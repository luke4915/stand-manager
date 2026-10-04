import express from 'express';
import { authenticate, authorizeAdmin, authorizeStock } from '../middleware/authenticate.js';
import { validate } from '../middleware/validate.js';
import { tenantScope, withTenantClient } from '../middleware/tenantScope.js';
import { resolveTenantFromHost } from '../middleware/resolveTenantFromHost.js';
import logger from '../logger.js';
import { requireModule } from '../utils/tenantModules.js';
import { logAudit } from '../utils/auditLogger.js';
import { idParamsSchema } from '../schemas/common.js';
import { productSchema, bulkVisibilitySchema, stockSchema } from '../schemas/productSchema.js';

const router = express.Router();

// GET /api/products/menu — pubblico, tenant risolto dal sottodominio
router.get('/menu', resolveTenantFromHost, requireModule('qr_menu'), async (req, res) => {
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
router.patch('/bulk-visibility', authenticate, authorizeAdmin, validate({ body: bulkVisibilitySchema }), tenantScope, async (req, res) => {
  const { ids, visible } = req.body;
  try {
    const { rowCount } = await req.db.query('UPDATE products SET visible = $1 WHERE id = ANY($2)', [visible, ids]);
    await logAudit(req.db, req.user.id, 'BULK_PRODUCT_VISIBILITY', { ids, visible });
    res.json({ message: `Aggiornati ${rowCount} prodotti`, updatedCount: rowCount });
  } catch (err) {
    logger.error({ err }, 'Errore bulk-visibility');
    res.status(500).json({ error: 'Errore aggiornamento massivo' });
  }
});

// PATCH /api/products/:id/stock — stock dalla cassa (admin, responsabile, cassa)
router.patch('/:id/stock', authenticate, authorizeStock, validate({ params: idParamsSchema, body: stockSchema }), tenantScope, async (req, res) => {
  const { stock, stock_enabled } = req.body;
  try {
    const { rows } = await req.db.query(
      'UPDATE products SET stock = $1, stock_enabled = $2 WHERE id = $3 RETURNING *',
      [stock, stock_enabled, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Prodotto non trovato' });
    await logAudit(req.db, req.user.id, 'UPDATE_STOCK', { productId: req.params.id, stock, stock_enabled });
    res.json(rows[0]);
  } catch (err) {
    logger.error({ err }, 'Errore PATCH stock');
    res.status(500).json({ error: 'Errore aggiornamento stock' });
  }
});

// POST /api/products
router.post('/', authenticate, authorizeAdmin, validate({ body: productSchema }), tenantScope, async (req, res) => {
  const { name, price, category, color, visible, print_destination } = req.body;
  try {
    const { rows } = await req.db.query(
      'INSERT INTO products (name, price, category, color, visible, print_destination) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [name, price, category, color, visible, print_destination]
    );
    await logAudit(req.db, req.user.id, 'CREATE_PRODUCT', { productId: rows[0].id, name });
    res.status(201).json(rows[0]);
  } catch (err) {
    logger.error({ err }, 'Errore salvataggio prodotto');
    res.status(500).json({ error: 'Errore salvataggio prodotto' });
  }
});

// PUT /api/products/:id
router.put('/:id', authenticate, authorizeAdmin, validate({ params: idParamsSchema, body: productSchema }), tenantScope, async (req, res) => {
  const { name, price, category, color, visible, print_destination } = req.body;
  try {
    const { rows } = await req.db.query(
      'UPDATE products SET name=$1, price=$2, category=$3, color=$4, visible=$5, print_destination=$6 WHERE id=$7 RETURNING *',
      [name, price, category, color, visible, print_destination, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Prodotto non trovato' });
    await logAudit(req.db, req.user.id, 'UPDATE_PRODUCT', { productId: req.params.id, name, price, visible });
    res.json(rows[0]);
  } catch (err) {
    logger.error({ err }, 'Errore aggiornamento prodotto');
    res.status(500).json({ error: 'Errore aggiornamento prodotto' });
  }
});

// DELETE /api/products/:id
router.delete('/:id', authenticate, authorizeAdmin, validate({ params: idParamsSchema }), tenantScope, async (req, res) => {
  try {
    const { rows } = await req.db.query('DELETE FROM products WHERE id=$1 RETURNING name', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Prodotto non trovato' });
    await logAudit(req.db, req.user.id, 'DELETE_PRODUCT', { productId: req.params.id, name: rows[0].name });
    res.json({ message: 'Prodotto eliminato' });
  } catch (err) {
    logger.error({ err }, 'Errore eliminazione prodotto');
    res.status(500).json({ error: 'Errore eliminazione prodotto' });
  }
});

export default router;
