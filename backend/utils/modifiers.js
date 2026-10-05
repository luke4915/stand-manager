import { HttpError } from './httpError.js';

// Modificatori dei piatti (migrazione 043). Dal client arrivano solo gli id delle opzioni scelte: nome e supplemento si
// leggono sempre dal catalogo (CLAUDE.md §4).

const round2 = (n) => Math.round(n * 100) / 100;

// Le opzioni scelte per una riga, controllate contro i gruppi del prodotto. `groups`: [{ id, name, min_select,
// max_select, options: [{ id, name, price_delta }] }]. Ritorna le scelte da salvare, `[{ id, name, price }]`, nell'ordine
// dei gruppi, e il supplemento totale in euro. Lancia HttpError 400 se una scelta non è ammessa, ne mancano o sono troppe.
export function resolveModifiers(selectedIds, groups, productName) {
  const ids = selectedIds ?? [];
  if (new Set(ids).size !== ids.length) throw new HttpError(400, `"${productName}": opzione scelta due volte`, 'INVALID_MODIFIER');

  const byOption = new Map(groups.flatMap(g => g.options.map(o => [o.id, { group: g, option: o }])));
  if (ids.some(id => !byOption.has(id))) throw new HttpError(400, `"${productName}": opzione non valida`, 'INVALID_MODIFIER');

  const chosen = [];
  for (const g of groups) {
    const picked = g.options.filter(o => ids.includes(o.id));
    if (picked.length < g.min_select)
      throw new HttpError(400, `"${productName}": scegli ${g.min_select === 1 ? 'un\'opzione' : `almeno ${g.min_select} opzioni`} per «${g.name}»`, 'MODIFIER_REQUIRED');
    if (g.max_select !== null && picked.length > g.max_select)
      throw new HttpError(400, `"${productName}": per «${g.name}» al massimo ${g.max_select}`, 'MODIFIER_TOO_MANY');
    for (const o of picked) chosen.push({ id: o.id, name: o.name, price: round2(Number(o.price_delta)) });
  }
  return { modifiers: chosen, extra: round2(chosen.reduce((s, m) => s + m.price, 0)) };
}

// I gruppi (con le loro opzioni) collegati a ciascun prodotto: Map productId → gruppi in ordine.
export async function loadProductGroups(db, productIds) {
  const byProduct = new Map(productIds.map(id => [id, []]));
  if (!productIds.length) return byProduct;
  const { rows } = await db.query(
    `SELECT pg.product_id, g.id, g.name, g.min_select, g.max_select,
            COALESCE(json_agg(json_build_object('id', m.id, 'name', m.name, 'price_delta', m.price_delta) ORDER BY m.position, m.id)
                     FILTER (WHERE m.id IS NOT NULL), '[]') AS options
     FROM product_modifier_groups pg
     JOIN modifier_groups g ON g.id = pg.group_id
     LEFT JOIN modifiers m ON m.group_id = g.id
     WHERE pg.product_id = ANY($1::int[])
     GROUP BY pg.product_id, g.id, pg.position ORDER BY pg.product_id, pg.position, g.id`, [productIds]);
  for (const r of rows) byProduct.get(r.product_id).push({ id: r.id, name: r.name, min_select: r.min_select, max_select: r.max_select, options: r.options });
  return byProduct;
}

// Testo per cucina, conto e ricevuta: «Spaghetti · senza glutine, parmigiano».
export const withModifiers = (name, modifiers) => (modifiers?.length ? `${name} · ${modifiers.map(m => m.name).join(', ')}` : name);
