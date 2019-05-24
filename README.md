# Depth camera capture in HTML5

<table cellspacing="0" cellpadding="0" style="border-collapse: collapse; border: none;">
<tr>
<td align="center" valign="center">
<img src="gesture/joggling.gif" alt="Video is not yet loaded." style="width:580px;"/>
<br />
</td>
<td align="center" valign="center">
<img src="gesture/hands_interaction.gif" alt="hands_interaction.gif is not yet loaded." style="width:556px;"/>
<br />
</td>
</tr>
<tr>
<td align="center" valign="center" colspan="2">
</br><p>Moving boxes using hands (or a paper) demo shows live depth captured mesh interaction with scene objects; combining 3D world and depth captured hands (or other objects) rendering and Bullet Physics. <a href="gesture/index.html">Run live demo</a>.</br></br>
</p>
</td>
</tr>
<tr>
</tr>
<tr>
<td align="center" valign="center">
<img src="backgroundremoval.gif" alt="backgroundremoval.gif is not yet loaded."/>
<br />
<p>Simple background removal implemented as flood-fill of background color to similarly colored pixels. Works only with simple backgrounds - e.g. room walls on the demo gif. Check the <a href="https://01.org/zh/node/28902">tutorial article</a> and <a href="depthdemo.html">run live demo</a>.</p>
</td>
<td align="center" valign="center">
<img src="typing_in_the_air/typing_in_the_air.gif" alt="typing_in_the_air.gif is not yet loaded."/>
<br />
<p>Typing in the air tutorial shows how to use depth stream and WebGL transform feedback to do simple gesture recognition. Check the <a href="https://software.intel.com/en-us/blogs/2017/06/22/tutorial-typing-in-the-air-using-depth-camera-chrome-javascript-and-webgl-transform">tutorial article</a> and <a href="typing_in_the_air/front_capture_typing.html">run live demo</a>.</p>
</td>
</tr>
<tr>
<td align="center" valign="center">
<img src="https://github.com/intel/depthcamera-pointcloud-web-demo/raw/master/recording.gif" alt="https://github.com/intel/depthcamera-pointcloud-web-demo/raw/master/recording.gif is not yet loaded." style="width:362px;"/>
<br />
<p>3D point cloud rendering demo shows how to render and synchronize depth and color video on GPU. Check the <a href="https://01.org/zh/node/10446">tutorial article</a> and <a href="https://intel.github.io/depthcamera-pointcloud-web-demo/">run live demo</a>.</p>
</td>
<td align="center" valign="center">
<img src="how_the_demo_looks.gif" alt="how_the_demo_looks.gif is not yet loaded." style="height:400px;width:452px;"/>
<br />
<p>HTML5 Depth Capture tutorial shows how to access depth stream, check the <a href="https://01.org/zh/node/5101">tutorial article</a> and <a href="depthdemo.html">run live demo</a>.</p>
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

## Articles related to the demos:
* [Depth Camera Capture in HTML5](https://01.org/zh/node/5101),
* [Typing in the air using depth camera, Chrome, JavaScript, and WebGL transform feedback](https://software.intel.com/en-us/blogs/2017/06/22/tutorial-typing-in-the-air-using-depth-camera-chrome-javascript-and-webgl-transform)
* [AR marker detection on GPU using WebGL](https://01.org/zh/node/26012)
* [Background removal with Intel® RealSense™ Depth Camera, WebRTC*, and WebGL*](https://01.org/zh/node/28902)
* [Background removal using TensorFlow.js](https://01.org/zh/node/29971)




