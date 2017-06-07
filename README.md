# Depth camera capture in HTML5

<table cellspacing="0" cellpadding="0" style="border-collapse: collapse; border: none;">
<tr>
<td align="center" valign="center">
<img src="how_the_demo_looks.gif" alt="how_the_demo_looks.gif is not yet loaded." style="height:400px;width:452px;"/>
<br />
<p>HTML5 Depth Capture tutorial shows how to access depth stream, check the <a href="https://01.org/chromium/blogs/astojilj/2017/depth-camera-capture-html5">tutorial text</a> or <a href="depthdemo.html">run the live demo here.</a></p>
</td>
<td align="center" valign="center">
<img src="typing_in_the_air/typing_in_the_air.gif" alt="typing_in_the_air.gif is not yet loaded." style="height:400px;width:702px;"/>
<br />
<p>Typing in the air tutorial shows how to use depth stream and WebGL transform feedback to do simple gesture recognition. Check the <a href="typing_in_the_air/doc/tutorial.html">tutorial text</a> and <a href="typing_in_the_air/front_capture_typing.html">run the live demo here.</a></p>
</td>
<td align="center" valign="center">
<img src="https://github.com/01org/depthcamera-pointcloud-web-demo/raw/master/recording.gif" alt="https://github.com/01org/depthcamera-pointcloud-web-demo/raw/master/recording.gif is not yet loaded." style="height:400px;width:422px;"/>
<br />
<p>3D point cloud rendering demo shows how to render and synchronize depth and color video on GPU. <a href="https://01org.github.io/depthcamera-pointcloud-web-demo/">Run the live demo here.</a></p>
</td>
</tr>
</table>

To capture and manipulate depth camera stream in HTML5, you'll need:
* Chrome browser version 58 or later (no need for additional extensions),
    * Version 58 is currently available [from Beta channel](http://www.chromium.org/getting-involved/dev-channel),
* Intel® RealSense™ 3D camera plugged to USB 3.0 port
     * SR300 (and related cameras like Razer Stargazer or Creative BlasterX
Senz3D) or R200,
* Windows, Linux or ChromeOS PC.

These are the constraints of current implementation. The plan is to support other depth cameras and OSX and Android, too.

An explanation on how to use the depth camera is in the article
[Depth Camera Capture in HTML5](https://01.org/chromium/blogs/astojilj/2017/depth-camera-capture-html5).


The example code here covers:

* Displaying depth video stream in <video> element
* uploading depth frame data to WebGL texture,
* enumerating depth frame data pixel values in loop.
