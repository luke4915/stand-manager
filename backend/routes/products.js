import express from 'express';
import { pool } from '../db.js';
import { authenticate, authorizeAdmin } from '../middleware/authenticate.js';
import { tenantScope, withTenantClient } from '../middleware/tenantScope.js';
import { resolveTenantFromHost } from '../middleware/resolveTenantFromHost.js';
import logger from '../logger.js';

const router = express.Router();
const VALID_DESTINATIONS = ['bar', 'kitchen', 'both'];
const LOW_STOCK_THRESHOLD = 10;

// GET /api/products/menu — pubblico, tenant risolto dal sottodominio
router.get('/menu', resolveTenantFromHost, async (req, res) => {
  try {
    const data = await withTenantClient(req.tenantId, async (db) => {
      const [{ rows: products }, { rows: sessions }] = await Promise.all([
        db.query('SELECT id, name, price, category, color FROM products WHERE visible = true ORDER BY category, name'),
        db.query('SELECT name FROM sessions WHERE end_time IS NULL ORDER BY start_time DESC LIMIT 1')
      ]);
      return { sessionName: sessions[0]?.name || null, products };
    });
    res.json(data);
  } catch (err) {
    logger.error({ err }, 'Errore GET /api/products/menu');
    res.status(500).json({ error: 'Errore caricamento menu' });
  }
});

// GET /api/products
router.get('/', authenticate, tenantScope, async (req, res) => {
  try {
    const { rows } = await req.db.query('SELECT * FROM products ORDER BY category, name');
    res.json(rows);
  } catch (err) {
    logger.error({ err }, 'Errore caricamento prodotti');
    res.status(500).json({ error: 'Errore caricamento prodotti' });
  }
});

// PATCH /api/products/bulk-visibility
router.patch('/bulk-visibility', authenticate, authorizeAdmin, tenantScope, async (req, res) => {
  const { ids, visible } = req.body;
  if (!Array.isArray(ids) || ids.length === 0 || visible === undefined)
    return res.status(400).json({ error: 'Dati non validi.' });
  try {
    const { rows } = await req.db.query(
      'UPDATE products SET visible = $1 WHERE id = ANY($2) RETURNING *',
      [visible, ids]
    );
    res.json({ message: `Aggiornati ${rows.length} prodotti`, updatedCount: rows.length });
  } catch (err) {
    logger.error({ err }, 'Errore bulk-visibility');
    res.status(500).json({ error: 'Errore aggiornamento massivo' });
  }
});

// PATCH /api/products/:id/stock — aggiorna stock (admin + cassa)
router.patch('/:id/stock', authenticate, tenantScope, async (req, res) => {
  const { id } = req.params;
  const { stock, stock_enabled } = req.body;
  try {
    const { rows } = await req.db.query(
      'UPDATE products SET stock = $1, stock_enabled = $2 WHERE id = $3 RETURNING *',
      [stock === null || stock === undefined ? null : parseInt(stock), stock_enabled ?? true, id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Prodotto non trovato' });
    res.json(rows[0]);
  } catch (err) {
    logger.error({ err }, 'Errore PATCH stock');
    res.status(500).json({ error: 'Errore aggiornamento stock' });
  }
});

// POST /api/products
router.post('/', authenticate, authorizeAdmin, tenantScope, async (req, res) => {
  const { name, price, category, color, visible, print_destination } = req.body;
  if (!name?.trim() || price === undefined || price === null || !category?.trim())
    return res.status(400).json({ error: 'Nome, Prezzo e Categoria sono obbligatori.' });
  if (name.trim().length > 40)
    return res.status(400).json({ error: 'Il nome è troppo lungo (max 40 caratteri).' });
  if (isNaN(price) || price < 0)
    return res.status(400).json({ error: 'Prezzo non valido.' });
  const dest = VALID_DESTINATIONS.includes(print_destination) ? print_destination : 'both';
  try {
    const { rows } = await req.db.query(
      'INSERT INTO products (name, price, category, color, visible, print_destination) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [name.trim(), price, category.trim(), color || '#3b82f6', visible !== false, dest]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    logger.error({ err }, 'Errore salvataggio prodotto');
    res.status(500).json({ error: 'Errore salvataggio prodotto' });
  }
});

// PUT /api/products/:id
router.put('/:id', authenticate, authorizeAdmin, tenantScope, async (req, res) => {
  const { id } = req.params;
  const { name, price, category, color, visible, print_destination } = req.body;
  if (!name?.trim() || price === undefined || price === null || !category?.trim())
    return res.status(400).json({ error: 'Campi obbligatori mancanti.' });
  const dest = VALID_DESTINATIONS.includes(print_destination) ? print_destination : 'both';
  try {
    const { rows } = await req.db.query(
      'UPDATE products SET name=$1, price=$2, category=$3, color=$4, visible=$5, print_destination=$6 WHERE id=$7 RETURNING *',
      [name.trim(), price, category.trim(), color, visible, dest, id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Prodotto non trovato' });
    res.json(rows[0]);
  } catch (err) {
    logger.error({ err }, 'Errore aggiornamento prodotto');
    res.status(500).json({ error: 'Errore aggiornamento prodotto' });
  }
});

// DELETE /api/products/:id
router.delete('/:id', authenticate, authorizeAdmin, tenantScope, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await req.db.query('DELETE FROM products WHERE id=$1', [id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Prodotto non trovato' });
    res.json({ message: 'Prodotto eliminato' });
  } catch (err) {
    logger.error({ err }, 'Errore eliminazione prodotto');
    res.status(500).json({ error: 'Errore eliminazione prodotto' });
  }
});

export { LOW_STOCK_THRESHOLD };
export default router;
