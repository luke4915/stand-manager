// Stile comune dei grafici (recharts), allineato al tema chiaro/scuro e a quello di SmartEats: una serie nel colore
// d'accento, barre sottili, griglia appena visibile, assi senza linee.
export const tooltipStyle = {
  backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)',
  borderRadius: 8, color: 'var(--text-main)', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,.12)',
};
export const axis = { tick: { fontSize: 12, fill: 'var(--text-muted)' }, axisLine: false, tickLine: false };
export const grid = { stroke: 'var(--border)', strokeOpacity: 0.6, vertical: false };
export const cursor = { fill: 'var(--bg-card-2)' };
