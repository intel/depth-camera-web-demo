/*jshint esversion: 6 */
/*
 * Copyright (c) 2018, Intel Corporation
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 *  * Redistributions of source code must retain the above copyright notice,
 *    this list of conditions and the following disclaimer.
 *  * Redistributions in binary form must reproduce the above copyright
 *    notice, this list of conditions and the following disclaimer in the
 *    documentation and/or other materials provided with the distribution.
 *  * Neither the name of Intel Corporation nor the names of its contributors
 *    may be used to endorse or promote products derived from this software
 *    without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
 * ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE
 * LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
 * CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
 * SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
 * INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
 * CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
 * ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
 * POSSIBILITY OF SUCH DAMAGE.
 */

class DepthToColorSyncRender {
  constructor(canvas) {
    let gl;
    try {
        gl = canvas.getContext('webgl2', {antialias: false});
    } catch (e) {
        console.error('Your browser doesn\'t support WebGL2.');
        throw new Error(`Could not create WebGL2 context: ${e}`);
    }
    this.gl = gl;
    this.programs = this.setupPrograms(gl);
    gl.getExtension('EXT_color_buffer_float');
    gl.getExtension('OES_texture_float_linear');
    this.PAUSE_REQUESTED = 1;
    this.PAUSED = 2;
  }

  createVideo() {
    var video = document.createElement("video");
    video.autoplay = true;
    video.loop = true;
    video.crossOrigin = "anonymous";
    video.width = 640;
    video.height = 480;
    video.oncanplay = function(){
      video.video_loaded=true;
    };  
    return video;
  }

  async setupCamera(depth_video = null) {
    if (depth_video)
      this.depthVideo = depth_video;
    if (!this.depthVideo)
      this.depthVideo = this.createVideo();
    if (!this.colorVideo)
      this.colorVideo = this.createVideo();

    if (!this.depthVideo.srcObject)
      this.depthVideo.srcObject = await DepthCamera.getDepthStream();
    const depthStream = this.depthVideo.srcObject;
    if (!this.colorVideo.srcObject) {
        const colorStream =
            await DepthCamera.getColorStreamForDepthStream(depthStream);
        this.colorVideo.srcObject = colorStream;
    }
    return DepthCamera.getCameraCalibration(depthStream);
  }

  // Create textures into which the camera output will be stored.
  setupTextures(gl, programs, width, height, colorwidth, colorheight) {
    let lastTextureId = 0;
    function createTexture2D(format, w, h, filter = gl.NEAREST) {
      gl.activeTexture(gl[`TEXTURE${lastTextureId}`]);
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
      gl.texStorage2D(
          gl.TEXTURE_2D,
          1, // number of mip-map levels
          format, // internal format
          w,
          h,
      );
      texture.unit = lastTextureId++;
      texture.w = w;
      texture.h = h;
      return texture;
    }

    const depth = createTexture2D(gl.R32F, width, height);
    const color = createTexture2D(gl.RGBA8, colorwidth, colorheight);
    const colorFilter = createTexture2D(gl.RGBA8, colorwidth, colorheight);
    const noHoles = createTexture2D(gl.RGBA8, colorwidth, colorheight);
    const reduceBlack = [createTexture2D(gl.RGBA8, colorwidth, colorheight),
                         createTexture2D(gl.RGBA8, colorwidth, colorheight),
                         createTexture2D(gl.RGBA8, colorwidth, colorheight),
                         createTexture2D(gl.RGBA8, colorwidth, colorheight),
                         createTexture2D(gl.RGBA8, colorwidth, colorheight),
                         createTexture2D(gl.RGBA8, colorwidth, colorheight)]


    return {
        depth: depth,
        color: color,
        colorFilter: colorFilter,
        noHoles: noHoles,
        reduceBlack: reduceBlack,        
    };
  }

