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
| Prodotti | Stand Manager (sagre, paninari) e SmartEats (ristoranti, pizzerie) sono due app sulla stessa API. Il frontend sceglie l'app dal tipo del locale (`AppRouter.jsx`): chi entra in un ristorante vede la dashboard SmartEats (`src/smarteats/`), mai quella della cassa. Un futuro gestionale hotel sarà un terzo tipo, con la sua app. |
| Moduli | Ogni tenant ha `business_type` e un elenco di `modules`. Il tipo di attività si sceglie alla creazione e **non cambia**: una sagra (o un paninaro) e un ristorante sono due prodotti distinti, non si mescolano. Ogni modulo dichiara per quali tipi esiste (`utils/modules.js`: i tavoli solo al ristorante, il menu QR solo a sagra e paninaro). |
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
| 0c | Tipi di attività esclusivi: moduli validati per tipo (migrazione 033 ripulisce i dati), tipo fisso dopo la creazione, app SmartEats separata con shell e dashboard Sala proprie (sala in sola lettura, servizio, carta, cucina, statistiche, impostazioni). | `[x]` |
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
| 2-2 | Conto per tavolo (`checks` e `orders.check_id`, migrazione 032): apertura con coperti, un solo conto aperto per tavolo, numeri in fila nella sessione, totali ricalcolati dal server, richiesta del conto, annullo, evento `check_updated`. I pagamenti (`payments`) arrivano col 2-5. | `[x]` |
| 2-3 | L'incasso conosce i conti: statistiche, contanti attesi, chiusura serata e CSV; le sagre restano identiche (stessi numeri su 1338 ordini reali). Migrazione 035: tabella `payments` (l'API dei pagamenti è il 2-5). Un conto aperto blocca la chiusura del servizio. | `[x]` |
| 2-4 | Comanda su un conto aperto (`POST /orders` con `check_id`, solo online); il KDS (staff e pubblico) e le copie stampate di cucina e bar mostrano tavolo e coperti. Lo storno vale finché il conto è aperto. L'interfaccia per inviarle arriva col 2-6. | `[x]` |
| 2-5 | Pagamenti (contanti, carta, altro) a importo o **per voce** (conti separati, anche a pezzi di quantità), resto sui contanti, chiusura automatica a residuo zero, `POST /checks/:id/close`, abbuono (omaggio o sconto sulle voci, `POST /checks/:id/adjust`), eliminazione del conto con le sue comande (admin), dati e modello di stampa della ricevuta non fiscale. Migrazione 036 (`payment_items`). Il pulsante di stampa e la schermata arrivano col 2-6. | `[x]` |
| 2-6 | Vista Sala operativa, ridisegnata come la cassa (area di lavoro + un solo pannello a destra, nessuna finestra sovrapposta; `smarteats/SalaPage.jsx` e `smarteats/sala/`): tavoli sulla pianta (o schede) con stato dal vivo; apertura tavolo con i coperti; pannello del conto con comande, totale e pagamenti; nuova comanda dalla carta (con stampa su cucina e bar); incasso per voce o a importo con resto e «alla romana»; omaggio/sconto sulle voci; richiesta del conto; ricevuta non fiscale; eliminazione del conto (admin). Solo online. | `[x]` |
| 2-6a | Editor della pianta: l'admin del locale disegna ogni sala, piazza i tavoli dove vuole e ne sceglie forma e dimensione (trascinamento, ridimensionamento, tocco su tablet); la Sala mostra la stessa pianta con lo stato dal vivo. Migrazione 034 (posizione e misure di tavoli e sale). Niente rotazione: la forma si ottiene da larghezza e altezza. | `[x]` |
| 2-6b | Sala: selettore per sala in alto e pianta scalata per starci intera nell'area (senza scroll); i tavoli mostrano i posti (e i coperti presenti). Muri e separatori disegnabili nell'editor della pianta (migrazione 039, `room_elements`). | `[x]` |
| 2-7 | Spostare un conto su un altro tavolo libero (`POST /checks/:id/move`) e unire due conti (`POST /checks/:id/merge`: comande, pagamenti e coperti confluiscono, il conto assorbito resta annullato con `merged_into`, migrazione 037). La cucina vede il tavolo nuovo. Nella Sala: «Sposta o unisci tavolo» nel menu del conto. | `[x]` |
| 2-8 | Pagamento per voce (chi paga cosa): fatto insieme al 2-5. Il raggruppamento per portata arriverà con la Fase 3. | `[x]` |
| 2-9 | Coperto sul conto: impostazione `cover_charge` (euro a persona, solo admin), fissata su ogni conto all'apertura; è una riga automatica «Coperto × coperti» (comanda di tipo `cover`, già servita), quindi si paga, si sconta e conta nell'incasso come ogni voce ma non come comanda nelle statistiche. «Modifica i coperti» nel menu del conto; l'unione dei conti somma i coperti. Migrazione 038. Lo sconto sul conto c'è dal 2-5 (omaggio/sconto sulle voci). | `[x]` |
| 2-10 | Servizi al posto delle «serate» per i ristoranti: stesse sessioni lato server, vocabolario del tipo di locale (`utils/terms.js`) in statistiche, PDF e chiusura; il nome del servizio è proposto dall'ora (Pranzo/Cena). | `[x]` |

