import { db } from './db';
import { fetchWithAuth } from '../utils/apiClient';

// Ogni dispositivo (cassa) ha una lettera assegnata dal server una volta sola e un
// contatore proprio per sessione: il codice ordine (A1, A2, …) si compone qui, quindi
// funziona anche senza rete. IndexedDB è separato per sottodominio, cioè per tenant.
const DEVICE_KEY = 'device';

export async function getDevice() {
  return (await db.meta.get(DEVICE_KEY)) ?? null;
}

// Abbina il dispositivo se non lo è già. Senza rete non fa nulla e riprova alla prossima chiamata.
// Il lock evita due abbinamenti da schede aperte insieme (consumerebbero due lettere).
export async function ensureDevice() {
  const existing = await getDevice();
  if (existing || !navigator.onLine) return existing;
  const pair = async () => {
    const again = await getDevice();
    if (again) return again;
    const { id, letter } = await fetchWithAuth('/devices', { method: 'POST', body: {} });
    const device = { key: DEVICE_KEY, id, letter };
    await db.meta.put(device);
    return device;
  };
  return navigator.locks ? navigator.locks.request('standmanager-device-pairing', pair) : pair();
}

// Prossimo numero ordine della sessione, in transazione: due schede non danno lo stesso numero.
// Ritorna device_id e device_seq da aggiungere all'ordine, più il codice che la cassa stampa (A13), oppure {} se il dispositivo non è ancora abbinato
// (il server userà allora il suo progressivo, come per gli ordini già in coda).
export async function nextOrderNumber(sessionId) {
  const device = await getDevice();
  if (!device) return {};
  const seq = await db.transaction('rw', db.counters, async () => {
    const lastSeq = (await db.counters.get(sessionId))?.lastSeq ?? 0;
    await db.counters.put({ sessionId, lastSeq: lastSeq + 1 });
    return lastSeq + 1;
  });
  return { device_id: device.id, device_seq: seq, displayCode: `${device.letter}${seq}` };
}
