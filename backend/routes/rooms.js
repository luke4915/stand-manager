import express from 'express';
import { authenticate, authorizeAdmin, authorizeCash } from '../middleware/authenticate.js';
import { validate } from '../middleware/validate.js';
import { tenantScope } from '../middleware/tenantScope.js';
import { inTransaction } from '../db.js';
import logger from '../logger.js';
import { logAudit } from '../utils/auditLogger.js';
import { requireModule } from '../utils/tenantModules.js';
import { idParamsSchema } from '../schemas/common.js';
import { createRoomSchema, updateRoomSchema, createTableSchema, updateTableSchema, bulkTablesSchema } from '../schemas/roomSchema.js';

// Sale e tavoli del locale (modulo `tables`). Si leggono con i ruoli di cassa, si modificano solo da admin.
export const roomsRouter = express.Router();
export const tablesRouter = express.Router();

const ROOM_COLUMNS = 'id, name, active';
const TABLE_COLUMNS = 'id, room_id, name, seats, active';

const UNIQUE_ROOM = 'Esiste già una sala con questo nome';
const UNIQUE_TABLE = 'Esiste già un tavolo con questo nome in questa sala';

// GET /api/rooms — tutte le sale con i loro tavoli, in una chiamata sola
roomsRouter.get('/', authenticate, requireModule('tables'), authorizeCash, tenantScope, async (req, res) => {
  try {
    const [{ rows: rooms }, { rows: tables }] = await Promise.all([
      req.db.query(`SELECT ${ROOM_COLUMNS} FROM rooms ORDER BY id`),
      req.db.query(`SELECT ${TABLE_COLUMNS} FROM dining_tables ORDER BY room_id, id`),
    ]);
    res.json(rooms.map(room => ({ ...room, tables: tables.filter(t => t.room_id === room.id) })));
  } catch (err) {
    logger.error({ err }, 'Errore GET /api/rooms');
    res.status(500).json({ error: 'Errore caricamento sale' });
  }
});

roomsRouter.post('/', authenticate, requireModule('tables'), authorizeAdmin, validate({ body: createRoomSchema }), tenantScope, async (req, res) => {
  try {
    const { rows } = await req.db.query(`INSERT INTO rooms (name) VALUES ($1) RETURNING ${ROOM_COLUMNS}`, [req.body.name]);
    await logAudit(req.db, req.user.id, 'CREATE_ROOM', { roomId: rows[0].id, name: rows[0].name });
    res.status(201).json({ ...rows[0], tables: [] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: UNIQUE_ROOM, code: 'ROOM_EXISTS' });
    logger.error({ err }, 'Errore POST /api/rooms');
    res.status(500).json({ error: 'Errore creazione sala' });
  }
});

roomsRouter.put('/:id', authenticate, requireModule('tables'), authorizeAdmin, validate({ params: idParamsSchema, body: updateRoomSchema }), tenantScope, async (req, res) => {
  try {
    const { name, active } = req.body;
    const { rows } = await req.db.query(
      `UPDATE rooms SET name = COALESCE($1, name), active = COALESCE($2, active) WHERE id = $3 RETURNING ${ROOM_COLUMNS}`,
      [name ?? null, active ?? null, req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Sala non trovata' });
    await logAudit(req.db, req.user.id, 'UPDATE_ROOM', { roomId: rows[0].id, ...req.body });
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: UNIQUE_ROOM, code: 'ROOM_EXISTS' });
    logger.error({ err }, 'Errore PUT /api/rooms/:id');
    res.status(500).json({ error: 'Errore aggiornamento sala' });
  }
});

