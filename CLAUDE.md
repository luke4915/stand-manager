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
  utils/            pricing (fonte di verità server), stock, displayCode, httpError, auditLogger, modules/tenantModules (moduli per tenant), tenantUsers, sessionToken
  tests/            test unitari node:test (*.test.js) sulla logica pura
  tests/integration/  test di integrazione: app in memoria + PostgreSQL locale con RLS
  migrations/       NNN_descrizione.sql + run.js (tabella _migrations)
frontend/           React 19 + Vite 7 + Tailwind v4 + react-router-dom 7 + PWA (vite-plugin-pwa) + Dexie
  src/App.jsx       shell autenticata, routing, WebSocket, carrello, sessioni
  src/pages/        pagine pubbliche/di livello alto (Login, Menu, KDS, Master)
  src/components/   per dominio: cart/, kitchen/, products/, setup/, shared/, layout/
  src/smarteats/    app dei ristoranti (SmartEatsApp, SalaPage, views.js): shell e dashboard proprie, scelte da AppRouter.jsx dal tipo del locale;
                    sala/ = pannello unico a destra come la cassa (SidePanel: apri tavolo, CheckView, PayView, AdjustView, DraftOrder; niente modali; anteprime in checkMath.js, lo stesso calcolo del server); floor/ = pianta della sala
  src/context/      AuthProvider + useAuth (login, refresh), ToastProvider + useToast
  src/config/api.js API_URL / WS_URL derivati dal sottodominio corrente
  src/offline/      db Dexie, coda ordini offline, hook useOfflineSync, catalogo offline, ultimi valori noti, dispositivo e numerazione (device.js)
  src/print/        stampa dal dispositivo: builder ePOS, template, driver, coda, configurazione locale
  src/utils/apiClient.js  client unico per le API: apiFetch, fetchWithAuth, ApiError, NetworkError
  src/utils/pricing.js  specchio 1:1 di backend/utils/pricing.js
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
| backend | `scripts/backup.sh` | dump del database con rotazione (vedi `docs/deployment.md`) |
| frontend | `npm run lint` | ESLint — deve passare prima di ogni commit |
| frontend | `npm test` | test (`node --test`) del motore di stampa in `src/print/`, anche contro la stampante simulata |
| frontend | `npm run mock:epos` | stampante Epson simulata su https://localhost:9443: disegna le copie nel terminale e può rifiutare i lavori (`-- --fail EPTR_COVER_OPEN`) |
| frontend | `npm run build` | build di produzione |

Lo sviluppo locale usa certificati mkcert per `*.standmanager.local` e un sottodominio per tenant (es. `default.standmanager.local`). Gli script in `backend/scripts/*.ps1` configurano host e wildcard su Windows.

## 3. Multi-tenancy e RLS — regole **MUST**

L'isolamento tra tenant si basa sulla Row-Level Security di PostgreSQL con la variabile di sessione `app.tenant_id`. Un errore qui significa dati di un cliente visibili a un altro.

1. **Route autenticate:** la catena è sempre `authenticate → (authorizeAdmin | authorizeDiscount)? → tenantScope`, e le query usano **solo `req.db.query(...)`**.
2. **Mai `pool.query` su tabelle tenant-scoped.** `pool.query` è ammesso solo su tabelle globali (`tenants`, `_migrations`) e nei punti già previsti (login, master panel). Il master panel usa **`masterPool`** (ruolo `standmanager_master`, migrazione 025): è l'unico che scrive su `tenants` o li elimina; l'utente applicativo di `pool` ha solo SELECT su `tenants` e non cancella da `audit_logs`. Non usare `masterPool` fuori da `routes/master.js`.
3. **Lavoro asincrono dopo la risposta** (job in background): usa `withTenantClient(tenantId, fn)`. `req.db` a quel punto è già stato rilasciato.
4. **Endpoint pubblici** (`/menu`, `/kds`): `resolveTenantFromHost` + `withTenantClient(req.tenantId, …)`. Non esporre mai colonne interne: seleziona le colonne una per una, niente `SELECT *`.
5. **Nuova tabella tenant-scoped:** nella stessa migrazione aggiungi `tenant_id INTEGER NOT NULL REFERENCES tenants(id)`, l'indice, `ENABLE` + `FORCE ROW LEVEL SECURITY` e la policy `tenant_isolation`. La policy deve usare `NULLIF(current_setting('app.tenant_id', true), '')::int` (vedi migrazione 009: senza `NULLIF` una connessione riciclata con `''` manda in errore il cast).
6. **Non affidarti al client per `tenant_id`:** arriva dal JWT (`req.user.tenantId`) o dal sottodominio, mai dal body.
7. **Login e master panel** hanno percorsi dedicati. Il login risolve il tenant dal sottodominio (`resolveTenantFromHost`) e cerca l'utente **solo in quel tenant** con `withTenantClient`: l'username è unico per tenant (`uniq_users_tenant_username`) e `users` non ha deroghe alla RLS. Il master usa `authenticateMaster`. Non riusare questi percorsi altrove.

