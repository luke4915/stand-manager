import express from 'express';
import { authenticate, authorizeAdmin, authorizeCash } from '../middleware/authenticate.js';
import { validate } from '../middleware/validate.js';
import { tenantScope } from '../middleware/tenantScope.js';
import { inTransaction } from '../db.js';
import logger from '../logger.js';
import { logAudit } from '../utils/auditLogger.js';
import { requireModule } from '../utils/tenantModules.js';
import { HttpError, sendHttpError } from '../utils/httpError.js';
import { idParamsSchema } from '../schemas/common.js';
import { createCourseSchema, updateCourseSchema, reorderCoursesSchema } from '../schemas/courseSchema.js';

// Portate del locale (modulo `tables`): antipasto, primo, secondo… in ordine di uscita. Si leggono con i ruoli di
// cassa, si modificano solo da admin, con audit.
const router = express.Router();
const COLUMNS = 'id, name, position, active';
const UNIQUE = 'Esiste già una portata con questo nome';

router.get('/', authenticate, requireModule('tables'), authorizeCash, tenantScope, async (req, res) => {
  try {
    const { rows } = await req.db.query(`SELECT ${COLUMNS} FROM courses ORDER BY position, id`);
    res.json(rows);
  } catch (err) {
    logger.error({ err }, 'Errore GET /api/courses');
    res.status(500).json({ error: 'Errore caricamento portate' });
  }
});

// Una portata nuova va in fondo.
router.post('/', authenticate, requireModule('tables'), authorizeAdmin, validate({ body: createCourseSchema }), tenantScope, async (req, res) => {
  try {
    const { rows } = await req.db.query(
      `INSERT INTO courses (name, position) VALUES ($1, COALESCE((SELECT MAX(position) + 1 FROM courses), 0)) RETURNING ${COLUMNS}`, [req.body.name]);
    await logAudit(req.db, req.user.id, 'CREATE_COURSE', { courseId: rows[0].id, name: rows[0].name });
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: UNIQUE, code: 'COURSE_EXISTS' });
    logger.error({ err }, 'Errore POST /api/courses');
    res.status(500).json({ error: 'Errore creazione portata' });
  }
});

// PUT /api/courses/order — nuovo ordine di uscita (prima di /:id)
router.put('/order', authenticate, requireModule('tables'), authorizeAdmin, validate({ body: reorderCoursesSchema }), tenantScope, async (req, res) => {
  const { ids } = req.body;
  try {
    const rows = await inTransaction(req.db, async (db) => {
      const { rows: current } = await db.query('SELECT id FROM courses FOR UPDATE');
      if (current.length !== ids.length || current.some(c => !ids.includes(c.id)))
        throw new HttpError(400, 'L\'elenco deve contenere tutte le portate', 'COURSES_MISMATCH');
      for (const [position, id] of ids.entries()) await db.query('UPDATE courses SET position = $1 WHERE id = $2', [position, id]);
      return (await db.query(`SELECT ${COLUMNS} FROM courses ORDER BY position, id`)).rows;
    });
    await logAudit(req.db, req.user.id, 'REORDER_COURSES', { ids });
    res.json(rows);
  } catch (err) {
    if (sendHttpError(res, err)) return;
    logger.error({ err }, 'Errore PUT /api/courses/order');
    res.status(500).json({ error: 'Errore riordino portate' });
  }
});

router.put('/:id', authenticate, requireModule('tables'), authorizeAdmin, validate({ params: idParamsSchema, body: updateCourseSchema }), tenantScope, async (req, res) => {
  try {
    const { name, active } = req.body;
    const { rows } = await req.db.query(
      `UPDATE courses SET name = COALESCE($1, name), active = COALESCE($2, active) WHERE id = $3 RETURNING ${COLUMNS}`,
      [name ?? null, active ?? null, req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Portata non trovata' });
    await logAudit(req.db, req.user.id, 'UPDATE_COURSE', { courseId: rows[0].id, ...req.body });
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: UNIQUE, code: 'COURSE_EXISTS' });
    logger.error({ err }, 'Errore PUT /api/courses/:id');
    res.status(500).json({ error: 'Errore aggiornamento portata' });
  }
});

// Eliminare una portata lascia i suoi prodotti senza portata; lo storico delle comande ne conserva il nome.
router.delete('/:id', authenticate, requireModule('tables'), authorizeAdmin, validate({ params: idParamsSchema }), tenantScope, async (req, res) => {
  try {
    const { rows } = await req.db.query('DELETE FROM courses WHERE id = $1 RETURNING id, name', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Portata non trovata' });
    await logAudit(req.db, req.user.id, 'DELETE_COURSE', { courseId: rows[0].id, name: rows[0].name });
    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'Errore DELETE /api/courses/:id');
    res.status(500).json({ error: 'Errore eliminazione portata' });
  }
});

export default router;
