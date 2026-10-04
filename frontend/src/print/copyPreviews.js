import { EposBuilder } from './eposBuilder.js';
import { TEMPLATES } from './templates.js';
import { renderReceipt, renderReceiptParts } from './preview.js';

// Ordine di esempio per l'anteprima: righe per cucina, bar ed entrambi, con una nota e l'asporto.
const SAMPLE_ORDER = {
  id: 'A12',
  display_code: 'A12',
  created_at: '2026-10-03T19:42:15',
  total: 21.5,
  is_takeaway: true,
  items: [
    { id: 1, name: 'Panino con porchetta', quantity: 2, price: 6, note: 'senza cipolla', print_destination: 'kitchen' },
    { id: 2, name: 'Birra media', quantity: 2, price: 4, print_destination: 'bar' },
    { id: 3, name: 'Acqua naturale 0,5 l', quantity: 1, price: 1.5, print_destination: 'both' },
  ],
};

// Anteprima in testo di ogni copia con i testi e le immagini del tenant. `images` è il provider dei
// template (createBrowserImages nel browser). Ogni anteprima ha `text` (le immagini sono segnaposto con le
// dimensioni) e `parts` (testo e immagini vere, in ordine).
export async function buildCopyPreviews(branding, images) {
  const previews = [];
  for (const [name, template] of Object.entries(TEMPLATES)) {
    const builder = new EposBuilder();
    await template(builder, SAMPLE_ORDER, { branding, images, showLogo: true });
    if (!builder.isEmpty) {
      const xml = builder.buildXml();
      previews.push({ name, text: renderReceipt(xml), parts: renderReceiptParts(xml) });
    }
  }
  return previews;
}
