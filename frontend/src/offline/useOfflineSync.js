import { useEffect, useState, useCallback } from 'react';
import { flushQueue, countByStatus } from './syncQueue';
import { useAuth } from '../context/useAuth';
import { useToast } from '../context/useToast';

const RETRY_INTERVAL_MS = 15000;

export function useOfflineSync() {
  const { refreshSession } = useAuth();
  const { showToast } = useToast();
  const [pending, setPending] = useState(0);
  const [failed, setFailed] = useState(0);
  const [online, setOnline] = useState(navigator.onLine);

  const refreshCounts = useCallback(async () => {
    setPending(await countByStatus('pending'));
    setFailed(await countByStatus('failed'));
  }, []);

  const sync = useCallback(async () => {
    const newlyFailed = await flushQueue({ refreshSession });
    newlyFailed.forEach(o => showToast(`Ordine offline non sincronizzato: ${o.error}`, 'error'));
    refreshCounts();
  }, [refreshSession, showToast, refreshCounts]);

  useEffect(() => {
    refreshCounts();
    const onOnline = () => { setOnline(true); sync(); };
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    const interval = setInterval(() => { if (navigator.onLine) sync(); }, RETRY_INTERVAL_MS);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      clearInterval(interval);
    };
  }, [sync, refreshCounts]);

  return { online, pending, failed, syncNow: sync };
}
