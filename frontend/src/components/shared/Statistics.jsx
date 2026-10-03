import React, { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts';
import { Download, X, CheckSquare, Square, FileText } from 'lucide-react';

import { fetchWithAuth } from '../../utils/apiClient';
import { useToast } from '../../context/useToast';
import StatCard from './statistics/StatCard';
import ChartCard from './statistics/ChartCard';
import { tooltipStyle } from './statistics/chartStyles';
import { useStatistics, formatEuro, formatMin, activeHours, reorderHours } from './statistics/useStatistics';
import { exportStatsPdf } from './statistics/pdfExport';

const Statistics = () => {
  const { showToast } = useToast();
  const {
    sessions, loading, error,
    selectedSessionIds, toggleSession, setSelectedSessionIds,
    stats, sortedTopProdotti, topProductsMetric, setTopProductsMetric,
    h2hProduct, setH2hProduct, h2hSessionA, setH2hSessionA, h2hSessionB, setH2hSessionB,
    availableProducts, h2hData, sessionAName, sessionBName,
  } = useStatistics();

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
      <p className="font-black uppercase tracking-widest text-xs">Caricamento...</p>
    </div>
  );

  if (error) return (
    <div className="flex items-center justify-center h-64 text-red-500">
      <p className="font-black uppercase tracking-widest text-xs">{error}</p>
    </div>
  );

  const closedSessions = sessions.filter(s => !!s.end_time);

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-4xl font-black tracking-tighter text-[var(--text-main)]">STATISTICHE</h2>
          <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] mt-1">
            {selectedSessionIds.length > 0 ? `${selectedSessionIds.length} sessioni selezionate` : 'Tutte le sessioni'}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setIsExportModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] cursor-pointer text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all">
            <Download size={14} /> Esporta CSV
          </button>
          <button onClick={() => exportStatsPdf(stats, sessions, selectedSessionIds)}
            className="flex items-center gap-2 px-4 py-2.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] cursor-pointer text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all">
            <FileText size={14} /> Esporta PDF
          </button>
        </div>
      </div>

      {sessions.length > 0 && (
        <ChartCard title="Filtra per sessione">
          <div className="flex flex-wrap gap-2">
            {sessions.map(s => {
              const selected = selectedSessionIds.includes(String(s.id));
              return (
                <button key={s.id} onClick={() => toggleSession(s.id)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-bold transition-all ${selected
                    ? 'bg-[var(--accent)] border-[var(--accent)] text-white'
                    : 'bg-[var(--bg-card-2)] border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--accent)]/50'
                    }`}>
                  {selected ? <CheckSquare size={13} /> : <Square size={13} />}
                  {s.name || new Date(s.start_time).toLocaleDateString('it-IT')}
                  {!s.end_time && <span className="text-[9px] opacity-70">(in corso)</span>}
                </button>
              );
            })}
            {selectedSessionIds.length > 0 && (
              <button onClick={() => setSelectedSessionIds([])}
                className="px-3 py-2 rounded-xl border border-[var(--border)] text-xs text-[var(--text-muted)] hover:text-red-500 hover:border-red-500/30 transition-all">
                Rimuovi filtri
              </button>
            )}
          </div>
        </ChartCard>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Totale serata" value={formatEuro(stats.totaleSerata)} />
        <StatCard label="Importo medio" value={formatEuro(stats.importoMedio)} />
        <StatCard label="Totale ordini" value={stats.numeroTotaleOrdini} />
        <StatCard label="Top prodotto" value={stats.prodottoPiuVenduto || '—'} />
        <StatCard label="Guadagno non realizzato (omaggi)" value={formatEuro(stats.unrealizedGiftRevenue)} sub="Prodotti regalati a prezzo di listino" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-[var(--bg-card)] rounded-xl p-4 border border-[var(--border)] flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">Ripartizione Ordini</p>
            <p className="text-xl font-black text-[var(--text-main)] mt-1">
              {stats.pctTakeaway}% Asporto <span className="text-xs font-normal text-[var(--text-muted)]">({stats.takeawayCount} ordini)</span>
            </p>
          </div>
          <div className="text-right text-xs font-bold text-[var(--text-muted)]">
            In loco: <span className="text-[var(--text-main)]">{stats.eatInCount}</span>
          </div>
        </div>

        <div className="bg-[var(--bg-card)] rounded-xl p-4 border border-[var(--border)] flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">Ordini Annullati / Storni</p>
            <p className="text-xl font-black text-red-500 mt-1">{formatEuro(stats.totaleStornato)}</p>
          </div>
          <div className="text-right text-xs font-bold text-[var(--text-muted)]">
            Conteggio: <span className="text-[var(--text-main)]">{stats.canceledCount} ordini</span>
          </div>
        </div>
      </div>

      {stats.numeroTotaleOrdini === 0 ? (
        <div className="flex items-center justify-center h-48 text-[var(--text-muted)]">
          <p className="font-black uppercase tracking-widest text-xs">Nessun dato disponibile</p>
        </div>
      ) : (
        <>
          {stats.incassoPerCategoria.length > 0 && (
            <ChartCard title="Incasso per categoria">
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={stats.incassoPerCategoria}>
                  <XAxis dataKey="categoria" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v) => formatEuro(v)} />
                  <Bar dataKey="totale" fill="var(--accent)" name="Incasso" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          )}

          <ChartCard title="Ordini per fascia oraria">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={activeHours(reorderHours(stats.ordiniPerFasciaOraria), 'count')}>
                <XAxis dataKey="ora" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="count" fill="var(--accent)" name="Ordini" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard
            title="Top 10 prodotti"
            action={
              <div className="flex bg-[var(--bg-card-2)] p-1 rounded-lg border border-[var(--border)]">
                <button onClick={() => setTopProductsMetric('count')}
                  className={`px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider transition-all ${topProductsMetric === 'count' ? 'bg-[var(--accent)] text-white shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}>
                  Quantità
                </button>
                <button onClick={() => setTopProductsMetric('revenue')}
                  className={`px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider transition-all ${topProductsMetric === 'revenue' ? 'bg-[var(--accent)] text-white shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}>
                  Incasso (€)
                </button>
              </div>
            }
          >
            <ResponsiveContainer width="100%" height={450}>
              <BarChart data={sortedTopProdotti} layout="vertical">
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="prodotto" tick={{ fontSize: 11 }} width={180} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v) => (topProductsMetric === 'revenue' ? formatEuro(v) : v)} />
                <Bar dataKey={topProductsMetric} fill="var(--accent)" name={topProductsMetric === 'revenue' ? 'Incasso' : 'Quantità'} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          {sessions.length > 1 && (
            <ChartCard title="Confronto prodotto tra serate (head to head)">
              <div className="flex flex-wrap gap-2 mb-4">
                <select value={h2hSessionA} onChange={e => setH2hSessionA(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--bg-card-2)] text-xs font-bold text-[var(--text-main)]">
                  <option value="">Serata A…</option>
                  {sessions.map(s => <option key={s.id} value={s.id}>{s.name || new Date(s.start_time).toLocaleDateString('it-IT')}</option>)}
                </select>
                <select value={h2hSessionB} onChange={e => setH2hSessionB(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--bg-card-2)] text-xs font-bold text-[var(--text-main)]">
                  <option value="">Serata B…</option>
                  {sessions.map(s => <option key={s.id} value={s.id}>{s.name || new Date(s.start_time).toLocaleDateString('it-IT')}</option>)}
                </select>
                <select value={h2hProduct} onChange={e => setH2hProduct(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--bg-card-2)] text-xs font-bold text-[var(--text-main)]">
                  <option value="">Seleziona prodotto…</option>
                  {availableProducts.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>

              {h2hData ? (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={h2hData}>
                    <XAxis dataKey="metric" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="A" name={sessionAName} fill="var(--accent)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="B" name={sessionBName} fill="var(--text-muted)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-xs text-[var(--text-muted)] text-center py-8">Seleziona un prodotto e due serate da confrontare.</p>
              )}
            </ChartCard>
          )}

          <ChartCard title="Prezzo medio ordine per fascia oraria">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={activeHours(reorderHours(stats.prezzoMedioPerFasciaOraria), 'prezzoMedio')}>
                <XAxis dataKey="ora" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v) => formatEuro(v)} />
                <Bar dataKey="prezzoMedio" fill="var(--accent)" name="Prezzo medio" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Andamento fatturato cumulativo">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={activeHours(reorderHours(stats.andamentoFatturato), 'totale')}>
                <XAxis dataKey="ora" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v) => formatEuro(v)} />
                <Line type="monotone" dataKey="totale" stroke="var(--accent)" name="Fatturato" dot={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          {stats.topGiftProducts.length > 0 && (
            <ChartCard title="Mancato incasso per omaggi (per prodotto)">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={stats.topGiftProducts} layout="vertical">
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="product" tick={{ fontSize: 11 }} width={120} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v) => formatEuro(v)} />
                  <Bar dataKey="missedRevenue" fill="var(--accent)" name="Mancato incasso" radius={[0, 4, 4, 0]} />
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
                  <XAxis dataKey="ora" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v) => formatMin(v)} />
                  <Bar dataKey="media" fill="var(--accent)" name="Tempo medio (min)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          {stats.confrontoSerate.length > 1 && (
            <ChartCard title="Confronto serate">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    {['Sessione', 'Totale', 'Ordini', 'Medio'].map(h => (
                      <th key={h} className="text-left p-2 text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {stats.confrontoSerate.map(s => (
                    <tr key={s.id} className="border-b border-[var(--border)] hover:bg-[var(--bg-card-2)] transition-colors">
                      <td className="p-2 font-bold text-[var(--text-main)]">{s.name}</td>
                      <td className="p-2 font-black text-[var(--accent)]">{formatEuro(s.totale)}</td>
                      <td className="p-2 text-[var(--text-muted)]">{s.numero}</td>
                      <td className="p-2 text-[var(--text-muted)]">{formatEuro(s.medio)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ChartCard>
          )}
        </>
      )}

      {isExportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
              <div>
                <h3 className="text-sm font-black text-[var(--text-main)] uppercase tracking-tight">Esporta Report CSV</h3>
                <p className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-wider mt-0.5">Solo sessioni concluse</p>
              </div>
              <button onClick={() => setIsExportModalOpen(false)} className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-main)] rounded-lg hover:bg-[var(--bg-input)] transition-colors">
                <X size={18} />
              </button>
            </div>
            <div className="p-4 max-h-72 overflow-y-auto space-y-2 no-scrollbar">
              {closedSessions.length === 0 ? (
                <p className="text-xs text-center text-[var(--text-muted)] py-6 italic">Nessuna sessione conclusa disponibile.</p>
              ) : closedSessions.map(s => (
                <div key={s.id} className="flex items-center justify-between p-3 rounded-xl bg-[var(--bg-card-2)] border border-[var(--border)] hover:border-[var(--accent)]/40 transition-all">
                  <div className="min-w-0 flex-1 pr-2">
                    <p className="text-sm font-bold text-[var(--text-main)] truncate">{s.name || `Sessione ${s.id}`}</p>
                    <p className="text-[10px] text-[var(--text-muted)]">
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