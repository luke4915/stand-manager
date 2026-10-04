# Disegno: sala, tavoli e conti (SmartEats, Fase 2)

Documento di progetto, da approvare prima di scrivere codice. Il piano per fasi sta in `docs/requirements.md`; qui c'è il
disegno della Fase 2 e l'ordine dei passi. Si aggiorna se cambiano le decisioni.

## 1. Cosa vogliamo

Un cameriere apre un **tavolo** con un certo numero di coperti, vi aggiunge **comande** nel corso del pasto (che vanno in cucina),
a fine pasto il tavolo chiede il **conto**, che si paga anche in più parti (alla romana o per voce) con contanti, carta o altro.
Il tavolo torna libero. Tutto è sincronizzato in tempo reale fra i dispositivi della sala.

Resta tutto com'è per le sagre: un ordine pagato subito alla cassa, senza tavolo né conto.

## 2. Il concetto nuovo: il conto

Oggi un ordine è insieme comanda (va in cucina) e pagamento (entra nell'incasso). Al tavolo le due cose si separano:

- **Ordine = comanda.** Ciò che il tavolo ha chiesto in un certo momento. Ha lo stato di cucina di sempre (in attesa, in
  preparazione, completato = servito, annullato).
- **Conto = ciò che il tavolo deve pagare.** Raccoglie le comande del tavolo, ha un totale e dei pagamenti.

Un ordine senza conto (`check_id` nullo) si comporta **esattamente come oggi**. Un ordine con conto non entra nell'incasso
finché il conto non è pagato.

## 3. Dati

Tutte le tabelle nuove sono tenant-scoped con RLS (`CLAUDE.md` §3) e vanno in `TENANT_SCOPED_TABLES`.

```
rooms          id, tenant_id, name, active                       (nome unico per tenant)
dining_tables  id, tenant_id, room_id, name, seats, active       (nome unico per sala)
               pianta (migrazione 034): rooms.grid_w/grid_h (celle), dining_tables.x/y/w/h (celle, tutti nulli = da piazzare) e shape ('rect'|'round'); niente rotazione
               ordine delle sale: si aggiunge con la vista Sala (2-6)

checks       id, tenant_id, session_id, table_id → dining_tables (nullo per banco), number (progressivo per sessione),
             covers, status ('open' | 'paid' | 'void'), opened_by, opened_at, bill_requested_at, closed_at,
             cover_charge (coperto applicato, fissato all'apertura), discount_* (sconto sul conto, solo ruoli sconto)
             indice unico: un solo conto aperto per tavolo
payments     (migrazione 035) id, tenant_id, check_id, method ('cash' | 'card' | 'other'), amount, paid_by, paid_at

orders       + check_id (nullo = ordine pagato subito, come oggi)
```

- **Il totale del conto non si fida del client.** Lo calcola il server: somma dei totali degli ordini non annullati, più
  coperti × coperto, meno lo sconto sul conto. Il conto si chiude quando i pagamenti coprono il totale.
- **Stato del tavolo** non si memorizza: libero se non ha un conto aperto, occupato se ce l'ha, "conto richiesto" se
  `bill_requested_at` è valorizzato.
- **Pagamento per voce** (migrazione 036): `payment_items` (pagamento, riga d'ordine, quantità, quota in euro). L'importo lo calcola il server in centesimi: proporzionale alla quantità e l'ultima quota di una riga prende il resto. Una comanda con voci già pagate, o che scenderebbe sotto il già pagato, non si storna; le voci pagate non si scontano.
- Le righe degli ordini restano in `order_items` (Fase 1): lo stato per riga e la portata arrivano nella Fase 3.

## 4. Punto critico: cosa conta come incasso

Oggi "incasso" = ordine `completed`, e questa condizione era scritta in sei punti di quattro file:

| Dove | Cosa fa |
|---|---|
| `utils/statsSql.js` | righe vendute nelle statistiche |
| `routes/stats.js` (3 query) | totali, fasce orarie, confronto serate |
| `utils/session.js` | incasso atteso in contanti |
| `routes/exports.js` | CSV di sessione |

(`routes/sessions.js` e `routes/orders.js` nominano `completed` solo per i passaggi di stato, non per l'incasso.)

**Passo 2-0 (fatto, nessuna novità visibile):** la regola sta in un solo punto (`utils/revenue.js`, `isRevenue()`), usato da tutti, e un test
impedisce di riscriverla a mano altrove. I test di prima passano invariati. Solo dopo, in quell'unico punto, la regola diventa:

> è incasso un ordine `completed` senza conto, oppure un ordine non annullato di un conto `paid`.

L'incasso **atteso in contanti** (`expectedCashSql`) è: gli ordini pagati subito (tutti contanti) più **tutti i pagamenti `cash` dei conti della sessione**, anche parziali e anche se il conto è ancora aperto (i soldi sono nel cassetto); la carta è incasso ma non entra nel cassetto. Per le sagre non cambia nulla.

Chiusura serata: i **conti aperti** bloccano la chiusura (409 `OPEN_CHECKS`) senza scelta "lascia fuori": i soldi non sono stati incassati. Le comande dei tavoli non contano come `openOrders`, le tiene il conto. Un conto che non sarà pagato (cliente andato via) si chiude solo con un **abbuono** (omaggio o sconto sul conto, come per gli ordini) oppure **eliminando il tavolo con il suo conto** (annulla le comande, solo admin, con audit): decisione dell'utente, si realizza nel 2-5.

## 5. API (modulo `tables`)

Tutte dietro `authenticate → tenantScope` e `requireModule('tables')`; il tenant viene dal token.

```
GET/POST/PUT/DELETE  /rooms, /tables             admin (lettura: tutti i ruoli di cassa)
GET   /checks?status=open                          conti aperti (mappa della sala)
POST  /checks            { table_id, covers }      apre il conto (409 se il tavolo ne ha già uno)
GET   /checks/:id                                  conto con comande, righe, totale, pagamenti
POST  /checks/:id/bill-request                     chiede il conto
POST  /checks/:id/payments { method, amount | items:[{order_item_id,quantity}], tendered? }
                                                   registra un pagamento a importo o per voce; chiude il conto a residuo zero
POST  /checks/:id/close                            chiude un conto con residuo zero (es. dopo un omaggio)
POST  /checks/:id/adjust { order_item_ids, type, … } abbuono: omaggio/sconto sulle voci non pagate (ruoli sconto)
GET   /checks/:id/receipt[?payment_id=]            dati della ricevuta non fiscale (conto o singolo pagamento)
POST  /checks/:id/void { cancel_orders? }          annulla il conto (ruoli sconto, senza comande attive); con cancel_orders elimina anche le comande (solo admin); mai con pagamenti già incassati
POST  /checks/:id/move   { table_id }              sposta il conto su un altro tavolo libero (409 TABLE_BUSY se occupato)
POST  /checks/:id/merge  { into }                  unisce questo conto in un altro aperto; i due conti si bloccano in ordine di id
POST  /orders            + check_id                comanda su un conto aperto
```

Errori di business con `HttpError` (404, 409 `TABLE_BUSY`, `CHECK_CLOSED`, …). Ogni azione sensibile (apertura, pagamento,
annullo, spostamento) con `logAudit`.

Eventi WebSocket: `check_updated`, `table_updated`. Il KDS pubblico riceve il nome del tavolo e i coperti, mai importi.

## 6. Interfaccia

Il ristorante ha una **app propria** (`frontend/src/smarteats/`, scelta da `AppRouter.jsx` dal tipo del locale), non una variante della cassa delle sagre. La vista **Sala** (`smarteats/SalaPage.jsx`, con i componenti in `smarteats/sala/`) è operativa dal passo 2-6. Disposizione come la cassa: area di lavoro a sinistra (tavoli, oppure la carta durante una comanda) e **un solo pannello a destra** (`SidePanel`) che cambia vista senza finestre sopra le finestre: apri tavolo, conto (`CheckView`, azioni secondarie nel menu «⋯»), incasso (`PayView`), sconto (`AdjustView`), comanda (`DraftOrder`). Sotto i 1280 px il pannello è a tutto schermo. I calcoli di anteprima stanno in `checkMath.js`. Quanto segue descrive l'idea originale:
elenco o mappa dei tavoli per sala con stato; aprire un tavolo (coperti); il carrello esistente funziona in "modalità
tavolo" (invia la comanda al conto invece di pagarla); pannello del conto con righe, totale, richiesta del conto e pagamento.
Mobile e desktop come il resto dell'app.

**Offline:** i tavoli richiedono il server, perché lo stato del conto è condiviso fra più dispositivi. La cassa "banco" resta
offline-first come oggi. È un limite da dichiarare ai clienti, non un difetto da risolvere in questa fase.

## 7. Ordine dei passi

Ogni passo si può provare e rilasciare da solo; i primi due non cambiano nulla per le sagre.

| Passo | Cosa | Tocca DB | Rischio |
|---|---|---|---|
| 2-0 | Regola "incasso" in un solo punto (`utils/revenue.js`) | no | basso, con test di equivalenza |
| 2-1 | Modulo `tables`, migrazione 031: sale e tavoli, API e gestione admin | sì (nuove tabelle) | basso |
| 2-2 | Migrazione 032: `checks`, `payments`, `orders.check_id`; ciclo di vita del conto e totali | sì | medio |
| 2-3 | La regola "incasso" conosce i conti (statistiche, contanti, chiusura serata, CSV) | no | **alto**: si prova che le sagre non cambiano |
| 2-4 | Comanda su un conto: `POST /orders` con `check_id`, KDS e comanda con tavolo | no | medio |
| 2-5 | Pagamenti (contanti, carta, alla romana), chiusura conto, ricevuta non fiscale | no | medio |
| 2-6 | Interfaccia Sala: tavoli, apertura, carrello in modalità tavolo, pannello del conto | no | medio |
| 2-7 | Spostare un conto, unire due tavoli | no | basso |
| 2-8 | Pagamento per voce (`payment_items`) | sì | medio |
| 2-9 | Coperto e sconto sul conto | sì (impostazioni) | basso |
| 2-10 | Servizi (pranzo/cena) al posto delle "serate" | no | basso |

Prima del passo 2-3 e di ogni migrazione: backup. Dopo ogni passo: test di integrazione, lint, build e un giro a mano.

## 8. Decisioni da prendere

1. **Incasso dei conti:** conta quando il conto è pagato (consigliato; le comande servite ma non ancora pagate non sono denaro).
2. **Offline dei tavoli:** non supportato in questa fase (vedi §6).
3. **Ruolo cameriere:** nella Fase 2 bastano i ruoli esistenti (cassa, responsabile, admin); il ruolo `cameriere` con permessi
   propri (nessun pagamento, sconto o annullo) arriva con la Fase 3.
4. **Fiscale:** fuori, come deciso; la ricevuta del conto è un documento non fiscale.
