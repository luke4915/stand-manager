import express from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { tenantScope } from '../middleware/tenantScope.js';
import { validate } from '../middleware/validate.js';
import { changeUsernameSchema } from '../schemas/authSchema.js';
import { signToken, setCookie } from '../utils/sessionToken.js';
import { logAudit } from '../utils/auditLogger.js';
import logger from '../logger.js';

const router = express.Router();

router.patch('/username', authenticate, validate({ body: changeUsernameSchema }), tenantScope, async (req, res) => {
  const { newUsername } = req.body;
  try {
    const { rows } = await req.db.query('UPDATE users SET username=$1 WHERE id=$2 RETURNING username', [newUsername, req.user.id]);
    if (!rows.length) return res.status(404).json({ error: 'Utente non trovato' });
    await logAudit(req.db, req.user.id, 'CHANGE_USERNAME', { previous: req.user.username, username: rows[0].username });

    // Il token porta lo username: se ne emette uno nuovo, mantenendo l'inizio sessione, così /auth/me
    // e il resto dell'app non mostrano il nome vecchio fino al prossimo rinnovo.
    setCookie(res, signToken({ ...req.user, username: rows[0].username, tenant_id: req.user.tenantId, tenant_name: req.user.tenantName }, req.user.loginAt));

    res.json({ success: true, username: rows[0].username });
  } catch (err) {
    // username già usato in questo tenant
    if (err.code === '23505') return res.status(409).json({ error: 'Username già in uso' });
    logger.error({ err }, 'Errore cambio username');
    res.status(500).json({ error: 'Errore durante il cambio username' });
  }
});

export default router;
