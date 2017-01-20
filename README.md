# Depth camera capture in HTML5

![Alt text](/how_the_demo_looks.gif?raw=true "Depth camera capture demo")

To capture and manipulate depth camera stream in HTML5, you'll need:
* Latest Chrome browser (no need for additional extensions),
* Intel Realsense camera plugged to USB 3.0 port of a
* Windows, Linux or ChromeOS PC.

These are the constraints of current implementation. The plan is to support other depth cameras and OSX and Android, too.

We are going to use camera's 16-bit depth stream in example code. Some of the use cases, like 3D pointcloud rendering, 3D scannning or object recognition, require higher data precision than 8-bit precision provided through ImageData that is most commonly used to access color video pixels data. http://www.w3schools.com/tags/canvas_getimagedata.asp 

The example code here covers
* Displaying depth video stream in <video> element
* uploading depth frame data to WebGL texture,
* enumerating depth frame data pixel values in loop.
