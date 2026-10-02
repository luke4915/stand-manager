import logger from '../logger.js';

/**
 * Registra un'azione critica nel database per l'audit di sicurezza.
 * Usa la connessione già legata al tenant (req.db o il client di withTenantClient):
 * tenant_id arriva da app.tenant_id e la RLS isola i log come le altre tabelle.
 * Va chiamata fuori da transazioni aperte: un errore qui viene solo loggato.
 * @param {import('pg').PoolClient} db - Connessione con app.tenant_id impostato
 * @param {number} userId - L'ID dell'utente che compie l'azione (da req.user.id)
 * @param {string} action - Il tipo di azione (es. 'CREATE_ORDER', 'REPRINT_ORDER')
 * @param {object} details - Oggetto contenente i dettagli rilevanti
 */
export async function logAudit(db, userId, action, details = {}) {
    try {
        await db.query(
            'INSERT INTO audit_logs (user_id, action, details) VALUES ($1, $2, $3)',
            [userId, action, JSON.stringify(details)]
        );
    } catch (err) {
        // Usiamo il logger interno per segnalare se l'audit log fallisce, senza bloccare l'app
        logger.error({ err, userId, action }, 'ERRORE critico durante il salvataggio dell\'audit log:');
    }
}
