// Anteprima in testo dell'XML ePOS: mostra una copia come uscirebbe dalla stampante, senza immagini
// reali (al loro posto un segnaposto con le dimensioni). Serve all'anteprima nel pannello master e
// alla stampante simulata (scripts/mock-epos.js). Nessuna dipendenza dal browser.
const WIDTH = 42; // caratteri per riga, come la TM-T20 a 80 mm con font A

const decode = (s) => s.replace(/&#10;/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const attr = (tag, name) => tag.match(new RegExp(`${name}="([^"]*)"`))?.[1];

// Disegna l'XML ePOS come uno scontrino di testo: allineamento, ingrandimenti in larghezza,
// banda inversa, immagini e QR (questi ultimi indicati con un segnaposto).
export function renderReceipt(xml) {
  const lines = [];
  const edge = `+${'-'.repeat(WIDTH)}+`;
  const row = (text) => lines.push(`|${text.padEnd(WIDTH).slice(0, WIDTH)}|`);

  for (const [, name, attrs, body = ''] of xml.matchAll(/<(text|feed|cut|image|barcode)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/\1>)/g)) {
    if (name === 'text') {
      const content = decode(body);
      if (!content) continue; // <text align="center"/> da solo: cambia solo l'allineamento
      const width = Number(attr(attrs, 'width') || 1);
      const shown = attr(attrs, 'reverse') === 'true' ? `▌${content}▐` : content;
      const spaced = width > 1 ? [...shown].join(' '.repeat(width - 1)) : shown;
      const align = attr(attrs, 'align');
      const pad = align === 'center' ? Math.floor((WIDTH - spaced.length) / 2) : align === 'right' ? WIDTH - spaced.length : 0;
      row(' '.repeat(Math.max(0, pad)) + spaced);
      if (Number(attr(attrs, 'height') || 1) > 1) row('');
    } else if (name === 'feed') {
      for (let i = 0; i < Number(attr(attrs, 'line') || 1); i++) row('');
    } else if (name === 'image') {
      row(`   [immagine ${attr(attrs, 'width')}x${attr(attrs, 'height')}px]`);
    } else if (name === 'barcode') {
      row(`   [${attr(attrs, 'type')}: ${decode(body)}]`);
    } else if (name === 'cut') {
      lines.push(`${'- '.repeat(WIDTH / 2 + 1)}✂ taglio`);
    }
  }
  return [edge, ...lines, edge].join('\n');
}
