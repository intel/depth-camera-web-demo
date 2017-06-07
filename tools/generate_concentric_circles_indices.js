/*jshint esversion: 6 */


function generateAllArrays() {
  var xs = [];
  var ys = [];
  var towards_center = [];
  var kernel = 60;
  var index = 0;
  var count_per_radius = [];
  var radius_offset = [];
  var all_indices = [];

  function addElementIfOnDistance(i, j, distance) {
    var d = Math.floor(Math.sqrt(i*i + j*j));
    if (d == distance) {
       xs.push(i);
       ys.push(j);
       all_indices[(kernel + j) * (2 * kernel + 1) + kernel + i] = index++;
       var x_of_element_towards_center = i - Math.sign(i);
       var y_of_element_towards_center = j - Math.sign(j);
       // Get the index of element with towards center x and y.
       var found = false;
       for (var z = xs.length - 1; z >= 0; z--) {
         if (xs[z] == x_of_element_towards_center && ys[z] == y_of_element_towards_center) {
           towards_center.push(z);
           found = true;
           break;
         }
       }
       if (!found)
           console.error("DCHECK failed:" + x_of_element_towards_center + "x" + y_of_element_towards_center);
       return 1;
    }
    return 0;
  }


var t0 = performance.now();
  var offset = 0;
  for (var k = 0; k < kernel; k++) {
    var counter = 0;
    // Generate elements in such way that all the points on the circle with
    // radius k are pushed to the array in clockwise order. 
    // 12:00 -> 3:00
    for (var j = -k; j <= 0; j++) {
      for (var i = 0; i <= k; i++) {
        counter += addElementIfOnDistance(i, j, k);
      }
    }
    // 3:00 -> 6:00
    for (var j = 1; j <= k; j++) {
      for (var i = k; i >= 1; i--) {
        counter += addElementIfOnDistance(i, j, k);
      }
    }
    // 6:00 -> 9:00
    for (var j = k; j >= 1; j--) {
      for (var i = 0; i >= -k; i--) {
        counter += addElementIfOnDistance(i, j, k);
      }
    }
    // 9:00 -> 12:00
    for (var j = 0; j >= -k; j--) {
      for (var i = -k; i <= -1; i++) {
        counter += addElementIfOnDistance(i, j, k);
      }
    }
    radius_offset.push(offset);
    offset += counter;
    count_per_radius.push(counter);
  }

var t1 = performance.now();
console.log("Call to generateAllArrays took " + (t1 - t0) + " milliseconds.");

  console.log("var xs = [" + xs.join() + "];");
  console.log("var ys = [" + ys.join() + "];");
  console.log("var towards_center = [" + towards_center.join() + "];");
  console.log("var count_per_radius = [" + count_per_radius.join() + "];");
  console.log("var radius_offset = [" + radius_offset.join() + "];");

  // Test.
  if (xs.length != towards_center.length)
    console.error("DCHECK failed on length");
  for (var i = 0; i < towards_center.length; ++i) {
    var ti = towards_center[i];
    xdiff = xs[i] - xs[ti];
    ydiff = ys[i] - ys[ti];
    
    if (xs[i] > 0) {
      if (xdiff > 1 || xdiff < 0)
        console.error("DCHECK failed on positive xdiff");
    }
    if (xs[i] < 0) {
      if (xdiff < -1 || xdiff > 0)
        console.error("DCHECK failed on negative xdiff");
    }
    if (ys[i] > 0) {
      if (ydiff > 1 || ydiff < 0)
        console.error("DCHECK failed on positive xdiff");
    }
    if (ys[i] < 0) {
      if (ydiff < -1 || ydiff > 0)
        console.error("DCHECK failed on negative xdiff");
    }
  }

  for (var i = 0; i < radius_offset.length; i++) {
    for (var l = radius_offset[i]; l < radius_offset[i] + count_per_radius[i]; l++) {
      var d = Math.floor(Math.sqrt(xs[l]*xs[l] + ys[l]*ys[l]));
      if (d != i)
        console.error("DCHECK failed on distance"); 
    }
  }
  
  for (var i = 0; i < radius_offset.length; i++) {
    for (var l = radius_offset[i]; l < radius_offset[i] + count_per_radius[i] - 1; l++) {
      if (Math.abs(xs[l] - xs[l + 1]) > 1)
        console.error("DCHECK failed on neigbouring xs:" + xs[l] + "-" + xs[l + 1] + ", ys:" + ys[l] + "-" + ys[l + 1] + " on radius:" + i); 
      if (Math.abs(ys[l] - ys[l + 1]) > 1)
        console.error("DCHECK failed on neigbouring ys"); 
    }
  }
}