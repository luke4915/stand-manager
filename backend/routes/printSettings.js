// routes/printSettings.js
import express from 'express';
import { authenticate, authorizeAdmin } from '../middleware/authenticate.js';
import { tenantScope } from '../middleware/tenantScope.js';
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
router.post('/copy-types', authenticate, authorizeAdmin, tenantScope, async (req, res) => {
  const { name, label } = req.body;
  if (!name?.trim() || !label?.trim())
    return res.status(400).json({ error: 'name e label sono obbligatori' });

  try {
    const { rows } = await req.db.query(
      'INSERT INTO copy_types (name, label) VALUES ($1, $2) RETURNING *',
      [name.trim(), label.trim()]
    );
    // Crea subito una riga print_settings di default per il nuovo tipo
    await req.db.query(
      'INSERT INTO print_settings (copy_type_id, printer_type, enabled) VALUES ($1, $2, false)',
      [rows[0].id, 'network']
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505')
      return res.status(400).json({ error: 'Nome già esistente' });
    logger.error({ err }, 'Errore POST /copy-types:')
    res.status(500).json({ error: 'Errore server' });
  }
});

// PUT /api/print-settings/copy-types/:id — solo admin
router.put('/copy-types/:id', authenticate, authorizeAdmin, tenantScope, async (req, res) => {
  const { id } = req.params;
  const { name, label } = req.body;
  if (!name?.trim() || !label?.trim())
    return res.status(400).json({ error: 'name e label sono obbligatori' });

  try {
    const { rows } = await req.db.query(
      'UPDATE copy_types SET name=$1, label=$2 WHERE id=$3 RETURNING *',
      [name.trim(), label.trim(), id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Tipo copia non trovato' });
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505')
      return res.status(400).json({ error: 'Nome già esistente' });
    logger.error({ err }, 'Errore PUT /copy-types/id:')
    res.status(500).json({ error: 'Errore server' });
  }
});

// DELETE /api/print-settings/copy-types/:id — solo admin
router.delete('/copy-types/:id', authenticate, authorizeAdmin, tenantScope, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await req.db.query('DELETE FROM copy_types WHERE id=$1', [id]);
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
router.post('/reorder', authenticate, authorizeAdmin, tenantScope, async (req, res) => {
  const { order } = req.body; // Array di id ordinati, es: [4, 1, 2, 5, 3]
  if (!Array.isArray(order)) {
    return res.status(400).json({ error: 'Formato ordine non valido' });
  }

  const client = req.db; // connessione dedicata già scoped al tenant
  try {
    await client.query('BEGIN');
    for (let i = 0; i < order.length; i++) {
      await client.query(
        'UPDATE print_settings SET sort_order = $1 WHERE id = $2',
        [i + 1, order[i]]
      );
    }
    await client.query('COMMIT');
    res.json({ message: 'Ordinamento completato con successo' });
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error({ err }, 'Errore POST /print-settings/reorder:');
    res.status(500).json({ error: 'Errore server durante il riordinamento' });
  }
});

// PUT /api/print-settings/:id — solo admin
router.put('/:id', authenticate, authorizeAdmin, tenantScope, async (req, res) => {
  const { id } = req.params;
  const { printer_type, printer_address, enabled } = req.body;

  if (!printer_type || !['network', 'usb'].includes(printer_type))
    return res.status(400).json({ error: 'printer_type deve essere "network" o "usb"' });

  if (printer_type === 'network' && printer_address) {
    const networkPattern = /^(\d{1,3}\.){3}\d{1,3}:\d{2,5}$/;
    if (!networkPattern.test(printer_address.trim()))
      return res.status(400).json({ error: 'Indirizzo rete non valido. Formato atteso: 192.168.1.100:9100' });
  }

  try {
    const { rows } = await req.db.query(
      `UPDATE print_settings
       SET printer_type=$1, printer_address=$2, enabled=$3
       WHERE id=$4 RETURNING *`,
      [printer_type, printer_address?.trim() || null, enabled, id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Impostazione non trovata' });
    res.json(rows[0]);
  } catch (err) {
    logger.error({ err }, 'Errore GET /print-settings/id:')
    res.status(500).json({ error: 'Errore server' });
  }
});

export default router;