## 4. Sicurezza e logica di business

- **Il server ricalcola sempre i prezzi.** Dal client sono affidabili solo `id` e `quantity` di ogni riga. Usa `computeLineTotal` e `sanitizeAdjustment` in `utils/pricing.js`: il totale di riga è in centesimi interi, lo sconto in euro è sull'intera riga, e l'ordine salva `line_total` (riferimento) accanto a `price` (unitario, solo per mostrare). Sconti e omaggi solo per `DISCOUNT_ROLES`.
- Se cambi la logica di prezzo, aggiorna **entrambi** i file `pricing.js` (backend e frontend) nello stesso commit: `tests/pricing.test.js` verifica che diano gli stessi importi.
- **Ogni input si valida con zod** (schemi in `backend/schemas/`) tramite il middleware `validate({ body, params })`, messo prima di `tenantScope`. In caso di errore risponde 400 con `campo: motivo` in italiano; altrimenti `req.body` contiene solo i campi dello schema, già convertiti, e `req.params` i valori convertiti. Niente validazioni scritte a mano negli handler.
- Le operazioni con più scritture (ordine + stock, storno + ripristino stock) vanno in transazione con `inTransaction(req.db, async (db) => { … })` da `db.js`. Per uscire con un errore di business (404, 409) lancia `new HttpError(status, messaggio, CODICE)` e nel `catch` della route usa `sendHttpError(res, err)`.
- Ordini e sessioni: ogni ordine appartiene a una sessione (`orders.session_id`) e senza sessione aperta non si creano ordini (`409 NO_ACTIVE_SESSION`). Esiste al massimo una sessione aperta per tenant. Il `display_code` è lettera del dispositivo + numero (A1, A2, … B1) e lo compone il client: il server lo ricostruisce da `device_id` e `device_seq` (mai dal testo del client) e l'indice unico `uniq_orders_device_seq` impedisce i duplicati. Solo gli ordini senza dispositivo (accodati prima della 018) usano ancora `sessions.order_counter`. Report e cassa filtrano per `session_id`, mai per orario.
- Dispositivi (`devices`, `routes/devices.js`): ogni cassa si abbina una volta e riceve una lettera (max 26 per tenant, assegnata sotto lock di transazione). Un dispositivo con ordini non si elimina. Una nuova tabella tenant-scoped va aggiunta anche a `TENANT_SCOPED_TABLES` in `routes/master.js` (eliminazione tenant), nell'ordine delle chiavi esterne.
- Elenco e statistiche: `GET /orders` non restituisce mai lo storico intero (o `session=active`, o pagine con `limit`/`before`). Le statistiche le aggrega il database (`routes/stats.js`, composizione in `utils/stats.js`): non portare gli ordini nel browser per sommarli. I prodotti si raggruppano per id, non per nome.
- Chiusura serata: se ci sono ordini in attesa o in preparazione `POST /sessions/end` richiede `openOrders` (`complete` li completa, `leave` li lascia fuori dai conti).
- Stock: conta solo con `stock_enabled = true` e `stock` valorizzato, altrimenti la disponibilità è illimitata. Si modifica solo con `utils/stock.js`, che somma le righe dello stesso prodotto e blocca i prodotti con `FOR UPDATE`. L'apertura di una sessione riporta tutti i prodotti a disponibilità illimitata.
- Le azioni sensibili (creazione ordine, storno, ristampa, modifiche admin) si registrano con `logAudit(req.db, req.user.id, 'AZIONE', dettagli)`: usa la connessione del tenant, quindi i log sono isolati dalla RLS. Chiamala fuori da transazioni aperte.
- Token: HS256 fissato (`utils/jwtConfig.js`), cookie `SameSite=Lax`. `authenticate` controlla a ogni richiesta (cache 15 s, `utils/userStatus.js`) che l'utente esista ancora e usa il suo ruolo attuale, non quello del token: 401 `USER_REVOKED` altrimenti. All'avvio `JWT_SECRET` e `MASTER_JWT_SECRET` devono esserci, essere diversi e lunghi almeno 32 caratteri (in produzione l'app non parte se deboli).
- Sessione: il token JWT dura 8 ore. `/auth/refresh` lo rinnova solo se è scaduto da meno di 24 ore e se il login (`loginAt` nel token) risale a meno di 7 giorni; oltre serve un nuovo login (`SESSION_EXPIRED`). Il refresh verifica anche tenant attivo e licenza.
- Impostazioni per tenant (`settings`): le chiavi ammesse sono in `schemas/settingsSchema.js`. Solo quelle in `PUBLIC_SETTINGS_KEYS` escono dall'endpoint pubblico `GET /settings`. L'admin del tenant scrive solo quelle in `TENANT_WRITABLE_SETTINGS_KEYS`; le `receipt_*` (scontrini) le scrive solo il master.
- Sala e tavoli (modulo `tables`, migrazione 031, `routes/rooms.js`): `rooms` e `dining_tables` (non `tables`, per non confondersi con PostgreSQL), tenant-scoped con RLS e nomi unici senza distinguere le maiuscole. Si leggono con i ruoli di cassa, si modificano solo da admin, con audit. Una sala con tavoli e un tavolo con conti non si eliminano (409); si disattivano. Pianta (034): `rooms.grid_w/grid_h` e `dining_tables.x/y/w/h/shape` in celle; si salva intera con `PUT /rooms/:id/layout` (solo admin) e le regole geometriche (dentro la sala, niente sovrapposizioni) le applica il server in `utils/roomLayout.js`; muri e separatori (`room_elements`, 039, tenant-scoped con RLS, `ON DELETE CASCADE` sulla sala) viaggiano nello stesso `PUT /rooms/:id/layout` (campo `elements` facoltativo: se c'è sostituisce tutti quelli della sala) e `GET /rooms` li restituisce in `elements`; il server vieta che escano dalla sala o coprano un tavolo; l'editor è `smarteats/floor/FloorEditor.jsx`, la geometria lato client in `floor/geometry.js`. Disegno e passi in `docs/design-tavoli.md`.
- Conti dei tavoli (modulo `tables`, migrazione 032, `routes/checks.js`, `utils/checks.js`): un conto raccoglie le comande (ordini con `check_id`) di un tavolo; un ordine senza `check_id` è pagato subito, come per le sagre. Un solo conto aperto per tavolo (indice unico parziale → 409 `TABLE_BUSY`), numero progressivo per sessione sotto lock, apertura solo con una sessione aperta. **Il totale lo calcola sempre il server** (comande non annullate); il client non manda importi. Eventi `check_updated` solo al personale (il KDS pubblico non li riceve). Pagamenti (`utils/payments.js`, tabelle `payments` 035 e `payment_items` 036): `POST /checks/:id/payments` a importo o per voce; **tutti gli importi in centesimi interi sul server** (le quote per voce sommano esattamente il totale di riga), il conto si chiude da solo a residuo zero. Ogni operazione sul conto (pagamento, nuova comanda, storno, abbuono, annullo) blocca prima la riga del conto (`lockCheck`) e poi le comande, mai al contrario. `POST /checks/:id/move` sposta il conto su un tavolo libero e `POST /checks/:id/merge` lo unisce a un altro (lock dei due conti in ordine di id; il conto assorbito resta `void` con `merged_into`). Coperto (`utils/cover.js`, impostazione `cover_charge`, migrazione 038): una comanda automatica `order_type = 'cover'` con la riga «Coperto × coperti», aggiornata da `syncCoverOrder` (apertura, `POST /checks/:id/covers`, unione); non è una comanda per cucina e statistiche (`isKitchenOrder` in `utils/revenue.js`), non si storna a mano (409 `COVER_ORDER`) e non cambia se già pagata (409 `COVER_PAID`). `POST /checks/:id/adjust` fa omaggio/sconto sulle voci non pagate (`DISCOUNT_ROLES`); `POST /checks/:id/void` con `cancel_orders` (solo admin) elimina il conto e le comande, ma non se ci sono pagamenti. Un conto aperto blocca `POST /sessions/end` (409 `OPEN_CHECKS`). Una comanda è un ordine con `check_id` (`POST /orders`, solo con il modulo `tables`, sempre online: niente `device_id` né sessione in ritardo; il codice viene dal contatore di sessione); il conto deve essere aperto e della sessione in corso (409 `CHECK_CLOSED`) e non si storna una comanda di un conto chiuso. Tavolo e coperti di una comanda li aggiunge `utils/orderCheck.js` (`withCheckInfo`) e arrivano a cucina, KDS pubblico (senza importi) e stampa (`tableLabel` in `print/templates.js`).
- Portate (modulo `tables`, migrazione 040, `routes/courses.js`, `utils/courseOrders.js`, `utils/orderLines.js`): `courses` (nome unico senza distinguere le maiuscole, `position` = ordine di uscita; lette dai ruoli di cassa, modificate solo da admin con audit) e `products.course_id` (la portata va controllata nel locale: la chiave esterna non passa dalla RLS). Il giro di un tavolo è `POST /checks/:id/courses` con `groups` `[{ course_id, seq, items }]`: **una comanda per portata**, tutte create nella stessa transazione (stock controllato una volta sul totale), con `course_seq` (stesso numero = escono insieme, accodato a quello già sul conto) e `course_name` (copia del nome). Il primo gruppo esce subito (`pending`, `fired_at`) se `fire_first`; le altre nascono `scheduled` («da mandare»): contano nel totale del conto e scalano lo stock, ma non compaiono in cucina né al KDS e non si completano a mano (409 `ORDER_SCHEDULED`); si possono stornare. `POST /checks/:id/fire` manda la prossima portata (o quella con `seq`) e `PUT /checks/:id/sequence` riordina quelle ancora da mandare. Mandare = `order_created` a cucina e KDS; la stampa resta del client, che stampa le comande della risposta. `closeAsPaid` rifiuta con 409 `COURSES_PENDING` se restano portate da mandare (un pagamento che salderebbe il conto viene annullato). Righe verificate sempre con `verifyOrderItems` (anche `POST /orders`).
- Incasso: cosa conta come incasso è definito **solo** in `utils/revenue.js` (`isRevenue()`); statistiche, incasso atteso e CSV lo usano, e `tests/revenue.test.js` vieta di riscrivere `status = 'completed'` in altre query. Un ordine senza conto conta se `completed`; uno con conto conta se non annullato e il conto è `paid`. I contanti attesi (`expectedCashSql`) sono gli ordini pagati subito più i pagamenti `cash` dei conti, anche parziali (`docs/design-tavoli.md`).
- Righe d'ordine: stanno **solo** in `order_items` (migrazioni 027-030; `orders.items` non esiste più). Sono parte dell'ordine: `writeOrderItems` (`utils/orderItemsWrite.js`) le scrive nella transazione di creazione, e se fallisce l'ordine non nasce. `utils/orderItems.js` mappa una riga verificata dal server in una riga di tabella; `utils/orderItemsRead.js` (`withItems`, `loadItems`) le rilegge nella forma che l'API ha sempre avuto (`id`, `name`, `quantity`, `price`, `line_total`, `type`, `discountMode`…). Le statistiche usano `utils/statsSql.js`. `product_id` è `bigint` e i prezzi `numeric`: `pg` li restituisce come stringhe, vanno convertiti (`Number`). Nessuna chiave esterna su `product_id`: un prodotto eliminato non deve toccare lo storico. Lo stato per riga e la portata arrivano con i tavoli (Fase 3 di `docs/requirements.md`).
- Moduli per tenant (`utils/modules.js`, `utils/tenantModules.js`, migrazione 026): ogni tenant ha `business_type` (sagra, paninaro, ristorante) e `modules` (oggi `kds`, `stats`, `qr_menu`, `tables`). **Il tipo è fisso dopo la creazione e i tipi non si mescolano**: ogni modulo dichiara in `utils/modules.js` per quali tipi esiste (`firstModuleNotAllowed`; i tavoli solo al ristorante, il menu QR a sagra e paninaro) e il master (creazione e `PUT /master/tenants/:id/modules`, che accetta solo `modules`) riceve 400 se ne accende uno non ammesso. Il tipo propone anche i moduli di partenza. Il nucleo (login, utenti, prodotti, ordini, sessioni, stampa, impostazioni) non è un modulo e c'è sempre. Una funzione opzionale si protegge **sul server** con `requireModule('id')` (dopo `authenticate` o `resolveTenantFromHost`; risponde 403 `MODULE_DISABLED`) e nel client con `canView` (`viewRoles.js`); il KDS pubblico via WebSocket è rifiutato se il modulo è spento. Login e `/auth/me` restituiscono `modules` e `businessType`. Solo il master li cambia (`PUT /master/tenants/:id/modules`, catalogo in `GET /master/catalog`). Un modulo nuovo si aggiunge in `utils/modules.js` e non richiede una migrazione. Il piano di sviluppo di SmartEats e della piattaforma sta in `docs/requirements.md`. Le parole che cambiano col tipo di locale (serata/servizio) sono in `frontend/src/utils/terms.js`.
- Utenti di un tenant (`utils/tenantUsers.js`, condiviso da `routes/auth.js` e `routes/master.js`): elenco, cambio ruolo/username, eliminazione e reset password. Non si elimina né si declassa l'ultimo admin (409 `LAST_ADMIN`) e un admin non elimina né declassa se stesso. Il master li gestisce con `withTenantClient(id, fn, masterPool)`: la policy `master_read` (025) lascia leggere gli utenti di tutti i tenant, quindi **ogni query su `users` filtra anche per `tenant_id` corrente** (`IN_TENANT`), mai solo per `id`. Le azioni del master si registrano nell'audit del tenant con `user_id` nullo (`MASTER_*`).
- Ruoli esistenti (`ROLES` in `authenticate.js`): `admin`, `responsabile`, `cassa`, `cucina`. Gruppi: `CASH_ROLES` (admin, responsabile, cassa: creano, stornano e ristampano ordini, gestiscono lo stock), `DISCOUNT_ROLES` (sconti e omaggi). La cucina vede gli ordini e ne fa avanzare lo stato, nient'altro. Le autorizzazioni si controllano lato server (`authorizeCash`, `authorizeAdmin`, …), non solo nascondendo la UI.
- Profilo (`routes/profile.js`): il cambio username riemette il token (`utils/sessionToken.js`) e si registra nell'audit. Un reset password vale subito anche per chi è già collegato: `authenticate` prende `must_change_password` dal database (`userStatus`), mai dal token, e mette `loginAt` in `req.user` e risponde 403 `PASSWORD_CHANGE_REQUIRED`; il client passa alla schermata di cambio password. Chi cambia o reimposta una password invalida la cache di `userStatus`.
- Password: nessun utente esiste senza password. Master e admin ne impostano una **temporanea** alla creazione (`must_change_password`): finché non è cambiata il server risponde 403 `PASSWORD_CHANGE_REQUIRED` a tutto tranne `/auth/me`, `/auth/change-password` e logout. `POST /auth/admin/users/:id/reset-password` la reimposta. Il login non distingue utente inesistente, senza password o password errata.
- Mai segreti nel codice o nei commit. Nuove variabili d'ambiente vanno aggiunte a `.env.example` con un valore fittizio.
- Password: minimo 8 caratteri, bcrypt costo 12 (`utils/password.js`). Il login è limitato per coppia IP + username.
- Dal client una riga d'ordine vale solo per `id` e `quantity`: nome, categoria, destinazione di stampa e prezzo si leggono dal catalogo. Un ordine in ritardo (`session_id`) richiede `client_order_id`. Lo stesso vale per il QR del menu (`frontend/src/utils/qrCart.js`).
- Operatività: `GET /api/health` e `/api/health/ready`; una riga di log per richiesta (`middleware/requestLogger.js`, mai cookie né body); backup con `backend/scripts/backup.sh`. Rilascio e lista pre-produzione in `docs/deployment.md`.
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

- Ogni modifica di schema è una nuova migrazione `backend/migrations/NNN_descrizione.sql`, numerata dopo l'ultima esistente (oggi 040; il numero 012 è saltato, non riusarlo).
- **Non modificare mai una migrazione già applicata.** Per correggerla, scrivine una nuova.
- Le migrazioni devono essere idempotenti dove possibile (`IF NOT EXISTS`, `DROP POLICY IF EXISTS`). `run.js` le esegue in transazione.
- L'utente applicativo ha solo SELECT/INSERT/UPDATE/DELETE (niente TRUNCATE, TRIGGER, REFERENCES; `audit_logs` non si aggiorna): nelle migrazioni non concedergli altro.
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
- La coda (`syncQueue.js`) toglie gli ordini accettati, si ferma su rete assente, 5xx e 429, rinnova la sessione sul 401 e marca `failed`, con il motivo, quelli rifiutati per sempre (altri 4xx). Il contatore rosso in testata apre `FailedOrdersModal`: `offline/failedOrders.js` permette di riprovare (torna `pending`) o eliminare l'ordine dalla coda.
- Il server resta la fonte di verità per prezzi e stock anche per gli ordini sincronizzati in ritardo. Il `display_code` invece lo dà la cassa (vedi §4), così si numera e si stampa anche senza rete.
- Il dispositivo si abbina al primo accesso online (`POST /devices`) e conserva lettera e contatore per sessione in Dexie (`offline/device.js`). Cancellare i dati del sito lo fa riabbinare con una lettera nuova.
- Il service worker non mette in cache le risposte API: potrebbero essere di un altro utente o tenant. Offline il catalogo viene da Dexie (`productsCache.js`), l'ultimo utente e l'ultima sessione da `lastKnown.js`, usati solo quando il server non è raggiungibile. IndexedDB e localStorage sono separati per sottodominio, quindi per tenant.

## 9. Stampa

La stampa è **del client**: la cassa che batte l'ordine stampa direttamente sulla stampante in LAN, quindi funziona anche senza internet. Il backend non stampa. Dettagli, file e flussi in `docs/stampa.md`.

- Codice in `frontend/src/print/`. I template parlano solo con il builder (`eposBuilder.js`); un'altra marca si aggiunge come driver `{ id, createBuilder(), send(builder, target) }` in `print.js`, senza toccare template e coda.
- Si stampa dopo che il server ha accettato l'ordine (online) o subito, insieme all'ordine in coda (offline). Un ordine sincronizzato in ritardo non si ristampa mai.
- La coda (`printJobs` in Dexie) tiene il lavoro finché la stampante non lo accetta. La configurazione si scarica e si conserva in Dexie per stampare offline.
- La personalizzazione degli scontrini (`receipt_*`) è per tenant e la modifica solo il master (`TenantReceiptEditor.jsx`). Non scrivere testi o loghi nei template. Le immagini sono data URL PNG (max 150 KB) decodificate a mano in `raster.js` perché la CSP non permette `fetch` su `data:`.
- Il simulatore `scripts/mock-epos.js` (https://localhost:9443) serve ai test e alle prove a mano; non sostituisce una stampante vera (certificato e CORS reali).
- `backend/debug_epos.js` è uno script di diagnostica, non codice applicativo.

## 10. Come lavorare (workflow per Claude)

1. **Prima di scrivere codice**, per feature non banali: leggi i file coinvolti e proponi un piano breve (migrazioni, endpoint, componenti, eventi WS). Aspetta conferma se tocca DB, auth o RLS.
2. Modifiche piccole e focalizzate. Niente refactoring non richiesti mescolati alla feature: segnalali a parte.
3. Riusa i pattern esistenti (vedi `routes/products.js` e il POST in `routes/orders.js` come riferimento).
4. Dopo ogni modifica: `npm run lint` nel frontend e verifica che il backend parta. Se tocchi una migrazione, eseguila su un DB locale.
5. Test: unitari in `backend/tests/` (`npm test`), di integrazione in `backend/tests/integration/` (`npm run test:integration`). Quelli di integrazione avviano l'app in memoria su un database locale vero (con RLS), creano tenant di prova con nomi casuali e li cancellano alla fine. Quando aggiungi logica critica (prezzi, stock, RLS) aggiungi test mirati: la logica pura va in funzioni separate con test unitari, i flussi tra API e database nei test di integrazione. Il frontend ha test solo per la logica pura (`frontend/src/**/*.test.js`, moduli senza dipendenze dal browser).
6. Commit in italiano, all'imperativo, con un ambito: `feat(orders): …`, `fix(rls): …`, `chore: …`.
7. Se una richiesta contraddice queste regole (soprattutto §3 e §4), fermati e chiedi.
8. A fine feature, aggiorna questo file se è nata una convenzione nuova.

## 11. Difetti noti e lavoro previsto

I difetti noti stanno in `docs/backlog.md`; il piano per SmartEats e la piattaforma (moduli, tavoli, prenotazioni…) in `docs/requirements.md`, da aggiornare a ogni passo. Quando ne risolvi uno, toglilo da lì nello stesso commit.
