// Statistiche: il database aggrega (routes/stats.js), qui si compone la risposta nella forma
// che la pagina Statistiche mostra. Funzioni pure, provate in tests/stats.test.js.

const round2 = (n) => parseFloat(Number(n || 0).toFixed(2));
const hourLabel = (h) => `${h}:00`;
const hours = () => Array.from({ length: 24 }, (_, h) => h);

/**
 * @param {object} input
 * @param {{n:number,total:string|number,takeaway:number,avg_minutes:number|null}} input.totals ordini completati
 * @param {{n:number,total:string|number}} input.canceled ordini annullati
 * @param {Array<{hour:number,n:number,total:string|number,avg_minutes:number|null,n_minutes:number}>} input.byHour
 * @param {Array<{product_id:number,name:string,category:string,quantity:string|number,revenue:string|number,missed:string|number}>} input.products
 */
export function buildStats({ totals, canceled, byHour, products }) {
  const canceledCount = canceled.n;
  const totaleStornato = round2(canceled.total);
  const empty = {
    totaleSerata: 0, importoMedio: 0, prodottoPiuVenduto: '', numeroTotaleOrdini: 0,
    incassoPerCategoria: [], ordiniPerFasciaOraria: [], prezzoMedioPerFasciaOraria: [],
    topProdotti: [], andamentoFatturato: [], tempiCompletamento: [], tempoMedioCompletamento: 0,
    unrealizedGiftRevenue: 0, topGiftProducts: [], canceledCount, totaleStornato,
  };
  if (!totals.n) return empty;

  const totaleSerata = Number(totals.total);
  const hourRow = (h) => byHour.find((r) => r.hour === h);

  const topProdotti = products
    .map((p) => ({ productId: Number(p.product_id), prodotto: p.name, count: Number(p.quantity), revenue: round2(p.revenue) }));
  const prodottoPiuVenduto = [...topProdotti].sort((a, b) => b.count - a.count)[0]?.prodotto || '';

  const categoryIncome = {};
  for (const p of products) categoryIncome[p.category || 'Altro'] = (categoryIncome[p.category || 'Altro'] || 0) + Number(p.revenue);
  const incassoPerCategoria = Object.entries(categoryIncome)
    .map(([categoria, totale]) => ({ categoria, totale: round2(totale) }))
    .sort((a, b) => b.totale - a.totale);

  const topGiftProducts = products
    .filter((p) => Number(p.missed) > 0)
    .map((p) => ({ product: p.name, missedRevenue: round2(p.missed) }))
    .sort((a, b) => b.missedRevenue - a.missedRevenue)
    .slice(0, 10);
  const unrealizedGiftRevenue = round2(products.reduce((sum, p) => sum + Number(p.missed), 0));

  // Fatturato cumulato nell'ordine della serata (da mezzogiorno a mezzogiorno), mostrato solo nelle ore con ordini
  const andamentoFatturato = hours().map((h) => ({ ora: hourLabel(h), totale: 0 }));
  let cumulative = 0;
  for (const h of [...hours().slice(12), ...hours().slice(0, 12)]) {
    const row = hourRow(h);
    if (!row) continue;
    cumulative += Number(row.total);
    andamentoFatturato[h].totale = round2(cumulative);
  }

  return {
    ...empty,
    totaleSerata,
    importoMedio: totaleSerata / totals.n,
    prodottoPiuVenduto,
    numeroTotaleOrdini: totals.n,
    incassoPerCategoria,
    ordiniPerFasciaOraria: hours().map((h) => ({ ora: hourLabel(h), count: hourRow(h)?.n ?? 0 })),
    prezzoMedioPerFasciaOraria: hours().map((h) => {
      const row = hourRow(h);
      return { ora: hourLabel(h), prezzoMedio: row?.n ? round2(Number(row.total) / row.n) : 0 };
    }),
    topProdotti,
    andamentoFatturato,
    tempiCompletamento: hours().map((h) => {
      const row = hourRow(h);
      return { ora: hourLabel(h), media: row?.n_minutes ? parseFloat(Number(row.avg_minutes).toFixed(1)) : 0, count: row?.n_minutes ?? 0 };
    }),
    tempoMedioCompletamento: totals.avg_minutes == null ? 0 : Number(totals.avg_minutes),
    unrealizedGiftRevenue,
    topGiftProducts,
    takeawayCount: totals.takeaway,
    eatInCount: totals.n - totals.takeaway,
    pctTakeaway: ((totals.takeaway / totals.n) * 100).toFixed(1),
  };
}

export function buildSessionComparison(rows) {
  return rows.map((r) => ({
    id: r.id,
    name: r.name || new Date(r.start_time).toLocaleDateString('it-IT'),
    totale: round2(r.total),
    numero: r.n,
    medio: r.n > 0 ? round2(Number(r.total) / r.n) : 0,
  }));
}
