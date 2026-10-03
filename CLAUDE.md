# CLAUDE.md — Stand Manager

Guida operativa per lavorare su questo repository. Leggila tutta prima di toccare il codice.
Le regole marcate **MUST** non si negoziano; il resto è la prassi del progetto.

## 1. Cos'è il progetto

SaaS multi-tenant per la gestione di sagre ed eventi: cassa (POS), ordini, stampa comande su stampanti termiche, Kitchen Display System, magazzino, statistiche, menu pubblico con QR.
Ex "SagraManager V2". Installazione e avvio sono descritti nel `README.md`.

Lingua: **UI, messaggi di errore, log e commenti in italiano.** Nomi di variabili, funzioni, tabelle e colonne in inglese.

## 2. Stack e struttura

```
backend/            Node.js (ESM) + Express 5 + pg + ws (WSS) + pino + zod
  server.js         avvio: certificati HTTPS, server, WebSocket
  app.js            createApp(): helmet, CORS, rate limit, route (usata da server.js e dai test)
  ws.js             createWebSocketHub(): WebSocket isolato per tenant, broadcast(tenantId, msg), attach(server)
  db.js             Pool PostgreSQL condiviso
  middleware/       authenticate, tenantScope, resolveTenantFromHost, validate, rateLimiter, authenticateMaster
  routes/           una route per dominio (orders, products, sessions, printSettings, master, …)
  schemas/          schemi zod per body e parametri (common.js: messaggi in italiano, idParamsSchema)
  utils/            pricing (fonte di verità server), stock, displayCode, httpError, eposXmlPrinter, receiptTemplates, auditLogger
  tests/            test unitari node:test (*.test.js) sulla logica pura
  tests/integration/  test di integrazione: app in memoria + PostgreSQL locale con RLS
  migrations/       NNN_descrizione.sql + run.js (tabella _migrations)
frontend/           React 19 + Vite 7 + Tailwind v4 + react-router-dom 7 + PWA (vite-plugin-pwa) + Dexie
  src/App.jsx       shell autenticata, routing, WebSocket, carrello, sessioni
  src/pages/        pagine pubbliche/di livello alto (Login, Menu, KDS, Master)
  src/components/   per dominio: cart/, kitchen/, products/, setup/, shared/, layout/
  src/context/      AuthProvider + useAuth (login, refresh), ToastProvider + useToast
  src/config/api.js API_URL / WS_URL derivati dal sottodominio corrente
  src/offline/      db Dexie, coda ordini offline, hook useOfflineSync, catalogo offline, ultimi valori noti
  src/utils/apiClient.js  client unico per le API: apiFetch, fetchWithAuth, ApiError, NetworkError
  src/utils/pricing.js  specchio 1:1 di backend/utils/pricing.js
branding/           loghi di altri marchi, tenuti fuori dal build del frontend
```

Ogni parte ha il suo `package.json` (`backend/`, `frontend/`): nella radice non ci sono dipendenze.

Comandi:

