// Shrinks a photo before it is uploaded: phone photos are often 4000px and
// 5-10 MB, far more than a web page needs. The longest side becomes at most
// MAX_SIDE and the result is a JPEG. Also fixes sideways phone photos, since
// createImageBitmap applies the EXIF orientation.
const MAX_SIDE = 1800;
const QUALITY = 0.86;

export async function shrinkImage(file) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    // The browser can't read it (e.g. HEIC outside Safari): send it as is
    // and let the server accept or refuse it.
    return file;
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', QUALITY));
  return blob ?? file;
}
