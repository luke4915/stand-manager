# CLAUDE.md — Stand Manager

Guida operativa per lavorare su questo repository. Leggila tutta prima di toccare il codice.
Le regole marcate **MUST** non si negoziano; il resto è la prassi del progetto.

## 1. Cos'è il progetto

SaaS multi-tenant per la gestione di sagre ed eventi: cassa (POS), ordini, stampa comande su stampanti termiche, Kitchen Display System, magazzino, statistiche, menu pubblico con QR.
Ex "SagraManager V2": nei nomi di package, path e documenti trovi ancora `sagra-manager` / `SagraManager`.

Lingua: **UI, messaggi di errore, log e commenti in italiano.** Nomi di variabili, funzioni, tabelle e colonne in inglese.

## 2. Stack e struttura

```
backend/            Node.js (ESM) + Express 5 + pg + ws (WSS) + pino + zod
  server.js         entrypoint: helmet, CORS, rate limit, HTTPS+WSS, mount delle route
  db.js             Pool PostgreSQL condiviso
  middleware/       authenticate, tenantScope, resolveTenantFromHost, rateLimiter, authenticateMaster
  routes/           una route per dominio (orders, products, sessions, printSettings, master, …)
  schemas/          schemi zod per validare i payload
  utils/            pricing (fonte di verità server), eposXmlPrinter, receiptTemplates, auditLogger
  migrations/       NNN_descrizione.sql + run.js (tabella _migrations)
frontend/           React 19 + Vite 7 + Tailwind v4 + react-router-dom 7 + PWA (vite-plugin-pwa) + Dexie
  src/App.jsx       shell autenticata, routing, WebSocket, carrello, sessioni
  src/pages/        pagine pubbliche/di livello alto (Login, Menu, KDS, Master)
  src/components/   per dominio: cart/, kitchen/, products/, setup/, shared/, layout/
  src/context/      AuthContext (login + refresh), ToastContext
  src/config/api.js API_URL / WS_URL derivati dal sottodominio corrente
  src/offline/      db Dexie, coda ordini offline, hook useOfflineSync
  src/utils/pricing.js  specchio 1:1 di backend/utils/pricing.js
```

Comandi:

| Dove | Comando | Cosa fa |
|---|---|---|
| backend | `npm run dev` | nodemon su server.js (HTTPS, porta 3000) |
| backend | `npm run migrate` | applica le migrazioni mancanti |
| frontend | `npm run dev` | Vite su https://*.standmanager.local:5173 |
| frontend | `npm run lint` | ESLint — deve passare prima di ogni commit |
| frontend | `npm run build` | build di produzione |

Lo sviluppo locale usa certificati mkcert per `*.standmanager.local` e un sottodominio per tenant (es. `default.standmanager.local`). Gli script in `backend/scripts/*.ps1` configurano host e wildcard su Windows.

## 3. Multi-tenancy e RLS — regole **MUST**

L'isolamento tra tenant si basa sulla Row-Level Security di PostgreSQL con la variabile di sessione `app.tenant_id`. Un errore qui significa dati di un cliente visibili a un altro.

1. **Route autenticate:** la catena è sempre `authenticate → (authorizeAdmin | authorizeDiscount)? → tenantScope`, e le query usano **solo `req.db.query(...)`**.
2. **Mai `pool.query` su tabelle tenant-scoped.** `pool.query` è ammesso solo su tabelle globali (`tenants`, `_migrations`) e nei punti già previsti (login, master panel).
3. **Lavoro asincrono dopo la risposta** (stampa in background, job): usa `withTenantClient(tenantId, fn)`. `req.db` a quel punto è già stato rilasciato.
4. **Endpoint pubblici** (`/menu`, `/kds`): `resolveTenantFromHost` + `withTenantClient(req.tenantId, …)`. Non esporre mai colonne interne: seleziona le colonne una per una, niente `SELECT *`.
5. **Nuova tabella tenant-scoped:** nella stessa migrazione aggiungi `tenant_id INTEGER NOT NULL REFERENCES tenants(id)`, l'indice, `ENABLE` + `FORCE ROW LEVEL SECURITY` e la policy `tenant_isolation`. La policy deve usare `NULLIF(current_setting('app.tenant_id', true), '')::int` (vedi migrazione 009: senza `NULLIF` una connessione riciclata con `''` manda in errore il cast).
6. **Non affidarti al client per `tenant_id`:** arriva dal JWT (`req.user.tenantId`) o dal sottodominio, mai dal body.
7. **Login e master panel** hanno percorsi dedicati (`lookupUserForLogin`, `authenticateMaster`). Non riusarli altrove.

