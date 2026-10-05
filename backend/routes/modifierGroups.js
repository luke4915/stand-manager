import express from 'express';
import { authenticate, authorizeAdmin, authorizeWaiter } from '../middleware/authenticate.js';
import { validate } from '../middleware/validate.js';
import { tenantScope } from '../middleware/tenantScope.js';
import { inTransaction } from '../db.js';
import logger from '../logger.js';
import { logAudit } from '../utils/auditLogger.js';
import { requireModule } from '../utils/tenantModules.js';
import { HttpError, sendHttpError } from '../utils/httpError.js';
import { idParamsSchema } from '../schemas/common.js';
import { modifierGroupSchema, productModifierGroupsSchema } from '../schemas/modifierSchema.js';

// Gruppi di modificatori dei piatti (modulo `tables`): cottura, aggiunte, senza… Si leggono col personale di sala (per
// ordinare), si modificano solo da admin, con audit. Le opzioni di un gruppo si salvano tutte insieme al gruppo.
export const modifierGroupsRouter = express.Router();
export const productModifiersRouter = express.Router();

const UNIQUE = 'Esiste già un gruppo con questo nome';
const guard = [authenticate, requireModule('tables')];

// Gruppi con opzioni e prodotti collegati, in una chiamata sola (serve alla Carta e alla comanda)
async function listGroups(db) {
  const [{ rows: groups }, { rows: options }, { rows: links }] = await Promise.all([
    db.query('SELECT id, name, min_select, max_select, position FROM modifier_groups ORDER BY position, id'),
    db.query('SELECT id, group_id, name, price_delta FROM modifiers ORDER BY position, id'),
    db.query('SELECT product_id, group_id FROM product_modifier_groups ORDER BY position'),
  ]);
  return groups.map(g => ({
    ...g,
    options: options.filter(o => o.group_id === g.id).map(({ id, name, price_delta }) => ({ id, name, price_delta: Number(price_delta) })),
    product_ids: links.filter(l => l.group_id === g.id).map(l => l.product_id),
  }));
}

const writeOptions = async (db, groupId, options) => {
  await db.query('DELETE FROM modifiers WHERE group_id = $1', [groupId]);
  for (const [position, o] of options.entries())
    await db.query('INSERT INTO modifiers (group_id, name, price_delta, position) VALUES ($1, $2, $3, $4)', [groupId, o.name, o.price_delta, position]);
};

modifierGroupsRouter.get('/', ...guard, authorizeWaiter, tenantScope, async (req, res) => {
  try { res.json(await listGroups(req.db)); }
  catch (err) {
    logger.error({ err }, 'Errore GET /api/modifier-groups');
    res.status(500).json({ error: 'Errore caricamento modificatori' });
  }
});

modifierGroupsRouter.post('/', ...guard, authorizeAdmin, validate({ body: modifierGroupSchema }), tenantScope, async (req, res) => {
  const { name, min_select: min, max_select: max, options } = req.body;
  try {
    const id = await inTransaction(req.db, async (db) => {
      const { rows: [g] } = await db.query(
        `INSERT INTO modifier_groups (name, min_select, max_select, position)
         VALUES ($1, $2, $3, COALESCE((SELECT MAX(position) + 1 FROM modifier_groups), 0)) RETURNING id`, [name, min, max]);
      await writeOptions(db, g.id, options);
      return g.id;
    });
    await logAudit(req.db, req.user.id, 'CREATE_MODIFIER_GROUP', { groupId: id, name });
    res.status(201).json((await listGroups(req.db)).find(g => g.id === id));
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: UNIQUE, code: 'GROUP_EXISTS' });
    logger.error({ err }, 'Errore POST /api/modifier-groups');
    res.status(500).json({ error: 'Errore creazione gruppo' });
  }
});

modifierGroupsRouter.put('/:id', ...guard, authorizeAdmin, validate({ params: idParamsSchema, body: modifierGroupSchema }), tenantScope, async (req, res) => {
  const { name, min_select: min, max_select: max, options } = req.body;
  try {
    await inTransaction(req.db, async (db) => {
      const { rowCount } = await db.query('UPDATE modifier_groups SET name = $1, min_select = $2, max_select = $3 WHERE id = $4', [name, min, max, req.params.id]);
      if (!rowCount) throw new HttpError(404, 'Gruppo non trovato');
      await writeOptions(db, req.params.id, options);
    });
    await logAudit(req.db, req.user.id, 'UPDATE_MODIFIER_GROUP', { groupId: Number(req.params.id), name });
    res.json((await listGroups(req.db)).find(g => g.id === Number(req.params.id)));
  } catch (err) {
    if (sendHttpError(res, err)) return;
    if (err.code === '23505') return res.status(409).json({ error: UNIQUE, code: 'GROUP_EXISTS' });
    logger.error({ err }, 'Errore PUT /api/modifier-groups/:id');
    res.status(500).json({ error: 'Errore aggiornamento gruppo' });
  }
});

// Eliminare un gruppo lo toglie dai prodotti; le comande già fatte conservano le scelte (sono una copia).
modifierGroupsRouter.delete('/:id', ...guard, authorizeAdmin, validate({ params: idParamsSchema }), tenantScope, async (req, res) => {
  try {
    const { rows } = await req.db.query('DELETE FROM modifier_groups WHERE id = $1 RETURNING id, name', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Gruppo non trovato' });
    await logAudit(req.db, req.user.id, 'DELETE_MODIFIER_GROUP', { groupId: rows[0].id, name: rows[0].name });
    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'Errore DELETE /api/modifier-groups/:id');
    res.status(500).json({ error: 'Errore eliminazione gruppo' });
  }
});

// PUT /api/products/:id/modifier-groups — i gruppi di un prodotto, nell'ordine in cui si chiedono
productModifiersRouter.put('/:id/modifier-groups', ...guard, authorizeAdmin, validate({ params: idParamsSchema, body: productModifierGroupsSchema }), tenantScope, async (req, res) => {
  const { group_ids: groupIds } = req.body;
  try {
    await inTransaction(req.db, async (db) => {
      if (!(await db.query('SELECT 1 FROM products WHERE id = $1 FOR UPDATE', [req.params.id])).rows.length) throw new HttpError(404, 'Prodotto non trovato');
      // La chiave esterna non passa dalla RLS: i gruppi si cercano qui, dove vale l'isolamento del locale
      const { rows: found } = await db.query('SELECT id FROM modifier_groups WHERE id = ANY($1::int[])', [groupIds]);
      if (found.length !== groupIds.length) throw new HttpError(400, 'Gruppo non valido', 'INVALID_GROUP');
      await db.query('DELETE FROM product_modifier_groups WHERE product_id = $1', [req.params.id]);
      for (const [position, groupId] of groupIds.entries())
        await db.query('INSERT INTO product_modifier_groups (product_id, group_id, position) VALUES ($1, $2, $3)', [req.params.id, groupId, position]);
    });
    await logAudit(req.db, req.user.id, 'SET_PRODUCT_MODIFIERS', { productId: Number(req.params.id), groupIds });
    res.json({ product_id: Number(req.params.id), group_ids: groupIds });
  } catch (err) {
    if (sendHttpError(res, err)) return;
    logger.error({ err }, 'Errore PUT /api/products/:id/modifier-groups');
    res.status(500).json({ error: 'Errore salvataggio modificatori del prodotto' });
  }
});
