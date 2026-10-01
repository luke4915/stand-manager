import Dexie from 'dexie';

export const db = new Dexie('standmanager_offline');
db.version(1).stores({
  pendingOrders: '++localId, status, createdAt', // coda: ordini creati offline, in attesa di sync
  productsCache: 'id',                            // ultima copia nota del catalogo, per lavorare offline
});