| Dove | Comando | Cosa fa |
|---|---|---|
| backend | `npm run dev` | nodemon su server.js (HTTPS, porta 3000) |
| backend | `npm run migrate` | applica le migrazioni mancanti |
| backend | `npm run db:baseline` | solo su un database appena creato da `schema.sql`: registra le migrazioni come già applicate |
| backend | `npm test` | test unitari (`node --test`) |
| backend | `npm run test:integration` | test di integrazione (serve `backend/.env.test`, vedi `.env.test.example`) |
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
- **Ogni input si valida con zod** (schemi in `backend/schemas/`) tramite il middleware `validate({ body, params })`, messo prima di `tenantScope`. In caso di errore risponde 400 con `campo: motivo` in italiano; altrimenti `req.body` contiene solo i campi dello schema, già convertiti, e `req.params` i valori convertiti. Niente validazioni scritte a mano negli handler.
- Le operazioni con più scritture (ordine + stock, storno + ripristino stock) vanno in transazione con `inTransaction(req.db, async (db) => { … })` da `db.js`. Per uscire con un errore di business (404, 409) lancia `new HttpError(status, messaggio, CODICE)` e nel `catch` della route usa `sendHttpError(res, err)`.
- Ordini e sessioni: ogni ordine appartiene a una sessione (`orders.session_id`) e senza sessione aperta non si creano ordini (`409 NO_ACTIVE_SESSION`). Esiste al massimo una sessione aperta per tenant. Il `display_code` viene da `sessions.order_counter`, incrementato nella transazione dell'ordine; report e cassa filtrano per `session_id`, mai per orario.
- Stock: conta solo con `stock_enabled = true` e `stock` valorizzato, altrimenti la disponibilità è illimitata. Si modifica solo con `utils/stock.js`, che somma le righe dello stesso prodotto e blocca i prodotti con `FOR UPDATE`. L'apertura di una sessione riporta tutti i prodotti a disponibilità illimitata.
- Le azioni sensibili (creazione ordine, storno, ristampa, modifiche admin) si registrano con `logAudit(req.db, req.user.id, 'AZIONE', dettagli)`: usa la connessione del tenant, quindi i log sono isolati dalla RLS. Chiamala fuori da transazioni aperte.
- Sessione: il token JWT dura 8 ore. `/auth/refresh` lo rinnova solo se è scaduto da meno di 24 ore e se il login (`loginAt` nel token) risale a meno di 7 giorni; oltre serve un nuovo login (`SESSION_EXPIRED`). Il refresh verifica anche tenant attivo e licenza.
- Impostazioni per tenant (`settings`): le chiavi ammesse sono in `schemas/settingsSchema.js`. Solo quelle in `PUBLIC_SETTINGS_KEYS` escono dall'endpoint pubblico `GET /settings`.
- Ruoli esistenti (`ROLES` in `authenticate.js`): `admin`, `responsabile`, `cassa`, `cucina`. Gruppi con permessi specifici: `DISCOUNT_ROLES` (sconti e omaggi), `STOCK_ROLES` (stock dalla cassa). Le autorizzazioni si controllano lato server, non solo nascondendo la UI.
- Mai segreti nel codice o nei commit. Nuove variabili d'ambiente vanno aggiunte a `.env.example` con un valore fittizio.
- Il rate limiting è in `middleware/rateLimiter.js`. Le API e gli ordini contano per utente se c'è una sessione valida, altrimenti per IP: le casse dietro lo stesso IP non si dividono il limite. Gli endpoint nuovi e "costosi" (export, stampa) meritano un limiter dedicato.
- Origini ammesse (`utils/origins.js`): `APP_DOMAIN` e i suoi sottodomini; localhost e IP LAN solo fuori dalla produzione. Un'origine non ammessa riceve 403 prima di qualsiasi elaborazione.

## 5. Convenzioni backend

