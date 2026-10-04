# Stand Manager

Gestionale SaaS per sagre, eventi e ristorazione: cassa, ordini, comande su stampanti termiche, schermo cucina (KDS), magazzino, statistiche e menu pubblico con QR. Ogni cliente (tenant) ha il suo sottodominio e i suoi dati, isolati nel database con la Row-Level Security di PostgreSQL.

- `backend/`: Node.js, Express 5, PostgreSQL, WebSocket
- `frontend/`: React 19, Vite, Tailwind v4, PWA con funzionamento offline

Regole, convenzioni e struttura nel dettaglio: [`CLAUDE.md`](CLAUDE.md).

## Requisiti

- Node.js 22
- PostgreSQL 16 o successivo
- [mkcert](https://github.com/FiloSottile/mkcert) per i certificati HTTPS locali

## Sviluppo in locale

**1. Database**

```bash
createdb standmanager
psql -d standmanager -c "CREATE ROLE standmanager_app LOGIN PASSWORD 'una-password'"
psql -d standmanager -f backend/schema.sql   # gli avvisi sul ruolo proprietario si possono ignorare
```

**2. Backend**

```bash
cd backend
cp .env.example .env          # compila database, JWT_SECRET, master panel e certificati
npm install
npm run db:baseline           # solo la prima volta: schema.sql contiene già tutte le migrazioni
npm run migrate               # da ora in poi applica solo le migrazioni nuove
npm run dev                   # https://<tenant>.standmanager.local:3000
```

**3. Frontend**

```bash
cd frontend
npm install
npm run dev                   # https://<tenant>.standmanager.local:5173
```

Ogni tenant si apre dal suo sottodominio (es. `default.standmanager.local`): i nomi vanno risolti verso `127.0.0.1`, su Windows con gli script in `backend/scripts/`. I tenant si creano dal master panel, su `/master`.

## Test

```bash
cd backend
npm test                      # unitari, senza database
npm run test:integration      # integrazione su PostgreSQL locale (configura backend/.env.test)
cd ../frontend && npm run lint && npm test
```

La CI (`.github/workflows/ci.yml`) esegue lint, test, build e `npm audit` a ogni push e pull request, con un PostgreSQL vero per i test di integrazione.

## Produzione

- `npm run build` nel frontend; il backend con `NODE_ENV=production` serve API, WebSocket e frontend compilato sulla stessa porta HTTPS.
- `APP_DOMAIN` è il dominio dell'app: servono un DNS e un certificato wildcard per `*.APP_DOMAIN`, indicato con `HTTPS_KEY_PATH` e `HTTPS_CERT_PATH`.
- L'app si connette al database con l'utente applicativo (soggetto a RLS). Le migrazioni (`npm run migrate`) usano `MIGRATION_DATABASE_URL`.
- Avvio con un gestore di processi (systemd o PM2). Un eventuale reverse proxy deve inoltrare anche l'upgrade WebSocket.
- `GET /api/health` (processo) e `/api/health/ready` (database) per il monitoraggio; `backend/scripts/backup.sh` per i backup.
- Lista di controllo prima di andare online, rilascio, backup e log: [`docs/deployment.md`](docs/deployment.md).