## 4. Sicurezza e logica di business

- **Il server ricalcola sempre i prezzi.** Dal client sono affidabili solo `id` e `quantity` di ogni riga. Usa `computeEffectivePrice` e `sanitizeAdjustment` in `utils/pricing.js`. Sconti e omaggi solo per `DISCOUNT_ROLES`.
- Se cambi la logica di prezzo, aggiorna **entrambi** i file `pricing.js` (backend e frontend) nello stesso commit.
- **Ogni payload in ingresso si valida con zod** in `backend/schemas/`. Le route più vecchie validano a mano: quando le tocchi, migrale a zod.
- Le operazioni con più scritture (ordine + stock, storno + ripristino stock) vanno in transazione `BEGIN/COMMIT/ROLLBACK` sulla stessa connessione.
- Le azioni sensibili (creazione ordine, storno, ristampa, modifiche admin) si registrano con `logAudit`.
- Ruoli esistenti: `admin`, `responsabile`, `cassa`, `cucina`. Le autorizzazioni si controllano lato server, non solo nascondendo la UI.
- Mai segreti nel codice o nei commit. Nuove variabili d'ambiente vanno aggiunte a `.env.example` con un valore fittizio.
- Il rate limiting è configurato in `middleware/rateLimiter.js`. Gli endpoint nuovi e "costosi" (export, stampa) meritano un limiter dedicato.

## 5. Convenzioni backend

- ESM (`import`/`export`), `async/await`, nessuna callback.
- Una route per dominio. Le route che devono notificare via WebSocket sono factory: `export default function (broadcast) { … }`.
- Struttura di un handler:
  ```js
  router.post('/', authenticate, tenantScope, async (req, res) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: '…' });
    try {
      const { rows } = await req.db.query('…', [ … ]);
      res.status(201).json(rows[0]);
    } catch (err) {
      logger.error({ err }, 'Errore POST /api/…');
      res.status(500).json({ error: 'Errore …' });
    }
  });
  ```
- Errori: `{ error: 'messaggio in italiano' }`, più `code` in MAIUSCOLO quando il frontend deve distinguerli (`TOKEN_EXPIRED`, `LICENSE_EXPIRED`, `TENANT_INACTIVE`). Status coerenti: 400 validazione, 401 non autenticato, 403 non autorizzato, 404, 409 conflitto, 402 licenza.
- Log solo con `logger` (pino), mai `console.log` nel codice applicativo. Passa l'errore come `{ err }`.
- Query sempre parametrizzate (`$1, $2`). Niente concatenazione di input utente in SQL.
- Eventi WebSocket: `{ type: 'snake_case_evento', … }` (es. `order_updated`, `product_stock_updated`). Un nuovo evento va gestito anche in `App.jsx` e/o nel KDS.

## 6. Database e migrazioni

- Ogni modifica di schema è una nuova migrazione `backend/migrations/NNN_descrizione.sql`, numerata dopo l'ultima esistente (oggi 013; il numero 012 è saltato, non riusarlo).
- **Non modificare mai una migrazione già applicata.** Per correggerla, scrivine una nuova.
- Le migrazioni devono essere idempotenti dove possibile (`IF NOT EXISTS`, `DROP POLICY IF EXISTS`). `run.js` le esegue in transazione.
- `MIGRATION_DATABASE_URL` serve a eseguire le DDL con un utente privilegiato. L'app gira con l'utente applicativo, soggetto a RLS.
- `backend/schema.sql` è il dump di riferimento dello schema. Rigeneralo (`pg_dump --schema-only`) dopo nuove migrazioni.

## 7. Convenzioni frontend

