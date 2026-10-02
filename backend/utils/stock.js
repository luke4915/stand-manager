// Stock dei prodotti. Si conta solo per i prodotti con stock_enabled = true e
// stock valorizzato; con stock_enabled = false (o stock NULL) la disponibilità è illimitata.

// Somma le quantità per prodotto: un ordine può avere più righe dello stesso
// prodotto (es. una venduta e una in omaggio).
export function sumQuantitiesByProduct(items) {
  const totals = new Map();
  for (const { id, quantity } of items) totals.set(id, (totals.get(id) || 0) + quantity);
  return totals;
}

// Blocca (FOR UPDATE) i prodotti a stock limitato coinvolti nell'ordine e
// ritorna quelli senza disponibilità sufficiente. Va chiamata dentro una transazione;
// l'ordinamento per id evita deadlock tra ordini concorrenti.
export async function lockAndFindShortages(db, totals) {
  const { rows } = await db.query(
    `SELECT id, name, stock FROM products
     WHERE id = ANY($1) AND stock_enabled AND stock IS NOT NULL
     ORDER BY id FOR UPDATE`,
    [[...totals.keys()]]
  );
  return rows.filter(p => p.stock < totals.get(p.id));
}

// Applica la variazione di stock (sign = -1 scala, +1 ripristina) ai soli prodotti
// a stock limitato, senza scendere sotto 0 (un ordine offline sincronizzato in
// ritardo è già stato venduto e non si rifiuta). Un prodotto che arriva a 0 viene
// nascosto; uno che torna disponibile viene mostrato.
// Ritorna { id, stock, visible } dei prodotti aggiornati.
export async function applyStockChange(db, totals, sign) {
  const { rows } = await db.query(
    `UPDATE products p
     SET stock = GREATEST(p.stock + $3 * t.qty, 0),
         visible = CASE WHEN p.stock + $3 * t.qty > 0 THEN (p.visible OR $3 > 0) ELSE false END
     FROM unnest($1::int[], $2::int[]) AS t(id, qty)
     WHERE p.id = t.id AND p.stock_enabled AND p.stock IS NOT NULL
     RETURNING p.id, p.stock, p.visible`,
    [[...totals.keys()], [...totals.values()], sign]
  );
  return rows;
}
