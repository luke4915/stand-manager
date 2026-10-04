import logger from '../logger.js';

// Una riga di log per richiesta API: metodo, percorso (senza query string), stato, durata, utente e tenant.
// Mai cookie, header o body: possono contenere password e token. Le richieste lente o in errore salgono di livello.
const SLOW_MS = 1000;
const SKIP = ['/api/health'];

export function requestLogger(req, res, next) {
  if (SKIP.some((p) => req.originalUrl.startsWith(p))) return next();
  const path = req.originalUrl.split('?')[0];
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Math.round(Number(process.hrtime.bigint() - start) / 1e6);
    const level = res.statusCode >= 500 ? 'error' : (res.statusCode >= 400 || ms >= SLOW_MS) ? 'warn' : 'info';
    logger[level]({
      method: req.method,
      path,
      status: res.statusCode,
      ms,
      userId: req.user?.id,
      tenantId: req.user?.tenantId ?? req.tenantId,
    }, 'richiesta');
  });
  next();
}
