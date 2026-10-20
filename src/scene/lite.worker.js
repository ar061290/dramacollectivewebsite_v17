// The lite tier's smaller copies of pictures (src/scene/lite.js), made off the page's thread: each picture
// comes in transferred (not copied) and goes back as its copy, made with the options it came with; or, if
// the copy could not be made, as it came, so the page still has it.
self.onmessage = async ({ data: { id, bitmap, options } }) => {
  let small = null;
  try {
    small = await createImageBitmap(bitmap, options);
  } catch {
    /* sent back as it came */
  }
  if (small) {
    bitmap.close();
    self.postMessage({ id, bitmap: small, small: true }, [small]);
  } else {
    self.postMessage({ id, bitmap, small: false }, [bitmap]);
  }
};
self.postMessage({ ready: true });