- ESM (`import`/`export`), `async/await`, nessuna callback.
- Una route per dominio. Le route che devono notificare via WebSocket sono factory: `export default function (broadcast) { … }`.
- Struttura di un handler:
  ```js
  router.post('/', authenticate, validate({ body: schema }), tenantScope, async (req, res) => {
    const { … } = req.body; // già validato
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
- Eventi WebSocket: `{ type: 'snake_case_evento', … }` (es. `order_updated`, `product_stock_updated`), inviati con `broadcast(req.user.tenantId, msg)`. Il tenant è obbligatorio: senza, l'evento viene scartato. Un nuovo evento va gestito anche in `App.jsx` e/o nel KDS.
- Il KDS pubblico (`?kds=public`) riceve solo gli eventi elencati in `PUBLIC_EVENTS` di `ws.js`, ridotti con `toPublicOrder()`. Un evento nuovo per il KDS pubblico va aggiunto lì, senza prezzi, totali o dati utente.

## 6. Database e migrazioni

- Ogni modifica di schema è una nuova migrazione `backend/migrations/NNN_descrizione.sql`, numerata dopo l'ultima esistente (oggi 017; il numero 012 è saltato, non riusarlo).
- **Non modificare mai una migrazione già applicata.** Per correggerla, scrivine una nuova.
- Le migrazioni devono essere idempotenti dove possibile (`IF NOT EXISTS`, `DROP POLICY IF EXISTS`). `run.js` le esegue in transazione.
- `MIGRATION_DATABASE_URL` serve a eseguire le DDL con un utente privilegiato. L'app gira con l'utente applicativo, soggetto a RLS.
- `backend/schema.sql` è il dump di riferimento dello schema e contiene tutte le migrazioni. Rigeneralo (`pg_dump --schema-only`) dopo nuove migrazioni. Un database nuovo si crea da `schema.sql` più `npm run db:baseline`.

## 7. Convenzioni frontend

- Componenti funzionali con hook. Un componente per file, file `.jsx` in PascalCase; hook `useXxx`; utility in camelCase `.js`. Un file `.jsx` esporta solo componenti: contesti, hook e costanti condivise vanno in un `.js` a parte (es. `useAuth.js` accanto ad `AuthProvider.jsx`), come chiede la regola di fast refresh.
- `config/api.js`: in sviluppo le API sono sulla porta 3000 dello stesso host; in produzione sulla stessa origine del frontend.
- Le chiamate API passano **solo** da `src/utils/apiClient.js`, mai da `fetch` diretta:
  - `fetchWithAuth(path, { method, body })` per tutto ciò che richiede login: su 401 rinnova la sessione una volta (un solo rinnovo anche per più chiamate insieme) e ripete la richiesta; licenza scaduta o tenant disattivato riportano al login;
  - `apiFetch` dove un 401 non significa sessione scaduta: login, pagine pubbliche (menu, KDS), master panel;
  - `body` oggetto viene inviato come JSON; `raw: true` restituisce la Response (file, audio);
  - gli errori arrivano come `ApiError` (`message` in italiano dal server, `status`, `code`) o `NetworkError` (server non raggiungibile). Mostra `err.message` con un toast.
- Lato server un 401 significa solo "sessione assente o scaduta": per credenziali o dati errati usa 400 o 403, altrimenti il frontend tenterebbe un rinnovo inutile.
- Stile solo con Tailwind v4. Rispetta il tema chiaro/scuro esistente e il doppio layout desktop/mobile (`useBreakpoint`, cartelle `desktop/` e `mobile/`).
- Messaggi all'utente tramite `ToastContext`, non con `alert()`.
- `App.jsx` è già molto grande: le nuove funzionalità vanno in componenti, hook o pagine dedicate, non qui.
- Icone PWA in `frontend/public/` (`pwa-192.png`, `pwa-512.png`, `apple-touch-icon.png`), ricavate dal simbolo di `logo_StandManager_ESC_POS.png` con il simbolo al 56% del lato, così la 512 vale anche come maskable. Se cambi le icone, aggiorna il manifest in `vite.config.js`.

## 8. Offline-first (fase 2, in corso)

- La coda locale è in Dexie (`src/offline/`). Per cambiare lo schema serve una nuova `db.version(n)` con eventuale `upgrade`; non modificare la versione esistente.
- Ogni ordine ha una chiave di idempotenza generata dalla cassa (`client_order_id`, UUID) con vincolo di unicità per tenant: un nuovo invio dello stesso ordine restituisce quello esistente con `duplicate: true`.
- Un ordine battuto offline va in coda con `session_id` e `client_created_at`. Alla sincronizzazione il server lo assegna a quella sessione, anche se chiusa da meno di 24 ore (oltre: `409 SESSION_CLOSED`), e riporta l'ora dentro la sessione. Non lo rifiuta per stock, perché è già stato venduto. Se la sessione è chiusa: stato `completed`, niente stock, niente comanda o KDS, `expected_cash` ricalcolato.
- La coda (`syncQueue.js`) toglie gli ordini accettati, si ferma su rete assente, 5xx e 429, rinnova la sessione sul 401 e marca `failed`, con il motivo, quelli rifiutati per sempre (altri 4xx).
- Il server resta la fonte di verità per prezzi, stock e `display_code` anche per gli ordini sincronizzati in ritardo.
- Il service worker non mette in cache le risposte API: potrebbero essere di un altro utente o tenant. Offline il catalogo viene da Dexie (`productsCache.js`), l'ultimo utente e l'ultima sessione da `lastKnown.js`, usati solo quando il server non è raggiungibile. IndexedDB e localStorage sono separati per sottodominio, quindi per tenant.

## 9. Stampa

- Il percorso funzionante è ePOS-Print XML via HTTPS verso Epson TM-T20IV (`utils/eposXmlPrinter.js` + `utils/receiptTemplates.js`). Le librerie `escpos*` sono state rimosse: non reintrodurle.
- Le copie destinate alla stessa stampante si raggruppano in un'unica richiesta con `printOrderBatch()`.
- La stampa non deve mai bloccare la risposta dell'ordine: si avvia dopo la risposta, dentro `withTenantClient`, e gli errori si loggano senza propagarli.
- `backend/debug_epos.js` è uno script di diagnostica, non codice applicativo.

## 10. Come lavorare (workflow per Claude)

1. **Prima di scrivere codice**, per feature non banali: leggi i file coinvolti e proponi un piano breve (migrazioni, endpoint, componenti, eventi WS). Aspetta conferma se tocca DB, auth o RLS.
2. Modifiche piccole e focalizzate. Niente refactoring non richiesti mescolati alla feature: segnalali a parte.
3. Riusa i pattern esistenti (vedi `routes/products.js` e il POST in `routes/orders.js` come riferimento).
4. Dopo ogni modifica: `npm run lint` nel frontend e verifica che il backend parta. Se tocchi una migrazione, eseguila su un DB locale.
5. Test: unitari in `backend/tests/` (`npm test`), di integrazione in `backend/tests/integration/` (`npm run test:integration`). Quelli di integrazione avviano l'app in memoria su un database locale vero (con RLS), creano tenant di prova con nomi casuali e li cancellano alla fine. Quando aggiungi logica critica (prezzi, stock, RLS) aggiungi test mirati: la logica pura va in funzioni separate con test unitari, i flussi tra API e database nei test di integrazione.
6. Commit in italiano, all'imperativo, con un ambito: `feat(orders): …`, `fix(rls): …`, `chore: …`.
7. Se una richiesta contraddice queste regole (soprattutto §3 e §4), fermati e chiedi.
8. A fine feature, aggiorna questo file se è nata una convenzione nuova.

## 11. Insidie note (da sistemare, non replicare)

Elenco verificato sul codice, ordinato per gravità. Quando ne risolvi una, toglila da qui nello stesso commit.

**Stampa (prossimo passo: stampa locale dal dispositivo e driver per più protocolli)**
- La comanda parte dal server in cloud: se cade la connessione internet della sagra, non si stampa.
- `orders.js`: `logoPath` punta a `assets/logo_5calzoni.png`, che non esiste ed è un logo specifico di un cliente. Il logo dovrebbe venire dalle impostazioni del tenant.
- `routes/printers.js` (PowerShell, solo Windows) è legacy.

**Codice legacy**
- `theme` nel JWT e in `/auth/me` vale sempre `'dark'`: `users` non ha una colonna `theme` e il tema è solo stato del client.

**Frontend e offline**
- Gli ordini offline rifiutati per sempre (`failed`) sono visibili solo come contatore in testata: manca una schermata per vederli e archiviarli. Gli ordini rimasti in coda da prima dell'aggiornamento non hanno `client_order_id` né `session_id`, quindi vanno nella sessione aperta al momento della sincronizzazione.

**Evoluzione (priorità 2)**
- `orders.items` è un array JSONB dentro l'ordine. Per la ristorazione avanzata (tavoli, stato per singola riga nel KDS, conti divisi) servirà una tabella `order_items`.
