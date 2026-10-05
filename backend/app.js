import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';

import authRoutes from './routes/auth.js';
import profileRoutes from './routes/profile.js';
import productRoutes from './routes/products.js';
import orderRoutes from './routes/orders.js';
import deviceRoutes from './routes/devices.js';
import sessionRoutes from './routes/sessions.js';
import statsRoutes from './routes/stats.js';
import { roomsRouter, tablesRouter } from './routes/rooms.js';
import coursesRouter from './routes/courses.js';
import { modifierGroupsRouter, productModifiersRouter } from './routes/modifierGroups.js';
import checkRoutes from './routes/checks.js';
import healthRoutes from './routes/health.js';
import { requestLogger } from './middleware/requestLogger.js';
import exportRoutes from './routes/exports.js';
import printSettingsRoutes from './routes/printSettings.js';
import settingsRoutes from './routes/settings.js';
import masterRoutes from './routes/master.js';
import { loginLimiter, apiLimiter, ordersLimiter, devicesLimiter, exportsLimiter } from './middleware/rateLimiter.js';
import { isAllowedOrigin } from './utils/origins.js';
import logger from './logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Applicazione Express senza server né porta: la avvia server.js (HTTPS) e la usano
// i test di integrazione. `broadcast` arriva dal WebSocket (ws.js); `rateLimit: false`
// serve solo ai test, che inviano molte richieste di fila dallo stesso indirizzo.
export function createApp({ broadcast, rateLimit = true, logRequests = true }) {
  const app = express();

  app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        // il frontend chiama le API e il WebSocket su HTTPS/WSS
        'connect-src': ["'self'", 'https://*', 'wss://*'],
      },
    },
  }));

  app.set('trust proxy', 1); // necessario per il rate limiter dietro proxy/nginx

  app.use(cookieParser());
  // Richieste dal browser da un'origine non ammessa: 403 prima di eseguire qualsiasi cosa.
  // Senza Origin (app native, script, stesso sito in GET) si prosegue normalmente.
  app.use((req, res, next) => {
    const { origin } = req.headers;
    if (origin && !isAllowedOrigin(origin)) return res.status(403).json({ error: 'Origine non consentita' });
    next();
  });
  app.use(cors({ origin: true, credentials: true }));
  app.use('/api/health', healthRoutes); // prima di limiti e log: lo interroga il monitoraggio ogni pochi secondi
  if (logRequests) app.use('/api', requestLogger);
  app.use(express.json({ limit: '1mb' }));
  // Dalla cartella assets si servono solo i suoni: lì stanno anche loghi che non devono essere pubblici.
  app.use('/api/assets', (req, res, next) => (req.path.endsWith('.mp3') ? next() : res.status(404).json({ error: 'Non trovato' })),
    express.static(path.join(__dirname, 'assets'), { index: false, dotfiles: 'deny' }));

  if (rateLimit) {
    app.use('/api', apiLimiter);
    app.use('/api/auth/login', loginLimiter);
    app.use('/api/master/login', loginLimiter);
    app.use('/api/orders', ordersLimiter);
    app.use('/api/devices', devicesLimiter);
    app.use('/api/exports', exportsLimiter);
  }

  app.use('/api/auth', authRoutes);
  app.use('/api/profile', profileRoutes);
  app.use('/api/products', productModifiersRouter); // PUT /:id/modifier-groups, prima delle route dei prodotti
  app.use('/api/products', productRoutes);
  app.use('/api/modifier-groups', modifierGroupsRouter);
  app.use('/api/print-settings', printSettingsRoutes);
  app.use('/api/orders', orderRoutes(broadcast));
  app.use('/api/devices', deviceRoutes);
  app.use('/api/sessions', sessionRoutes(broadcast));
  app.use('/api/exports', exportRoutes);
  app.use('/api/stats', statsRoutes);
  app.use('/api/rooms', roomsRouter);
  app.use('/api/tables', tablesRouter);
  app.use('/api/courses', coursesRouter);
  app.use('/api/checks', checkRoutes(broadcast));
  app.use('/api/settings', settingsRoutes);
  app.use('/api/master', masterRoutes);

  // In produzione il backend serve anche il frontend compilato
  if (process.env.NODE_ENV === 'production') {
    const distPath = path.join(__dirname, '..', 'frontend', 'dist');
    app.use(express.static(distPath));
    app.use((req, res, next) => {
      if (req.method === 'GET' && !req.path.startsWith('/api')) {
        return res.sendFile(path.join(distPath, 'index.html'));
      }
      next();
    });
  }

  app.use((err, _req, res, _next) => {
    // JSON malformato o troppo grande: errore di chi chiama, non del server
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Corpo della richiesta non valido' });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Richiesta troppo grande' });
    logger.error({ err }, 'Errore non gestito');
    res.status(500).json({ error: 'Errore interno del server' });
  });

  return app;
}
