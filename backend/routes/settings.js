import express from 'express';
import { authenticate, authorizeAdmin } from '../middleware/authenticate.js';
import { tenantScope, withTenantClient } from '../middleware/tenantScope.js';
import { resolveTenantFromHost } from '../middleware/resolveTenantFromHost.js';
import logger from '../logger.js';
import { logAudit } from '../utils/auditLogger.js';
import { PUBLIC_SETTINGS_KEYS, settingKeySchema, settingValueSchema } from '../schemas/settingsSchema.js';

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

// PUT /api/settings/:key — solo admin, solo chiavi note
router.put('/:key', authenticate, authorizeAdmin, tenantScope, async (req, res) => {
    const key = settingKeySchema.safeParse(req.params.key);
    if (!key.success) return res.status(400).json({ error: 'Impostazione non riconosciuta' });
    const body = settingValueSchema.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: 'Valore non valido (testo, massimo 2000 caratteri)' });

    try {
        const { value } = body.data;
        await req.db.query(
            'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (tenant_id, key) DO UPDATE SET value = $2',
            [key.data, value]
        );
        await logAudit(req.user.id, 'UPDATE_SETTING', { key: key.data });
        res.json({ key: key.data, value });
    } catch (err) {
        logger.error({ err }, 'Errore PUT /api/settings/:key');
        res.status(500).json({ error: 'Errore salvataggio impostazione' });
    }
});

export default router;
