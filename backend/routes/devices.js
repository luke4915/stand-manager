import express from 'express';
import { authenticate, authorizeAdmin } from '../middleware/authenticate.js';
import { validate } from '../middleware/validate.js';
import { tenantScope } from '../middleware/tenantScope.js';
import { inTransaction } from '../db.js';
import logger from '../logger.js';
import { logAudit } from '../utils/auditLogger.js';
import { idParamsSchema } from '../schemas/common.js';
import { createDeviceSchema, updateDeviceSchema } from '../schemas/deviceSchema.js';

const router = express.Router();

// POST /api/devices — abbina un dispositivo: assegna la prima lettera libera del tenant.
// Va chiamato una volta sola per dispositivo (il client conserva id e lettera).
router.post('/', authenticate, validate({ body: createDeviceSchema }), tenantScope, async (req, res) => {
  const { name } = req.body;
  try {
    // Abbinamenti contemporanei dello stesso tenant si mettono in fila con un lock di transazione:
    // ognuno vede le lettere già prese dagli altri e sceglie la successiva, senza conflitti da ritentare.
    const device = await inTransaction(req.db, async (db) => {
      await db.query(`SELECT pg_advisory_xact_lock(hashtextextended('devices:' || current_setting('app.tenant_id'), 0))`);
      const { rows } = await db.query(
        `INSERT INTO devices (letter, name)
         SELECT chr(l), COALESCE($1, 'Cassa ' || chr(l))
         FROM generate_series(65, 90) AS l
         WHERE chr(l) NOT IN (SELECT letter FROM devices)
         ORDER BY l LIMIT 1
         RETURNING id, letter, name`,
        [name ?? null]
      );
      return rows[0] ?? null;
    });
    if (!device) {
      return res.status(409).json({ error: 'Numero massimo di dispositivi raggiunto (26)', code: 'DEVICE_LIMIT' });
    }
    await logAudit(req.db, req.user.id, 'CREATE_DEVICE', { deviceId: device.id, letter: device.letter });
    res.status(201).json(device);
  } catch (err) {
    logger.error({ err }, 'Errore POST /api/devices');
    res.status(500).json({ error: 'Errore abbinamento dispositivo' });
  }
});

// GET /api/devices — elenco per le impostazioni (admin)
router.get('/', authenticate, authorizeAdmin, tenantScope, async (req, res) => {
  try {
    const { rows } = await req.db.query('SELECT id, letter, name, created_at FROM devices ORDER BY letter');
    res.json(rows);
  } catch (err) {
    logger.error({ err }, 'Errore GET /api/devices');
    res.status(500).json({ error: 'Errore caricamento dispositivi' });
  }
});

// PUT /api/devices/:id — rinomina (admin)
router.put('/:id', authenticate, authorizeAdmin, validate({ params: idParamsSchema, body: updateDeviceSchema }), tenantScope, async (req, res) => {
  try {
    const { rows } = await req.db.query(
      'UPDATE devices SET name = $1 WHERE id = $2 RETURNING id, letter, name', [req.body.name, req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Dispositivo non trovato' });
    await logAudit(req.db, req.user.id, 'UPDATE_DEVICE', { deviceId: rows[0].id, name: rows[0].name });
    res.json(rows[0]);
  } catch (err) {
    logger.error({ err }, 'Errore PUT /api/devices/:id');
    res.status(500).json({ error: 'Errore aggiornamento dispositivo' });
  }
});

// DELETE /api/devices/:id — solo se non ha ordini: altrimenti il codice storico perderebbe la sua lettera
router.delete('/:id', authenticate, authorizeAdmin, validate({ params: idParamsSchema }), tenantScope, async (req, res) => {
  try {
    const { rows } = await req.db.query('DELETE FROM devices WHERE id = $1 RETURNING id, letter', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Dispositivo non trovato' });
    await logAudit(req.db, req.user.id, 'DELETE_DEVICE', { deviceId: rows[0].id, letter: rows[0].letter });
    res.json({ success: true });
  } catch (err) {
    if (err.code === '23503') {
      return res.status(409).json({ error: 'Il dispositivo ha ordini registrati e non si può eliminare', code: 'DEVICE_IN_USE' });
    }
    logger.error({ err }, 'Errore DELETE /api/devices/:id');
    res.status(500).json({ error: 'Errore eliminazione dispositivo' });
  }
});

export default router;
