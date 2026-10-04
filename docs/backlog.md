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

**Dalla revisione del 4 ottobre 2026 (fasi 2-4)**
- Sicurezza: sessioni non revocabili e segreti non controllati all'avvio (cookie `SameSite=None`, algoritmo JWT non fissato); WebSocket senza `maxPayload` né limiti di connessioni; QR del menu considerato affidabile; nome e categoria delle righe d'ordine presi dal client invece che dal catalogo; ordini "in ritardo" (`session_id`) apribili anche a ruoli e momenti non previsti; CSV con iniezione di formule; password minima 6 e bcrypt 10; `/api/assets` serve loghi di altri marchi; l'utente applicativo del DB serve anche il master (serve un ruolo separato).
- Dati e scalabilità: `GET /orders` senza paginazione e statistiche calcolate nel browser; mancano indici composti; il contatore di sessione mette in fila le casse; mancano vincoli CHECK su `orders.status`, `users.role`, `products.print_destination`; `audit_logs` senza retention.
- Frontend: tre implementazioni del WebSocket; file troppo grandi (`ProductConfig.jsx`, `App.jsx`, `PrintProfiles.jsx`); il ruolo `responsabile` non ha voci di menu; lo storno mostra l'id interno e non il `display_code`; statistiche per nome e non per id.
- Operatività: CI, health check, log, backup, controllo dei segreti, ordine di rilascio codice/migrazione.
