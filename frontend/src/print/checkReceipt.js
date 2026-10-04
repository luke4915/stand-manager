import { getPrintConfig } from './config.js';
import { createBrowserImages } from './raster.js';
import { enqueuePrintJobs } from './queue.js';
import { buildReceiptJob } from './receiptJob.js';

// Stampa la ricevuta non fiscale di un conto (o di un pagamento) mettendola nella coda di stampa locale.
// Ritorna true se è in coda, false se non c'è una stampante configurata.
export async function printCheckReceipt(receipt) {
  const config = await getPrintConfig();
  if (!config) return false;
  const job = await buildReceiptJob(config, receipt, createBrowserImages(config.images));
  if (!job) return false;
  await enqueuePrintJobs([job], `receipt-${receipt.check.id}-${Date.now()}`, `C${receipt.check.number}`);
  return true;
}
