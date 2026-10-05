import { formatEuro } from '../sala/checkMath';
import { barPercent } from './chartData';

// Barre orizzontali (portate, piatti): etichetta a sinistra, valore a destra, una sola serie nel colore d'accento. Barre
// sottili ancorate a sinistra con l'estremità arrotondata; l'etichetta e il valore restano in colore del testo.
export const HBars = ({ rows, valueOf, format = (v) => v, hint }) => {
  const max = Math.max(0, ...rows.map(valueOf));
  return (
    <ul className="space-y-2.5">
      {rows.map(row => (
        <li key={row.key} title={hint?.(row)} className="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-3 text-sm">
          <span className="truncate text-[var(--text-main)]">{row.label}</span>
          <span className="h-2 rounded-full bg-[var(--bg-card-2)]" aria-hidden="true">
            <span className="block h-2 rounded-r-full rounded-l-sm bg-[var(--accent)]" style={{ width: `${barPercent(valueOf(row), max)}%` }} />
          </span>
          <span className="tabular-nums text-[var(--text-muted)] w-20 text-right">{format(valueOf(row))}</span>
        </li>
      ))}
    </ul>
  );
};

// Incasso per ora: barre verticali sottili sulla stessa linea di base, griglia appena visibile, valore al passaggio del
// mouse (o del dito) e l'ora di punta evidenziata; la stessa serie si legge anche come tabella.
export const HourBars = ({ hours, label, peak }) => {
  const max = Math.max(0, ...hours.map(h => h.revenue));
  return (
    <div>
      <div className="relative h-40 flex items-end gap-1.5 border-b border-[var(--border)]" role="img" aria-label="Incasso per ora">
        {[25, 50, 75].map(g => <span key={g} className="absolute inset-x-0 border-t border-[var(--border)]/50 pointer-events-none" style={{ bottom: `${g}%` }} aria-hidden="true" />)}
        {hours.map(h => (
          <div key={h.hour} className="group relative flex-1 min-w-0 h-full flex items-end justify-center">
            <span className={`w-full max-w-6 rounded-t-md transition-colors ${h.hour === peak ? 'bg-[var(--accent)]' : 'bg-[var(--accent)]/45 group-hover:bg-[var(--accent)]'}`}
              style={{ height: `${barPercent(h.revenue, max)}%` }} />
            <span className="pointer-events-none absolute bottom-full mb-2 left-1/2 -translate-x-1/2 hidden group-hover:block z-10 whitespace-nowrap rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-xs shadow-lg">
              <span className="block font-semibold text-[var(--text-main)]">{label(h.hour)}</span>
              <span className="block text-[var(--text-muted)] tabular-nums">{formatEuro(h.revenue)} · {h.checks} {h.checks === 1 ? 'conto' : 'conti'} · {h.covers} cop.</span>
            </span>
          </div>
        ))}
      </div>
      <div className="flex gap-1.5 pt-1.5">
        {hours.map(h => <span key={h.hour} className="flex-1 min-w-0 text-center text-xs text-[var(--text-muted)] tabular-nums">{hours.length > 12 && h.hour % 2 ? '' : String(h.hour).padStart(2, '0')}</span>)}
      </div>
    </div>
  );
};

export const HourTable = ({ hours, label }) => (
  <table className="w-full text-sm">
    <thead><tr className="text-left text-xs text-[var(--text-muted)]"><th className="py-1.5 font-medium">Ora</th><th className="font-medium text-right">Conti</th><th className="font-medium text-right">Coperti</th><th className="font-medium text-right">Incasso</th></tr></thead>
    <tbody className="tabular-nums text-[var(--text-main)]">
      {hours.map(h => <tr key={h.hour} className="border-t border-[var(--border)]"><td className="py-1.5">{label(h.hour)}</td><td className="text-right">{h.checks}</td><td className="text-right">{h.covers}</td><td className="text-right">{formatEuro(h.revenue)}</td></tr>)}
    </tbody>
  </table>
);
