// Stopping a three.js renderer's animation loop. three asks for the loop's next frame after the loop's
// callback has returned, so a stop made from inside the callback cancels the frame already running and
// leaves an empty loop asking for every frame for good (and, once started again, a second loop beside
// it: the callback twice a frame). So the stop is made again just after the callback (a microtask runs
// once it has returned), unless the loop was started again meanwhile. From outside a callback the
// second stop does nothing.

/** Stop `renderer`'s animation loop; `stillStopped()` says whether it should still be stopped a moment later. */
export function stopLoop(renderer, stillStopped) {
  renderer.setAnimationLoop(null);
  queueMicrotask(() => { if (stillStopped()) renderer.setAnimationLoop(null); });
}
