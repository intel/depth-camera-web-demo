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
    this.colorVideo = createVideo();
    this.depthVideo = createVideo();
    let gl;
    try {
        gl = canvas.getContext('webgl2');
    } catch (e) {
        console.error('Your browser doesn\'t support WebGL2.');
        throw new Error(`Could not create WebGL2 context: ${e}`);
    }
    this.programs = setupPrograms(gl);
    initAttributes(gl);
    gl.getExtension('EXT_color_buffer_float');
    gl.getExtension('OES_texture_float_linear');
  }

  createVideo() {
    var video = document.createElement("video");
    video.autoplay = true;
    video.loop = true;
    video.crossOrigin = "anonymous";
    video.width = 640;
    video.height = 480;
    video.init_done = false;
    video.oncanplay = function(){
      video.video_loaded=true;
    };  
    return video;
  }

  async setupCamera() {
  	const depthStream = await DepthCamera.getDepthStream();
  	const depth = depth_stream.getVideoTracks()[0];
  	const color_stream =
  	    await DepthCamera.getColorStreamForDepthStream(depth_stream);

  	this.colorVideo.srcObject = colorStream;
  	this.depthVideo.srcObject = depthStream;
  	return DepthCamera.getCameraCalibration(depthStream);
  }

  // Create textures into which the camera output will be stored.
  function setupTextures(gl, programs, width, height, colorwidth, colorheight) {
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

  	return {
  	    depth: depth,
  	    color: color,
  	    d2c: d2c
  	};

  }

  initUniforms(gl, cameraParams, width, height) {
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

  	const d2c = programs.d2c;
  	gl.useProgram(d2c);
  	gl.uniform1i(gl.getUniformLocation(d2c, "sDepth"), textures.depth.unit);
  	gl.uniform1i(gl.getUniformLocation(d2c, "s"), textures.color.unit);
  	gl.uniform1f(gl.getUniformLocation(d2c, 'depthScale'), cameraParams.depthScale);
  	gl.uniform2f(gl.getUniformLocation(d2c, 'depthFocalLength'), focalx, focaly);
  	gl.uniform2f(gl.getUniformLocation(d2c, 'depthOffset'), offsetx, offsety);
  	gl.uniform2f(gl.getUniformLocation(d2c, 'colorFocalLength'), colorfocalx, colorfocaly);
  	gl.uniform2f(gl.getUniformLocation(d2c, 'colorOffset'), coloroffsetx, coloroffsety);
  	gl.uniformMatrix4fv(gl.getUniformLocation(d2c, "depthToColor"), false, cameraParams.depthToColor);

  	const render = programs.render;
  	gl.useProgram(render);
  	gl.uniform1i(gl.getUniformLocation(d2c, "d2c"), d2cTexture.unit;
    
  }


  setupPrograms(gl) {
  	// need them and add another pass that would, using depth camera, calculate
  	// 3D position of AR marker square.
  	// first pass would be mapping depth to color for all pixels.
  	const depthToColorVertex = `#version 300 es
  	  precision highp float;
  	  uniform float depthScale;
  	  uniform vec2 depthOffset;
  	  uniform vec2 colorOffset;
  	  uniform vec2 depthFocalLength;
  	  uniform vec2 colorFocalLength;
  	  uniform mat4 depthToColor;
  	  uniform sampler2D sDepth;

  	  out vec4 position;

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
  	    vec2 position2d = (depth_texture_coord - depthOffset) / depthFocalLength;
  	    vec3 depthPos = vec3(position2d * depth_scaled, depth_scaled);
  	    vec4 colorPos = depthToColor * vec4(depthPos, 1.0);
  	    
  	    position2d = colorPos.xy / colorPos.z;
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
  	  varying vec2 t;

  	  void main(){
  	    vec4 tex = texture2D(s, t);
  	    gl_FragColor = tex;
  	  }`;  

  	createProgram = (gl, vs, ps) => {
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
  	  gl.enableVertexAttribArray(vertex_location);
  	  program.vertex_location = vertex_location;
  	  gl.bindBuffer(gl.ARRAY_BUFFER, vertex_buffer);
  	  gl.vertexAttribPointer(vertex_location, 2, gl.FLOAT, false, 0, 0);
  	  return program;
  	}

  	return {
  	  d2c: createProgram(gl, depthToColorVertex, depthToColorPixel),
  	  render: createProgram(gl, renderVertex, renderPixel)
  	}
  }
   
  setup(gl, cameraParams, depthW, depthH, colorW, colorH) {
    createFramebuffer2D = (gl, textureList) => {
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

  	this.textures = setupTextures(gl, this.programs, width, height, colorW, colorH);
  	initUniforms(gl, cameraParams, depthW, depthH);
  	// init passes with framebuffers
  	this.passes = [{
  	  in: textures.depth,
  	  framebuffer: this.createFramebuffer2D(gl, [textures.d2c]),
  	  program: this.programs.d2c
  	}, {
  	  in: textures.d2c,
  	  framebuffer: null,
  	  program: this.programs.render
  	}];
  }

  initAttributes(gl) {

  }

  doMain() {
  	this.cameraParams = await setupCamera();

  	let frame = 0;
  	let textures;
  	const colorVideo = this.colorVideo;
  	const depthVideo = this.colorVideo;
  	const programs = this.programs;
  	const renderer = this;

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
  	      let source = depthVideo;
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
  	        source,
  	      );
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
  	        colorStreamElement,
  	      );
  	    } catch (e) {
  	      console.error(`Error uploading video to WebGL:
  	                    ${e.name}, ${e.message}`);
  	    }

  	    let l;
  	    let program;
        gl.bindVertexArray(gl.vao_markers);  
  	    for (let i = 0; i < gl.passes.length; ++i) {
  	      const pass = gl.passes[i];
  	      // comment previous two lines and uncomment following to measure
  	      // latency of rendering only
  	      // { const pass = gl.passes[6];
  	      gl.useProgram(pass.program);
  	      gl.bindFramebuffer(gl.FRAMEBUFFER, pass.framebuffer);

  	      if(pass.points) {
  	        gl.bindVertexArray(gl.vertexAttribArray);
  	        gl.drawArrays(gl.POINTS, 0, pass.points);
  	        gl.bindVertexArray(gl.vao_markers);
  	        continue;
  	      }
  	      gl.bindBuffer(gl.ARRAY_BUFFER, gl.vertex_buffer);
  	      gl.vertexAttribPointer(pass.program.vertex_location, 2, gl.FLOAT, false, 0, 0);
  	      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.index_buffer);
  	      gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);              
  	    }

  	    frame += 1;
  	  }
  	  window.requestAnimationFrame(animate);
  	};
  	animate();
  }
}