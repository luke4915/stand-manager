import { computeLineTotal, sanitizeAdjustment } from './pricing.js';
import { DISCOUNT_ROLES } from '../middleware/authenticate.js';
import { HttpError } from './httpError.js';
import { loadProductGroups, resolveModifiers } from './modifiers.js';

// Righe di un ordine verificate dal server (CLAUDE.md §4): dal client contano solo `id` e `quantity`; nome, categoria,
// destinazione di stampa e prezzo vengono dal catalogo. Sconti e omaggi solo per i ruoli autorizzati.
// Usata da POST /orders e dalle comande per portata dei conti. Lancia HttpError (400, 403).
export async function verifyOrderItems(db, items, role) {
  const productIds = [...new Set(items.map(i => i.id).filter(Boolean))];
  const { rows: dbProducts } = await db.query(
    'SELECT id, name, price, category, print_destination FROM products WHERE id = ANY($1)', [productIds]
  );
  const productMap = Object.fromEntries(dbProducts.map(p => [p.id, p]));
  for (const item of items) {
    if (!(item.id in productMap)) throw new HttpError(400, `Prodotto non valido: ${item.id}`);
  }

  // Per chi non può fare sconti l'adjustment non si ignora in silenzio: la richiesta si rifiuta.
  const authorized = DISCOUNT_ROLES.includes(role);
  if (items.some(i => i.type && i.type !== 'sale') && !authorized)
    throw new HttpError(403, 'Non hai i permessi per applicare sconti o omaggi.');

  const groupsByProduct = await loadProductGroups(db, productIds);
  const verifiedItems = items.map(i => {
    const product = productMap[i.id];
    // Il prezzo di listino della riga è prezzo del prodotto + supplementi delle opzioni scelte
    const { modifiers, extra } = resolveModifiers(i.modifiers, groupsByProduct.get(Number(i.id)) ?? [], product.name);
    const original_price = Math.round((parseFloat(product.price) + extra) * 100) / 100;
    const adjustment = sanitizeAdjustment(i, authorized);
    const line_total = computeLineTotal(original_price, i.quantity, adjustment);
    return {
      id: i.id,
      name: product.name,
      quantity: i.quantity,
      price: line_total / i.quantity, // unitario effettivo; il riferimento è line_total
      line_total,
      original_price,
      type: adjustment.type,
      discountMode: adjustment.discountMode,
      discountValue: adjustment.discountValue,
      note: i.note || '',
      modifiers,
      category: product.category || 'Altro',
      print_destination: product.print_destination || 'both',
    };
  });
  const total = verifiedItems.reduce((sum, i) => sum + Math.round(i.line_total * 100), 0) / 100;
  const allGift = verifiedItems.every(i => i.type === 'gift');
  const anyAdjustment = verifiedItems.some(i => i.type !== 'sale');
  return { items: verifiedItems, total, orderType: allGift ? 'gift' : (anyAdjustment ? 'discount' : 'sale') };
}
