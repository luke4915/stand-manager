# Backlog: insidie note e lavoro previsto

Elenco verificato sul codice. Quando ne risolvi una, toglila da qui nello stesso commit.


**Stampa**
- La ristampa offline copre solo gli ordini battuti da questa cassa nella sessione aperta (non quelli di altre casse).
- Gli indirizzi stampante si salvano ancora come `printer_address` con `printer_type` `'network'`; il valore `'usb'` della colonna non si usa più.
- `config.js`, `printOrder.js` e `usePrintQueue.js` (che dipendono da `apiClient` e React) non hanno test automatici; coda, archivio locale e driver sì (`offline.test.js`).
- La scritta "COPIA INTERNA ASSOCIAZIONE" e i nomi delle copie sono fissi nei template.

**Codice legacy**
- `theme` nel JWT e in `/auth/me` vale sempre `'dark'`: `users` non ha una colonna `theme` e il tema è solo stato del client.

**Frontend e offline**
- Gli ordini rimasti in coda da prima dell'aggiornamento non hanno `client_order_id` né `session_id`, quindi vanno nella sessione aperta al momento della sincronizzazione.

**Evoluzione (priorità 2)**

**Dalla revisione del 4 ottobre 2026 (fase 4)**
- Sicurezza: `/api/assets` serve solo `.mp3` (i loghi di altri marchi sono stati tolti dal repository ma restano nella cronologia git); gli ordini offline sincronizzati dopo la chiusura aggiornano il totale atteso ma non sono segnalati nel report di sessione.
- Dati: `audit_logs` senza retention. Cassa e cucina scaricano ancora tutti gli ordini della sessione aperta (fino a 2000): se serve, filtrare per stato.
- Frontend: file troppo grandi (`ProductConfig.jsx`, `PrintProfiles.jsx`).
- Operatività: i log vanno su stdout, manca un raccoglitore (dipende dall'hosting); il backup è su disco locale, la copia fuori dal server è da configurare; nessun monitoraggio esterno dell'health check.
- Qualità: nessun test end-to-end (browser) e nessun test del frontend oltre la logica pura; TypeScript non adottato.
