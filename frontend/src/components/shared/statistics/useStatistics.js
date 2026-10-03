import { useEffect, useState, useMemo, useCallback } from 'react';
import { fetchWithAuth } from '../../../utils/apiClient';

export const formatEuro = (v) => Number(v || 0).toFixed(2) + ' €';
export const formatMin = (v) => Number(v || 0).toFixed(1) + ' min';

export const activeHours = (data, key) => {
  const firstIndex = data.findIndex(d => d[key] > 0);
  if (firstIndex === -1) return [];
  const lastIndex = data.length - 1 - [...data].reverse().findIndex(d => d[key] > 0);
  return data.slice(firstIndex, lastIndex + 1);
};

// Riordina partendo dalle 12:00 per coprire il flusso 12:00 -> 03:00 senza spezzare la notte
export const reorderHours = (data) => [...data.slice(12), ...data.slice(0, 12)];

const empty = {
  totaleSerata: 0, importoMedio: 0, prodottoPiuVenduto: '',
  numeroTotaleOrdini: 0, incassoPerCategoria: [],
  ordiniPerFasciaOraria: [], prezzoMedioPerFasciaOraria: [],
  topProdotti: [], andamentoFatturato: [],
  tempiCompletamento: [], tempoMedioCompletamento: 0,
  confrontoSerate: [],
  unrealizedGiftRevenue: 0, topGiftProducts: []
};

