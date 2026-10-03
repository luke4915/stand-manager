import { useEffect } from 'react';
import { ensureDevice } from './device';

// Abbina il dispositivo all'avvio dell'app autenticata e, se era offline, al ritorno della rete.
export function useDevicePairing() {
  useEffect(() => {
    const pair = () => ensureDevice().catch(() => { /* riprova al prossimo avvio o al ritorno online */ });
    pair();
    window.addEventListener('online', pair);
    return () => window.removeEventListener('online', pair);
  }, []);
}
