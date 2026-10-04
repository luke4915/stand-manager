import express from 'express';
import { authenticate, authorizeAdmin } from '../middleware/authenticate.js';
import { tenantScope } from '../middleware/tenantScope.js';
import logger from '../logger.js';
import { validate } from '../middleware/validate.js';
import { idParamsSchema } from '../schemas/common.js';

const router = express.Router();

const fmt = (n) => Number(n || 0).toFixed(2).replace('.', ',');
// Valori che iniziano con = + - @ (o tab/CR) Excel li legge come formule: si antepone un apostrofo.
const esc = (s) => {
  const text = String(s || '');
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
};

router.get('/session/:id/csv', authenticate, authorizeAdmin, validate({ params: idParamsSchema }), tenantScope, async (req, res) => {
  const sessionId = req.params.id;

  try {
    const { rows: sessionRows } = await req.db.query('SELECT id FROM sessions WHERE id=$1', [sessionId]);
    if (!sessionRows.length) return res.status(404).json({ error: 'Sessione non trovata' });

    const { rows: orders } = await req.db.query(
      `SELECT id, created_at, items, total FROM orders
       WHERE status='completed' AND session_id = $1
       ORDER BY created_at ASC`,
      [sessionId]
    );

    const headers = ['ID Ordine', 'Data/Ora', 'Prodotto', 'Categoria', 'Quantita', 'Prezzo Unitario', 'Prezzo Riga', 'Note', 'Totale Ordine'];
    const rows = [headers.join(';')];

    for (const order of orders) {
      let items = [];
      try { items = typeof order.items === 'string' ? JSON.parse(order.items) : (order.items || []); } catch { }
      for (const item of items) {
        const qty = Number(item.quantity || 0);
        const price = Number(item.price || 0);
        rows.push([
          order.id,
          new Date(order.created_at).toLocaleString('it-IT'),
          esc(item.name),
          esc(item.category || 'Generico'),
          qty,
          fmt(price),
          fmt(item.line_total ?? qty * price),
          esc(item.note),
          fmt(order.total),
        ].join(';'));
      }
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=report_sessione_${sessionId}.csv`);
    res.status(200).send('\uFEFF' + rows.join('\n'));
  } catch (err) {
    logger.error({ err }, 'Errore CSV')
    res.status(500).json({ error: 'Errore generazione CSV' });
  }
});

export default router;
