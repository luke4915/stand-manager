# Messa online e operatività

Guida per portare Stand Manager in produzione e tenerlo in vita. Le regole di sviluppo stanno in `CLAUDE.md`.

## Prima di aprire ai clienti

- [ ] `NODE_ENV=production`. Con segreti deboli l'app non parte.
- [ ] `JWT_SECRET` e `MASTER_JWT_SECRET`: stringhe diverse, casuali, almeno 32 caratteri (`openssl rand -hex 48`).
- [ ] `MASTER_PASSWORD_HASH`: hash bcrypt di una password lunga e unica per il master panel.
- [ ] `APP_DOMAIN` = dominio reale. DNS wildcard `*.dominio` e certificato wildcard (`HTTPS_KEY_PATH`, `HTTPS_CERT_PATH`) o TLS terminato da un reverse proxy.
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

## Messa online gratis (Oracle Cloud + DuckDNS + Docker)

Costo zero per cominciare, adatto a pochi clienti. Tutto sta in `deploy/` (`docker-compose.yml`, `.env.example`) e nell'immagine costruita dal workflow **Rilascio**. Quando i clienti crescono si sposta lo stesso stack su un VPS da pochi euro al mese: cambia solo la macchina.

### 1. Dominio gratuito (DuckDNS)
1. Entra su https://www.duckdns.org (login con GitHub/Google) e crea un nome, es. `smarteats` → `smarteats.duckdns.org`.
2. Il **wildcard è incluso**: `qualsiasi.smarteats.duckdns.org` punta allo stesso IP, quindi ogni locale è un sottodominio (`pizzeria-rossi.smarteats.duckdns.org`).
3. Copia il **token** (serve a Traefik per ottenere il certificato wildcard con la sfida DNS di Let's Encrypt).
4. Quando vendi davvero (e per WhatsApp/Meta), conviene un dominio proprio (~10 €/anno): si cambia `APP_DOMAIN` e si punta il DNS `*.dominio` allo stesso IP, il resto non cambia.

### 2. Server Oracle Cloud Always Free
1. Crea l'account su https://cloud.oracle.com (serve una carta per verifica, non viene addebitata sul piano gratuito). Scegli la regione di casa con cura: non si cambia.
2. Crea un'istanza **Ampere A1 (ARM)**, Ubuntu 22.04, 2 OCPU e 12 GB (basta), con IP pubblico; poi **riserva l'IP** (Networking → Reserved public IP) così non cambia.
3. Nella VCN → Security List aggiungi regole in ingresso per le porte TCP **80** e **443** (e 22 per SSH, già presente).
4. Sulla macchina Ubuntu apri anche il firewall interno:
   ```
   sudo iptables -I INPUT 6 -p tcp --dport 80 -j ACCEPT
   sudo iptables -I INPUT 6 -p tcp --dport 443 -j ACCEPT
   sudo netfilter-persistent save
   ```
5. Installa Docker: `curl -fsSL https://get.docker.com | sudo sh && sudo usermod -aG docker $USER` (riconnettiti).
6. Su DuckDNS metti l'IP riservato nel campo «current ip» del tuo nome.
7. Nota: Oracle può **recuperare le istanze Always Free rimaste inattive** per giorni. Un monitor che interroga l'app (punto 6) basta a tenerla viva.

### 3. Prima installazione
1. Pubblica l'immagine: su GitHub crea il tag `git tag v0.1.0 && git push origin v0.1.0` (o lancia a mano il workflow **Rilascio**). Poi in GitHub → Packages rendi pubblico il pacchetto `stand-manager` (oppure sul server fai `docker login ghcr.io`).
2. Sul server: `git clone https://github.com/luke4915/stand-manager.git && cd stand-manager/deploy`.
3. `cp .env.example .env && chmod 600 .env`, poi compila: dominio, token DuckDNS, password diverse e segreti casuali (`openssl rand -hex 48`). L'hash della password master: `docker run --rm node:22-slim sh -c "npm i bcrypt >/dev/null 2>&1; node -e \"require('bcrypt').hash('LA-TUA-PASSWORD',12).then(h=>console.log(h.replaceAll('\$','\$\$')))\""` (nel `.env` di compose i `$` sono già raddoppiati).
4. `docker compose up -d`. Al primo avvio l'app crea ruoli e schema (`scripts/init-db.js`), applica le migrazioni e parte; Traefik ottiene il certificato wildcard (1-2 minuti: `docker compose logs -f traefik`).
5. Apri `https://<nome>.duckdns.org/master`, entra con la password master e crea il primo locale.

### 4. Rilasciare una nuova versione
1. Merge su `main` (CI verde), poi `git tag v0.1.1 && git push origin v0.1.1`: il workflow costruisce l'immagine (amd64 + arm64).
2. Sul server: `cd stand-manager/deploy`. Il backup notturno c'è, ma **prima di una migrazione** lancia `docker compose exec backup bash /backup.sh /backups 14`.
3. `docker compose pull app && docker compose up -d app`: le migrazioni mancanti girano all'avvio, poi parte il server (secondi di fermo).
4. Tornare indietro: imposta in `.env` `APP_IMAGE=ghcr.io/luke4915/stand-manager:0.1.0` e rilancia `up -d`. Se la migrazione era distruttiva, ripristina il backup (sotto).

### 5. Backup e ripristino
- Il servizio `backup` fa un dump ogni notte alle 03:00 in `deploy/backups/` (14 giorni). **Sullo stesso disco non basta**: copiali fuori, es. `rclone copy deploy/backups r2:nome-bucket` con un cron (Cloudflare R2 o Backblaze B2 hanno un piano gratuito).
- Ripristino provato: `docker compose exec -T db pg_restore -U postgres -d standmanager --clean --if-exists < backups/standmanager-AAAAMMGG-HHMMSS.dump`. Fallo una volta su un database di prova prima di averne bisogno.

### 6. Monitoraggio
Crea un monitor gratuito su https://uptimerobot.com che interroga `https://<nome>.duckdns.org/api/health/ready` ogni 5 minuti: ti avvisa se l'app o il database sono giù e tiene attiva la macchina.
