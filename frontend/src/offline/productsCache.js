import { db } from './db';

// Ultima copia nota del catalogo, per lavorare offline anche dopo un ricaricamento.
// IndexedDB è separato per origine, quindi per sottodominio: ogni tenant ha la sua copia.
export async function saveProducts(products) {
  await db.transaction('rw', db.productsCache, async () => {
    await db.productsCache.clear();
    await db.productsCache.bulkPut(products);
  });
}

export function loadCachedProducts() {
  return db.productsCache.toArray();
}
