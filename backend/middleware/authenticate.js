import jwt from 'jsonwebtoken';
import logger from '../logger.js';

// Finché l'utente non cambia la password temporanea il server rifiuta ogni chiamata
// (tranne quelle che servono a cambiarla): non basta nascondere l'interfaccia.
function verifyRequest(req, res, next, { allowPasswordChange }) {
  let token = req.cookies?.token;
  if (!token) {
    const auth = req.headers['authorization'] || req.headers['Authorization'];
    if (auth?.startsWith('Bearer ')) token = auth.split(' ')[1];
  }
  if (!token) return res.status(401).json({ error: 'Token mancante' });

  if (!process.env.JWT_SECRET) {
    logger.error('JWT_SECRET non impostata');
    return res.status(500).json({ error: 'Server non configurato correttamente' });
  }

  try {
    const { id, username, role, tenantId, tenantName, mustChangePassword } = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id, username, role, tenantId, tenantName, mustChangePassword: !!mustChangePassword };
    if (req.user.mustChangePassword && !allowPasswordChange)
      return res.status(403).json({ error: 'Devi prima cambiare la password temporanea', code: 'PASSWORD_CHANGE_REQUIRED' });
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError')
      return res.status(401).json({ error: 'Token scaduto', code: 'TOKEN_EXPIRED' });
    return res.status(403).json({ error: 'Token non valido' });
  }
}

export const authenticate = (req, res, next) => verifyRequest(req, res, next, { allowPasswordChange: false });
export const authenticateAllowingPasswordChange = (req, res, next) => verifyRequest(req, res, next, { allowPasswordChange: true });

export function authorizeAdmin(req, res, next) {
  if (req.user?.role !== 'admin')
    return res.status(403).json({ error: 'Accesso riservato agli amministratori' });
  next();
}

// Ruoli che lavorano alla cassa: creano ordini, li stornano, li ristampano, gestiscono lo stock.
// La cucina vede gli ordini e ne fa avanzare lo stato, nient'altro.
export const CASH_ROLES = ['admin', 'responsabile', 'cassa'];
export const STOCK_ROLES = CASH_ROLES;

export const authorizeRoles = (roles, message) => (req, res, next) => {
  if (!roles.includes(req.user?.role)) return res.status(403).json({ error: message });
  next();
};

export const authorizeStock = authorizeRoles(STOCK_ROLES, 'Non hai i permessi per modificare lo stock');
export const authorizeCash = authorizeRoles(CASH_ROLES, 'Non hai i permessi per questa operazione');

// Ruoli degli utenti di un tenant.
export const ROLES = ['admin', 'responsabile', 'cassa', 'cucina'];

// Ruoli abilitati ad applicare sconti/omaggi su ordini e singoli prodotti.
// Esportato anche come array riutilizzabile per validazioni inline (non solo middleware di route).
export const DISCOUNT_ROLES = ['admin', 'responsabile'];

export function authorizeDiscount(req, res, next) {
  if (!DISCOUNT_ROLES.includes(req.user?.role))
    return res.status(403).json({ error: 'Accesso riservato ad admin e responsabili' });
  next();
}