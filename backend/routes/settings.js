import express from 'express';
import { authenticate, authorizeAdmin } from '../middleware/authenticate.js';
import { tenantScope, withTenantClient } from '../middleware/tenantScope.js';
import { resolveTenantFromHost } from '../middleware/resolveTenantFromHost.js';
import logger from '../logger.js';
import { logAudit } from '../utils/auditLogger.js';
import { SETTINGS_KEYS, PUBLIC_SETTINGS_KEYS, settingParamsSchema, settingValueSchema } from '../schemas/settingsSchema.js';
import { validate } from '../middleware/validate.js';

const router = express.Router();

// GET /api/settings — pubblico (menu con QR): solo le chiavi in PUBLIC_SETTINGS_KEYS
router.get('/', resolveTenantFromHost, async (req, res) => {
    try {
        const settings = await withTenantClient(req.tenantId, async (db) => {
            const { rows } = await db.query(
                'SELECT key, value FROM settings WHERE key = ANY($1)',
                [PUBLIC_SETTINGS_KEYS]
            );
            return Object.fromEntries(rows.map(r => [r.key, r.value]));
        });
        res.json(settings);
    } catch (err) {
        logger.error({ err }, 'Errore GET /api/settings');
        res.status(500).json({ error: 'Errore caricamento impostazioni' });
    }
});

// GET /api/settings/all — utenti autenticati: tutte le chiavi note, comprese quelle private
// (contenuto degli scontrini), che la cassa conserva in locale per stampare anche offline
router.get('/all', authenticate, tenantScope, async (req, res) => {
    try {
        const { rows } = await req.db.query('SELECT key, value FROM settings WHERE key = ANY($1)', [SETTINGS_KEYS]);
        res.json(Object.fromEntries(rows.map(r => [r.key, r.value])));
    } catch (err) {
        logger.error({ err }, 'Errore GET /api/settings/all');
        res.status(500).json({ error: 'Errore caricamento impostazioni' });
    }
});

// PUT /api/settings/:key — solo admin, solo chiavi note
router.put('/:key', authenticate, authorizeAdmin, validate({ params: settingParamsSchema, body: settingValueSchema }), tenantScope, async (req, res) => {
    const { key } = req.params;
    const { value } = req.body;
    try {
        await req.db.query(
            'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (tenant_id, key) DO UPDATE SET value = $2',
            [key, value]
        );
        await logAudit(req.db, req.user.id, 'UPDATE_SETTING', { key: key });
        res.json({ key: key, value });
    } catch (err) {
        logger.error({ err }, 'Errore PUT /api/settings/:key');
        res.status(500).json({ error: 'Errore salvataggio impostazione' });
    }
});

export default router;
