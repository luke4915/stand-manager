# Messa online e operatività

Guida per portare Stand Manager in produzione e tenerlo in vita. Le regole di sviluppo stanno in `CLAUDE.md`.

## Percorso consigliato: Railway

App e database sulla stessa piattaforma, HTTPS e certificato wildcard gestiti da Railway, rilascio automatico a ogni push. Il `Dockerfile` costruisce frontend e backend in un'unica immagine; `railway.json` dice a Railway di usarlo, di preparare il database prima di ogni rilascio (`npm run db:prepare`) e di aspettare `/api/health/ready` prima di passare il traffico alla versione nuova.

La stampa non dipende dall'hosting: è la cassa che parla con la stampante in LAN (vedi `docs/stampa.md`).

**1. Dominio.** Serve un dominio di secondo livello (es. `miodominio.it`): i tenant sono `nome.miodominio.it` e il master panel sta su `miodominio.it/master`. Un DNS che supporti il CNAME sulla radice (Cloudflare lo fa) semplifica il passo 5.

**2. Progetto Railway.** Nuovo progetto → *Deploy from GitHub repo* → `stand-manager`, branch `feat/multi-tenancy`. Nello stesso progetto aggiungi un database PostgreSQL (*New → Database → PostgreSQL*). Regione europea per entrambi.

**3. Variabili del servizio app** (scheda *Variables*; `${{Postgres.…}}` sono riferimenti alle variabili del database, che Railway risolve da sé):

```
NODE_ENV=production
TLS_TERMINATED_BY_PROXY=true
APP_DOMAIN=miodominio.it
LOG_LEVEL=info

PG_HOST=${{Postgres.PGHOST}}
PG_PORT=${{Postgres.PGPORT}}
PG_DATABASE=${{Postgres.PGDATABASE}}
PG_USER=standmanager_app
PG_PASSWORD=<openssl rand -hex 24>
PG_MASTER_USER=standmanager_master
PG_MASTER_PASSWORD=<openssl rand -hex 24, diversa>
MIGRATION_DATABASE_URL=${{Postgres.DATABASE_URL}}

JWT_SECRET=<openssl rand -hex 48>
MASTER_JWT_SECRET=<openssl rand -hex 48, diversa>
MASTER_PASSWORD_HASH=<hash bcrypt, vedi backend/.env.example>
```

`PORT` lo imposta Railway. `HTTPS_KEY_PATH` e `HTTPS_CERT_PATH` non servono. Le password di `PG_PASSWORD` e `PG_MASTER_PASSWORD` le scegli tu: al primo rilascio `db:prepare` crea i due ruoli con queste password.

**4. Primo rilascio.** Al primo deploy `npm run db:prepare` trova il database vuoto: crea i ruoli `standmanager_app` e `standmanager_master`, carica `schema.sql` e registra le migrazioni come già applicate. Dai rilasci successivi salta questa parte e applica solo le migrazioni nuove. Se fallisce, il rilascio si ferma e resta online la versione precedente.

**5. Domini.** Nel servizio app, *Settings → Networking → Custom Domain*: aggiungi `*.miodominio.it` e `miodominio.it`, poi crea nel DNS i record che Railway mostra (per il wildcard due CNAME, uno per `_acme-challenge`, e un TXT). Con Cloudflare il record `_acme-challenge` non va messo dietro il proxy (nuvola grigia).

**6. Prova.** `https://miodominio.it/api/health/ready` risponde 200; da `https://miodominio.it/master` crei il primo tenant e lo apri su `https://<slug>.miodominio.it`.

**Backup.** Il database ha i backup di Railway (scheda *Backups* del servizio PostgreSQL, da attivare con una pianificazione giornaliera se il piano lo prevede). In più, prima di un rilascio con migrazioni, un dump dal tuo computer:

```bash
BACKUP_DATABASE_URL=<DATABASE_PUBLIC_URL del servizio Postgres> backend/scripts/backup.sh ./backups 14
```

**Limiti noti su Railway:** il master panel è raggiungibile da chiunque conosca l'indirizzo (non c'è un reverse proxy per filtrarlo per IP: lo proteggono password e limite ai tentativi di login); i log restano nella scheda *Logs* del servizio.

## Prima di aprire ai clienti