- Componenti funzionali con hook. Un componente per file, file `.jsx` in PascalCase; hook `useXxx`; utility in camelCase `.js`.
- Le chiamate API usano `API_URL` da `src/config/api.js`, con `credentials: 'include'` (JWT in cookie). Mai URL scritti a mano.
- Gestisci sempre il 401 (`TOKEN_EXPIRED`) passando per il refresh di `AuthContext`. Obiettivo: centralizzare in un helper `fetchWithAuth` e migrarci gradualmente le `fetch` sparse.
- Stile solo con Tailwind v4. Rispetta il tema chiaro/scuro esistente e il doppio layout desktop/mobile (`useBreakpoint`, cartelle `desktop/` e `mobile/`).
- Messaggi all'utente tramite `ToastContext`, non con `alert()`.
- `App.jsx` è già molto grande: le nuove funzionalità vanno in componenti, hook o pagine dedicate, non qui.
- Il frontend usa le PWA icons `pwa-192.png` e `pwa-512.png` dichiarate in `vite.config.js`: se le cambi, aggiorna il manifest.

## 8. Offline-first (fase 2, in corso)

- La coda locale è in Dexie (`src/offline/`). Per cambiare lo schema serve una nuova `db.version(n)` con eventuale `upgrade`; non modificare la versione esistente.
- Ogni ordine creato offline deve essere **idempotente**: va inviato con una chiave generata dal client (UUID) che il server salva con vincolo di unicità. Così un retry non duplica l'ordine.
- Il server resta la fonte di verità per prezzi, stock e `display_code` anche per gli ordini sincronizzati in ritardo. Il frontend mostra i dati come provvisori finché la sincronizzazione non è confermata.
- La cache delle risposte API del service worker non deve mai servire dati di un utente o tenant diverso: escludi le route di autenticazione e valuta chiavi per tenant.

## 9. Stampa

- Il percorso funzionante è ePOS-Print XML via HTTPS verso Epson TM-T20IV (`utils/eposXmlPrinter.js` + `utils/receiptTemplates.js`). Raw TCP sulla porta 9100 e le librerie `escpos*` sono legacy: non usarle per codice nuovo.
- Le copie destinate alla stessa stampante si raggruppano in un'unica richiesta con `printOrderBatch()`.
- La stampa non deve mai bloccare la risposta dell'ordine: si avvia dopo la risposta, dentro `withTenantClient`, e gli errori si loggano senza propagarli.
- `backend/debug_epos.js` è uno script di diagnostica, non codice applicativo.

## 10. Come lavorare (workflow per Claude)

1. **Prima di scrivere codice**, per feature non banali: leggi i file coinvolti e proponi un piano breve (migrazioni, endpoint, componenti, eventi WS). Aspetta conferma se tocca DB, auth o RLS.
2. Modifiche piccole e focalizzate. Niente refactoring non richiesti mescolati alla feature: segnalali a parte.
3. Riusa i pattern esistenti (vedi `routes/products.js` e il POST in `routes/orders.js` come riferimento).
4. Dopo ogni modifica: `npm run lint` nel frontend e verifica che il backend parta. Se tocchi una migrazione, eseguila su un DB locale.
5. Non esistono ancora test automatici. Quando aggiungi logica critica (prezzi, stock, RLS) proponi test mirati (es. `node:test`) invece di saltarli.
6. Commit in italiano, all'imperativo, con un ambito: `feat(orders): …`, `fix(rls): …`, `chore: …`.
7. Se una richiesta contraddice queste regole (soprattutto §3 e §4), fermati e chiedi.
8. A fine feature, aggiorna questo file se è nata una convenzione nuova.

## 11. Insidie note (da sistemare, non replicare)

Elenco verificato sul codice, ordinato per gravità. Quando ne risolvi una, toglila da qui nello stesso commit.

**Critiche (isolamento tenant e sicurezza)**
- `server.js`: il WebSocket non richiede autenticazione e `broadcast()` invia a **tutti** i client connessi. Ordini, stock e sessioni di un tenant arrivano agli altri tenant e a chiunque si colleghi.
- `db.js`: se `MIGRATION_DATABASE_URL` è nel `.env`, anche l'app usa l'utente privilegiato e può scavalcare la RLS. Le credenziali delle migrazioni devono servire solo a `run.js`.
- Endpoint pubblici che violano §3.4: `/orders/kds` fa `SELECT *` sugli ordini (espone `created_by`, totali, ecc.) e `/settings` restituisce tutte le chiavi delle impostazioni.
- `auth.js` `/refresh`: verifica il token con `ignoreExpiration` senza limite di tempo, quindi un token scaduto da qualsiasi tempo si può rinnovare. Non controlla nemmeno se il tenant è attivo o se la licenza è scaduta.
- `audit_logs` non ha `tenant_id` e `logAudit` usa `pool.query`: i log non sono isolati per tenant. L'eliminazione di un tenant dal master panel non li cancella.