export function useStatistics() {
  const [orders, setOrders] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [products, setProducts] = useState([]);
  const [selectedSessionIds, setSelectedSessionIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [topProductsMetric, setTopProductsMetric] = useState('count');
  const [h2hProduct, setH2hProduct] = useState('');
  const [h2hSessionA, setH2hSessionA] = useState('');
  const [h2hSessionB, setH2hSessionB] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [ordersData, sessionsData, productsData] = await Promise.all([
          fetchWithAuth('/orders'),
          fetchWithAuth('/sessions'),
          fetchWithAuth('/products'),
        ]);
        setOrders(Array.isArray(ordersData) ? ordersData : []);
        setSessions(Array.isArray(sessionsData) ? sessionsData : []);
        setProducts(Array.isArray(productsData) ? productsData : []);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const toggleSession = (id) => {
    const sid = String(id);
    setSelectedSessionIds(prev => prev.includes(sid) ? prev.filter(s => s !== sid) : [...prev, sid]);
  };

  const getOrdersBySession = useCallback((sessionId) =>
    orders.filter(o => o.status === 'completed' && String(o.session_id) === String(sessionId)),
  [orders]);

  const availableProducts = useMemo(() => {
    if (!h2hSessionA || !h2hSessionB) {
      return [...new Set(orders.flatMap(o => o.items?.map(i => i.name).filter(Boolean) || []))].sort();
    }
    const productsA = new Set(getOrdersBySession(h2hSessionA).flatMap(o => o.items?.map(i => i.name).filter(Boolean) || []));
    const productsB = new Set(getOrdersBySession(h2hSessionB).flatMap(o => o.items?.map(i => i.name).filter(Boolean) || []));
    return [...productsA].filter(p => productsB.has(p)).sort();
  }, [orders, getOrdersBySession, h2hSessionA, h2hSessionB]);

  useEffect(() => {
    if (h2hProduct && !availableProducts.includes(h2hProduct)) setH2hProduct('');
  }, [availableProducts, h2hProduct]);

  const h2hData = useMemo(() => {
    if (!h2hProduct || !h2hSessionA || !h2hSessionB) return null;
    const calculate = (sessionId) => {
      let qty = 0, revenue = 0;
      getOrdersBySession(sessionId).forEach(o => o.items?.forEach(i => {
        if (i.name === h2hProduct) { qty += Number(i.quantity || 0); revenue += Number(i.price || 0) * Number(i.quantity || 0); }
      }));
      return { qty, revenue: parseFloat(revenue.toFixed(2)) };
    };
    const a = calculate(h2hSessionA), b = calculate(h2hSessionB);
    return [
      { metric: 'Quantità venduta', A: a.qty, B: b.qty },
      { metric: 'Incasso (€)', A: a.revenue, B: b.revenue },
    ];
  }, [h2hProduct, h2hSessionA, h2hSessionB, getOrdersBySession]);

  const sessionAName = sessions.find(s => String(s.id) === String(h2hSessionA))?.name || 'Serata A';
  const sessionBName = sessions.find(s => String(s.id) === String(h2hSessionB))?.name || 'Serata B';

  const stats = useMemo(() => {
    if (!orders.length) return empty;

    let canceledFiltered = orders.filter(o => o.status === 'canceled');
    let filtered = orders.filter(o => o.status === 'completed');

    if (selectedSessionIds.length > 0 && sessions.length > 0) {
      const isOrderInSessions = (o) => selectedSessionIds.includes(String(o.session_id));
      filtered = filtered.filter(isOrderInSessions);
      canceledFiltered = canceledFiltered.filter(isOrderInSessions);
    }

    const canceledCount = canceledFiltered.length;
    const totaleStornato = canceledFiltered.reduce((sum, o) => sum + Number(o.total || 0), 0);

    if (!filtered.length) return { ...empty, canceledCount, totaleStornato: parseFloat(totaleStornato.toFixed(2)) };

    const totaleSerata = filtered.reduce((sum, o) => sum + Number(o.total || 0), 0);
    const importoMedio = totaleSerata / filtered.length;

    let takeawayCount = 0, eatInCount = 0;
    filtered.forEach(o => { o.is_takeaway ? takeawayCount++ : eatInCount++; });
    const pctTakeaway = ((takeawayCount / filtered.length) * 100).toFixed(1);

    const priceMap = {};
    products.forEach(p => { priceMap[p.id] = Number(p.price || 0); });
    let unrealizedGiftRevenue = 0;
    const giftRevenueByProduct = {};

    const productStats = {};
    const categoryIncome = {};
    filtered.forEach(o => o.items?.forEach(i => {
      if (!i.name) return;
      const qty = Number(i.quantity || 0), price = Number(i.price || 0), itemRevenue = price * qty;
      if (!productStats[i.name]) productStats[i.name] = { count: 0, revenue: 0 };
      productStats[i.name].count += qty;
      productStats[i.name].revenue += itemRevenue;
      const cat = i.category || 'Altro';
      categoryIncome[cat] = (categoryIncome[cat] || 0) + itemRevenue;
      const catalogPrice = priceMap[i.id] ?? price;
      if (price === 0 && catalogPrice > 0) {
        const missedRevenue = catalogPrice * qty;
        unrealizedGiftRevenue += missedRevenue;
        giftRevenueByProduct[i.name] = (giftRevenueByProduct[i.name] || 0) + missedRevenue;
      }
    }));

    const topGiftProducts = Object.entries(giftRevenueByProduct)
      .map(([product, missedRevenue]) => ({ product, missedRevenue: parseFloat(missedRevenue.toFixed(2)) }))
      .sort((a, b) => b.missedRevenue - a.missedRevenue).slice(0, 10);

    const prodottoPiuVenduto = Object.entries(productStats).sort((a, b) => b[1].count - a[1].count)[0]?.[0] || '';

    const topProdotti = Object.entries(productStats)
      .map(([name, data]) => ({ prodotto: name, count: data.count, revenue: parseFloat(data.revenue.toFixed(2)) }));

    const incassoPerCategoria = Object.entries(categoryIncome)
      .map(([categoria, totale]) => ({ categoria, totale: parseFloat(totale.toFixed(2)) }))
      .sort((a, b) => b.totale - a.totale);

    const ordiniPerFasciaOraria = Array.from({ length: 24 }, (_, h) => ({ ora: `${h}:00`, count: 0 }));
    const prezzoPerFascia = Array.from({ length: 24 }, (_, h) => ({ ora: `${h}:00`, total: 0, count: 0 }));
    filtered.forEach(o => {
      const h = new Date(o.created_at).getHours();
      ordiniPerFasciaOraria[h].count += 1;
      prezzoPerFascia[h].total += Number(o.total || 0);
      prezzoPerFascia[h].count += 1;
    });
    const prezzoMedioPerFasciaOraria = prezzoPerFascia.map(f => ({
      ora: f.ora, prezzoMedio: f.count > 0 ? parseFloat((f.total / f.count).toFixed(2)) : 0,
    }));

    const andamentoFatturato = Array.from({ length: 24 }, (_, h) => ({ ora: `${h}:00`, totale: 0 }));
    let cumulative = 0;
    [...filtered].sort((a, b) => new Date(a.created_at) - new Date(b.created_at)).forEach(o => {
      const h = new Date(o.created_at).getHours();
      cumulative += Number(o.total || 0);
      andamentoFatturato[h].totale = parseFloat(cumulative.toFixed(2));
    });

    const tempi = [];
    filtered.forEach(o => {
      if (o.created_at && o.completed_at) {
        const diff = (new Date(o.completed_at) - new Date(o.created_at)) / 60000;
        if (diff >= 0 && diff < 180) tempi.push({ ora: new Date(o.created_at).getHours(), diff });
      }
    });
    const tempoMedioCompletamento = tempi.length > 0 ? tempi.reduce((sum, t) => sum + t.diff, 0) / tempi.length : 0;
    const tempiCompletamento = Array.from({ length: 24 }, (_, h) => ({ ora: `${h}:00`, media: 0, count: 0 }));
    tempi.forEach(t => { tempiCompletamento[t.ora].media += t.diff; tempiCompletamento[t.ora].count += 1; });
    tempiCompletamento.forEach(t => { if (t.count > 0) t.media = parseFloat((t.media / t.count).toFixed(1)); });

    const confrontoSerate = sessions.map(s => {
      const so = orders.filter(o => o.status === 'completed' && o.session_id === s.id);
      const totale = so.reduce((sum, o) => sum + Number(o.total || 0), 0);
      return {
        id: s.id, name: s.name || new Date(s.start_time).toLocaleDateString('it-IT'),
        totale: parseFloat(totale.toFixed(2)), numero: so.length,
        medio: so.length > 0 ? parseFloat((totale / so.length).toFixed(2)) : 0,
      };
    });

    return {
      totaleSerata, importoMedio, prodottoPiuVenduto, numeroTotaleOrdini: filtered.length,
      incassoPerCategoria, ordiniPerFasciaOraria, prezzoMedioPerFasciaOraria, topProdotti,
      andamentoFatturato, tempiCompletamento, tempoMedioCompletamento, confrontoSerate,
      unrealizedGiftRevenue: parseFloat(unrealizedGiftRevenue.toFixed(2)), topGiftProducts,
      takeawayCount, eatInCount, pctTakeaway, canceledCount,
      totaleStornato: parseFloat(totaleStornato.toFixed(2)),
    };
  }, [orders, sessions, selectedSessionIds, products]);

  const sortedTopProdotti = useMemo(() => (
    [...stats.topProdotti].sort((a, b) => b[topProductsMetric] - a[topProductsMetric]).slice(0, 10)
  ), [stats.topProdotti, topProductsMetric]);

  return {
    orders, sessions, products, loading, error,
    selectedSessionIds, toggleSession, setSelectedSessionIds,
    stats, sortedTopProdotti, topProductsMetric, setTopProductsMetric,
    h2hProduct, setH2hProduct, h2hSessionA, setH2hSessionA, h2hSessionB, setH2hSessionB,
    availableProducts, h2hData, sessionAName, sessionBName,
  };
}
