import express from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { tenantScope } from '../middleware/tenantScope.js';
import logger from '../logger.js';

const router = express.Router();

router.patch('/username', authenticate, tenantScope, async (req, res) => {
  const { newUsername } = req.body;
  if (!newUsername?.trim()) return res.status(400).json({ error: 'Nome utente mancante' });
  try {
    const { rows: existing } = await req.db.query(
      'SELECT id FROM users WHERE username=$1 AND id!=$2', [newUsername.trim(), req.user.id]
    );
    if (existing.length) return res.status(409).json({ error: 'Username già in uso' });
    await req.db.query('UPDATE users SET username=$1 WHERE id=$2', [newUsername.trim(), req.user.id]);
    res.json({ success: true, username: newUsername.trim() });
  } catch (err) {
    logger.error({ err }, 'Errore server')
    res.status(500).json({ error: 'Errore server' });
  }
});

export default router;
