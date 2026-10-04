// Prepara un'immagine per la stampante termica: la ridimensiona e la riduce a bianco e nero
// (stessa soglia della stampa), così in anteprima si vede esattamente cosa uscirà. Ritorna un data URL PNG.
const THRESHOLD = 128;

export async function toBlackWhiteDataUrl(file, maxWidth) {
  const bitmap = await createImageBitmap(file);
  const width = Math.min(maxWidth, bitmap.width);
  const height = Math.max(1, Math.round(bitmap.height * width / bitmap.width));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff'; // lo sfondo trasparente diventerebbe nero con la soglia
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);

  const image = ctx.getImageData(0, 0, width, height);
  const { data } = image;
  for (let i = 0; i < data.length; i += 4) {
    const grey = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    const value = grey < THRESHOLD ? 0 : 255;
    data[i] = data[i + 1] = data[i + 2] = value;
    data[i + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  return canvas.toDataURL('image/png');
}
