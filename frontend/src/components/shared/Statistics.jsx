import React, { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts';
import { Download, X, Check, FileText } from 'lucide-react';

import { fetchWithAuth } from '../../utils/apiClient';
import { useToast } from '../../context/useToast';
import StatCard from './statistics/StatCard';
import ChartCard from './statistics/ChartCard';
import { tooltipStyle, axis, grid, cursor } from './statistics/chartStyles';
import { useStatistics, formatEuro, formatMin, activeHours, reorderHours } from './statistics/useStatistics';
import { exportStatsPdf } from './statistics/pdfExport';
import { useAuth } from '../../context/useAuth';
import { termsFor } from '../../utils/terms';

const Statistics = () => {
  const { showToast } = useToast();
  const { user } = useAuth();
  const terms = termsFor(user?.businessType);
  const {
    sessions, loading, error,
    selectedSessionIds, toggleSession, setSelectedSessionIds,
    stats, sortedTopProdotti, topProductsMetric, setTopProductsMetric,
    h2hProduct, setH2hProduct, h2hSessionA, setH2hSessionA, h2hSessionB, setH2hSessionB,
    availableProducts, h2hData, sessionAName, sessionBName,
  } = useStatistics(terms);

  const [isExportModalOpen, setIsExportModalOpen] = useState(false);

  const handleExportCSV = async (session) => {
    try {
      const res = await fetchWithAuth(`/exports/session/${session.id}/csv`, { raw: true });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `report_${(session.name || `sessione_${session.id}`).replace(/[^a-z0-9]/gi, '_').toLowerCase()}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setIsExportModalOpen(false);
    } catch (err) {
      showToast(`Impossibile scaricare il CSV: ${err.message}`, 'error');
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-[var(--text-muted)]">
      <p className="text-sm">Caricamento…</p>
    </div>
  );

  if (error) return (
    <div className="flex items-center justify-center h-64 text-red-500">
      <p className="text-sm">{error}</p>
    </div>
  );

  const closedSessions = sessions.filter(s => !!s.end_time);

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-[var(--text-main)]">Statistiche</h2>
          <p className="text-sm text-[var(--text-muted)]">
            {selectedSessionIds.length > 0 ? `${selectedSessionIds.length} ${selectedSessionIds.length === 1 ? 'sessione selezionata' : 'sessioni selezionate'}` : 'Tutte le sessioni'}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setIsExportModalOpen(true)}
            className="inline-flex items-center gap-2 h-10 px-4 rounded-lg border border-[var(--border)] text-sm font-medium text-[var(--text-main)] hover:bg-[var(--bg-card-2)] cursor-pointer transition-colors">
            <Download size={15} /> Esporta CSV
          </button>
          <button onClick={() => exportStatsPdf(stats, sessions, selectedSessionIds, terms)}
            className="inline-flex items-center gap-2 h-10 px-4 rounded-lg border border-[var(--border)] text-sm font-medium text-[var(--text-main)] hover:bg-[var(--bg-card-2)] cursor-pointer transition-colors">
            <FileText size={15} /> Esporta PDF
          </button>
        </div>
      </div>

      {sessions.length > 0 && (
        <ChartCard title={terms.filter}>
          <div className="flex flex-wrap gap-2">
            {sessions.map(s => {
              const selected = selectedSessionIds.includes(String(s.id));
              return (
                <button key={s.id} onClick={() => toggleSession(s.id)}
                  aria-pressed={selected}
                  className={`flex items-center gap-1.5 h-9 px-3 rounded-lg border text-sm font-medium transition-colors cursor-pointer ${selected
                    ? 'bg-[var(--accent)]/10 border-[var(--accent)] text-[var(--accent)]'
                    : 'border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-main)]'
                    }`}>
                  {selected && <Check size={14} />}
                  {s.name || new Date(s.start_time).toLocaleDateString('it-IT')}
                  {!s.end_time && <span className="text-xs opacity-70">in corso</span>}
                </button>
              );
            })}
            {selectedSessionIds.length > 0 && (
              <button onClick={() => setSelectedSessionIds([])}
                className="h-9 px-3 rounded-lg text-sm text-[var(--text-muted)] hover:text-red-500 transition-colors cursor-pointer">
                Rimuovi filtri
              </button>
            )}
          </div>
        </ChartCard>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
        <StatCard label={terms.total} value={formatEuro(stats.totaleSerata)} />
        <StatCard label="Importo medio" value={formatEuro(stats.importoMedio)} />
        <StatCard label="Totale ordini" value={stats.numeroTotaleOrdini} />
        <StatCard label="Top prodotto" value={stats.prodottoPiuVenduto || '—'} />
        <StatCard label="Omaggi" value={formatEuro(stats.unrealizedGiftRevenue)} sub="Valore a listino dei prodotti regalati" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-[var(--bg-card)] rounded-xl p-4 border border-[var(--border)] flex items-center justify-between gap-3">
          <div>
            <p className="text-xs text-[var(--text-muted)]">Ripartizione ordini</p>
            <p className="text-xl font-semibold text-[var(--text-main)] mt-1">
              {stats.pctTakeaway}% Asporto <span className="text-xs font-normal text-[var(--text-muted)]">({stats.takeawayCount} ordini)</span>
            </p>
          </div>
          <div className="text-right text-sm text-[var(--text-muted)]">
            In loco: <span className="text-[var(--text-main)]">{stats.eatInCount}</span>
          </div>
        </div>

        <div className="bg-[var(--bg-card)] rounded-xl p-4 border border-[var(--border)] flex items-center justify-between gap-3">
          <div>
            <p className="text-xs text-[var(--text-muted)]">Ordini annullati e storni</p>
            <p className="text-xl font-semibold tabular-nums text-red-500 mt-1">{formatEuro(stats.totaleStornato)}</p>
          </div>
          <div className="text-right text-sm text-[var(--text-muted)]">
            Conteggio: <span className="text-[var(--text-main)]">{stats.canceledCount} ordini</span>
          </div>
        </div>
      </div>

      {stats.numeroTotaleOrdini === 0 ? (
        <div className="flex items-center justify-center h-48 text-[var(--text-muted)]">
          <p className="text-sm">Nessun dato disponibile.</p>
        </div>
      ) : (
        <>
          {stats.incassoPerCategoria.length > 0 && (
            <ChartCard title="Incasso per categoria">
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={stats.incassoPerCategoria}>
                  <CartesianGrid {...grid} />
                  <XAxis dataKey="categoria" {...axis} />
                  <YAxis {...axis} />
                  <Tooltip cursor={cursor} contentStyle={tooltipStyle} formatter={(v) => formatEuro(v)} />
                  <Bar maxBarSize={28} dataKey="totale" fill="var(--accent)" name="Incasso" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          )}

          <ChartCard title="Ordini per fascia oraria">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={activeHours(reorderHours(stats.ordiniPerFasciaOraria), 'count')}>
                  <CartesianGrid {...grid} />
                <XAxis dataKey="ora" {...axis} />
                <YAxis {...axis} />
                <Tooltip cursor={cursor} contentStyle={tooltipStyle} />
                <Bar maxBarSize={28} dataKey="count" fill="var(--accent)" name="Ordini" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard
            title="Top 10 prodotti"
            action={
              <div className="flex gap-1 p-1 rounded-lg bg-[var(--bg-main)] border border-[var(--border)]" role="tablist" aria-label="Metrica">
                {[['count', 'Quantità'], ['revenue', 'Incasso']].map(([id, name]) => (
                  <button key={id} role="tab" aria-selected={topProductsMetric === id} onClick={() => setTopProductsMetric(id)}
                    className={`h-8 px-3 rounded-md text-sm font-medium transition cursor-pointer ${topProductsMetric === id ? 'bg-[var(--bg-card)] text-[var(--text-main)] shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}>{name}</button>
                ))}
              </div>
            }
          >
            <ResponsiveContainer width="100%" height={450}>
              <BarChart data={sortedTopProdotti} layout="vertical">
                <XAxis type="number" {...axis} />
                <YAxis type="category" dataKey="prodotto" {...axis} width={180} />
                <Tooltip cursor={cursor} contentStyle={tooltipStyle} formatter={(v) => (topProductsMetric === 'revenue' ? formatEuro(v) : v)} />
                <Bar maxBarSize={28} dataKey={topProductsMetric} fill="var(--accent)" name={topProductsMetric === 'revenue' ? 'Incasso' : 'Quantità'} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          {sessions.length > 1 && (
            <ChartCard title={terms.h2h}>
              <div className="flex flex-wrap gap-2 mb-4">
                <select value={h2hSessionA} onChange={e => setH2hSessionA(e.target.value)}
                  className="h-10 px-3 rounded-lg border border-[var(--border)] bg-[var(--bg-card-2)] text-sm text-[var(--text-main)]">
                  <option value="">{terms.pickA}</option>
                  {sessions.map(s => <option key={s.id} value={s.id}>{s.name || new Date(s.start_time).toLocaleDateString('it-IT')}</option>)}
                </select>
                <select value={h2hSessionB} onChange={e => setH2hSessionB(e.target.value)}
                  className="h-10 px-3 rounded-lg border border-[var(--border)] bg-[var(--bg-card-2)] text-sm text-[var(--text-main)]">
                  <option value="">{terms.pickB}</option>
                  {sessions.map(s => <option key={s.id} value={s.id}>{s.name || new Date(s.start_time).toLocaleDateString('it-IT')}</option>)}
                </select>
                <select value={h2hProduct} onChange={e => setH2hProduct(e.target.value)}
                  className="h-10 px-3 rounded-lg border border-[var(--border)] bg-[var(--bg-card-2)] text-sm text-[var(--text-main)]">
                  <option value="">Seleziona prodotto…</option>
                  {availableProducts.map(p => <option key={p.id} value={String(p.id)}>{p.name}</option>)}
                </select>
              </div>

              {h2hData ? (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={h2hData}>
                  <CartesianGrid {...grid} />
                    <XAxis dataKey="metric" {...axis} />
                    <YAxis {...axis} />
                    <Tooltip cursor={cursor} contentStyle={tooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar maxBarSize={28} dataKey="A" name={sessionAName} fill="var(--accent)" radius={[4, 4, 0, 0]} />
                    <Bar maxBarSize={28} dataKey="B" name={sessionBName} fill="var(--text-muted)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-xs text-[var(--text-muted)] text-center py-8">{terms.selectTwo}</p>
              )}
            </ChartCard>
          )}

          <ChartCard title="Prezzo medio ordine per fascia oraria">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={activeHours(reorderHours(stats.prezzoMedioPerFasciaOraria), 'prezzoMedio')}>
                  <CartesianGrid {...grid} />
                <XAxis dataKey="ora" {...axis} />
                <YAxis {...axis} />
                <Tooltip cursor={cursor} contentStyle={tooltipStyle} formatter={(v) => formatEuro(v)} />
                <Bar maxBarSize={28} dataKey="prezzoMedio" fill="var(--accent)" name="Prezzo medio" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Andamento fatturato cumulativo">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={activeHours(reorderHours(stats.andamentoFatturato), 'totale')}>
                  <CartesianGrid {...grid} />
                <XAxis dataKey="ora" {...axis} />
                <YAxis {...axis} />
                <Tooltip cursor={cursor} contentStyle={tooltipStyle} formatter={(v) => formatEuro(v)} />
                <Line type="monotone" dataKey="totale" stroke="var(--accent)" name="Fatturato" dot={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          {stats.topGiftProducts.length > 0 && (
            <ChartCard title="Mancato incasso per omaggi (per prodotto)">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={stats.topGiftProducts} layout="vertical">
                  <XAxis type="number" {...axis} />
                  <YAxis type="category" dataKey="product" {...axis} width={120} />
                  <Tooltip cursor={cursor} contentStyle={tooltipStyle} formatter={(v) => formatEuro(v)} />
                  <Bar maxBarSize={28} dataKey="missedRevenue" fill="var(--accent)" name="Mancato incasso" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          )}

          <ChartCard title={`Tempo medio completamento ordini — ${formatMin(stats.tempoMedioCompletamento)}`}>
            {stats.tempoMedioCompletamento === 0 ? (
              <p className="text-xs text-[var(--text-muted)] text-center py-8">
                Nessun ordine con tempo di completamento registrato. I tempi vengono registrati solo in modalità ordini avanzata.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={activeHours(reorderHours(stats.tempiCompletamento), 'media')}>
                  <CartesianGrid {...grid} />
                  <XAxis dataKey="ora" {...axis} />
                  <YAxis {...axis} />
                  <Tooltip cursor={cursor} contentStyle={tooltipStyle} formatter={(v) => formatMin(v)} />
                  <Bar maxBarSize={28} dataKey="media" fill="var(--accent)" name="Tempo medio (min)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

        </>
      )}

      {isExportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
              <div>
                <h3 className="text-base font-semibold text-[var(--text-main)]">Esporta report CSV</h3>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">Solo sessioni concluse</p>
              </div>
              <button onClick={() => setIsExportModalOpen(false)} className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-main)] rounded-lg hover:bg-[var(--bg-input)] transition-colors">
                <X size={18} />
              </button>
            </div>
            <div className="p-4 max-h-72 overflow-y-auto space-y-2 no-scrollbar">
              {closedSessions.length === 0 ? (
                <p className="text-sm text-center text-[var(--text-muted)] py-6">{terms.none}</p>
              ) : closedSessions.map(s => (
                <div key={s.id} className="flex items-center justify-between p-3 rounded-lg bg-[var(--bg-card-2)] border border-[var(--border)] hover:border-[var(--border-hover)] transition-colors">
                  <div className="min-w-0 flex-1 pr-2">
                    <p className="text-sm font-medium text-[var(--text-main)] truncate">{s.name || `${terms.column} ${s.id}`}</p>
                    <p className="text-xs text-[var(--text-muted)]">
                      Chiusa il {new Date(s.end_time).toLocaleDateString('it-IT')} alle {new Date(s.end_time).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <button onClick={() => handleExportCSV(s)} className="p-2 rounded-lg bg-[var(--accent)]/10 hover:bg-[var(--accent)] text-[var(--accent)] hover:text-white transition-all shrink-0">
                    <Download size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Statistics;