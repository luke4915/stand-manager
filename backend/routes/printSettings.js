// routes/printSettings.js
import express from 'express';
import { authenticate, authorizeAdmin } from '../middleware/authenticate.js';
import { tenantScope } from '../middleware/tenantScope.js';
import { validate } from '../middleware/validate.js';
import { idParamsSchema } from '../schemas/common.js';
import { copyTypeSchema, reorderSchema, printSettingSchema } from '../schemas/printSettingsSchema.js';
import { inTransaction } from '../db.js';
import logger from '../logger.js';

const router = express.Router();

// ─── COPY TYPES ───────────────────────────────────────────────

// GET /api/print-settings/copy-types — tutti gli utenti autenticati
router.get('/copy-types', authenticate, tenantScope, async (req, res) => {
  try {
    const { rows } = await req.db.query('SELECT * FROM copy_types ORDER BY id');
    res.json(rows);
  } catch (err) {
    logger.error({ err }, 'Errore GET /copy-types:')
    res.status(500).json({ error: 'Errore server' });
  }
});

// POST /api/print-settings/copy-types — solo admin
router.post('/copy-types', authenticate, authorizeAdmin, validate({ body: copyTypeSchema }), tenantScope, async (req, res) => {
  const { name, label } = req.body;
  try {
    // Tipo di copia e sua impostazione di stampa (disattivata) nascono insieme
    const copyType = await inTransaction(req.db, async (db) => {
      const { rows } = await db.query('INSERT INTO copy_types (name, label) VALUES ($1, $2) RETURNING *', [name, label]);
      await db.query(
        'INSERT INTO print_settings (copy_type_id, printer_type, enabled) VALUES ($1, $2, false)',
        [rows[0].id, 'network']
      );
      return rows[0];
    });
    res.status(201).json(copyType);
  } catch (err) {
    if (err.code === '23505')
      return res.status(409).json({ error: 'Nome già esistente' });
    logger.error({ err }, 'Errore POST /copy-types:')
    res.status(500).json({ error: 'Errore server' });
  }
});

// PUT /api/print-settings/copy-types/:id — solo admin
router.put('/copy-types/:id', authenticate, authorizeAdmin, validate({ params: idParamsSchema, body: copyTypeSchema }), tenantScope, async (req, res) => {
  const { name, label } = req.body;
  try {
    const { rows } = await req.db.query(
      'UPDATE copy_types SET name=$1, label=$2 WHERE id=$3 RETURNING *',
      [name, label, req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Tipo copia non trovato' });
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505')
      return res.status(409).json({ error: 'Nome già esistente' });
    logger.error({ err }, 'Errore PUT /copy-types/id:')
    res.status(500).json({ error: 'Errore server' });
  }
});

// DELETE /api/print-settings/copy-types/:id — solo admin
router.delete('/copy-types/:id', authenticate, authorizeAdmin, validate({ params: idParamsSchema }), tenantScope, async (req, res) => {
  try {
    const result = await req.db.query('DELETE FROM copy_types WHERE id=$1', [req.params.id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Tipo copia non trovato' });
    res.json({ message: 'Tipo copia eliminato' });
  } catch (err) {
    logger.error({ err }, 'Errore DELETE /copy-types/id:')
    res.status(500).json({ error: 'Errore server' });
  }
});

// ─── PRINT SETTINGS ───────────────────────────────────────────

// GET /api/print-settings — tutti gli utenti autenticati
// Ritorna la configurazione completa (join con copy_types) ordinata per sort_order
router.get('/', authenticate, tenantScope, async (req, res) => {
  try {
    const { rows } = await req.db.query(`
      SELECT ps.id, ps.copy_type_id, ct.name AS copy_type_name, ct.label AS copy_type_label,
             ps.printer_type, ps.printer_address, ps.enabled, ps.sort_order
      FROM print_settings ps
      JOIN copy_types ct ON ct.id = ps.copy_type_id
      ORDER BY ps.sort_order ASC, ct.id ASC
    `);
    res.json(rows);
  } catch (err) {
    logger.error({ err }, 'Errore GET /print-settings:')
    res.status(500).json({ error: 'Errore server' });
  }
});

// POST /api/print-settings/reorder — solo admin
// Aggiorna l'ordine di stampa globale delle copie in blocco
router.post('/reorder', authenticate, authorizeAdmin, validate({ body: reorderSchema }), tenantScope, async (req, res) => {
  const { order } = req.body; // id in ordine di stampa, es. [4, 1, 2, 5, 3]
  try {
    // Un solo UPDATE: la posizione di ogni id nell'array diventa il suo sort_order
    await req.db.query(
      `UPDATE print_settings ps SET sort_order = o.position
       FROM unnest($1::int[]) WITH ORDINALITY AS o(id, position)
       WHERE ps.id = o.id`,
      [order]
    );
    res.json({ message: 'Ordinamento completato con successo' });
  } catch (err) {
    logger.error({ err }, 'Errore POST /print-settings/reorder:');
    res.status(500).json({ error: 'Errore server durante il riordinamento' });
  }
});

// PUT /api/print-settings/:id — solo admin
router.put('/:id', authenticate, authorizeAdmin, validate({ params: idParamsSchema, body: printSettingSchema }), tenantScope, async (req, res) => {
  const { printer_type, printer_address, enabled } = req.body;
  try {
    const { rows } = await req.db.query(
      `UPDATE print_settings
       SET printer_type=$1, printer_address=$2, enabled=$3
       WHERE id=$4 RETURNING *`,
      [printer_type, printer_address, enabled, req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Impostazione non trovata' });
    res.json(rows[0]);
  } catch (err) {
    logger.error({ err }, 'Errore PUT /print-settings/id')
    res.status(500).json({ error: 'Errore server' });
  }
});

export default router;
