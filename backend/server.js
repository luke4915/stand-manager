import { createServer } from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

import { createApp } from './app.js';
import { createWebSocketHub } from './ws.js';
import { pool } from './db.js';
import logger from './logger.js';
import { checkSecrets } from './utils/jwtConfig.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const { missing, weak } = checkSecrets();
if (missing.length || (weak.length && process.env.NODE_ENV === 'production')) {
  logger.fatal({ problems: [...missing, ...weak] }, 'Segreti non validi nel .env (servono stringhe casuali di almeno 32 caratteri, es. openssl rand -hex 48)');
  process.exit(1);
}
if (weak.length) logger.warn({ problems: weak }, 'Segreti deboli: in produzione l\'app non partirebbe');

// Certificati HTTPS (mkcert in sviluppo): percorsi da env, con fallback sui file locali
const keyPath = process.env.HTTPS_KEY_PATH || path.resolve(__dirname, '_wildcard.standmanager.local+4-key.pem');
const certPath = process.env.HTTPS_CERT_PATH || path.resolve(__dirname, '_wildcard.standmanager.local+4.pem');
let httpsOptions;
try {
  httpsOptions = { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) };
} catch (err) {
  logger.fatal({ err }, 'Certificati HTTPS mancanti o non leggibili');
  process.exit(1);
}

// WebSocket sullo stesso server HTTPS (quindi WSS), isolato per tenant: vedi ws.js
const hub = createWebSocketHub();
const server = createServer(httpsOptions, createApp({ broadcast: hub.broadcast }));
hub.attach(server);

process.on('SIGTERM', () => {
  logger.info('SIGTERM ricevuto, chiusura server...');
  hub.close();
  server.close(() => pool.end(() => process.exit(0)));
});

const PORT = parseInt(process.env.PORT) || 3000;
server.listen(PORT, '0.0.0.0', () => logger.info(`API e WSS in ascolto su https://0.0.0.0:${PORT}`));