  initUniforms(gl, cameraParams, width, height) {
    const textures = this.textures;
    const color = textures.color;
    const intrin = cameraParams.getDepthIntrinsics(width, height);
    const offsetx = (intrin.offset[0] / width);
    const offsety = (intrin.offset[1] / height);
    const focalxinv = width / intrin.focalLength[0];
    const focalyinv = height / intrin.focalLength[1];
    const focalx = intrin.focalLength[0] / width;
    const focaly = intrin.focalLength[1] / height;
    const coloroffsetx = cameraParams.colorOffset[0] / color.w;
    const coloroffsety = cameraParams.colorOffset[1] / color.h;
    const colorfocalx = cameraParams.colorFocalLength[0] / color.w;
    const colorfocaly = cameraParams.colorFocalLength[1] / color.h;
    const colorfocalxinv = color.w / cameraParams.colorFocalLength[0];
    const colorfocalyinv = color.h / cameraParams.colorFocalLength[1];

    const range = [0.3, 0.9];

    const bilateral = this.programs.bilateral;
    gl.useProgram(bilateral);
    gl.uniform1i(gl.getUniformLocation(bilateral, "s"), textures.color.unit);
    gl.uniform2f(gl.getUniformLocation(bilateral, 'dd'), 1 / color.w, 1 / color.h);

    const noHoles = this.programs.noHoles;
    gl.useProgram(noHoles);
    gl.uniform1i(gl.getUniformLocation(noHoles, "s"), textures.colorFilter.unit);
    gl.uniform1i(gl.getUniformLocation(noHoles, "sDepth"), textures.depth.unit);
    gl.uniform2f(gl.getUniformLocation(noHoles, 'dd'), 1 / color.w, 1 / color.h);
    gl.uniform1f(gl.getUniformLocation(noHoles, 'depthScale'), cameraParams.depthScale);
    gl.uniform2f(gl.getUniformLocation(noHoles, 'depthFocalLength'), focalx, focaly);
    gl.uniform2f(gl.getUniformLocation(noHoles, 'depthOffset'), offsetx, offsety);
    gl.uniform2f(gl.getUniformLocation(noHoles, 'colorFocalLengthInv'), colorfocalxinv, colorfocalyinv);
    gl.uniform2f(gl.getUniformLocation(noHoles, 'colorOffset'), coloroffsetx, coloroffsety);
    gl.uniformMatrix4fv(gl.getUniformLocation(noHoles, "colorToDepth"), false, cameraParams.colorToDepth);

    const reduceBlack = this.programs.reduceBlack;
    gl.useProgram(reduceBlack);
    reduceBlack.s = gl.getUniformLocation(reduceBlack, "s");
    gl.uniform2f(gl.getUniformLocation(reduceBlack, 'dd'), 1 / color.w, 1 / color.h);
    gl.uniform2f(gl.getUniformLocation(reduceBlack, 'range'), range[0], range[1]);

    const render = this.programs.render;
    gl.useProgram(render);
    const lastReduceBlack = textures.reduceBlack[0/*textures.reduceBlack.length - 1*/];
    gl.uniform1i(gl.getUniformLocation(render, "s"), lastReduceBlack.unit);
    gl.uniform2f(gl.getUniformLocation(render, 'range'), range[0], range[1]);    
  }


