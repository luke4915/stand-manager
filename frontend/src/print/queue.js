import { db } from '../offline/db.js';
import { getDriver } from './print.js';

// Coda di stampa locale: ogni lavoro è l'XML di una stampante per un ordine. Resta in coda finché
// la stampante non lo accetta (spenta, carta finita, rete assente): niente va perso in silenzio.
const CHANGED_EVENT = 'standmanager:print-queue-changed';
const ADDED_EVENT = 'standmanager:print-jobs-added';
const notify = (name = CHANGED_EVENT) => window.dispatchEvent(new Event(name));

const subscribe = (name) => (handler) => {
  window.addEventListener(name, handler);
  return () => window.removeEventListener(name, handler);
};
export const onQueueChanged = subscribe(CHANGED_EVENT); // il contenuto della coda è cambiato
export const onJobsAdded = subscribe(ADDED_EVENT);      // nuovi lavori da inviare subito

// jobs: da buildPrintJobs(). orderKey: identifica l'ordine (client_order_id).
export async function enqueuePrintJobs(jobs, orderKey, displayCode) {
  const rows = jobs.map(job => ({
    key: `${orderKey}:${job.key}`,
    displayCode,
    driver: job.driver.id,
    host: job.host,
    port: job.port,
    xml: job.builder.buildXml(),
    copies: job.copies,
    status: 'pending',
    attempts: 0,
    lastError: null,
    createdAt: Date.now(),
  }));
  // Un ordine già accodato (stessa chiave) non si duplica
  await db.printJobs.bulkAdd(rows).catch(err => {
    if (err.name !== 'BulkError' || err.failures.some(f => f.name !== 'ConstraintError')) throw err;
  });
  notify();
  notify(ADDED_EVENT);
}

export const countPrintJobs = () => db.printJobs.count();

let flushing = null;
let rerun = false;

async function flushOnce() {
  const newlyFailed = [];
  const jobs = await db.printJobs.orderBy('createdAt').toArray();
  const blocked = new Set(); // una stampante che non risponde non si interroga di nuovo in questo giro
  for (const job of jobs) {
    const printer = `${job.host}:${job.port}`;
    if (blocked.has(printer)) continue;
    try {
      await getDriver(job.driver).send({ buildXml: () => job.xml }, { host: job.host, port: job.port });
      await db.printJobs.delete(job.id);
    } catch (err) {
      blocked.add(printer);
      await db.printJobs.update(job.id, { attempts: job.attempts + 1, lastError: err.message });
      if (job.attempts === 0) newlyFailed.push({ ...job, error: err.message });
    }
  }
  return newlyFailed;
}

// Invia i lavori in coda nell'ordine in cui sono nati. Un lavoro rifiutato resta in coda
// (si riprova al giro successivo) e non blocca le altre stampanti. Se arrivano nuovi lavori
// mentre un giro è in corso, ne parte subito un altro.
// Ritorna i lavori che falliscono per la prima volta, per avvisare una sola volta l'operatore.
export function flushPrintQueue() {
  if (flushing) {
    rerun = true;
    return flushing;
  }
  flushing = (async () => {
    const newlyFailed = [];
    do {
      rerun = false;
      newlyFailed.push(...await flushOnce());
    } while (rerun);
    return newlyFailed;
  })().finally(() => { flushing = null; notify(); });
  return flushing;
}

// Scarta i lavori rimasti in coda (es. stampante guasta e comande ormai consegnate a voce).
export async function discardPrintJobs() {
  await db.printJobs.clear();
  notify();
}
