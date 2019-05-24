### How to specify calibration parameters for RealSense cameras

After exploring possibility to implement JavaScript API that would fetch calibration parameters from camera ([link to outdated specification for the reference](https://www.w3.org/TR/2017/WD-mediacapture-depth-20170328/)), that approach got abandoned calibration parameters are instead, specified in JavaScript code here, in [depth-camera.js](https://github.com/intel/depth-camera-web-demo/blob/926fd23c535e3a5a07fcfb94bf9afea0e31a9dc4/depth-camera.js#L149) file. Given that all RealSense cameras of the same model are factory calibrated to the same values and that firmware update (so far) doesn't change calibration parameters, specifying constant values in depth-camera.js and lookup based on camera label worked fine,... so far.

The section here explains where from, and how to, add numerical values to depth-camera.js file. This work is required for new camera models or if you want to support depth or color stream track resolutions that are not yet specified in depth-camera.js.

We would need [rs-enumerate-devices](https://github.com/IntelRealSense/librealsense/tree/master/tools/enumerate-devices) tool. It is part of RealSense SDK. Install SDK binary [binary or build it from source code](https://github.com/IntelRealSense/librealsense/). Connect the camera and run ```rs-enumerate-devices -c``` to get the calibration data printed out to terminal. Copy values from there to [depth-camera.js](https://github.com/intel/depth-camera-web-demo/blob/926fd23c535e3a5a07fcfb94bf9afea0e31a9dc4/depth-camera.js#L274) following the example:

```
    } else if (cameraName === "SR300")  {
      result =  {
```

Run `rs-enumerate-devices -o` - depthScale value is in a row containing `Depth Units` label. 

```
        depthScale: 0.0001249866472790017724,
```

Provide depth intrinstics for resolutions you plan to use. `rs-enumerate-devices -c` prints out this:

```
Intrinsic of "Depth"      640x480         Z16
Width:          640
Height:         480
PPX:            307.147125244141
PPY:            245.624420166016
Fx:             474.499542236328
Fy:             474.499420166016
Distortion:     Inverse Brown Conrady
Coeffs:         0.126395508646965       0.0701233819127083      0.00355594046413898     0.00548861175775528     0.103697031736374
```

From the output,  we just copy values to `getDepthIntrinsics` and `depthDistortionModel` below. `getColorIntrinsics`data is populated following the same pattern - note that there multiple resolutions (Intrinsic of "Color" 640x480, Intrinsic of "Color" 1280x720, ...) supported with different constants to be copied from `rs-enumerate-devices -c` output. 

```
        getDepthIntrinsics: function(width, height) {
          if (width == 640 && height == 480) {
            return {
              offset: [307.147125244141, 245.624420166016],
              focalLength: [474.499542236328, 474.499420166016],
            };
          } else {
            throwUnsupportedSizeError();
          }
        },
        getColorIntrinsics: function(width, height) {
          if (width == 640 && height == 480) {
            return {
              offset: [305.502166748047, 247.462982177734],
              focalLength: [618.239440917969, 618.239562988281],
            };
          } else if (width == 1280 && height == 720) {
            return {
              offset: [618.253234863281, 371.194458007812],
              focalLength: [927.359130859375, 927.359313964844],
            };
          } else if (width == 1920 && height == 1080) {
            return {
              offset: [927.3798828125, 556.791687011719],
              focalLength: [1391.03869628906, 1391.03894042969],
            };
          } else {
            throwUnsupportedSizeError();
          }
        },
        colorOffset: new Float32Array(
          [305.502166748047, 247.462982177734]
        ),
        colorFocalLength: new Float32Array(
          [618.239440917969, 618.239562988281]
        ),
        
```

depthToColor values are copied from `rs-enumerate-devices -c` `Extrinsic from "Depth" To "Color"` section.

```
Extrinsic from "Depth"    To      "Color" :
Rotation Matrix:
0.99999        0.0034401      -0.0016265
-0.003436      0.99999        0.0024992
0.0016351      -0.0024936     1

Translation Vector: 0.0256999991834164  0.00126673700287938  0.00358582031913102
```

Note how the command output is column major compared to depthToColor layout below - three elements of the first printed row are the first three depthToColor column elements. We have patched [this line in rs-enumerate-devices](https://github.com/IntelRealSense/librealsense/blob/d0f0e5e5238ad8c729957c1d82297452c32e8d72/tools/enumerate-devices/rs-enumerate-devices.cpp#L26) to obtain higher precision values.

The fourth row of depthToColor matrix is populated from `Translation Vector`values.

```

        depthToColor: [
          0.999992787837982, -0.00343602383509278, 0.00163511745631695, 0,
          0.00344009511172771, 0.999990999698639, -0.00249356147833169, 0,
          -0.00162653462029994, 0.00249916850589216, 0.999995589256287, 0,
          0.0256999991834164, 0.00126673700287938, 0.00358582031913102, 1
        ],
        colorToDepth: [
          0.999992787837982, -0.00343602383509278, 0.00163511745631695, 0,
          0.00344009511172771, 0.999990999698639, -0.00249356147833169, 0,
          -0.00162653462029994, 0.00249916850589216, 0.999995589256287, 0,
          -0.0257013235241175, -0.00134619453456253, -0.00354716833680868, 1
        ],        
        depthDistortionModel: DistortionModel.INVERSE_BROWN_CONRADY,
        depthDistortioncoeffs: [
          0.126395508646965,
          0.0701233819127083,
          0.00355594046413898,
          0.00548861175775528,
          0.103697031736374,
        ],
        colorDistortionModel: DistortionModel.NONE,
        colorDistortioncoeffs: [0, 0, 0, 0, 0],
      };
}

```