// Una sala con dei tavoli non si elimina: prima si tolgono (o la si disattiva).
roomsRouter.delete('/:id', authenticate, requireModule('tables'), authorizeAdmin, validate({ params: idParamsSchema }), tenantScope, async (req, res) => {
  try {
    const { rows } = await req.db.query('DELETE FROM rooms WHERE id = $1 RETURNING id, name', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Sala non trovata' });
    await logAudit(req.db, req.user.id, 'DELETE_ROOM', { roomId: rows[0].id, name: rows[0].name });
    res.json({ success: true });
  } catch (err) {
    if (err.code === '23503') return res.status(409).json({ error: 'La sala ha ancora dei tavoli: eliminali prima, oppure disattivala', code: 'ROOM_NOT_EMPTY' });
    logger.error({ err }, 'Errore DELETE /api/rooms/:id');
    res.status(500).json({ error: 'Errore eliminazione sala' });
  }
});

// POST /api/rooms/:id/tables — un tavolo
roomsRouter.post('/:id/tables', authenticate, requireModule('tables'), authorizeAdmin, validate({ params: idParamsSchema, body: createTableSchema }), tenantScope, async (req, res) => {
  try {
    const { rows } = await req.db.query(
      `INSERT INTO dining_tables (room_id, name, seats) SELECT id, $2, $3 FROM rooms WHERE id = $1 RETURNING ${TABLE_COLUMNS}`,
      [req.params.id, req.body.name, req.body.seats]);
    if (!rows.length) return res.status(404).json({ error: 'Sala non trovata' });
    await logAudit(req.db, req.user.id, 'CREATE_TABLE', { tableId: rows[0].id, roomId: rows[0].room_id, name: rows[0].name });
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: UNIQUE_TABLE, code: 'TABLE_EXISTS' });
    logger.error({ err }, 'Errore POST /api/rooms/:id/tables');
    res.status(500).json({ error: 'Errore creazione tavolo' });
  }
});

// POST /api/rooms/:id/tables/bulk — più tavoli (prefisso + numeri); i nomi già presenti si saltano
roomsRouter.post('/:id/tables/bulk', authenticate, requireModule('tables'), authorizeAdmin, validate({ params: idParamsSchema, body: bulkTablesSchema }), tenantScope, async (req, res) => {
  try {
    const { prefix, from, to, seats } = req.body;
    const created = await inTransaction(req.db, async (db) => {
      const { rows: room } = await db.query('SELECT id FROM rooms WHERE id = $1 FOR UPDATE', [req.params.id]);
      if (!room.length) return null;
      const { rows } = await db.query(
        `INSERT INTO dining_tables (room_id, name, seats)
         SELECT $1, $2 || n, $3 FROM generate_series($4::int, $5::int) AS n
         ON CONFLICT (room_id, lower(name)) DO NOTHING
         RETURNING ${TABLE_COLUMNS}`,
        [req.params.id, prefix, seats, from, to]);
      return rows;
    });
    if (!created) return res.status(404).json({ error: 'Sala non trovata' });
    await logAudit(req.db, req.user.id, 'CREATE_TABLES_BULK', { roomId: req.params.id, prefix, from, to, created: created.length });
    res.status(201).json({ created, skipped: (to - from + 1) - created.length });
  } catch (err) {
    logger.error({ err }, 'Errore POST /api/rooms/:id/tables/bulk');
    res.status(500).json({ error: 'Errore creazione tavoli' });
  }
});

tablesRouter.put('/:id', authenticate, requireModule('tables'), authorizeAdmin, validate({ params: idParamsSchema, body: updateTableSchema }), tenantScope, async (req, res) => {
  try {
    const { name, seats, active } = req.body;
    const { rows } = await req.db.query(
      `UPDATE dining_tables SET name = COALESCE($1, name), seats = COALESCE($2, seats), active = COALESCE($3, active)
       WHERE id = $4 RETURNING ${TABLE_COLUMNS}`,
      [name ?? null, seats ?? null, active ?? null, req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Tavolo non trovato' });
    await logAudit(req.db, req.user.id, 'UPDATE_TABLE', { tableId: rows[0].id, ...req.body });
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: UNIQUE_TABLE, code: 'TABLE_EXISTS' });
    logger.error({ err }, 'Errore PUT /api/tables/:id');
    res.status(500).json({ error: 'Errore aggiornamento tavolo' });
  }
});

// Un tavolo con conti registrati non si elimina (la sua storia perderebbe il tavolo): si disattiva.
tablesRouter.delete('/:id', authenticate, requireModule('tables'), authorizeAdmin, validate({ params: idParamsSchema }), tenantScope, async (req, res) => {
  try {
    const { rows } = await req.db.query('DELETE FROM dining_tables WHERE id = $1 RETURNING id, name', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Tavolo non trovato' });
    await logAudit(req.db, req.user.id, 'DELETE_TABLE', { tableId: rows[0].id, name: rows[0].name });
    res.json({ success: true });
  } catch (err) {
    if (err.code === '23503') return res.status(409).json({ error: 'Il tavolo ha conti registrati: disattivalo invece di eliminarlo', code: 'TABLE_IN_USE' });
    logger.error({ err }, 'Errore DELETE /api/tables/:id');
    res.status(500).json({ error: 'Errore eliminazione tavolo' });
  }
});
