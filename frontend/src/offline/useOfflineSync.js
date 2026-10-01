import { useEffect, useState, useCallback } from 'react';
import { flushQueue, pendingCount } from './syncQueue';

export function useOfflineSync() {
  const [pending, setPending] = useState(0);
  const [online, setOnline] = useState(navigator.onLine);

  const refreshCount = useCallback(() => pendingCount().then(setPending), []);
  const sync = useCallback(async () => { await flushQueue(); refreshCount(); }, [refreshCount]);

  useEffect(() => {
    refreshCount();
    const onOnline = () => { setOnline(true); sync(); };
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    const interval = setInterval(() => { if (navigator.onLine) sync(); }, 15000); // riserva, ogni 15s
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      clearInterval(interval);
    };
  }, [sync, refreshCount]);

  return { online, pending, syncNow: sync };
}