// Dati dei grafici delle statistiche del ristorante: funzioni pure, con test.

// Le ore dall'apertura alla chiusura, anche quelle senza conti (zero), così l'asse è continuo e leggibile.
export function fillHours(byHour) {
  if (!byHour.length) return [];
  const byTime = new Map(byHour.map(h => [h.hour, h]));
  const first = Math.min(...byHour.map(h => h.hour)), last = Math.max(...byHour.map(h => h.hour));
  return Array.from({ length: last - first + 1 }, (_, i) => byTime.get(first + i) ?? { hour: first + i, checks: 0, covers: 0, revenue: 0 });
}

// Altezza (o larghezza) di una barra in percentuale del massimo; le barre positive hanno almeno 2% per restare visibili.
export function barPercent(value, max) {
  if (!(max > 0) || !(value > 0)) return 0;
  return Math.max(2, Math.round((value / max) * 1000) / 10);
}

// L'ora di punta: quella col maggior incasso (la prima, a parità). Nulla se non c'è incasso.
export function peakHour(hours) {
  const best = hours.reduce((b, h) => (h.revenue > (b?.revenue ?? 0) ? h : b), null);
  return best && best.revenue > 0 ? best : null;
}

export const hourLabel = (h) => `${String(h).padStart(2, '0')}:00`;

// «1 h 12 min», «45 min», «—» se manca.
export function formatDuration(minutes) {
  if (minutes === null || minutes === undefined) return '—';
  const m = Math.round(minutes);
  return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min` : `${m} min`;
}

export const METHOD_LABEL = { cash: 'Contanti', card: 'Carta', other: 'Altro' };
