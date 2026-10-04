# SmartEats e piattaforma: requisiti e ordine di sviluppo

Piano di lavoro per portare la piattaforma da "gestionale per sagre" (Stand Manager) a una piattaforma con più prodotti,
tra cui **SmartEats** (ristoranti e pizzerie). Si aggiorna a ogni passo: quando una voce è fatta, cambia lo stato
nello stesso commit. Le cose "da sistemare" già note stanno in `docs/backlog.md`.

Stati: `[ ]` da fare · `[~]` in corso · `[x]` fatto.
Priorità: **P0** fondamenta (senza non si procede) · **P1** MVP ristorante · **P2** subito dopo · **P3** più avanti.

## Decisioni prese

| Tema | Decisione |
|---|---|
| Piattaforma | Un solo backend e **un solo database** PostgreSQL. I tenant restano isolati dalla RLS; un locale SmartEats è un tenant come una sagra, con altri moduli accesi. |
| Prodotti | Stand Manager (sagre, paninari) e SmartEats (ristoranti, pizzerie) sono due app sulla stessa API. |
| Moduli | Ogni tenant ha `business_type` e un elenco di `modules`. Il tipo di attività è solo un preset dei moduli, non un fork del codice. |
| Repository | Monorepo con più app (`apps/`) e codice condiviso (`packages/core`), **ma il trasloco si fa quando parte la prima schermata SmartEats** (vedi 0b), non prima. |
| Fiscale | Fuori dal primo rilascio: l'app gestisce il conto, lo scontrino fiscale resta sul registratore del locale. |
| Primo obiettivo | Tavoli e comande. Le prenotazioni vengono dopo. |
| Branch | Il lavoro sta su `feat/smarteats-platform`, mai direttamente su `main`. |

## Fase 0: fondamenta (P0)

| Id | Requisito | Stato |
|---|---|---|
| 0a-1 | Colonne `tenants.business_type` e `tenants.modules` (migrazione 026, additiva). I tenant esistenti ricevono i moduli di oggi: nulla cambia per loro. | `[x]` |
| 0a-2 | Catalogo dei moduli e dei preset in un solo posto (`backend/utils/modules.js`). | `[x]` |
| 0a-3 | Il server applica i moduli: `requireModule(...)` sulle route di KDS, statistiche e menu pubblico. | `[x]` |
| 0a-4 | Login e `/auth/me` restituiscono i moduli del tenant; l'app li usa per menu e route insieme al ruolo. Una modifica del master arriva agli utenti già collegati al ricaricamento della pagina o al nuovo accesso. | `[x]` |
| 0a-5 | Pannello master: tipo di attività e moduli alla creazione del tenant e in modifica. | `[x]` |
| 0a-6 | Test: modulo spento blocca la route sul server e nasconde la voce; i tenant esistenti restano identici. | `[x]` |
| 0b | Trasloco in monorepo (`apps/standmanager`, `apps/smarteats`, `packages/core`), CI e documentazione. | `[ ]` rimandato alla prima schermata SmartEats |

## Fase 1: ordini a righe (P0, tocca il nucleo)

Fatta in "espandi e poi restringi": la tabella nuova si è affiancata al JSONB, ogni passo è stato verificato sui dati reali, e
alla fine il JSONB è sparito. Oggi le righe stanno **solo** in `order_items`.

| Id | Requisito | Stato |
|---|---|---|
| 1-1 | Tabella `order_items` (migrazioni 027-028): una riga per prodotto ordinato, tenant-scoped con RLS. Niente stato per riga e niente portata: arrivano nella Fase 3. | `[x]` |
| 1-2 | Riempimento dei vecchi ordini dal JSONB, ripetibile, con anomalie segnalate. | `[x]` |
| 1-3 | Verifica riga per riga contro il JSONB: 0 differenze su 1364 ordini reali. | `[x]` |
| 1-4 | Doppia scrittura durante la migrazione. | `[x]` |
| 1-5 | Letture dalle righe (elenco, ristampa, KDS, storno, CSV, statistiche), ciascuna confrontata col vecchio risultato (statistiche: 283 gruppi, stesso incasso e stessi pezzi). | `[x]` |
| 1-6 | Via il JSONB: gli ordini non lo scrivono più (029), la colonna è eliminata (030), tolti gli strumenti di migrazione. Le righe sono parte dell'ordine: se non si scrivono, l'ordine non nasce. | `[x]` |

**Ordine di rilascio in produzione:** migrazione 029 e codice nuovo; solo dopo, quando il codice vecchio non gira più, la 030 (con backup).

