# Depth camera capture in HTML5

![Alt text](/how_the_demo_looks.gif?raw=true "Depth camera capture demo")

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
