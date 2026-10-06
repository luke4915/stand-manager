import { useEffect, useState, useMemo } from 'react';
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
  unrealizedGiftRevenue: 0, topGiftProducts: [],
  canceledCount: 0, totaleStornato: 0,
};

// Le statistiche le calcola il server (GET /stats): al browser arrivano solo i totali, mai gli ordini.
export function useStatistics(terms) {
  const [sessions, setSessions] = useState([]);
  const [stats, setStats] = useState(empty);
  const [selectedSessionIds, setSelectedSessionIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [topProductsMetric, setTopProductsMetric] = useState('count');
  const [h2hProduct, setH2hProduct] = useState('');
  const [h2hSessionA, setH2hSessionA] = useState('');
  const [h2hSessionB, setH2hSessionB] = useState('');
  const [availableProducts, setAvailableProducts] = useState([]);
  const [h2hData, setH2hData] = useState(null);

  useEffect(() => {
    fetchWithAuth('/sessions')
      .then(data => setSessions(Array.isArray(data) ? data : []))
      .catch(err => setError(err.message));
  }, []);

  // Si ricalcola a ogni cambio delle serate scelte; ogni richiesta sostituisce la precedente
  const sessionsParam = selectedSessionIds.join(',');
  useEffect(() => {
    let cancelled = false;
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const query = new URLSearchParams({ tz, ...(sessionsParam && { sessions: sessionsParam }) });
    fetchWithAuth(`/stats?${query}`)
      .then(data => { if (!cancelled) { setStats(data); setError(null); } })
      .catch(err => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [sessionsParam]);

  const toggleSession = (id) => {
    const sid = String(id);
    setSelectedSessionIds(prev => prev.includes(sid) ? prev.filter(s => s !== sid) : [...prev, sid]);
  };

  // Prodotti confrontabili: quelli venduti in entrambe le serate scelte (o tutti, finché non se ne scelgono due)
  useEffect(() => {
    let cancelled = false;
    const query = new URLSearchParams({ ...(h2hSessionA && { a: h2hSessionA }), ...(h2hSessionB && { b: h2hSessionB }) });
    fetchWithAuth(`/stats/shared-products?${query}`)
      .then(data => { if (!cancelled) setAvailableProducts(data); })
      .catch(() => { if (!cancelled) setAvailableProducts([]); });
    return () => { cancelled = true; };
  }, [h2hSessionA, h2hSessionB]);

  useEffect(() => {
    if (h2hProduct && !availableProducts.some(p => String(p.id) === h2hProduct)) setH2hProduct('');
  }, [availableProducts, h2hProduct]);

  useEffect(() => {
    if (!h2hProduct || !h2hSessionA || !h2hSessionB) { setH2hData(null); return; }
    let cancelled = false;
    const query = new URLSearchParams({ a: h2hSessionA, b: h2hSessionB, product: h2hProduct });
    fetchWithAuth(`/stats/head-to-head?${query}`)
      .then(data => { if (!cancelled) setH2hData(data); })
      .catch(() => { if (!cancelled) setH2hData(null); });
    return () => { cancelled = true; };
  }, [h2hProduct, h2hSessionA, h2hSessionB]);

  const sessionAName = sessions.find(s => String(s.id) === String(h2hSessionA))?.name || (terms?.defaultA ?? 'Serata A');
  const sessionBName = sessions.find(s => String(s.id) === String(h2hSessionB))?.name || (terms?.defaultB ?? 'Serata B');

  const sortedTopProdotti = useMemo(() => (
    [...stats.topProdotti].sort((a, b) => b[topProductsMetric] - a[topProductsMetric]).slice(0, 10)
  ), [stats.topProdotti, topProductsMetric]);

  return {
    sessions, loading, error,
    selectedSessionIds, toggleSession, setSelectedSessionIds,
    stats, sortedTopProdotti, topProductsMetric, setTopProductsMetric,
    h2hProduct, setH2hProduct, h2hSessionA, setH2hSessionA, h2hSessionB, setH2hSessionB,
    availableProducts, h2hData, sessionAName, sessionBName,
  };
}
