import { getLineTotal, getEffectivePrice, getDiscountedTotal } from '../utils/pricing';
import { getPrintConfig } from './config.js';
import { buildPrintJobs } from './print.js';
import { createBrowserImages } from './raster.js';
import { enqueuePrintJobs } from './queue.js';
import { saveLocalOrder } from './localOrders.js';
import { reprintFromLocal } from './reprint.js';

// Stampa le copie di un ordine appena battuto: le prepara, le mette in coda locale e prova
// a inviarle subito. Non dipende dal server, quindi funziona anche offline.
// Ritorna il numero di stampanti a cui è stato accodato un lavoro (0 = stampa non configurata).
export async function printOrderTickets({ cart, displayCode, clientOrderId, sessionId, isTakeaway }) {
  const config = await getPrintConfig();
  if (!config?.settings.some(s => s.enabled && s.printer_address)) return 0;

  const order = {
    id: displayCode,
    display_code: displayCode,
    created_at: new Date().toISOString(),
    total: getDiscountedTotal(cart),
    is_takeaway: isTakeaway,
    items: cart.map(i => ({ ...i, price: getEffectivePrice(i), line_total: getLineTotal(i) })),
  };

  const ctx = { branding: config.branding, images: createBrowserImages(config.images), showLogo: true };
  const jobs = await buildPrintJobs(config.settings, order, ctx);
  await saveLocalOrder(clientOrderId, sessionId, order); // per la ristampa offline
  await enqueuePrintJobs(jobs, clientOrderId, displayCode);
  return jobs.length;
}

// Come sopra, per una ristampa (l'invio parte dalla coda): i dati arrivano dall'ordine salvato (items già con prezzi effettivi).
export async function reprintOrder(savedOrder) {
  const config = await getPrintConfig();
  if (!config) return 0;
  const order = { ...savedOrder, id: savedOrder.display_code };
  const jobs = await buildPrintJobs(config.settings, order, { branding: config.branding, images: createBrowserImages(config.images), showLogo: true });
  await enqueuePrintJobs(jobs, `reprint-${savedOrder.id}-${Date.now()}`, savedOrder.display_code);
  return jobs.length;
}

// Ristampa dall'archivio locale: funziona anche senza server.
export async function reprintLocal(clientOrderId) {
  return reprintFromLocal(clientOrderId, await getPrintConfig());
}
