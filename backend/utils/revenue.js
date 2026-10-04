// Cosa conta come incasso: l'unica definizione, usata da statistiche, incasso atteso e CSV.
// Il test tests/revenue.test.js impedisce di riscrivere la regola a mano altrove.
//
// Un ordine senza conto (sagre, banco) è incasso quando è completato. Un ordine di un conto di un tavolo è
// incasso quando il conto è pagato (e l'ordine non è annullato): le comande servite ma non ancora pagate non sono
// denaro (docs/design-tavoli.md, §4).

// Condizione SQL per l'ordine con alias `alias`: ordini che fanno parte dell'incasso.
export const isRevenue = (alias = 'o') =>
  `((${alias}.check_id IS NULL AND ${alias}.status = 'completed')
    OR (${alias}.check_id IS NOT NULL AND ${alias}.status <> 'canceled'
        AND EXISTS (SELECT 1 FROM checks rc WHERE rc.id = ${alias}.check_id AND rc.status = 'paid')))`;

// Contanti attesi nel cassetto per la sessione `$param`: gli ordini pagati subito (tutti in contanti) più i
// pagamenti in contanti ricevuti sui conti dei tavoli, anche parziali e anche se il conto è ancora aperto.
// Carta e altri metodi sono incasso ma non entrano nel cassetto.
export const expectedCashSql = (param = '$1') =>
  `(SELECT COALESCE(SUM(o.total), 0) FROM orders o WHERE o.check_id IS NULL AND ${isRevenue('o')} AND o.session_id = ${param})
   + (SELECT COALESCE(SUM(p.amount), 0) FROM payments p JOIN checks c ON c.id = p.check_id
      WHERE p.method = 'cash' AND c.session_id = ${param})`;

// Le comande vere, cioè quelle che passano dalla cucina: esclude la riga automatica del coperto (order_type 'cover'),
// che è incasso ma non una comanda. Serve a contare gli ordini e i tempi nelle statistiche.
export const isKitchenOrder = (alias = 'o') => `${alias}.order_type <> 'cover'`;
