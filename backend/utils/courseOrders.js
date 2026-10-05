import { HttpError } from './httpError.js';
import { lockCheck } from './payments.js';
import { verifyOrderItems } from './orderLines.js';
import { writeOrderItems } from './orderItemsWrite.js';
import { sumQuantitiesByProduct, lockAndFindShortages, applyStockChange } from './stock.js';
import { formatDisplayCode } from './displayCode.js';
import { loadItems } from './orderItemsRead.js';
import { withCheckInfo } from './orderCheck.js';

// Portate di un conto (passo 3-1/3-2). Il cameriere prende tutto il giro: il server crea una comanda per portata.
// Le prime escono subito (`pending`), le altre restano `scheduled` («da mandare») sul conto finché qualcuno le manda.
// `course_seq` è l'ordine di uscita: portate con lo stesso numero escono insieme. Tutte le funzioni vanno chiamate
// dentro una transazione e bloccano prima il conto (CLAUDE.md §4).

// Comande lette per intero (righe, tavolo e coperti), nella forma che arriva a cucina, KDS e stampa.
export async function loadOrdersForNotify(db, orderIds) {
  if (!orderIds.length) return [];
  const { rows } = await db.query('SELECT * FROM orders WHERE id = ANY($1::int[]) ORDER BY course_seq NULLS FIRST, id', [orderIds]);
  const byOrder = await loadItems(db, orderIds);
  return (await withCheckInfo(db, rows)).map(o => ({ ...o, total: Number(o.total), items: byOrder.get(o.id) ?? [] }));
}

// `groups`: [{ course_id, seq, items }] già validate nella forma. Il numero d'ordine di uscita (`seq`) è relativo: il
// server lo accoda a quello delle portate già sul conto, così un secondo giro non si mescola col primo.
// Con `fireFirst` il primo gruppo esce subito; altrimenti il conto riceve tutto «da mandare».
export async function createCourseOrders(db, { tenantId, userId, role, checkId, groups, fireFirst }) {
  const check = await lockCheck(db, checkId);
  const { rows: sessions } = await db.query('SELECT id FROM sessions WHERE id = $1 AND end_time IS NULL FOR SHARE', [check.session_id]);
  if (!sessions.length) throw new HttpError(409, 'Il conto non è della sessione in corso', 'CHECK_CLOSED');

  const courseIds = [...new Set(groups.map(g => g.course_id).filter(Boolean))];
  const { rows: courses } = await db.query('SELECT id, name FROM courses WHERE id = ANY($1::int[])', [courseIds]);
  const courseName = new Map(courses.map(c => [c.id, c.name]));
  if (courseIds.some(id => !courseName.has(id))) throw new HttpError(400, 'Portata non valida', 'INVALID_COURSE');

  const verified = [];
  for (const g of groups) verified.push({ ...g, ...(await verifyOrderItems(db, g.items, role)) });

  // Lo stock si controlla una volta sola sul totale del giro: o c'è tutto, o non si crea nulla.
  const totals = sumQuantitiesByProduct(verified.flatMap(g => g.items));
  const shortages = await lockAndFindShortages(db, totals);
  if (shortages.length)
    throw new HttpError(409, `Prodotto esaurito o insufficiente: ${shortages.map(p => p.name).join(', ')}`, 'OUT_OF_STOCK');

  const { rows: [{ base }] } = await db.query('SELECT COALESCE(MAX(course_seq), 0)::int AS base FROM orders WHERE check_id = $1', [checkId]);
  const firstSeq = Math.min(...verified.map(g => g.seq));
  const ordered = verified.map((g, index) => ({ ...g, index })).sort((a, b) => a.seq - b.seq || a.index - b.index);

  const created = [];
  for (const g of ordered) {
    const { rows: [{ order_counter: counter }] } = await db.query(
      'UPDATE sessions SET order_counter = order_counter + 1 WHERE id = $1 RETURNING order_counter', [check.session_id]);
    const fired = fireFirst && g.seq === firstSeq;
    const { rows: [order] } = await db.query(
      `INSERT INTO orders (total, status, created_by, order_type, display_code, session_id, check_id, course_seq, course_name, fired_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, ${fired ? 'now()' : 'NULL'}) RETURNING id`,
      [g.total, fired ? 'pending' : 'scheduled', userId, g.orderType, formatDisplayCode(counter), check.session_id, checkId,
        base + g.seq, courseName.get(g.course_id) ?? null]);
    await writeOrderItems(db, tenantId, order.id, g.items);
    created.push({ id: order.id, fired });
  }
  const stockUpdates = await applyStockChange(db, totals, -1);
  return { orderIds: created.map(o => o.id), firedIds: created.filter(o => o.fired).map(o => o.id), stockUpdates };
}

// Manda una portata: le comande da mandare con quell'ordine di uscita (o la prossima, se `seq` manca) passano a
// `pending` e arrivano in cucina. Ritorna gli id mandati.
export async function fireCourses(db, { checkId, seq }) {
  await lockCheck(db, checkId);
  const { rows } = await db.query(
    `SELECT id, course_seq FROM orders WHERE check_id = $1 AND status = 'scheduled' ORDER BY course_seq, id FOR UPDATE`, [checkId]);
  if (!rows.length) throw new HttpError(409, 'Non ci sono portate da mandare', 'NO_SCHEDULED_COURSES');
  const target = seq ?? rows[0].course_seq;
  const ids = rows.filter(r => r.course_seq === target).map(r => r.id);
  if (!ids.length) throw new HttpError(404, 'Portata non trovata tra quelle da mandare', 'COURSE_NOT_FOUND');
  await db.query(`UPDATE orders SET status = 'pending', fired_at = now() WHERE id = ANY($1::int[])`, [ids]);
  return ids;
}

// Cambia l'ordine di uscita delle portate ancora da mandare: `assignments` = [{ id, seq }]. Quelle già mandate non si
// spostano. Due portate con lo stesso numero escono insieme.
export async function resequenceCourses(db, { checkId, assignments }) {
  await lockCheck(db, checkId);
  const { rows } = await db.query(`SELECT id FROM orders WHERE check_id = $1 AND status = 'scheduled' FOR UPDATE`, [checkId]);
  const scheduled = new Set(rows.map(r => r.id));
  if (assignments.some(a => !scheduled.has(a.id)))
    throw new HttpError(409, 'Una delle portate è già stata mandata o non fa parte del conto', 'ORDER_NOT_SCHEDULED');
  for (const a of assignments) await db.query('UPDATE orders SET course_seq = $1 WHERE id = $2', [a.seq, a.id]);
}