**Correttezza dei dati**
- `orders.js` `getNextDisplayCode`: conta con `COUNT(*)` senza lock, quindi due ordini concorrenti possono ricevere lo stesso `display_code`.
- `orders.js` POST: lo stock è verificato fuori dalla transazione e senza `SELECT … FOR UPDATE`, quindi si può vendere oltre la disponibilità.
- `orders.js` PUT: `status` non è validato e lo storno con ripristino dello stock non è in transazione.
- Gli ordini non hanno `session_id`: l'appartenenza a una sessione si deduce da `created_at`, sia nei report che nella cassa che nei codici.
- `resolveTenantFromHost.js`: la cache memorizza anche i tenant "non trovati" e non scade mai. Un tenant creato dopo un tentativo fallito resta in 404 fino al riavvio, e la cache non segue le disattivazioni.
- `authenticate.js`: `logger.error({ err }, …)` usa `err` non definito nel controllo su `JWT_SECRET`. Inoltre `theme` non finisce in `req.user`, quindi `/auth/me` restituisce sempre `'dark'`.
- `tenantScope.js`: `pool.connect()` è fuori dal `try`.

**Validazione e coerenza API**
- Solo il POST `/orders` usa zod (`schemas/orderSchema.js`). Le altre route validano a mano o non validano: per esempio `PATCH /products/:id/stock` accetta qualsiasi ruolo e qualsiasi valore.
- `auth.js` `/change-password` risponde con `{ message }` invece di `{ error }`.
- `master.js`: l'eliminazione di un tenant non è in transazione.
- `orders.js`: `logoPath` punta a `assets/logo_5calzoni.png`, che non esiste ed è un logo specifico di un cliente. Il logo dovrebbe venire dalle impostazioni del tenant.

**Codice legacy e dipendenze**
- `routes/printers.js` (PowerShell, solo Windows) e `GET /profile/copy-types` (lista fissa) sono legacy. `server.js` importa `escpos` senza usarlo.
- Dipendenze backend inutilizzate: `escpos*`, `node-thermal-printer`, `pdfkit`, `bwip-js`, `body-parser`, `undici`. `sharp` è usato a runtime ma è in `devDependencies`.
- `firebase` è in `frontend/package.json` ma non è usato.
- `dexie` e `vite-plugin-pwa` sono nel `package.json` di root invece che in `frontend/package.json`.
- `console.error` in `server.js` e `db.js` invece di `logger`.
- `.env.example` non elenca `MASTER_PASSWORD_HASH`, `MASTER_JWT_SECRET`, `HTTPS_KEY_PATH`, `HTTPS_CERT_PATH`, `MIGRATION_DATABASE_URL`. `CORS_ORIGIN` è elencata ma il codice non la legge.
- Due dump SQL (`backend/schema.sql` e `stand_manager_db.sql`): tieni come riferimento solo `backend/schema.sql`.

**Deploy e configurazione**
- `server.js`: la CORS accetta solo host locali e `.standmanager.local`. Il dominio di produzione va aggiunto via env.
- `config/api.js`: la porta `:3000` è fissa. In produzione l'API passerà da reverse proxy sullo stesso host.
- `vite.config.js`: le icone `pwa-192.png` e `pwa-512.png` non sono in `frontend/public`, e `allowedHosts` contiene sottodomini di tenant scritti a mano.

**Frontend e offline**
- La cache `NetworkFirst` del service worker copre tutto `/api`, autenticazione compresa e senza chiave per tenant (viola §8).
- `offline/syncQueue.js`: nessuna chiave di idempotenza e nessuna gestione del 401 durante la sincronizzazione.
- 53 `fetch` sparse in 17 file e nessun `fetchWithAuth` centralizzato. La pagina di test `/dexie-test` è ancora raggiungibile da `App.jsx`.

**Evoluzione (priorità 2)**
- `orders.items` è un array JSONB dentro l'ordine. Per la ristorazione avanzata (tavoli, stato per singola riga nel KDS, conti divisi) serviranno una tabella `order_items` e un `session_id` sugli ordini.
