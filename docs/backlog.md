# Backlog: insidie note e lavoro previsto

Elenco verificato sul codice. Quando ne risolvi una, toglila da qui nello stesso commit.


**Stampa**
- L'anteprima dei template nel master mostra le immagini come segnaposto con le dimensioni, non l'immagine reale composta.
- La ristampa offline copre solo gli ordini battuti da questa cassa nella sessione aperta (non quelli di altre casse).
- Gli indirizzi stampante si salvano ancora come `printer_address` con `printer_type` `'network'`; il valore `'usb'` della colonna non si usa più.
- `config.js`, `printOrder.js` e `usePrintQueue.js` (che dipendono da `apiClient` e React) non hanno test automatici; coda, archivio locale e driver sì (`offline.test.js`).
- La scritta "COPIA INTERNA ASSOCIAZIONE" e i nomi delle copie sono fissi nei template.

**Codice legacy**
- `theme` nel JWT e in `/auth/me` vale sempre `'dark'`: `users` non ha una colonna `theme` e il tema è solo stato del client.
- Manca nell'interfaccia la reimpostazione della password di un utente (esiste solo l'endpoint `POST /auth/admin/users/:id/reset-password`).

**Frontend e offline**
- Gli ordini offline rifiutati per sempre (`failed`) sono visibili solo come contatore in testata: manca una schermata per vederli e archiviarli. Gli ordini rimasti in coda da prima dell'aggiornamento non hanno `client_order_id` né `session_id`, quindi vanno nella sessione aperta al momento della sincronizzazione.

**Evoluzione (priorità 2)**
- `orders.items` è un array JSONB dentro l'ordine. Per la ristorazione avanzata (tavoli, stato per singola riga nel KDS, conti divisi) servirà una tabella `order_items`.

**Dalla revisione del 4 ottobre 2026 (fasi 3-4)**
- Sicurezza: l'utente applicativo del DB serve anche il master (serve un ruolo separato); `/api/assets` serve solo `.mp3`, ma i loghi di altri marchi sono ancora nel repository (`backend/assets`, `branding/`); gli ordini in ritardo arrivati dopo la chiusura non compaiono nel report di sessione.
- Dati e scalabilità: `GET /orders` senza paginazione e statistiche calcolate nel browser; mancano indici composti; `audit_logs` senza retention.
- Frontend: tre implementazioni del WebSocket; file troppo grandi (`ProductConfig.jsx`, `App.jsx`, `PrintProfiles.jsx`); statistiche per nome e non per id.
- Operatività: CI, health check, log, backup, ordine di rilascio codice/migrazione.
