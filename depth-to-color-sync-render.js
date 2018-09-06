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

const REDUCE_BLACK_PASSES = 7;

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

    const depth0 = createTexture2D(gl.R32F, width, height);
    const depth1 = createTexture2D(gl.R32F, width, height);    
    const color = createTexture2D(gl.RGBA8, colorwidth, colorheight);
    const colorFilter = createTexture2D(gl.RGBA8, colorwidth, colorheight);
    const noHoles = createTexture2D(gl.RGBA8, colorwidth, colorheight);
    const reduceBlack = [createTexture2D(gl.RGBA8, colorwidth, colorheight),
                         createTexture2D(gl.RGBA8, colorwidth, colorheight),
                         createTexture2D(gl.RGBA8, colorwidth, colorheight),
                         createTexture2D(gl.RGBA8, colorwidth, colorheight),
                         createTexture2D(gl.RGBA8, colorwidth, colorheight),
                         createTexture2D(gl.RGBA8, colorwidth, colorheight),
                         createTexture2D(gl.RGBA8, colorwidth, colorheight)];
    const background = createTexture2D(gl.RGBA8, colorwidth, colorheight);
    const previousBackground = createTexture2D(gl.RGBA8, colorwidth, colorheight);
    const cleanup = createTexture2D(gl.RGBA8, colorwidth, colorheight);

    return {
        depth: depth0,
        previousDepth: depth1,        
        color: color,
        colorFilter: colorFilter,
        noHoles: noHoles,
        reduceBlack: reduceBlack,
        background: background,
        previousBackground: previousBackground,
        cleanup: cleanup
    };
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
    
    const noHolesVertex = `#version 300 es
      in vec2 v;
      out vec2 t;

      void main(){
        gl_Position = vec4(v.x * 2.0 - 1.0, v.y * 2.0 - 1.0, 0, 1);
        t = v;
      }`;
    const noHolesPixel = `#version 300 es
      precision highp float;

      layout(location = 0) out vec4 fragColor;
      layout(location = 1) out vec4 backgroundColor;
      in vec2 t;
      
      uniform sampler2D sDepth;
      uniform sampler2D sPreviousDepth;
      uniform sampler2D sColor;
      uniform sampler2D sPreviousBackground;
      uniform vec2 dd;
      uniform vec3 ddDepth; // vec3(1/w, 1/h, 0)
      uniform float depthScale;
      uniform vec2 depthOffset;
      uniform vec2 colorOffset;
      uniform vec2 depthFocalLength;
      uniform vec2 colorFocalLengthInv;
      uniform mat4 colorToDepth;

      const vec4 rgbmask = vec4(1.0, 1.0, 1.0, 0.0);
      const float range = 0.9;
                  
      vec4 normalizeRG(vec4 c) {
        float sum = dot(c, rgbmask);
        return vec4(c.rgb / sum, c.a);
      } 

      vec4 colorDeproject(vec2 index, float z) {
        vec2 position2d = (index - colorOffset) * colorFocalLengthInv;
        return vec4(position2d * z, z, 1.0);
      }

      // Bilateral filter approach from https://www.shadertoy.com/view/4dfGDH
      float normpdf3(vec3 v, float sigma) {
        return 0.39894*exp(-0.5*dot(v,v)/(sigma*sigma))/sigma;
      }
      vec4 textureB(sampler2D s, vec2 t) {
        #define BSIGMA 0.1
        #define MSIZE 15
        const float Epsilon = 1e-10;
        vec3 c = texture(s, t).rgb;
        const int kSize = (MSIZE - 1) / 2;
        const float kernel[MSIZE] = float[MSIZE](0.031225216, 0.033322271, 0.035206333, 0.036826804, 0.038138565, 0.039104044, 0.039695028, 0.039894000, 0.039695028, 0.039104044, 0.038138565, 0.036826804, 0.035206333, 0.033322271, 0.031225216);
        vec3 finalColor = vec3(0.0);
        float bZ = 0.2506642602897679;
        float Z = 0.0;
        
        vec3 cc;
        float factor;
        for (int i = -kSize; i <= kSize; ++i) {
          for (int j = -kSize; j <= kSize; ++j) {
            cc = texture(s, t + dd * vec2(float(i), float(j))).rgb;
            factor = normpdf3(cc - c, BSIGMA) * bZ * kernel[kSize + j] * kernel[kSize + i];
            Z += factor;
            finalColor += factor * cc;
          }
        }
        return vec4(finalColor/Z, 1.0);
      }

      void main(){
        fragColor = texture(sColor, t);
        vec4 backColor = texture(sPreviousBackground, t);
        // Get the depth for color pixel.
        vec4 colorPos = colorDeproject(t, 0.5);
        vec4 depthPos = colorToDepth * colorPos;
        vec2 position2d = depthPos.xy / depthPos.z;
        vec2 v = position2d * depthFocalLength + depthOffset;
        // float z = texture(sDepth, v).r;
        float z = min(min(texture(sDepth, v).r,
                          min(texture(sDepth, v + ddDepth.rb).r,
                              texture(sDepth, v - ddDepth.rb).r)),
                      min(texture(sDepth, v + ddDepth.bg).r,
                          texture(sDepth, v - ddDepth.bg).r));

        z = (z == 1.0) ? 0.0 : z;
        z *= depthScale;

        backColor = z > range ? vec4(fragColor.rgb, z) : backColor;
        backgroundColor = backColor;

        float z1 = texture(sPreviousDepth, v).r;
        z1 = (z1 == 1.0) ? 0.0 : z1;
        // z = (z == 0.0) ? z1 * depthScale : z;
        
        // clamp up to 0.95 for expressing value using color alpha channel.
        // [0-0.9] would express foreground, [0.9-0.95] background from depth
        // camera and [0.95-1] computed background based on color fill.
        z = (z > 0.95) ? 0.95 : z;
        
        vec4 distN = normalizeRG(fragColor) - normalizeRG(backColor);
        vec4 dist = fragColor - backColor;
        // z = (z == 0.0 && dot(distN.rgb, distN.rgb) < 0.003 &&
        //    dot(dist.rgb, dist.rgb) < 0.008 && backColor.a > 0.9) ? backColor.a : z;
        z = (z > 0.95) ? 0.95 : z;
        fragColor.a = z;
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
      uniform vec4 samplingStep;
      uniform int handleLeftBlackBorder;
      vec4 bckgndThreshold = vec4(0.9);
      in vec2 t;
      out vec4 fragColor;

      void main(){
        vec4 c = texture(s, t);
        fragColor = c;
        if (c.a > 0.9)
          return;

        const vec4 similarThreshold = vec4(0.023);

        vec4 dd3 = samplingStep;
        vec4 dd4 = dd3 * 1.414213562;
        vec4 dd6 = 3.0 * dd3;
        vec4 dd8 = 3.0 * dd4;
        vec4 dd1 = 0.3333 * dd3;
        vec4 dd2 = 0.3333 * dd4;

        vec4 c11 = texture(s, t - dd3.rg);
        vec4 c15 = texture(s, t + dd3.rg);
        vec4 c13 = texture(s, t - dd3.bg);
        vec4 c17 = texture(s, t + dd3.bg);
        vec4 c12 = texture(s, t - dd4.ag);
        vec4 c16 = texture(s, t + dd4.ag);
        vec4 c18 = texture(s, t - dd4.ra);
        vec4 c14 = texture(s, t + dd4.ra);

        vec4 c21 = texture(s, t - dd6.rg);
        vec4 c25 = texture(s, t + dd6.rg);
        vec4 c23 = texture(s, t - dd6.bg);
        vec4 c27 = texture(s, t + dd6.bg);
        vec4 c22 = texture(s, t - dd8.ag);
        vec4 c26 = texture(s, t + dd8.ag);
        vec4 c28 = texture(s, t - dd8.ra);
        vec4 c24 = texture(s, t + dd8.ra);

        vec4 c01 = texture(s, t - dd1.rg);
        vec4 c05 = texture(s, t + dd1.rg);
        vec4 c03 = texture(s, t - dd1.bg);
        vec4 c07 = texture(s, t + dd1.bg);
        vec4 c02 = texture(s, t - dd2.ag);
        vec4 c06 = texture(s, t + dd2.ag);
        vec4 c08 = texture(s, t - dd2.ra);
        vec4 c04 = texture(s, t + dd2.ra);

        
        // ci1 and ci5, ci2 and ci6,... are opposite. From z01 and z02, which
        // caontain depth of the nearest 8 pixels, to z21 and z22 for the
        // furthest pixels.
        vec4 z01 = vec4(c01.a, c02.a, c03.a, c04.a);
        vec4 z02 = vec4(c05.a, c06.a, c07.a, c08.a);
        vec4 z11 = vec4(c11.a, c12.a, c13.a, c14.a);
        vec4 z12 = vec4(c15.a, c16.a, c17.a, c18.a);
        vec4 z21 = vec4(c21.a, c22.a, c23.a, c24.a);
        vec4 z22 = vec4(c25.a, c26.a, c27.a, c28.a);
        
        vec4 background01 = vec4(greaterThan(z01, bckgndThreshold));
        vec4 background02 = vec4(greaterThan(z02, bckgndThreshold));
        vec4 background11 = vec4(greaterThan(z11, bckgndThreshold));
        vec4 background12 = vec4(greaterThan(z12, bckgndThreshold));
        vec4 background21 = vec4(greaterThan(z21, bckgndThreshold));
        vec4 background22 = vec4(greaterThan(z22, bckgndThreshold));

        // Current pixel values, packed for parallel diff.
        vec4 rn = vec4(c.r);
        vec4 gn = vec4(c.g);
        vec4 bn = vec4(c.b);

        // Use naive RGB diff for first prototype to evaluate similar colors.
        vec4 r01 = vec4(c01.r, c02.r, c03.r, c04.r);
        vec4 r02 = vec4(c05.r, c06.r, c07.r, c08.r);
        vec4 g01 = vec4(c01.g, c02.g, c03.g, c04.g);
        vec4 g02 = vec4(c05.g, c06.g, c07.g, c08.g);
        vec4 b01 = vec4(c01.b, c02.b, c03.b, c04.b);
        vec4 b02 = vec4(c05.b, c06.b, c07.b, c08.b);
        vec4 diffr1 = abs(r01 - rn);
        vec4 diffr2 = abs(r02 - rn);
        vec4 diffg1 = abs(g01 - gn);
        vec4 diffg2 = abs(g02 - gn);
        vec4 diffb1 = abs(b01 - bn);
        vec4 diffb2 = abs(b02 - bn);
        vec4 sim01 = vec4(lessThan(max(max(diffr1, diffg1), diffb1), similarThreshold));
        vec4 sim02 = vec4(lessThan(max(max(diffr2, diffg2), diffb2), similarThreshold));

        vec4 r11 = vec4(c11.r, c12.r, c13.r, c14.r);
        vec4 r12 = vec4(c15.r, c16.r, c17.r, c18.r);
        vec4 g11 = vec4(c11.g, c12.g, c13.g, c14.g);
        vec4 g12 = vec4(c15.g, c16.g, c17.g, c18.g);
        vec4 b11 = vec4(c11.b, c12.b, c13.b, c14.b);
        vec4 b12 = vec4(c15.b, c16.b, c17.b, c18.b);
        diffr1 = abs(r11 - rn);
        diffr2 = abs(r12 - rn);
        diffg1 = abs(g11 - gn);
        diffg2 = abs(g12 - gn);
        diffb1 = abs(b11 - bn);
        diffb2 = abs(b12 - bn);
        vec4 sim11 = vec4(lessThan(max(max(diffr1, diffg1), diffb1), similarThreshold));
        vec4 sim12 = vec4(lessThan(max(max(diffr2, diffg2), diffb2), similarThreshold));

        vec4 r21 = vec4(c21.r, c22.r, c23.r, c24.r);
        vec4 r22 = vec4(c25.r, c26.r, c27.r, c28.r);
        vec4 g21 = vec4(c21.g, c22.g, c23.g, c24.g);
        vec4 g22 = vec4(c25.g, c26.g, c27.g, c28.g);
        vec4 b21 = vec4(c21.b, c22.b, c23.b, c24.b);
        vec4 b22 = vec4(c25.b, c26.b, c27.b, c28.b);
        diffr1 = abs(r21 - rn);
        diffr2 = abs(r22 - rn);
        diffg1 = abs(g21 - gn);
        diffg2 = abs(g22 - gn);
        diffb1 = abs(b21 - bn);
        diffb2 = abs(b22 - bn);
        vec4 sim21 = vec4(lessThan(max(max(diffr1, diffg1), diffb1), similarThreshold));
        vec4 sim22 = vec4(lessThan(max(max(diffr2, diffg2), diffb2), similarThreshold));

/*
        // Background or zero with different color.
        vec4 foreground11 = vec4(1.0) - background11;
        vec4 foreground21 = vec4(1.0) - background21;
        vec4 foreground11 = vec4(1.0) - background1;
        vec4 foreground12 = vec4(1.0) - background2;
        const vec4 ZERO = vec4(0.0);
        vec4 zero1 = vec4(equal(z0, ZERO));
        vec4 zero2 = vec4(equal(z1, ZERO));
        vec4 zero11 = vec4(equal(z01, ZERO));
        vec4 zero21 = vec4(equal(z11, ZERO));

        // Same direction non-zero foreground including both pixels.
        vec4 nzf1 = foreground1 * z0;
        vec4 nzf2 = foreground2 * z1;
        vec4 nzf11 = foreground11 * z01;
        vec4 nzf21 = foreground21 * z11;
        vec4 sdf1 = nzf1 * nzf11;
        vec4 sdf2 = nzf2 * nzf21;
        vec4 sdbz1 = (background1 + zero1) * (background11 + zero11);
        vec4 sdbz2 = (background2 + zero2) * (background21 + zero21);

        // When we have a same direction foregrounds with the same color and in
        // the same time, opposite direction background or zero of different color,
        // let's make the pixel foreground.
        vec4 sdscodbz1 = sdf1 * sim1 * sdbz2 * (vec4(1.0) - sim2) * (vec4(1.0) - sim21);
        vec4 sdscodbz2 = sdf2 * sim2 * sdbz1 * (vec4(1.0) - sim1) * (vec4(1.0) - sim11);

        if (c.a == 0.0 && dot(sdscodbz1.ga, sdscodbz1.ga) + dot(sdscodbz2.ga, sdscodbz2.ga) > 0.0) {
           fragColor = vec4(c.rgb, 0.4);
           return;
        }*/

        vec4 sb11 = sim11 * background11;
        vec4 sb12 = sim12 * background12;
        vec4 sb01 = sim01 * background01;
        vec4 sb02 = sim02 * background02;        
        vec4 sdocfodbz1 = sim01 * background01 + sim11 * (background11 + sim21 * background21);
        vec4 sdocfodbz2 = sim02 * background02 + sim12 * (background12 + sim22 * background22);
        if (dot(sdocfodbz1, sdocfodbz1) + dot(sdocfodbz2, sdocfodbz2) > 0.0) {
          float coef = 0.3;
          float count1 = dot(sb11, sb11) + dot(sb12, sb12) + coef;
          float count0 = dot(sb01, sb01) + dot(sb02, sb02) + coef;
          vec3 ch = c.rgb * coef;
          if (count0 > coef) {
            float rf = dot(sb01, r01) + dot(sb02, r02);
            float gf = dot(sb01, g01) + dot(sb02, g02);
            float bf = dot(sb01, b01) + dot(sb02, b02);
            ch = (ch + vec3(rf, gf, bf)) / count0;
            fragColor = vec4(ch, 0.9804); // 0.9804 is for debugging.
            return;
          }
          float rf = dot(sb11, r11) + dot(sb12, r12);
          float gf = dot(sb11, g11) + dot(sb12, g12);
          float bf = dot(sb11, b11) + dot(sb12, b12);
          ch = (ch + vec3(rf, gf, bf)) / count1;
          fragColor = vec4(ch, count1 > coef ? 0.9804 : 1.0);
          return;
        }

        // Special case: background or background followed by zero from left to 
        // right with two zeros or background to the right is background.
        // If the two to the right, below or above are foregrounds, don't expand
        // it.
        vec4 w = vec4(z01.a, z11.a, z12.g, z11.g);
        w = vec4(greaterThan(w, bckgndThreshold)) + vec4(equal(w, vec4(0.0)));

       /* if (handleLeftBlackBorder == 1 && c.a == 0.0 && all(equal(w, vec4(1.0)))
            && (background12.a == 1.0 ||
                (background22.a == 1.0 && z12.a == 0.0))) {
          fragColor.a = 0.9804;
          return;          
        }*/        
      }`;
    
    const cleanupVertex = `#version 300 es
      in vec2 v;
      out vec2 t;

      void main(){
        gl_Position = vec4(v.x * 2.0 - 1.0, v.y * 2.0 - 1.0, 0, 1);
        t = v;
      }`;
    const cleanupPixel = `#version 300 es
      precision mediump float;
      uniform sampler2D s;
      uniform vec4 samplingStep;
      uniform vec4 mappedRectangle;

      in vec2 t;
      out vec4 fragColor;
      const vec4 rgbmask = vec4(1.0, 1.0, 1.0, 0.0);
      const float range = 0.9;
            
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
        float a = t.x < mappedRectangle.x ? 1.0 : c.a;
        fragColor = vec4(c.rgb, a);
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
      uniform sampler2D sBackground;
      varying vec2 t;
      const vec4 rgbmask = vec4(1.0, 1.0, 1.0, 0.0);
      const vec2 range = vec2(0.1, 0.9);            
      vec4 normalizeRG(vec4 c) {
        float sum = dot(c, rgbmask);
        return vec4(c.rgb / sum, c.a);
      } 

      const float Epsilon = 1e-10;
      vec3 RGBtoHCV(vec3 RGB)
      {
        // Based on work by Sam Hocevar and Emil Persson
        vec4 P = (RGB.g < RGB.b) ? vec4(RGB.bg, -1.0, 2.0/3.0) : vec4(RGB.gb, 0.0, -1.0/3.0);
        vec4 Q = (RGB.r < P.x) ? vec4(P.xyw, RGB.r) : vec4(RGB.r, P.yzx);
        float C = Q.x - min(Q.w, Q.y);
        float H = abs((Q.w - Q.y) / (6.0 * C + Epsilon) + Q.z);
        return vec3(H, C, Q.x);
      }
 
      void main(){
        vec4 tex = texture2D(s, t);
        vec4 background = texture2D(sBackground, t);
        gl_FragColor = (tex.a > range.x && tex.a < range.y) ? tex : vec4(0.0);
        if (tex.a == 1.0) {
          gl_FragColor = vec4(1.0, 0.6, 0.1, 1.0);
        } else if (tex.a > 0.99) 
          gl_FragColor = vec4(1.0, 0.5, 0.5, 1.0);
        else if (tex.a > 0.9803) 
          gl_FragColor = vec4(0.3, 0.8, 1.0, 1.0);
        else if (tex.a > 0.972) 
          gl_FragColor = vec4(0.5, 0.5, 0.7, 1.0);
        // else if (tex.a > 0.951) 
        //   gl_FragColor = vec4(0.0, 1.0, 0.0, 1.0);
        else if (tex.a == 0.0) 
           gl_FragColor = vec4(1.0, 1.0, 0.0, 1.0);
        else if (tex.a > range.y) 
          gl_FragColor = vec4(0.0, 1.0, 1.0, 1.0);
        else if (tex.a < range.x) 
           gl_FragColor = vec4(1.0, 0.0, 1.0, 1.0);
/*        else if (tex.a >= 0.399 && tex.a <= 0.401) 
          gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0);
        if (tex.a > range.y)
          gl_FragColor = vec4(1.0);
        if (tex.a < range.x)
          gl_FragColor = vec4(1.0);*/
        // gl_FragColor = vec4(tex.rgb, 1.0);
        // gl_FragColor = tex.a < range.y ? vec4(tex.rgb, 1.0) : vec4(0.0, 1.0, 1.0, 1.0);

        // gl_FragColor = background; 
        // gl_FragColor = normalizeRG(background);
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
      noHoles: createProgram(gl, noHolesVertex, noHolesPixel),
      reduceBlack: createProgram(gl, reduceBlackVertex, reduceBlackPixel),      
      cleanup: createProgram(gl, cleanupVertex, cleanupPixel),
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
    const sk = 11;
    // init passes with framebuffers
    if (!this.passes) {
      this.passes = [{
        framebuffer: createFramebuffer2D(gl, [textures.noHoles, textures.background]),
        program: this.programs.noHoles,
      }, {
        in: textures.noHoles,
        samplingStep: [sk / colorW, sk / colorH, -sk / colorW, 0.0],
        framebuffer: createFramebuffer2D(gl, [textures.reduceBlack[0]]),
        program: this.programs.reduceBlack,
        handleLeftBlackBorder: 1
      }, {
        in: textures.reduceBlack[0],
        samplingStep: [sk / colorW, sk / colorH, -sk / colorW, 0.0],
        framebuffer: createFramebuffer2D(gl, [textures.reduceBlack[1]]),
        program: this.programs.reduceBlack,
        handleLeftBlackBorder: 0
      }, {
        in: textures.reduceBlack[1],
        samplingStep: [(sk - 2) / colorW, (sk - 2) / colorH, -(sk - 2) / colorW, 0.0],
        framebuffer: createFramebuffer2D(gl, [textures.reduceBlack[2]]),
        program: this.programs.reduceBlack,
        handleLeftBlackBorder: 0
      }, {
        in: textures.reduceBlack[2],
        samplingStep: [(sk - 4) / colorW, (sk - 4) / colorH, -(sk - 4) / colorW, 0.0],
        framebuffer: createFramebuffer2D(gl, [textures.reduceBlack[3]]),
        program: this.programs.reduceBlack,
        handleLeftBlackBorder: 0
      }, {
        in: textures.reduceBlack[3],
        samplingStep: [(sk - 5) / colorW, (sk - 5) / colorH, -(sk - 5) / colorW, 0.0],
        framebuffer: createFramebuffer2D(gl, [textures.reduceBlack[4]]),
        program: this.programs.reduceBlack,
        handleLeftBlackBorder: 0
      }, {
        in: textures.reduceBlack[4],
        samplingStep: [(sk - 7) / colorW, (sk - 7) / colorH, -(sk - 7) / colorW, 0.0],
        framebuffer: createFramebuffer2D(gl, [textures.reduceBlack[5]]),
        program: this.programs.reduceBlack,
        handleLeftBlackBorder: 0
      }, {
        in: textures.reduceBlack[5],
        samplingStep: [(sk - 7) / colorW, (sk - 7) / colorH, -(sk - 7) / colorW, 0.0],
        framebuffer: createFramebuffer2D(gl, [textures.reduceBlack[6]]),
        program: this.programs.reduceBlack,
        handleLeftBlackBorder: 0
      }, {
        samplingStep: [2 / colorW, 2 / colorH, -2 / colorW, 0.0],
        framebuffer: createFramebuffer2D(gl, [textures.cleanup]),
        program: this.programs.cleanup,
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

    // Shaders asume const range up to 0.9, in order to express the depth using
    // color alpha channel.
    const range = 1.5; // meaning 1.1 meters away from camera should be hidden.
    const scale = cameraParams.depthScale * 0.9 / range;

    const noHoles = this.programs.noHoles;
    gl.useProgram(noHoles);

    noHoles.sDepth = gl.getUniformLocation(noHoles, "sDepth");
    noHoles.sPreviousDepth = gl.getUniformLocation(noHoles, "sPreviousDepth");
    noHoles.sColor = gl.getUniformLocation(noHoles, "sColor");
    noHoles.sPreviousBackground = gl.getUniformLocation(noHoles, "sPreviousBackground");

    gl.uniform3f(gl.getUniformLocation(noHoles, 'ddDepth'), 1 / width, 1 / height, 0);
    gl.uniform2f(gl.getUniformLocation(noHoles, 'dd'), 1 / color.w, 1 / color.h);
    gl.uniform1f(gl.getUniformLocation(noHoles, 'depthScale'), scale);
    gl.uniform2f(gl.getUniformLocation(noHoles, 'depthFocalLength'), focalx, focaly);
    gl.uniform2f(gl.getUniformLocation(noHoles, 'depthOffset'), offsetx, offsety);
    gl.uniform2f(gl.getUniformLocation(noHoles, 'colorFocalLengthInv'), colorfocalxinv, colorfocalyinv);
    gl.uniform2f(gl.getUniformLocation(noHoles, 'colorOffset'), coloroffsetx, coloroffsety);
    gl.uniformMatrix4fv(gl.getUniformLocation(noHoles, "colorToDepth"), false, cameraParams.colorToDepth);

    const reduceBlack = this.programs.reduceBlack;
    gl.useProgram(reduceBlack);
    reduceBlack.s = gl.getUniformLocation(reduceBlack, "s");
    reduceBlack.samplingStep = gl.getUniformLocation(reduceBlack, "samplingStep");
    reduceBlack.handleLeftBlackBorder = gl.getUniformLocation(reduceBlack, "handleLeftBlackBorder");

    const cleanup = this.programs.cleanup;
    gl.useProgram(cleanup);
    const lastReduceBlack = textures.reduceBlack[REDUCE_BLACK_PASSES - 1/*textures.reduceBlack.length - 1*/];
    gl.uniform1i(gl.getUniformLocation(cleanup, "s"), lastReduceBlack.unit);
    cleanup.samplingStep = gl.getUniformLocation(cleanup, "samplingStep");
    gl.uniform4f(gl.getUniformLocation(cleanup, 'mappedRectangle'), cameraParams.cameraName == "D415" ? 0.08 : 0, 0, 1, 1);

    const render = this.programs.render;
    gl.useProgram(render);
    gl.uniform1i(gl.getUniformLocation(render, "s"), textures.cleanup.unit); 

    render.sBackground = gl.getUniformLocation(render, "sBackground");
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
            const temp = textures.depth;
            textures.depth = textures.previousDepth;
            textures.previousDepth = temp;
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
            const temp = textures.background;
            textures.previousBackground = textures.background;
            textures.background = textures.previousBackground;
            gl.bindFramebuffer(gl.FRAMEBUFFER, renderer.passes[0].framebuffer);
            gl.framebufferTexture2D(
              gl.FRAMEBUFFER,
              gl.COLOR_ATTACHMENT1,
              gl.TEXTURE_2D,
              textures.background,
              0, // mip-map level
            );
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
          if (pass.samplingStep && pass.program.samplingStep)
            gl.uniform4fv(pass.program.samplingStep, pass.samplingStep);
          if (pass.program.sDepth)
            gl.uniform1i(pass.program.sDepth, textures.depth.unit);
          if (pass.program.sPreviousDepth)
            gl.uniform1i(pass.program.sPreviousDepth, textures.previousDepth.unit);
          if (pass.program.sColor)
            gl.uniform1i(pass.program.sColor, textures.color.unit);
          if (pass.program.sPreviousBackground)
             gl.uniform1i(pass.program.sPreviousBackground, textures.previousBackground.unit);
          if (pass.program.sBackground)
             gl.uniform1i(pass.program.sBackground, textures.background.unit);
          if (pass.program.handleLeftBlackBorder)
             gl.uniform1i(pass.program.handleLeftBlackBorder, pass.handleLeftBlackBorder);           

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