## Fase 3: portate e cucina (P1)

| Id | Requisito | Stato |
|---|---|---|
| 3-1 | Ogni prodotto ha una portata (lista del locale ordinabile, `courses` e `products.course_id`, migrazione 040). Lista gestita in Impostazioni → Portate (`CourseSettings`), portata scelta per prodotto nella Carta. | `[x]` |
| 3-2 | Il cameriere "manda" una portata: solo allora arriva in cucina e si stampa la comanda. Una comanda per portata, quelle future `scheduled` sul conto; ordine di uscita e «insieme» con lo stesso numero; riordino. Comanda in Sala divisa per portata (`DraftOrder`: prima/dopo/insieme, riordino), «Prossima portata → Manda» sul conto, portata stampata sul tagliando. Mancano il riordino di portate già sul conto da interfaccia e il palmare. | `[~]` |
| 3-3 | Stato per riga (migrazione 041) e monitor cucina (`smarteats/cucina/`): comande per portata con tavolo, coperti e minuti d'attesa; lo chef segna «Pronta» (tutta la comanda o piatto per piatto), i tab Cucina/Bar compaiono solo se c'è lavoro per il bar. In sala: stato della portata (da mandare, in cucina, pronta), avviso quando è pronta e segno sulla pianta per 15 minuti. Niente «servito» da confermare. | `[x]` |
| 3-4 | Comanda di cucina con tavolo, coperti e portata. | `[ ]` |
| 3-5 | Ruolo `cameriere` (migrazione 042, `WAITER_ROLES`): prende ordini, manda e serve, non incassa né storna né sconta. Interfaccia per palmare: tavoli come schede con filtro (Tutti / Occupati / Da servire) sotto i 640 px, pannello a tutto schermo, comandi limitati al ruolo, nessun menu laterale. | `[x]` |
| 3-6 | Modificatori dei piatti (migrazione 043): gruppi di opzioni con supplemento (cottura, aggiunte, senza…), minimo e massimo, collegati ai prodotti; scelta in comanda (`ModifierPicker`), gestione nella Carta (`ModifierSettings`), prezzo calcolato dal server, opzioni su cucina, conto, ricevuta e tagliando. | `[x]` |

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
| 5-5 | Statistiche per ristorante (`/stats/restaurant`, pagina Statistiche di SmartEats): coperti, scontrino medio per coperto e per conto, durata e rotazione dei conti, incasso per ora, portate, piatti più venduti, tempi di cucina, sconti e omaggi, incassi per metodo. Da valutare altre metriche con l'uso. | `[x]` |
| 5-6 | Più sedi per lo stesso cliente. | `[ ]` |

## Regole di lavoro

- Un passo alla volta, ogni passo con i suoi test. Prima di toccare dati esistenti (Fase 1) si prepara una verifica prima/dopo.
- Le tabelle nuove sono tenant-scoped con RLS, come da `CLAUDE.md` §3, e vanno aggiunte a `TENANT_SCOPED_TABLES` del master.
- Una funzione nuova che dipende da un modulo si dichiara con `requireModule` sul server e con la stessa regola nel menu.
- Il nome del prodotto SmartEats va verificato (dominio, marchio) prima di usarlo in pubblico.
