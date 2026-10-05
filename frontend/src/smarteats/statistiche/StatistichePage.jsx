import { useState, useEffect, useMemo } from 'react';
import { fetchWithAuth } from '../../utils/apiClient';
import { useToast } from '../../context/useToast';
import { formatEuro } from '../sala/checkMath';
import { segment, segmentBox, input } from '../sala/ui';
import { HBars, HourBars, HourTable } from './Bars';
import { fillHours, peakHour, hourLabel, formatDuration, METHOD_LABEL } from './chartData';

const dateLabel = (iso) => new Date(iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });

const Kpi = ({ label, value, note }) => (
  <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
    <p className="text-xs text-[var(--text-muted)]">{label}</p>
    <p className="mt-1 text-2xl font-semibold tabular-nums text-[var(--text-main)]">{value}</p>
    {note && <p className="mt-0.5 text-xs text-[var(--text-muted)]">{note}</p>}
  </div>
);

const Card = ({ title, aside, children }) => (
  <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
    <header className="flex items-center justify-between gap-3 mb-4"><h3 className="text-sm font-semibold text-[var(--text-main)]">{title}</h3>{aside}</header>
    {children}
  </section>
);

const Empty = ({ children }) => <p className="text-sm text-[var(--text-muted)] py-4">{children}</p>;

