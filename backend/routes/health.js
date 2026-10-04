import express from 'express';
import { pool } from '../db.js';
import logger from '../logger.js';

const router = express.Router();

// GET /api/health — il processo risponde (liveness). Nessun accesso al database.
router.get('/', (_req, res) => res.json({ status: 'ok' }));

// GET /api/health/ready — il database risponde (readiness): per il bilanciatore e il monitoraggio.
router.get('/ready', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok' });
  } catch (err) {
    logger.error({ err }, 'Health check: database non raggiungibile');
    res.status(503).json({ status: 'database non raggiungibile' });
  }
});

export default router;
