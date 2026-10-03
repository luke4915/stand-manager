import { useEffect, useState, useCallback } from 'react';
import { useToast } from '../context/useToast';
import { refreshPrintConfig } from './config.js';
import { flushPrintQueue, countPrintJobs, onQueueChanged, onJobsAdded } from './queue.js';

const RETRY_INTERVAL_MS = 15000;

// Tiene viva la stampa: aggiorna la configurazione quando c'è rete, svuota la coda a intervalli
// e al ritorno online, e avvisa una volta sola quando una stampante non risponde.
export function usePrintQueue() {
  const { showToast } = useToast();
  const [pending, setPending] = useState(0);

  const refreshCount = useCallback(async () => setPending(await countPrintJobs()), []);

  const flush = useCallback(async () => {
    const failed = await flushPrintQueue();
    failed.forEach(job => showToast(`Stampa ${job.displayCode} non riuscita: ${job.error}. Riprovo in automatico.`, 'error'));
  }, [showToast]);

  useEffect(() => {
    const syncConfig = () => refreshPrintConfig().catch(() => { /* offline: resta l'ultima configurazione nota */ });
    syncConfig();
    refreshCount();
    flush();
    const onOnline = () => { syncConfig(); flush(); };
    window.addEventListener('online', onOnline);
    const interval = setInterval(flush, RETRY_INTERVAL_MS);
    const unsubscribers = [onQueueChanged(refreshCount), onJobsAdded(flush)];
    return () => {
      window.removeEventListener('online', onOnline);
      clearInterval(interval);
      unsubscribers.forEach(off => off());
    };
  }, [flush, refreshCount]);

  return { pending, retryNow: flush };
}
