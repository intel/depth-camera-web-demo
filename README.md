# Depth camera capture in HTML5

<table cellspacing="0" cellpadding="0" style="border-collapse: collapse; border: none;">
<tr>
<td align="center" valign="center">
<img src="gesture/hands_interaction.gif" alt="hands_interaction.gif is not yet loaded." style="width:702px;"/>
<br />
<p>Moving boxes using hands demo shows live depth captured mesh interaction with scene objects; combining 3D world and depth captured hands (or other objects) rendering and Bullet Physics. <a href="https://01org.github.io/depth-camera-web-demo/gesture/index.html">Run the live demo here.</a></p>
</td>
<td align="center" valign="center">
<img src="https://github.com/01org/depthcamera-pointcloud-web-demo/raw/master/recording.gif" alt="https://github.com/01org/depthcamera-pointcloud-web-demo/raw/master/recording.gif is not yet loaded." style="height:400px;width:422px;"/>
<br />
<p>3D point cloud rendering demo shows how to render and synchronize depth and color video on GPU. <a href="https://01org.github.io/depthcamera-pointcloud-web-demo/">Run the live demo here.</a></p>
</td>
</tr>
<tr>
<td align="center" valign="center">
<img src="typing_in_the_air/typing_in_the_air.gif" alt="typing_in_the_air.gif is not yet loaded." style="height:400px;width:702px;"/>
<br />
<p>Typing in the air tutorial shows how to use depth stream and WebGL transform feedback to do simple gesture recognition. Check the <a href="https://01org.github.io/depth-camera-web-demo/typing_in_the_air/doc/tutorial.html">tutorial text</a> and <a href="https://01org.github.io/depth-camera-web-demo/typing_in_the_air/front_capture_typing.html">run the live demo here.</a></p>
</td>
<td align="center" valign="center">
<img src="how_the_demo_looks.gif" alt="how_the_demo_looks.gif is not yet loaded." style="height:400px;width:452px;"/>
<br />
<p>HTML5 Depth Capture tutorial shows how to access depth stream, check the <a href="https://01.org/chromium/blogs/astojilj/2017/depth-camera-capture-html5">tutorial text</a> or <a href="https://01org.github.io/depth-camera-web-demo/depthdemo.html">run the live demo here.</a></p>
</td>
</tr>
</table>

To capture and manipulate depth camera stream in HTML5, you'll need:
* Chrome browser version 62 or later (the official release and no need for additional extensions),
* Intel® RealSense™ 3D camera plugged to USB 3.0 port
     * SR300 (and related cameras like Razer Stargazer or Creative BlasterX
Senz3D) or R200,
* Windows, Linux or ChromeOS PC.

These are the constraints of current implementation. The plan is to support other depth cameras and OSX and Android, too.

The articles explaining the demos and how to use the depth camera capture with WebGL:
* [Depth Camera Capture in HTML5](https://01.org/chromium/blogs/astojilj/2017/depth-camera-capture-html5),
* [How to create a 3D view from a depth camera in WebGL](https://01.org/blogs/mkollaro/2017/how-to-create-3d-view-in-webgl)
* [Typing in the air using depth camera, Chrome, JavaScript, and WebGL transform feedback](https://software.intel.com/en-us/blogs/2017/06/22/tutorial-typing-in-the-air-using-depth-camera-chrome-javascript-and-webgl-transform)

