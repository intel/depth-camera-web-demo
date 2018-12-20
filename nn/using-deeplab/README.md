## DeepLabV3+ segmentation in TensorFlow.js

In the [previous work](https://01.org/blogs/astojilj/2018/background-removal-intel-realsense-depth-camera-webrtc-and-webgl), I used a Intel® RealSense™ Depth Camera with the Chrome* Web browser to implement [a working prototype](https://01.org/sites/default/files/users/u58404/bg-removal-1.gif).<br /> Here, instead of using a depth camera, I use a standard web camera, TensorFlow.js and DeepLab3+ MobileNetV2 model downloaded from exported to lower resolution and converted to TensorFlow.js web friendly format.

This is not a background removal demo, yet - it doesn't handle borders, like it is done in [depth camera demo](https://01.org/sites/default/files/users/u58404/bg-removal-1.gif), nor it includes [all the planned optimizations](https://01.org/blogs/astojilj/2018/background-removal-tensorflow.js). In addition to use previous mask as input to speedup the inference the plan is to utilize also depth camera input, when available.

This code is used for benchmarking TensorFlow.js implementation. TensorFlow.js tfjs-core code included here is built from pull requests [#1448 Packed batch<->space ND](https://github.com/tensorflow/tfjs-core/pull/1448) and [#1423 Packed arithmetics](https://github.com/tensorflow/tfjs-core/pull/1423) applied to master at [a71700b](https://github.com/tensorflow/tfjs-core/commit/a71700bedf5a65b79203a88523e4c27d3e9b9ae8).

## Benchmark results

Benchmark runs inference and dataSync() to read back data from GPU on every frame and displays last 20 frames average for both as *total(inference + dataSync)ms* per frame.<br />

The result shows that packing operations, when using GL_FLOAT output (*packing* here means 2x2 pixel block from GL_R32F texture gets encoded as 1 pixel in GL_RGBA32F texture) don't show improvement.<br />

On the other hand, when forcing GL_HALF_FLOAT use, not only that unpacked operations are faster, but there is a significant improvement of half float packed operations compared to half float unpacked operations.

MBP 

P H: 125
P: 195
U: 195
U H: 170

PH 680



## Converting DeepLab model to TensorFlow.js friendly format with lower resolution

Original DeepLabV3+ MobileNetV2 [checkpoints at TensorFlow models repo](https://github.com/tensorflow/models/blob/master/research/deeplab/g3doc/model_zoo.md) are supporting 513x513 input. The example shows that we can use this, higher precision (and higher memory bandwidth) implementation, on [high end laptop GPU](https://01.org/blogs/astojilj/2018/background-removal-tensorflow.js). Lower resolution input model, e.g. 257x257, is used here for benchmarking because it performs significantly better, but still quite slow, on mid range laptop GPUs and mobile.

The simplest way to export the low res variant of original frozen model is to clone [TensorFlow/models](https://github.com/tensorflow/models) repository. Then, modify DeepLab test script like below and run ```sh local_test_mobilenetv2.sh```.

```
--- a/research/deeplab/local_test_mobilenetv2.sh
+++ b/research/deeplab/local_test_mobilenetv2.sh
@@ -124,8 +124,8 @@ python "${WORK_DIR}"/export_model.py \
   --export_path="${EXPORT_PATH}" \
   --model_variant="mobilenet_v2" \
   --num_classes=21 \
-  --crop_size=513 \
-  --crop_size=513 \
+  --crop_size=257 \
+  --crop_size=257 \
   --inference_scales=1.0
```

This generates frozen_inference_graph.pb. After this, I used transform_graph tool to replace batch normalizations with add operations (biasAdd) followed by tensorflowjs_converter, to export to TensorFlow.js web friendly model.

```
bazel-bin/tensorflow/tools/graph_transforms/transform_graph --in_graph=frozen_inference_graph.pb --out_graph=frozen_inference_graph_257_1.pb --inputs='ImageTensor' --outputs='ArgMax' --transforms='strip_unused_nodes(type=float, shape="1,257,257,3") fold_constants(ignore_errors=true) fold_batch_norms fold_old_batch_norms'

bazel-bin/tensorflow/tools/graph_transforms/transform_graph --in_graph=frozen_inference_graph_257_1.pb --out_graph=frozen_inference_graph_257_2.pb --inputs='ImageTensor' --outputs='ArgMax' --transforms='strip_unused_nodes(type=float, shape="1,257,257,3") fold_constants(ignore_errors=true) fold_batch_norms fold_old_batch_norms'

tensorflowjs_converter --input_format=tf_frozen_model --output_node_names="ArgMax" --saved_model_tags=serve ./frozen_inference_graph_257_2.pb  argmax257_2
```


## References

**DeepLab: Semantic Image Segmentation with Deep Convolutional Nets,**
    **Atrous Convolution, and Fully Connected CRFs** <br />
    Liang-Chieh Chen+, George Papandreou+, Iasonas Kokkinos, Kevin Murphy, and Alan L Yuille (+ equal
    contribution). <br />
    [[link]](http://arxiv.org/abs/1606.00915). TPAMI 2017.
 
 **MobileNetV2: Inverted Residuals and Linear Bottlenecks**<br />
    Mark Sandler, Andrew Howard, Menglong Zhu, Andrey Zhmoginov, Liang-Chieh Chen<br />
    [[link]](https://arxiv.org/abs/1801.04381). In CVPR, 2018.
