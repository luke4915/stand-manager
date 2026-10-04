// Tavolo e coperti delle comande: un ordine di un conto porta il nome del tavolo, i coperti e il numero del conto,
// così cucina, KDS e stampa dicono "Tavolo 5 · 4 coperti". Gli ordini pagati subito li hanno nulli.
export async function withCheckInfo(db, orders) {
  const ids = [...new Set(orders.map(o => o.check_id).filter(Boolean))];
  const info = new Map();
  if (ids.length) {
    const { rows } = await db.query(
      `SELECT c.id, c.number, c.covers, t.name AS table_name
       FROM checks c LEFT JOIN dining_tables t ON t.id = c.table_id WHERE c.id = ANY($1)`, [ids]);
    for (const r of rows) info.set(r.id, r);
  }
  return orders.map(o => {
    const c = o.check_id ? info.get(o.check_id) : null;
    return { ...o, table_name: c?.table_name ?? null, covers: c?.covers ?? null, check_number: c?.number ?? null };
  });
}
