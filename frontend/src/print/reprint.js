import { db } from '../offline/db.js';
import { buildPrintJobs } from './print.js';
import { createBrowserImages } from './raster.js';
import { enqueuePrintJobs } from './queue.js';
import { recordPendingReprint } from './localOrders.js';

// Ristampa un ordine dall'archivio locale, senza server. L'invio parte dalla coda di stampa e la
// ristampa resta annotata per l'audit, che si comunica al server al ritorno della rete.
// Ritorna il numero di stampanti accodate (0 = ordine non in archivio o stampa non configurata).
export async function reprintFromLocal(clientOrderId, config) {
  const row = await db.printedOrders.get(clientOrderId);
  if (!row || !config) return 0;
  const jobs = await buildPrintJobs(config.settings, row.order, { branding: config.branding, images: createBrowserImages(), showLogo: true });
  if (!jobs.length) return 0;
  await enqueuePrintJobs(jobs, `reprint-${clientOrderId}-${Date.now()}`, row.order.display_code);
  await recordPendingReprint(clientOrderId);
  return jobs.length;
}
