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
        gl = canvas.getContext('webgl2');
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
    function createTexture2D(format, w, h) {
      gl.activeTexture(gl[`TEXTURE${lastTextureId}`]);
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
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
    const d2c = createTexture2D(gl.RGBA32F, colorwidth, colorheight);
    const noHoles = createTexture2D(gl.RGBA8, colorwidth, colorheight);

    return {
        depth: depth,
        color: color,
        d2c: d2c,
        noHoles: noHoles
    };
  }

  initUniforms(gl, cameraParams, width, height) {
    const textures = this.textures;
    const color = textures.color;
    const intrin = cameraParams.getDepthIntrinsics(width, height);
    const offsetx = (intrin.offset[0] / width);
    const offsety = (intrin.offset[1] / height);
    const focalx = intrin.focalLength[0] / width;
    const focaly = intrin.focalLength[1] / height;
    const coloroffsetx = cameraParams.colorOffset[0] / color.w;
    const coloroffsety = cameraParams.colorOffset[1] / color.h;
    const colorfocalx = cameraParams.colorFocalLength[0] / color.w;
    const colorfocaly = cameraParams.colorFocalLength[1] / color.h;
    const d2cTexture = textures.d2c;
    const range = [0.3, 0.8];

    const d2c = this.programs.d2c;
    gl.useProgram(d2c);
    gl.uniform1i(gl.getUniformLocation(d2c, "sDepth"), textures.depth.unit);
    gl.uniform1i(gl.getUniformLocation(d2c, "s"), textures.color.unit);
    gl.uniform1f(gl.getUniformLocation(d2c, 'depthScale'), cameraParams.depthScale);
    gl.uniform2f(gl.getUniformLocation(d2c, 'depthFocalLength'), focalx, focaly);
    gl.uniform2f(gl.getUniformLocation(d2c, 'depthOffset'), offsetx, offsety);
    gl.uniform2f(gl.getUniformLocation(d2c, 'colorFocalLength'), colorfocalx, colorfocaly);
    gl.uniform2f(gl.getUniformLocation(d2c, 'colorOffset'), coloroffsetx, coloroffsety);
    gl.uniformMatrix4fv(gl.getUniformLocation(d2c, "depthToColor"), false, cameraParams.depthToColor);
    gl.uniform1i(gl.getUniformLocation(d2c, "depthDistortionModel"), cameraParams.depthDistortionModel);
    gl.uniform1fv(gl.getUniformLocation(d2c, "depthDistortionCoeffs"), cameraParams.depthDistortioncoeffs);

    const noHoles = this.programs.noHoles;
    gl.useProgram(noHoles);
    gl.uniform1i(gl.getUniformLocation(noHoles, "color"), textures.color.unit);
    gl.uniform1i(gl.getUniformLocation(noHoles, "s"), textures.d2c.unit);
    gl.uniform2f(gl.getUniformLocation(noHoles, 'dd'), 1 / color.w, 1 / color.h);


    const render = this.programs.render;
    gl.useProgram(render);
    gl.uniform1i(gl.getUniformLocation(render, "d2c"), textures.noHoles.unit);
    gl.uniform1i(gl.getUniformLocation(render, "s"), textures.color.unit);
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
    
    // need them and add another pass that would, using depth camera, calculate
    // 3D position of AR marker square.
    // first pass would be mapping depth to color for all pixels.
    const depthToColorVertex = `#version 300 es
      precision highp float;

      #define DISTORTION_INVERSE_BROWN_CONRADY 2

      uniform float depthScale;
      uniform vec2 depthOffset;
      uniform vec2 colorOffset;
      uniform vec2 depthFocalLength;
      uniform vec2 colorFocalLength;
      uniform mat4 depthToColor;
      uniform int depthDistortionModel;
      uniform float depthDistortionCoeffs[5];

      uniform sampler2D sDepth;

      out vec4 position;

      vec4 depthDeproject(vec2 index, float depth) {
        vec2 position2d = (index - depthOffset) / depthFocalLength;
        if(depthDistortionModel == DISTORTION_INVERSE_BROWN_CONRADY) {
          float r2 = dot(position2d, position2d);
          float f = 1.0
                  + depthDistortionCoeffs[0] * r2
                  + depthDistortionCoeffs[1] * r2 * r2
                  + depthDistortionCoeffs[4] * r2 * r2 * r2;
          float ux = position2d.x * f
                   + 2.0 * depthDistortionCoeffs[2] * position2d.x * position2d.y
                   + depthDistortionCoeffs[3] * (r2 + 2.0 * position2d.x * position2d.x);
          float uy = position2d.y * f
                   + 2.0 * depthDistortionCoeffs[3] * position2d.x * position2d.y
                   + depthDistortionCoeffs[2] * (r2 + 2.0 * position2d.y * position2d.y);
          position2d = vec2(ux, uy);
        }
        return vec4(position2d * depth, depth, 1.0);
      }

      void main(){
        // Get the texture coordinates in range from [0, 0] to [1, 1]
        vec2 depth_pixel;
        vec2 depth_texture_size = vec2(textureSize(sDepth, 0));
        depth_pixel.x = mod(float(gl_VertexID), depth_texture_size.x) + 0.5;
        depth_pixel.y = clamp(floor(float(gl_VertexID) / depth_texture_size.x),
                              0.0, depth_texture_size.y) + 0.5;
        vec2 depth_texture_coord = depth_pixel / depth_texture_size;
        float depth = texture(sDepth, depth_texture_coord).r;
        if (depth == 0.0) {
          position = vec4(0.0);
          return;
        }
        float depth_scaled = depthScale * depth;
        // X and Y are the position within the depth texture (adjusted
        // so that it matches the position of the RGB texture), Z is
        // the depth.
        
        vec4 depthPos = depthDeproject(depth_texture_coord, depth_scaled);
        vec4 colorPos = depthToColor * depthPos;
        
        vec2 position2d = colorPos.xy / colorPos.z;
        // color texture coordinate.
        vec2 v = position2d * colorFocalLength + colorOffset;
        position = colorPos;
        gl_Position = vec4(v.x * 2.0 - 1.0, v.y * 2.0 - 1.0, 0, 1);
      }`;
    const depthToColorPixel = `#version 300 es
      precision highp float;
      uniform sampler2D s;
      in vec4 position;
      out vec4 fragColor;

      void main() {
        // In color frame aligned texture, each pixel holds 3D position.
        fragColor = position;
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
      uniform sampler2D color;
      uniform vec2 dd;
      in vec2 t;
      out vec4 fragColor;

      void main(){
        vec4 pos = texture(s, t);
        vec4 col = texture(color, t);
        if (pos.z > 0.0) {
          fragColor = vec4(col.rgb, pos.z);
          return;
        }
        vec4 dd1 = vec4(dd,dd) * vec4(1.0, 1.0, -1.0, 0.0);

        vec4 postl = texture(s, t - dd1.rg);
        vec4 posbr = texture(s, t + dd1.rg);
        vec4 postr = texture(s, t - dd1.bg);
        vec4 posbl = texture(s, t + dd1.bg);
        vec4 post = texture(s, t - dd1.ag);
        vec4 posb = texture(s, t + dd1.ag);
        vec4 posl = texture(s, t - dd1.ra);
        vec4 posr = texture(s, t + dd1.ra);

        vec4 z0 = vec4(posl.z, postl.z, post.z, postr.z);
        vec4 z1 = vec4(posr.z, posbr.z, posb.z, posbl.z);
        vec4 nonzero = sign(z1 * z0);
        float depth = dot(nonzero, mix(z1, z0, 0.5)) / dot(nonzero, nonzero);
        fragColor = vec4(col.rgb, depth);
      }`;

    const reduceBlack = `#version 300 es
      in vec2 v;
      out vec2 t;

      void main(){
        gl_Position = vec4(v.x * 2.0 - 1.0, v.y * 2.0 - 1.0, 0, 1);
        t = v;
      }`;
    const reduceBlack = `#version 300 es
      precision mediump float;
      uniform sampler2D s;
      uniform vec2 dd;
      in vec2 t;
      out vec4 fragColor;

      void main(){
        vec4 col = texture(color, t);
        if (col.a > 0.0) {
          fragColor = col;
          return;
        }

        // TODO: multiplier depends on target resolution.
        vec4 dd3 = vec4(dd,dd) * (3.0, 3.0, -3.0, 0.0);
        vec4 dd5 = vec4(dd,dd) * (5.0, 5.0, -5.0, 0.0);

        vec4 postl = texture(s, t - dd3.rg);
        vec4 posbr = texture(s, t + dd3.rg);
        vec4 postr = texture(s, t - dd3.bg);
        vec4 posbl = texture(s, t + dd3.bg);
        vec4 post = texture(s, t - dd5.ag);
        vec4 posb = texture(s, t + dd5.ag);
        vec4 posl = texture(s, t - dd5.ra);
        vec4 posr = texture(s, t + dd5.ra);
        vec4 coltl = texture(color, t - dd3.rg);
        vec4 colbr = texture(color, t + dd3.rg);
        vec4 coltr = texture(color, t - dd3.bg);
        vec4 colbl = texture(color, t + dd3.bg);
        vec4 colt = texture(color, t - dd5.ag);
        vec4 colb = texture(color, t + dd5.ag);
        vec4 coll = texture(color, t - dd5.ra);
        vec4 colr = texture(color, t + dd5.ra);       

        fragColor = vec4(col.rgb, depth);*/
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
      uniform sampler2D d2c;
      uniform vec2 range;
      varying vec2 t;

      void main(){
        vec4 tex = texture2D(d2c, t);
        gl_FragColor = (tex.a > range.x && tex.a < range.y) ? tex : vec4(0.0);
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
      d2c: createProgram(gl, depthToColorVertex, depthToColorPixel),
      noHoles: createProgram(gl, noHolesVertex, noHolesPixel),
      render: createProgram(gl, renderVertex, renderPixel)
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
        in: textures.depth,
        framebuffer: createFramebuffer2D(gl, [textures.d2c]),
        program: this.programs.d2c,
        points: depthW * depthH,
        vertexAttribArray: gl.createVertexArray()
      }, {
        in: textures.d2c,
        framebuffer: createFramebuffer2D(gl, [textures.noHoles]),
        program: this.programs.noHoles,
      }, {
        in: textures.noHoles,
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
          gl.bindFramebuffer(gl.FRAMEBUFFER, pass.framebuffer);

          if(pass.points) {
            gl.bindVertexArray(pass.vertexAttribArray);
            gl.clear(gl.COLOR_BUFFER_BIT);
            gl.drawArrays(gl.POINTS, 0, pass.points);
            gl.bindVertexArray(renderer.vao);
            continue;
          }
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