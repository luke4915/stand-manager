// Il QR del menu pubblico è una scelta del cliente, non un dato affidabile: di ogni riga contano
// solo id e quantità. Nome, prezzo e destinazione di stampa si leggono dal catalogo della cassa.
const MAX_QUANTITY = 999;

export function itemsFromQr(rawItems, products) {
  if (!Array.isArray(rawItems)) return [];
  const byId = new Map(products.map(p => [p.id, p]));
  const items = [];
  for (const raw of rawItems) {
    const product = byId.get(Number(raw?.id));
    const quantity = Math.trunc(Number(raw?.quantity));
    if (!product || !(quantity > 0)) continue;
    items.push({ ...product, quantity: Math.min(quantity, MAX_QUANTITY), type: 'sale', discountMode: null, discountValue: null, note: '' });
  }
  return items;
}
