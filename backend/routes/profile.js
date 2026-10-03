import express from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { tenantScope } from '../middleware/tenantScope.js';
import { validate } from '../middleware/validate.js';
import { changeUsernameSchema } from '../schemas/authSchema.js';
import logger from '../logger.js';

const router = express.Router();

router.patch('/username', authenticate, validate({ body: changeUsernameSchema }), tenantScope, async (req, res) => {
  const { newUsername } = req.body;
  try {
    await req.db.query('UPDATE users SET username=$1 WHERE id=$2', [newUsername, req.user.id]);
    res.json({ success: true, username: newUsername });
  } catch (err) {
    // username unico in tutto il sistema, anche se di un altro tenant (invisibile per RLS)
    if (err.code === '23505') return res.status(409).json({ error: 'Username già in uso' });
    logger.error({ err }, 'Errore cambio username');
    res.status(500).json({ error: 'Errore durante il cambio username' });
  }
});

export default router;