  setupPrograms(gl) {
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    const vertex_buffer = gl.createBuffer();
    this.vertex_buffer = vertex_buffer;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertex_buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0,0,1,0,1,1,0,1]), gl.STATIC_DRAW);

    this.index_buffer= gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.index_buffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0,1,2,0,2,3]), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
    
    const bilateralVertex = `#version 300 es
      in vec2 v;
      out vec2 t;

      void main(){
        gl_Position = vec4(v.x * 2.0 - 1.0, v.y * 2.0 - 1.0, 0, 1);
        t = v;
      }`;

    // Approach https://www.shadertoy.com/view/4dfGDH
    const bilateralPixel = `#version 300 es
      precision mediump float;
      uniform sampler2D s;
      uniform vec2 dd;
      in vec2 t;
      out vec4 fragColor;

      #define SIGMA 10.0
      #define BSIGMA 0.1
      #define MSIZE 15

      float normpdf3(vec3 v, float sigma)
      {
      	return 0.39894*exp(-0.5*dot(v,v)/(sigma*sigma))/sigma;
      }


      void main()
      {
      	vec3 c = texture(s, t).rgb;        
      	const int kSize = (MSIZE - 1)/2;
      	const float kernel[MSIZE] = float[MSIZE](0.031225216, 0.033322271, 0.035206333, 0.036826804, 0.038138565, 0.039104044, 0.039695028, 0.039894000, 0.039695028, 0.039104044, 0.038138565, 0.036826804, 0.035206333, 0.033322271, 0.031225216);
      	vec3 final_colour = vec3(0.0);
      	float bZ = 0.2506642602897679;
      	
      	float Z = 0.0;
      	vec3 cc;
      	float factor;
      	for (int i = -kSize; i <= kSize; ++i) {
      	  for (int j = -kSize; j <= kSize; ++j) {
      		cc = texture(s, t + dd * vec2(float(i), float(j))).rgb;
      		factor = normpdf3(cc - c, BSIGMA) * bZ * kernel[kSize + j] * kernel[kSize + i];
      		Z += factor;
      		final_colour += factor * cc;
      	  }
      	}
      	fragColor = vec4(final_colour/Z, 1.0);
      }`;

    
    const noHolesVertex = `#version 300 es
      in vec2 v;
      out vec2 t;

      void main(){
        gl_Position = vec4(v.x * 2.0 - 1.0, v.y * 2.0 - 1.0, 0, 1);
        t = v;
      }`;
    const noHolesPixel = `#version 300 es
      precision mediump float;
      uniform sampler2D s;
      uniform sampler2D sDepth;
      uniform sampler2D color;
      uniform vec2 dd;
      uniform float depthScale;
      uniform vec2 depthOffset;
      uniform vec2 colorOffset;
      uniform vec2 depthFocalLength;
      uniform vec2 colorFocalLengthInv;
      uniform mat4 colorToDepth;

      in vec2 t;
      out vec4 fragColor;

      vec4 colorDeproject(vec2 index, float z) {
        vec2 position2d = (index - colorOffset) * colorFocalLengthInv;
        return vec4(position2d * z, z, 1.0);
      }

      void main(){
        fragColor = texture(s, t);
        // Get the depth for color pixel.
        vec4 colorPos = colorDeproject(t, 0.5);
        vec4 depthPos = colorToDepth * colorPos;
        vec2 position2d = depthPos.xy / depthPos.z;
        vec2 v = position2d * depthFocalLength + depthOffset;
        float z = texture(sDepth, v).r * depthScale;
        z = (z == 1.0) ? 0.0 : z;
        fragColor.a = (z > 0.97) ? 0.97 : z;

/*        if (col.a > 0.0) {
//          return;
//        }
        vec4 dd1 = vec4(dd,dd) * vec4(1.0, 1.0, -1.0, 0.0);

        vec4 col1 = texture(s, t + dd1.rg);
        vec4 col2 = texture(s, t + dd1.ra);
        vec4 col3 = texture(s, t + dd1.ag);
        vec3 z = vec3(col1.a, col2.a, col3.a);
        vec3 nonzero = sign(z);
        float count = dot(nonzero, nonzero);

        float depth = (count > 0.0) ? dot(nonzero, z) / count : 0.0;
        fragColor = vec4(texture(color, t).rgb, depth);

        vec4 postl = texture(s, t - dd1.rg);
        vec4 posbr = texture(s, t + dd1.rg);
        vec4 postr = texture(s, t - dd1.bg);
        vec4 posbl = texture(s, t + dd1.bg);
        vec4 post = texture(s, t - dd1.ag);
        vec4 posb = texture(s, t + dd1.ag);
        vec4 posl = texture(s, t - dd1.ra);
        vec4 posr = texture(s, t + dd1.ra);

        vec4 z0 = vec4(posl.a, postl.a, post.a, postr.a);
        vec4 z1 = vec4(posr.a, posbr.a, posb.a, posbl.a);
        vec4 nonzero = sign(z1 * z0);
        float depth = dot(nonzero, mix(z1, z0, 0.5)) / dot(nonzero, nonzero);
        fragColor = vec4(col.rgb, depth > 0.97 ? 0.97 : depth);*/
      }`;

    const reduceBlackVertex = `#version 300 es
      in vec2 v;
      out vec2 t;

      void main(){
        gl_Position = vec4(v.x * 2.0 - 1.0, v.y * 2.0 - 1.0, 0, 1);
        t = v;
      }`;
    const reduceBlackPixel = `#version 300 es
      precision mediump float;
      uniform sampler2D s;
      uniform vec2 range;
      uniform vec2 dd;

      in vec2 t;
      out vec4 fragColor;
      const vec4 rgbmask = vec4(1.0, 1.0, 1.0, 0.0);
            
      bool similarColor(vec4 a, vec4 b) {
      	vec3 d = a.rgb - b.rgb;
      	return dot(d, d) < 0.007;
      }
      
      vec4 normalizeRG(vec4 c) {
        float sum = 1.0; // dot(c, rgbmask);
        return vec4(c.rg / sum, c.ba);
      } 

      void main(){
        vec4 c = texture(s, t);
        fragColor = c;
        if (c.a > range.y)
          return;

        vec4 similarThreshold = vec4(c.a > 0.0 ? 0.02 : 0.03);

        vec4 dd3 = vec4(dd,dd) * vec4(11.0, 11.0, -11.0, 0.0);
        vec4 dd4 = vec4(dd,dd) * vec4(15.0, 15.0, -15.0, 0.0);

        vec4 c1 = normalizeRG(texture(s, t - dd3.rg));
        vec4 c5 = normalizeRG(texture(s, t + dd3.rg));
        vec4 c3 = normalizeRG(texture(s, t - dd3.bg));
        vec4 c7 = normalizeRG(texture(s, t + dd3.bg));
        vec4 c2 = normalizeRG(texture(s, t - dd4.ag));
        vec4 c6 = normalizeRG(texture(s, t + dd4.ag));
        vec4 c8 = normalizeRG(texture(s, t - dd4.ra));
        vec4 c4 = normalizeRG(texture(s, t + dd4.ra));

        vec4 cn = normalizeRG(c);
        
        // c1 and c5, c2 and c6,... are opposite.
        vec4 z0 = vec4(c1.a, c2.a, c3.a, c4.a);
        vec4 z1 = vec4(c5.a, c6.a, c7.a, c8.a);
        vec4 bckgndThreshold = vec4(range.y);
        vec4 background1 = vec4(greaterThan(z0, bckgndThreshold));
        vec4 background2 = vec4(greaterThan(z1, bckgndThreshold));
        vec4 foreground1 = vec4(1.0) - background1;
        vec4 foreground2 = vec4(1.0) - background2;
        bool backgroundBorder = any(greaterThan(background1 + background2, vec4(0.0)));

        vec4 r1 = vec4(c1.r, c2.r, c3.r, c4.r);
        vec4 r2 = vec4(c5.r, c6.r, c7.r, c8.r);
        vec4 g1 = vec4(c1.g, c2.g, c3.g, c4.g);
        vec4 g2 = vec4(c5.g, c6.g, c7.g, c8.g);
        vec4 b1 = vec4(c1.b, c2.b, c3.b, c4.b);
        vec4 b2 = vec4(c5.b, c6.b, c7.b, c8.b);
        vec4 rn = vec4(cn.r);
        vec4 gn = vec4(cn.g);
        vec4 bn = vec4(cn.b);
        vec4 diffr1 = abs(r1 - rn);
        vec4 diffr2 = abs(r2 - rn);
        vec4 diffg1 = abs(g1 - gn);
        vec4 diffg2 = abs(g2 - gn);
        vec4 diffb1 = abs(b1 - bn);
        vec4 diffb2 = abs(b2 - bn);

        
        if (backgroundBorder) {
          // We need to know which one is background border and for that color
          // to check if it is similar to background.
          vec4 sim1 = vec4(lessThan(max(max(diffr1, diffg1), diffb1), similarThreshold));
          vec4 sim2 = vec4(lessThan(max(max(diffr2, diffg2), diffb2), similarThreshold));
          float background = dot(sim1, background1) + dot(sim2, background2);
          fragColor.a = (background > 0.0) ? 1.0 : fragColor.a;
          // TODO: in case that the color is in the middle of background pixels
          // even it is not of the same color, we threat it as background when
          // the depth is 0.
          bool backgroundAround = dot(background1, background1) +
                                   dot(background2, background2) >= 4.0; 
          fragColor.a = (fragColor.a == 0.0 && backgroundAround) ? 0.996 : fragColor.a;
          return;
        }
        // non background border, handle holes.
        vec4 nonzero = sign(z1 * z0);
        float count = dot(nonzero, nonzero);
        if (count > 0.0) {
          float depth = dot(nonzero, mix(z1, z0, 0.5)) / count;
          fragColor = vec4(c.rgb, depth);
          return;
        }
      }`;
    const renderVertex = `
      attribute vec2 v;
      varying vec2 t;

      void main(){
        gl_Position = vec4(v.x * 2.0 - 1.0, -v.y * 2.0 + 1.0, 0, 1);
        t = v;
      }`;
    const renderPixel = `
      precision mediump float;
      uniform sampler2D s;
      uniform vec2 range;
      varying vec2 t;

      void main(){
        vec4 tex = texture2D(s, t);
        gl_FragColor = (tex.a > range.x && tex.a < range.y) ? tex : vec4(0.0);
        if (tex.a == 1.0) {
          gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0);
        } else if (tex.a > 0.99) 
          gl_FragColor = vec4(1.0, 0.5, 0.5, 1.0);
        else if (tex.a > 0.971) 
          gl_FragColor = vec4(0.0, 1.0, 0.0, 1.0);
        else if (tex.a == 0.0) 
           gl_FragColor = vec4(1.0, 1.0, 0.0, 1.0);
        else if (tex.a > range.y) 
          gl_FragColor = vec4(0.0, 1.0, 1.0, 1.0);
        else if (tex.a < range.x) 
           gl_FragColor = vec4(1.0, 0.0, 1.0, 1.0);
/*        if (tex.a > range.y)
          gl_FragColor = vec4(1.0);
        if (tex.a < range.x)
          gl_FragColor = vec4(1.0);*/
        // gl_FragColor = tex;
      }`; 

    function createProgram(gl, vs, ps) {
      var vertex_shader = gl.createShader(gl.VERTEX_SHADER);
      gl.shaderSource(vertex_shader, vs);
      gl.compileShader(vertex_shader);

      var pixel_shader = gl.createShader(gl.FRAGMENT_SHADER);
      gl.shaderSource(pixel_shader, ps);
      gl.compileShader(pixel_shader);

      var program  = gl.createProgram();
      gl.attachShader(program, vertex_shader);
      gl.attachShader(program, pixel_shader);
      gl.linkProgram(program);
      const vinfo = gl.getShaderInfoLog(vertex_shader);
      const pinfo = gl.getShaderInfoLog(pixel_shader);
      if (vinfo.length > 0)
        console.error(vinfo);
      if (pinfo.length > 0)
        console.error(pinfo);

      gl.useProgram(program);

      const vertex_location = gl.getAttribLocation(program, "v");
      if (vertex_location == -1)
        return program;
      gl.enableVertexAttribArray(vertex_location);
      program.vertex_location = vertex_location;
      gl.bindBuffer(gl.ARRAY_BUFFER, vertex_buffer);
      gl.vertexAttribPointer(vertex_location, 2, gl.FLOAT, false, 0, 0);
      return program;
    }

    return {
      bilateral: createProgram(gl, bilateralVertex, bilateralPixel),
      noHoles: createProgram(gl, noHolesVertex, noHolesPixel),
      reduceBlack: createProgram(gl, reduceBlackVertex, reduceBlackPixel),      
      render: createProgram(gl, renderVertex, renderPixel),
    }
  }
   
  setup(gl, cameraParams, depthW, depthH, colorW, colorH) {
    const createFramebuffer2D = (gl, textureList) => {
      const framebuffer = gl.createFramebuffer();
      const drawBuffers = [];
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      for (let i = 0; i < textureList.length; i += 1) {
        const texture = textureList[i];
        drawBuffers.push(gl[`COLOR_ATTACHMENT${i}`]);
        gl.framebufferTexture2D(
          gl.FRAMEBUFFER,
          gl[`COLOR_ATTACHMENT${i}`],
          gl.TEXTURE_2D,
          texture,
          0, // mip-map level
        );
      }
      gl.drawBuffers(drawBuffers);
      return framebuffer;
    }

    if (!this.textures)
      this.textures = this.setupTextures(gl, this.programs, depthW, depthH, colorW, colorH);
    this.initUniforms(gl, cameraParams, depthW, depthH);

    const textures = this.textures;
    // init passes with framebuffers
    if (!this.passes) {
      this.passes = [{
      	in: textures.color,
        framebuffer: createFramebuffer2D(gl, [textures.colorFilter]),
        program: this.programs.bilateral,
      }, {
        framebuffer: createFramebuffer2D(gl, [textures.noHoles]),
        program: this.programs.noHoles,
      }, {
        in: textures.noHoles,
        framebuffer: createFramebuffer2D(gl, [textures.reduceBlack[0]]),
        program: this.programs.reduceBlack,
      }, {
        in: textures.reduceBlack[0],
        framebuffer: createFramebuffer2D(gl, [textures.reduceBlack[1]]),
        program: this.programs.reduceBlack,
      }, {
        in: textures.reduceBlack[1],
        framebuffer: createFramebuffer2D(gl, [textures.reduceBlack[2]]),
        program: this.programs.reduceBlack,
      }, {
        in: textures.reduceBlack[2],
        framebuffer: createFramebuffer2D(gl, [textures.reduceBlack[3]]),
        program: this.programs.reduceBlack,
      }, {
        in: textures.reduceBlack[3],
        framebuffer: createFramebuffer2D(gl, [textures.reduceBlack[4]]),
        program: this.programs.reduceBlack,
      }, {
        in: textures.reduceBlack[4],
        framebuffer: createFramebuffer2D(gl, [textures.reduceBlack[5]]),
        program: this.programs.reduceBlack,
      }, {
        framebuffer: null,
        program: this.programs.render
      }];
    }
    this.initAttributes(gl);
  }

  initAttributes(gl) {
    gl.bindVertexArray(this.vao);
    gl.useProgram(this.programs.render);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertex_buffer);
    gl.vertexAttribPointer(this.programs.render.vertex_location, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.index_buffer);    
  }

  // it is loaded externally.
  setDepthVideo(video) {
    this.depthVideo = video;
    if (video.videoWidth > 2) {
      this.depthVideo.video_loaded = true;
      return;
    }
    video.oncanplay = function() {
      video.video_loaded=true;
    }
  }

  async play() {
    const cameraParams = await this.setupCamera(this.depthVideo);    
    let frame = 0;
    let textures;
    const colorVideo = this.colorVideo;
    const depthVideo = this.depthVideo;
    const programs = this.programs;
    const renderer = this;
    const gl = renderer.gl;
    let width = 0;
    let height = 0;
    let currentDepthTime = 0;
    let currentColorTime = 0;

    if (this.paused == this.PAUSE_REQUESTED) {
      // if we get new play before paused is fulfilled, avoid second
      // requestAnimationFrame issue;
      this.paused = 0;
      return;
    } else if (this.paused == 0) {
      console.error("DCHECK failed on paused");
      return;
    }

    // Run for each frame. Will do nothing if the camera is not ready yet.
    const animate = function () {
      if (depthVideo.video_loaded && colorVideo.video_loaded) {
        if (frame === 0) {
          width = depthVideo.videoWidth;
          height = depthVideo.videoHeight;
          renderer.setup(gl, cameraParams, width, height, colorVideo.videoWidth, colorVideo.videoHeight);
          textures = renderer.textures;
        }
        try {
          if (depthVideo.currentTime != currentDepthTime) {
            currentDepthTime = depthVideo.currentTime;
            gl.activeTexture(gl[`TEXTURE${textures.depth.unit}`]);
            gl.bindTexture(gl.TEXTURE_2D, textures.depth);
            gl.texSubImage2D(
              gl.TEXTURE_2D,
              0, // mip-map level
              0, // x-offset
              0, // y-offset
              width,
              height,
              gl.RED,
              gl.FLOAT,
              depthVideo,
            );
          }
          if (colorVideo.currentTime != currentColorTime) {
            currentColorTime = colorVideo.currentTime;
            gl.activeTexture(gl[`TEXTURE${textures.color.unit}`]);
            gl.bindTexture(gl.TEXTURE_2D, textures.color);
            gl.texSubImage2D(
              gl.TEXTURE_2D,
              0, // mip-map level
              0, // x-offset
              0, // y-offset
              width,
              height,
              gl.RGBA,
              gl.UNSIGNED_BYTE,
              colorVideo,
            );
          }
        } catch (e) {
          console.error(`Error uploading video to WebGL:
                        ${e.name}, ${e.message}`);
        }

        let l;
        let program;
        gl.bindVertexArray(renderer.vao);  
        for (let i = 0; i < renderer.passes.length; ++i) {
          const pass = renderer.passes[i];
          // comment previous two lines and uncomment following to measure
          // latency of rendering only
          // { const pass = gl.passes[6];
          gl.useProgram(pass.program);
          if (pass.in && pass.program.s)
            gl.uniform1i(pass.program.s, pass.in.unit);

          gl.bindFramebuffer(gl.FRAMEBUFFER, pass.framebuffer);
          gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);              
        }

        frame += 1;
      }
      if (renderer.paused == renderer.PAUSE_REQUESTED) {
        renderer.paused = renderer.PAUSED;
        return;
      }
       window.requestAnimationFrame(animate);
    };
    animate();
  }

  pause() {
    this.paused = 2;
  }
}