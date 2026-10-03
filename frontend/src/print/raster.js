// Immagini per la stampante: conversione in bianco e nero a 1 bit (soglia 128, come
// faceva il backend con sharp) e composizione del banner con il numero ordine.
// Usa canvas, quindi gira solo nel browser; i template lo ricevono tramite ctx.images.

const PRINTER_WIDTH = 512;
const SIDE_IMG_WIDTH = 125;

function canvasToRaster(canvas) {
  const { width, height } = canvas;
  const { data } = canvas.getContext('2d').getImageData(0, 0, width, height);
  const bytesPerRow = Math.ceil(width / 8);
  const mono = new Uint8Array(bytesPerRow * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const grey = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      if (grey < 128) mono[y * bytesPerRow + (x >> 3)] |= 0x80 >> (x % 8);
    }
  }
  let binary = '';
  for (let i = 0; i < mono.length; i += 0x8000) binary += String.fromCharCode(...mono.subarray(i, i + 0x8000));
  return { width, height, b64: btoa(binary) };
}

function newCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff'; // lo sfondo trasparente diventerebbe nero con la soglia
  ctx.fillRect(0, 0, width, height);
  return { canvas, ctx };
}

async function loadBitmap(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Immagine non disponibile: ${url}`);
  return createImageBitmap(await res.blob());
}

// images: provider per i template. Senza immagini configurate restituisce null e i template
// ripiegano sul testo. Gli errori di caricamento non bloccano mai la stampa.
export function createBrowserImages({ logoUrl, sideImageUrl } = {}) {
  const cache = new Map();
  const once = (key, load) => {
    if (!cache.has(key)) cache.set(key, load().catch(() => null));
    return cache.get(key);
  };

  return {
    logo: () => !logoUrl ? null : once('logo', async () => {
      const bmp = await loadBitmap(logoUrl);
      const { canvas, ctx } = newCanvas(PRINTER_WIDTH, Math.round(bmp.height * PRINTER_WIDTH / bmp.width));
      ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
      return canvasToRaster(canvas);
    }),

    // Riga con l'immagine laterale ripetuta ai due lati e il numero al centro.
    // variant 'slip': numeretto con "Buon appetito!"; 'header': intestazione delle copie di ritiro.
    numberBanner: async (code, variant) => {
      if (!sideImageUrl) return null;
      const side = await once('side', () => loadBitmap(sideImageUrl));
      if (!side) return null;
      const sideH = Math.round(side.height * SIDE_IMG_WIDTH / side.width);
      const h = sideH + 60;
      const centerW = PRINTER_WIDTH - SIDE_IMG_WIDTH * 2;
      const { canvas, ctx } = newCanvas(PRINTER_WIDTH, h);
      const sideY = (h - sideH) / 2;
      ctx.drawImage(side, 0, sideY, SIDE_IMG_WIDTH, sideH);
      ctx.drawImage(side, SIDE_IMG_WIDTH + centerW, sideY, SIDE_IMG_WIDTH, sideH);
      ctx.fillStyle = '#000';
      ctx.textAlign = 'center';
      const cx = SIDE_IMG_WIDTH + centerW / 2;
      if (variant === 'slip') {
        ctx.font = `bold ${(h - 45) * 0.7}px monospace`;
        ctx.fillText(` ${code} `, cx, h * 0.5);
        ctx.font = 'italic 600 40px sans-serif';
        ctx.fillText('Buon appetito!', cx, h * 0.95);
      } else {
        ctx.font = '600 28px sans-serif';
        ctx.fillText('NUMERO ORDINE:', cx, h * 0.15);
        ctx.font = `bold ${(h - 45) * 0.75}px monospace`;
        ctx.fillText(code, cx, h * 0.95);
      }
      return canvasToRaster(canvas);
    },
  };
}

export const NO_IMAGES = { logo: () => null, numberBanner: () => null };
