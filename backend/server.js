import express from 'express';
import cors from 'cors';
// 🔴 MODIFICA: Importiamo 'createServer' da 'https' nativo anziché 'http'
import { createServer } from 'https';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import { fileURLToPath } from 'url';
import path from 'path';
import escpos from 'escpos';
// import escposUsb from 'escpos-usb';
import helmet from 'helmet';
import fs from 'fs'; // 🔴 NUOVO: Necessario per leggere i file .pem di mkcert

import authRoutes from './routes/auth.js';
import profileRoutes from './routes/profile.js';
import productRoutes from './routes/products.js';
import printersRoutes from './routes/printers.js';
import orderRoutes from './routes/orders.js';
import sessionRoutes from './routes/sessions.js';
import exportRoutes from './routes/exports.js';
import printSettingsRoutes from './routes/printSettings.js';
import settingsRoutes from './routes/settings.js';
import { loginLimiter, apiLimiter, ordersLimiter } from './middleware/rateLimiter.js';
import logger from './logger.js';
import { pool } from './db.js';
import masterRoutes from './routes/master.js';
import { attachWebSocket } from './ws.js';
import { isAllowedOrigin } from './utils/origins.js';

// escpos.USB = escposUsb;
dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// 🔴 MODIFICA: Aggiornato Helmet con CSP permissivo per consentire le connessioni WSS locali
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      "connect-src": ["'self'", "https://*", "wss://*"],
    },
  },
}));

// Crash immediato se JWT_SECRET mancante
if (!process.env.JWT_SECRET) {
  logger.fatal('JWT_SECRET non impostata nel .env');
  process.exit(1);
}

app.set('trust proxy', 1); // necessario per rate limiter dietro proxy/nginx

app.use(cookieParser());
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    const ok = isAllowedOrigin(origin);
    cb(ok ? null : new Error('CORS non consentito'), ok);
  },
  credentials: true,
}));
app.use(express.json({ limit: '1mb' })); // limita payload JSON
app.use('/api/assets', express.static(path.join(__dirname, 'assets')));

// Rate limiting globale su tutte le API
app.use('/api', apiLimiter);
// Rate limiting specifico
app.use('/api/auth/login', loginLimiter);
app.use('/api/master/login', loginLimiter);
app.use('/api/orders', ordersLimiter);

// 🔴 MODIFICA: Caricamento sicuro dei certificati mkcert da variabili d'ambiente con fallback sul tuo file attuale
const keyPath = process.env.HTTPS_KEY_PATH || path.resolve(__dirname, '_wildcard.standmanager.local+4-key.pem');
const certPath = process.env.HTTPS_CERT_PATH || path.resolve(__dirname, '_wildcard.standmanager.local+4.pem');

let httpsOptions;
try {
  httpsOptions = {
    key: fs.readFileSync(path.resolve(keyPath)),
    cert: fs.readFileSync(path.resolve(certPath)),
  };
  logger.info('Certificati SSL di mkcert caricati correttamente');
} catch (err) {
  logger.error({ err }, 'FATALE: Impossibile avviare il backend. File dei certificati mkcert mancanti o non leggibili');
  process.exit(1);
}

// 🔴 MODIFICA: Passiamo le opzioni SSL al server HTTPS
const server = createServer(httpsOptions, app);

// WebSocket sullo stesso server HTTPS (quindi WSS), isolato per tenant: vedi ws.js
const { broadcast, close: closeWebSocket } = attachWebSocket(server);

app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/products', productRoutes);
app.use('/api/printers', printersRoutes);
app.use('/api/print-settings', printSettingsRoutes);
app.use('/api/orders', orderRoutes(broadcast));
app.use('/api/sessions', sessionRoutes(broadcast));
app.use('/api/exports', exportRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/master', masterRoutes);

// Serve frontend build in produzione
const distPath = path.join(__dirname, '..', 'frontend', 'dist');
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(distPath));
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api')) {
      return res.sendFile(path.join(distPath, 'index.html'));
    }
    next();
  });
}

// Handler errori globale
app.use((err, _req, res, _next) => {
  logger.error({ err }, 'Errore non gestito');
  res.status(500).json({ error: 'Errore interno del server' });
});

process.on('SIGTERM', () => {
  logger.info('SIGTERM ricevuto, chiusura server...');
  closeWebSocket();
  server.close(() => {
    pool.end(() => process.exit(0));
  });
});

const PORT = parseInt(process.env.PORT) || 3000;
// endpoint locale risponde su https:// anziché http://
server.listen(PORT, '0.0.0.0', () => logger.info(`🚀 API sicure + WSS in ascolto su https://0.0.0.0:${PORT}`));