import { useState, useEffect } from 'react';
import { fetchWithAuth } from '../../utils/apiClient';
import { useToast } from '../../context/useToast';
import PanelFrame from './PanelFrame';
import { formatEuro } from './checkMath';
import { label, row, segment, segmentBox } from './ui';

// Cambio di posto: «Sposta» il conto su un tavolo libero, «Unisci» lo riunisce a quello di un altro tavolo
// (comande, pagamenti e coperti confluiscono lì). Tutto nello stesso pannello del conto.
const MoveView = ({ detail, onBack, onMoved, onMerged }) => {
  const { showToast } = useToast();
  const [mode, setMode] = useState('move');
  const [rooms, setRooms] = useState(null);
  const [checks, setChecks] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([fetchWithAuth('/rooms'), fetchWithAuth('/checks?status=open')])
      .then(([r, c]) => { setRooms(r); setChecks(c); })
      .catch(err => showToast(err.message, 'error'));
  }, [showToast]);

  const busyTables = new Set(checks.map(c => c.table_id));
  const others = checks.filter(c => c.id !== detail.id);

  const run = async (path, body, done) => {
    setBusy(true);
    try { done(await fetchWithAuth(`/checks/${detail.id}/${path}`, { method: 'POST', body })); }
    catch (err) { showToast(err.message, 'error'); }
    finally { setBusy(false); }
  };

  return (
    <PanelFrame title="Cambio di posto" subtitle={`Ora: ${detail.table_name}`} onBack={onBack}>
      <div className={segmentBox} role="tablist" aria-label="Cosa fare">
        <button role="tab" aria-selected={mode === 'move'} className={segment(mode === 'move')} onClick={() => setMode('move')}>Sposta</button>
        <button role="tab" aria-selected={mode === 'merge'} className={segment(mode === 'merge')} onClick={() => setMode('merge')}>Unisci</button>
      </div>

      {!rooms && <p className="text-sm text-[var(--text-muted)] px-1 pt-2">Caricamento…</p>}

      {rooms && mode === 'move' && rooms.filter(r => r.active).map(room => {
        const free = room.tables.filter(t => t.active && !busyTables.has(t.id));
        return (
          <section key={room.id} className="pt-1">
            <p className={`${label} px-1 py-1.5`}>{room.name} · liberi</p>
            {free.length === 0 && <p className="text-xs text-[var(--text-muted)] px-1">Nessun tavolo libero</p>}
            <div className="grid grid-cols-3 gap-2">
              {free.map(t => (
                <button key={t.id} disabled={busy} onClick={() => run('move', { table_id: t.id }, onMoved)}
                  className={`${row} text-center font-semibold text-sm text-[var(--text-main)] hover:!border-[var(--accent)] active:scale-95 transition-all disabled:opacity-50`}>
                  {t.name}<span className="block text-xs font-bold text-[var(--text-muted)]">{t.seats} posti</span>
                </button>
              ))}
            </div>
          </section>
        );
      })}

      {rooms && mode === 'merge' && (
        <section className="pt-1 space-y-1.5">
          <p className={`${label} px-1 py-1.5`}>Unisci questo conto a…</p>
          {others.length === 0 && <p className="text-xs text-[var(--text-muted)] px-1">Non ci sono altri tavoli aperti.</p>}
          {others.map(c => (
            <button key={c.id} disabled={busy} onClick={() => run('merge', { into: c.id }, (target) => onMerged(target))}
              className={`${row} w-full flex items-center gap-2 text-left hover:!border-[var(--accent)] active:scale-[0.99] transition-all disabled:opacity-50`}>
              <span className="flex-1 min-w-0 font-semibold text-sm text-[var(--text-main)] truncate">{c.table_name ?? 'Banco'}<span className="ml-2 text-xs font-bold normal-case text-[var(--text-muted)]">{c.covers} cop.</span></span>
              <span className="font-semibold text-xs tabular-nums text-[var(--text-main)]">{formatEuro(c.total)}</span>
            </button>
          ))}
        </section>
      )}
    </PanelFrame>
  );
};

export default MoveView;