// Statistiche del ristorante: coperti, scontrino medio per coperto, durata e rotazione dei conti, andamento per ora,
// portate, piatti più venduti, tempi di cucina, sconti e incassi per metodo. Un servizio alla volta, o tutti insieme.
const StatistichePage = () => {
  const { showToast } = useToast();
  const [sessions, setSessions] = useState([]);
  const [sessionId, setSessionId] = useState(undefined);  // null = tutti i servizi; undefined finché non si sa
  const [stats, setStats] = useState(null);
  const [asTable, setAsTable] = useState(false);

  useEffect(() => {
    fetchWithAuth('/sessions').then(list => { setSessions(list); setSessionId(list[0]?.id ?? null); }).catch(err => showToast(err.message, 'error'));
  }, [showToast]);

  useEffect(() => {
    if (sessionId === undefined) return;
    setStats(null);
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    fetchWithAuth(`/stats/restaurant?tz=${encodeURIComponent(tz)}${sessionId ? `&sessions=${sessionId}` : ''}`)
      .then(setStats).catch(err => showToast(err.message, 'error'));
  }, [sessionId, showToast]);

  const hours = useMemo(() => fillHours(stats?.byHour ?? []), [stats]);
  const peak = peakHour(hours);
  const t = stats?.totals;

  return (
    <div className="space-y-5 pb-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-[var(--text-main)]">Statistiche</h2>
          <p className="text-sm text-[var(--text-muted)]">Contano i conti pagati.</p>
        </div>
        <select className={`${input} !w-64`} aria-label="Servizio" value={sessionId ?? ''} onChange={e => setSessionId(e.target.value ? Number(e.target.value) : null)}>
          <option value="">Tutti i servizi</option>
          {sessions.map(s => <option key={s.id} value={s.id}>{s.name} · {dateLabel(s.start_time)}</option>)}
        </select>
      </header>

      {!stats && <p className="text-sm text-[var(--text-muted)]">Caricamento…</p>}
      {stats && t.checks === 0 && <Empty>Nessun conto pagato in questo periodo.</Empty>}
      {stats && t.checks > 0 && (
        <>
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <Kpi label="Incasso" value={formatEuro(t.revenue)} />
            <Kpi label="Coperti" value={t.covers} note={`${t.checks} ${t.checks === 1 ? 'conto' : 'conti'}`} />
            <Kpi label="Per coperto" value={t.avgPerCover === null ? '—' : formatEuro(t.avgPerCover)} note="scontrino medio" />
            <Kpi label="Per conto" value={formatEuro(t.avgCheck)} note="scontrino medio" />
            <Kpi label="Durata del conto" value={formatDuration(t.avgDurationMinutes)} note="in media" />
            <Kpi label="Rotazione" value={t.rotation === null ? '—' : `${t.rotation}×`} note={`${t.tablesUsed} ${t.tablesUsed === 1 ? 'tavolo' : 'tavoli'} usati`} />
          </div>

          <Card title="Incasso per ora" aside={
            <div className={`${segmentBox} w-44`} role="tablist" aria-label="Vista">
              <button role="tab" aria-selected={!asTable} className={segment(!asTable)} onClick={() => setAsTable(false)}>Grafico</button>
              <button role="tab" aria-selected={asTable} className={segment(asTable)} onClick={() => setAsTable(true)}>Tabella</button>
            </div>}>
            {asTable ? <HourTable hours={hours} label={hourLabel} /> : <HourBars hours={hours} label={hourLabel} peak={peak?.hour} />}
            {peak && !asTable && <p className="mt-3 text-xs text-[var(--text-muted)]">Ora di punta: <span className="text-[var(--text-main)] font-medium">{hourLabel(peak.hour)}</span> con {formatEuro(peak.revenue)}.</p>}
          </Card>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card title="Per portata">
              {stats.courses.length === 0 ? <Empty>Nessun dato.</Empty>
                : <HBars rows={stats.courses.map(c => ({ key: c.course, label: c.course, ...c }))} valueOf={r => r.revenue} format={formatEuro} hint={r => `${r.quantity} piatti`} />}
            </Card>
            <Card title="Piatti più venduti">
              {stats.topProducts.length === 0 ? <Empty>Nessun dato.</Empty>
                : <HBars rows={stats.topProducts.map(p => ({ key: p.id ?? p.name, label: p.name, ...p }))} valueOf={r => r.quantity} format={v => `${v} pz`} hint={r => formatEuro(r.revenue)} />}
            </Card>
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            <Card title="Tempi di cucina">
              {stats.kitchen.dishes === 0 ? <Empty>Servono piatti segnati pronti dalla cucina.</Empty> : (
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between"><dt className="text-[var(--text-muted)]">In media</dt><dd className="font-semibold tabular-nums text-[var(--text-main)]">{formatDuration(stats.kitchen.avgMinutes)}</dd></div>
                  {stats.kitchen.kitchen !== null && <div className="flex justify-between"><dt className="text-[var(--text-muted)]">Cucina</dt><dd className="tabular-nums text-[var(--text-main)]">{formatDuration(stats.kitchen.kitchen)}</dd></div>}
                  {stats.kitchen.bar !== null && <div className="flex justify-between"><dt className="text-[var(--text-muted)]">Bar</dt><dd className="tabular-nums text-[var(--text-main)]">{formatDuration(stats.kitchen.bar)}</dd></div>}
                  <p className="text-xs text-[var(--text-muted)] pt-1">Da quando la portata esce a quando il piatto è pronto · {stats.kitchen.dishes} piatti.</p>
                </dl>
              )}
            </Card>
            <Card title="Incassi per metodo">
              {stats.payments.length === 0 ? <Empty>Nessun pagamento.</Empty>
                : <HBars rows={stats.payments.map(p => ({ key: p.method, label: METHOD_LABEL[p.method] ?? p.method, ...p }))} valueOf={r => r.amount} format={formatEuro} />}
            </Card>
            <Card title="Sconti e omaggi">
              {stats.discounts.lines === 0 ? <Empty>Nessuno sconto né omaggio.</Empty> : (
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between"><dt className="text-[var(--text-muted)]">Sconti</dt><dd className="font-semibold tabular-nums text-[var(--text-main)]">{formatEuro(stats.discounts.discount)}</dd></div>
                  <div className="flex justify-between"><dt className="text-[var(--text-muted)]">Omaggi</dt><dd className="font-semibold tabular-nums text-[var(--text-main)]">{formatEuro(stats.discounts.gift)}</dd></div>
                  <p className="text-xs text-[var(--text-muted)] pt-1">Valore a listino su {stats.discounts.lines} {stats.discounts.lines === 1 ? 'riga' : 'righe'}.</p>
                </dl>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
};

export default StatistichePage;
