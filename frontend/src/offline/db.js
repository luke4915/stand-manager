import Dexie from 'dexie';

export const db = new Dexie('standmanager_offline');
db.version(1).stores({
  pendingOrders: '++localId, status, createdAt', // coda: ordini creati offline, in attesa di sync
  productsCache: 'id',                            // ultima copia nota del catalogo, per lavorare offline
});

// Dispositivo abbinato e contatori degli ordini: la cassa numera da sola, anche offline.
db.version(2).stores({
  meta: 'key',          // { key: 'device', id, letter }: abbinamento di questo dispositivo al tenant
  counters: 'sessionId', // { sessionId, lastSeq }: ultimo numero ordine dato in quella sessione
});


// Coda di stampa: un lavoro per stampante e ordine, con l'XML già pronto. `key` (ordine + stampante)
// è unico, quindi lo stesso ordine non si accoda due volte.
db.version(3).stores({
  printJobs: '++id, &key, status, createdAt',
});
