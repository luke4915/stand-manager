import jwt from 'jsonwebtoken';
import { SIGN_OPTIONS } from './jwtConfig.js';

// Token di sessione e cookie, condivisi da routes/auth.js e routes/profile.js.

// Limiti del rinnovo sessione:
// - un token si può rinnovare solo se è scaduto da meno di REFRESH_GRACE_MS;
// - la sessione dura al massimo MAX_SESSION_MS dal login, poi serve un nuovo login.
export const REFRESH_GRACE_MS = 24 * 60 * 60 * 1000;
export const MAX_SESSION_MS = 7 * 24 * 60 * 60 * 1000;

// `loginAt` (secondi, come iat/exp) è l'istante del login: il refresh lo conserva,
// così la durata massima della sessione non si allunga a ogni rinnovo.
// Il token dura TOKEN_TTL_S, ma mai oltre la fine della sessione massima.
export const TOKEN_TTL_S = 8 * 60 * 60;
export const signToken = (user, loginAt = Math.floor(Date.now() / 1000)) => {
  const sessionEndS = loginAt + MAX_SESSION_MS / 1000;
  const expiresIn = Math.max(1, Math.min(TOKEN_TTL_S, sessionEndS - Math.floor(Date.now() / 1000)));
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role, theme: user.theme || 'dark', tenantId: user.tenant_id, tenantName: user.tenant_name, mustChangePassword: !!user.must_change_password, loginAt },
    process.env.JWT_SECRET,
    { ...SIGN_OPTIONS, expiresIn }
  );
};

export const setCookie = (res, token) => res.cookie('token', token, {
  httpOnly: true,
  secure: true,
  sameSite: 'lax', // app e API stanno sullo stesso sito
  path: '/',
  maxAge: TOKEN_TTL_S * 1000,
});

export const clearCookie = (res) => res.cookie('token', '', {
  httpOnly: true,
  secure: true,
  sameSite: 'lax', // app e API stanno sullo stesso sito
  path: '/',
  expires: new Date(0),
});