## Fase 2: sala, tavoli e conti (P1)

Disegno completo e decisioni in `docs/design-tavoli.md`. Un passo alla volta; i primi due non cambiano nulla per le sagre.

| Id | Requisito | Stato |
|---|---|---|
| 2-0 | La regola "cosa conta come incasso" in un solo punto (`utils/revenue.js`), oggi sparsa in sei query; i test di prima passano invariati e un test impedisce di riscriverla altrove. | `[x]` |
| 2-1 | Modulo `tables`: sale e tavoli (migrazione 031, tabelle `rooms` e `dining_tables`), API `/rooms` e `/tables`, gestione da parte dell'admin in Sistema (anche tavoli in serie). La mappa con la posizione dei tavoli arriverà con la vista Sala. | `[x]` |
| 2-2 | Conto per tavolo (`checks`, `payments`, `orders.check_id`, migrazione 032): apertura con coperti, totali ricalcolati dal server, richiesta del conto. | `[ ]` |
| 2-3 | L'incasso conosce i conti: statistiche, contanti attesi, chiusura serata e CSV; le sagre restano identiche. | `[ ]` |
| 2-4 | Comanda su un conto aperto; il KDS e la comanda mostrano tavolo e coperti. | `[ ]` |
| 2-5 | Pagamenti (contanti, carta, altro), anche in più parti alla romana; chiusura del conto; ricevuta non fiscale. | `[ ]` |
| 2-6 | Vista Sala: tavoli per sala con stato, apertura tavolo, carrello in modalità tavolo, pannello del conto, aggiornamento in tempo reale. | `[ ]` |
| 2-7 | Spostare un conto su un altro tavolo e unire due tavoli. | `[ ]` |
| 2-8 | Pagamento per voce (chi paga cosa). | `[ ]` |
| 2-9 | Coperto e sconto sul conto. | `[ ]` |
| 2-10 | Servizi (pranzo e cena) al posto delle "serate". | `[ ]` |

## Fase 3: portate e cucina (P1)

| Id | Requisito | Stato |
|---|---|---|
| 3-1 | Ogni riga ha una portata (antipasto, primo, secondo, dolce). | `[ ]` |
| 3-2 | Il cameriere "manda" una portata: solo allora arriva in cucina e si stampa la comanda. | `[ ]` |
| 3-3 | KDS per riga: in preparazione, pronta, servita; il tavolo vede cosa è pronto. | `[ ]` |
| 3-4 | Comanda di cucina con tavolo, coperti e portata. | `[ ]` |
| 3-5 | Ruolo cameriere con permessi propri (prende ordini, non fa sconti né storni). | `[ ]` |

## Fase 4: prenotazioni (P2)

| Id | Requisito | Stato |
|---|---|---|
| 4-1 | Agenda delle prenotazioni per servizio, con coperti e orario. | `[ ]` |
| 4-2 | Capienza e turni: la sala non si riempie oltre i posti disponibili. | `[ ]` |
| 4-3 | Assegnazione del tavolo alla prenotazione e arrivo del cliente. | `[ ]` |
| 4-4 | Pagina pubblica di prenotazione per ogni locale (sottodominio del tenant). | `[ ]` |
| 4-5 | Conferma e promemoria al cliente (email o messaggio). | `[ ]` |
| 4-6 | Lista d'attesa. | `[ ]` |

## Più avanti (P3)

| Id | Requisito | Stato |
|---|---|---|
| 5-1 | Integrazione col registratore telematico (scontrino fiscale). | `[ ]` |
| 5-2 | Ordine dal tavolo da parte del cliente (QR) con conferma del cameriere. | `[ ]` |
| 5-3 | Asporto e consegne con orari di ritiro. | `[ ]` |
| 5-4 | Gestione magazzino con ricette e distinta base. | `[ ]` |
| 5-5 | Statistiche per ristorante: coperti, scontrino medio per coperto, rotazione dei tavoli. | `[ ]` |
| 5-6 | Più sedi per lo stesso cliente. | `[ ]` |

## Regole di lavoro

- Un passo alla volta, ogni passo con i suoi test. Prima di toccare dati esistenti (Fase 1) si prepara una verifica prima/dopo.
- Le tabelle nuove sono tenant-scoped con RLS, come da `CLAUDE.md` §3, e vanno aggiunte a `TENANT_SCOPED_TABLES` del master.
- Una funzione nuova che dipende da un modulo si dichiara con `requireModule` sul server e con la stessa regola nel menu.
- Il nome del prodotto SmartEats va verificato (dominio, marchio) prima di usarlo in pubblico.