- [ ] `NODE_ENV=production`. Con segreti deboli l'app non parte.
- [ ] `JWT_SECRET` e `MASTER_JWT_SECRET`: stringhe diverse, casuali, almeno 32 caratteri (`openssl rand -hex 48`).
- [ ] `MASTER_PASSWORD_HASH`: hash bcrypt di una password lunga e unica per il master panel.
- [ ] `APP_DOMAIN` = dominio reale. DNS wildcard `*.dominio` e certificato wildcard (`HTTPS_KEY_PATH`, `HTTPS_CERT_PATH`) o TLS terminato da un reverse proxy o dalla piattaforma (`TLS_TERMINATED_BY_PROXY=true`).
- [ ] Il database accetta connessioni solo dall'app (rete privata o firewall). Tre utenti, con password diverse: applicativo (`PG_USER`, soggetto a RLS; sui tenant solo lettura, su `audit_logs` solo lettura e inserimento), master (`PG_MASTER_USER`, usato solo dalle route `/master`: crea, modifica ed elimina tenant) e migrazioni (`MIGRATION_DATABASE_URL`, mai usato dall'app).
- [ ] Il file `.env` non è nel repository e ha permessi `600`.
- [ ] Backup notturno pianificato **e un ripristino provato** (vedi sotto).
- [ ] Il monitoraggio interroga `GET /api/health/ready` (200 = app e database ok, 503 = database giù).
- [ ] `npm audit` pulito; la CI (`.github/workflows/ci.yml`) è verde sul commit che si rilascia.
- [ ] Il master panel (`/master`) non è esposto a tutti, se possibile limitato per IP dal reverse proxy.

## Rilascio di una nuova versione

1. Backup (`backend/scripts/backup.sh`) **prima** di toccare il database.
2. `git pull`, `npm ci` in `backend/` e `frontend/`, `npm run build` nel frontend.
3. `npm run migrate` in `backend/` (usa `MIGRATION_DATABASE_URL`).
4. Riavvio del processo (systemd/PM2). Il server chiude in modo ordinato su SIGTERM.

**Ordine tra codice e migrazione.** Dipende dalla migrazione, e lo dice il commento in testa al file `.sql`:
- migrazione che *aggiunge* (colonna con default, indice, tabella): prima la migrazione, poi il codice nuovo;
- migrazione che *restringe* (CHECK, NOT NULL, colonna tolta): prima il codice nuovo (che già rispetta il vincolo), poi la migrazione.
Con una sola istanza e pochi secondi di fermo il problema non si pone; conta quando si aggiorna senza fermare il servizio.

Le migrazioni non si modificano una volta applicate: per correggerne una se ne scrive una nuova. Non c'è un "down": il rimedio a una migrazione sbagliata è il backup preso al punto 1.

## Backup e ripristino

```bash
BACKUP_DATABASE_URL=postgres://utente_privilegiato:password@host/standmanager \
  backend/scripts/backup.sh /var/backups/standmanager 14
```

Crea un dump compresso, ne verifica la leggibilità e cancella quelli più vecchi di 14 giorni. Esempio di pianificazione (`crontab -e`):

```
30 3 * * *  BACKUP_DATABASE_URL=... /opt/standmanager/backend/scripts/backup.sh /var/backups/standmanager 14
```

- Il dump contiene i dati di **tutti** i clienti: cartella con permessi stretti e copia fuori dal server (altro disco, storage remoto). Un backup solo sulla stessa macchina non protegge da un guasto della macchina.
- **Prova il ripristino** (almeno ogni tanto, e subito la prima volta):

```bash
createdb standmanager_ripristino
pg_restore --no-owner -d standmanager_ripristino /var/backups/standmanager/standmanager-AAAAMMGG-HHMMSS.dump
psql -d standmanager_ripristino -c "SELECT count(*) FROM orders"
```

Dopo un ripristino su un database nuovo vanno ricreati i ruoli e i permessi dell'utente applicativo (vedi `README.md` e `backend/migrations/022_restrict_app_privileges.sql`).

## Log

- In produzione l'app scrive JSON su stdout (pino). Una riga per richiesta API: metodo, percorso, stato, durata in ms, utente e tenant. Mai cookie, intestazioni o corpo delle richieste.
- Livelli: 5xx = `error`, 4xx e richieste oltre 1 s = `warn`, il resto `info`. `LOG_LEVEL` regola la verbosità.
- Con systemd i log sono in `journalctl -u standmanager`; con PM2 in `pm2 logs`. Per tenerli oltre qualche giorno e cercarci dentro serve un raccoglitore (Loki, Papertrail, CloudWatch…): da decidere con l'hosting scelto.
- Conservazione di `audit_logs` nel database: non c'è ancora una scadenza (vedi `docs/backlog.md`).

## Esempio systemd

```ini
[Unit]
Description=Stand Manager
After=network.target postgresql.service

[Service]
WorkingDirectory=/opt/standmanager/backend
ExecStart=/usr/bin/node server.js
Environment=NODE_ENV=production
EnvironmentFile=/opt/standmanager/backend/.env
User=standmanager
Restart=on-failure
RestartSec=3
# Il server esce con errore su eccezioni non gestite: systemd lo riavvia

[Install]
WantedBy=multi-user.target
```

## Reverse proxy

Se c'è un reverse proxy davanti (nginx, Caddy): deve inoltrare l'upgrade WebSocket, passare `X-Forwarded-For` (il server usa `trust proxy = 1`, quindi un solo proxy) e non deve permettere di raggiungere direttamente la porta dell'app dall'esterno, altrimenti l'IP del client si può falsificare.
