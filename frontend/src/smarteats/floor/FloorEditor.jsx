import { useState, useEffect, useRef, useMemo } from 'react';
import { X, Undo2, Redo2, Save, Minus, Plus, Square, Circle, Eraser, Wand2 } from 'lucide-react';
import { fetchWithAuth } from '../../utils/apiClient';
import { useToast } from '../../context/useToast';
import FloorCanvas from './FloorCanvas';
import { useDraft } from './useDraft';
import { conflictIds, moveBy, resizeBy, defaultSize, findFreeSpot, isPlaced, clamp } from './geometry';

const toDraft = (room) => ({
  gridW: room.grid_w, gridH: room.grid_h,
  tables: room.tables.map(({ id, name, seats, active, x, y, w, h, shape }) => ({ id, name, seats, active, x, y, w, h, shape })),
});
const unplaced = { x: null, y: null, w: null, h: null };

const btn = 'flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[var(--border)] text-[var(--text-main)] font-black text-[10px] uppercase tracking-widest hover:bg-[var(--bg-card-2)] disabled:opacity-40 transition-colors';
const numInput = 'w-16 p-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border)] text-[var(--text-main)] text-sm text-center outline-none focus:ring-2 focus:ring-[var(--accent)]';
const label = 'text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]';

const Stepper = ({ name, value, min, max, onChange }) => (
  <div className="flex items-center gap-1" role="group" aria-label={name}>
    <button className={`${btn} px-2`} aria-label={`Riduci ${name}`} disabled={value <= min} onClick={() => onChange(value - 1)}><Minus size={12} /></button>
    <span className="w-8 text-center font-black text-[var(--text-main)]">{value}</span>
    <button className={`${btn} px-2`} aria-label={`Aumenta ${name}`} disabled={value >= max} onClick={() => onChange(value + 1)}><Plus size={12} /></button>
  </div>
);

// Editor della pianta di una sala (solo admin). I tavoli si trascinano sulla griglia con scatto alla cella; la maniglia
// in basso a destra li ridimensiona; con la tastiera: frecce = sposta, Maiusc+frecce = ridimensiona, Canc = togli dalla
// pianta, Ctrl+Z / Ctrl+Y = annulla / ripristina. Si salva tutto insieme, e solo se non ci sono tavoli sovrapposti o fuori.
const FloorEditor = ({ room, onClose, onSaved }) => {
  const { showToast } = useToast();
  const initial = useMemo(() => toDraft(room), [room]);
  const { draft, commit, startGesture, update, endGesture, undo, redo, canUndo, canRedo } = useDraft(initial);
  const [selectedId, setSelectedId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [confirmExit, setConfirmExit] = useState(false);
  const drag = useRef(null);

  const { gridW, gridH, tables } = draft;
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const conflicts = useMemo(() => conflictIds(tables, gridW, gridH), [tables, gridW, gridH]);
  const selected = tables.find(t => t.id === selectedId);
  const pending = tables.filter(t => !isPlaced(t));

  const patchTable = (id, patch) => ({ ...draft, tables: tables.map(t => (t.id === id ? { ...t, ...patch } : t)) });
  const requestClose = () => (dirty ? setConfirmExit(true) : onClose());

  const place = (table) => {
    const { w, h } = defaultSize(table.seats);
    const spot = findFreeSpot(tables, gridW, gridH, w, h);
    if (!spot) return showToast('Non c\'è più spazio libero: ingrandisci la sala', 'warning');
    commit(patchTable(table.id, { ...spot, w, h }));
    setSelectedId(table.id);
  };
  const placeAll = () => {
    let next = tables;
    for (const t of next.filter(x => !isPlaced(x))) {
      const { w, h } = defaultSize(t.seats);
      const spot = findFreeSpot(next, gridW, gridH, w, h);
      if (!spot) { showToast('Spazio esaurito: alcuni tavoli restano da piazzare', 'warning'); break; }
      next = next.map(x => (x.id === t.id ? { ...x, ...spot, w, h } : x));
    }
    commit({ ...draft, tables: next });
  };
  const removeFromPlan = (id) => { commit(patchTable(id, unplaced)); setSelectedId(null); };
  const setGrid = (key, value) => commit({ ...draft, [key]: clamp(Number(value) || 4, 4, 60) });

  // Tastiera. Non interferisce con i campi di testo.
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest('input, textarea, select')) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); return e.shiftKey ? redo() : undo(); }
      if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); return redo(); }
      if (e.key === 'Escape') return requestClose();
      const t = tables.find(x => x.id === selectedId);
      if (!t || !isPlaced(t)) return;
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); return removeFromPlan(t.id); }
      const step = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
      if (!step) return;
      e.preventDefault();
      commit(patchTable(t.id, e.shiftKey ? resizeBy(t, step[0], step[1], gridW, gridH) : moveBy(t, step[0], step[1], gridW, gridH)));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  useEffect(() => {
    if (!dirty) return;
    const warn = (e) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  // Trascinamento e ridimensionamento con i pointer events (mouse, dito, penna).
  const beginDrag = (e, t, mode, cell) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setSelectedId(t.id);
    drag.current = { id: t.id, mode, cell, startX: e.clientX, startY: e.clientY, origin: t };
    startGesture();
  };
  const moveDrag = (e) => {
    const d = drag.current;
    if (!d) return;
    const dx = Math.round((e.clientX - d.startX) / d.cell), dy = Math.round((e.clientY - d.startY) / d.cell);
    const patch = d.mode === 'move' ? moveBy(d.origin, dx, dy, gridW, gridH) : resizeBy(d.origin, dx, dy, gridW, gridH);
    update(patchTable(d.id, patch));
  };
  const endDrag = () => { drag.current = null; endGesture(); };

  const renderTable = (t, style, cell) => {
    const bad = conflicts.has(t.id), isSel = t.id === selectedId;
    return (
      <div key={t.id} style={{ ...style, touchAction: 'none' }} role="button" aria-label={`Tavolo ${t.name}`}
        onPointerDown={e => beginDrag(e, t, 'move', cell)} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}
        className={`flex flex-col items-center justify-center cursor-grab active:cursor-grabbing border-2 box-border overflow-hidden
          ${t.shape === 'round' ? 'rounded-full' : 'rounded-lg'}
          ${bad ? 'border-red-500 bg-red-500/20' : 'border-[var(--accent)] bg-[var(--accent)]/15'}
          ${isSel ? 'ring-2 ring-offset-1 ring-[var(--text-main)] z-10' : ''} ${t.active ? '' : 'opacity-50'}`}>
        <span className="font-black text-[var(--text-main)] leading-none truncate max-w-full px-1" style={{ fontSize: Math.max(10, Math.min(cell * 0.45, 18)) }}>{t.name}</span>
        {cell >= 24 && t.h > 1 && <span className="text-[var(--text-muted)] leading-none mt-0.5" style={{ fontSize: Math.max(9, cell * 0.3) }}>{t.seats} posti</span>}
        {isSel && (
          <span role="separator" aria-label="Ridimensiona" onPointerDown={e => beginDrag(e, t, 'resize', cell)}
            className="absolute right-0 bottom-0 w-4 h-4 bg-[var(--text-main)] rounded-tl-md cursor-nwse-resize" style={{ touchAction: 'none' }}
            onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} />
        )}
      </div>
    );
  };

  const save = async () => {
    setSaving(true);
    try {
      await fetchWithAuth(`/rooms/${room.id}/layout`, {
        method: 'PUT',
        body: { grid_w: gridW, grid_h: gridH, tables: tables.map(({ id, x, y, w, h, shape }) => ({ id, x, y, w, h, shape })) },
      });
      showToast('Pianta salvata', 'success');
      await onSaved();
      onClose();
    } catch (err) { showToast(err.message, 'error'); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[2000] flex flex-col bg-[var(--bg-main)]" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <header className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-[var(--border)] bg-[var(--bg-card)]">
        <div className="mr-auto min-w-0">
          <p className={label}>Pianta della sala</p>
          <h2 className="text-lg font-black text-[var(--text-main)] truncate">{room.name}</h2>
        </div>
        <button className={btn} onClick={undo} disabled={!canUndo} aria-label="Annulla"><Undo2 size={14} /></button>
        <button className={btn} onClick={redo} disabled={!canRedo} aria-label="Ripristina"><Redo2 size={14} /></button>
        <button className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-black text-[10px] uppercase tracking-widest disabled:opacity-40"
          onClick={save} disabled={!dirty || conflicts.size > 0 || saving}><Save size={14} /> {saving ? 'Salvataggio…' : 'Salva'}</button>
        <button className={btn} onClick={requestClose} aria-label="Chiudi"><X size={14} /></button>
      </header>

      {confirmExit && (
        <div className="px-4 py-3 bg-amber-500/10 border-b border-amber-500/30 flex flex-wrap items-center gap-3 text-sm text-[var(--text-main)]">
          <span className="mr-auto">Hai modifiche non salvate.</span>
          <button className={btn} onClick={() => setConfirmExit(false)}>Continua a modificare</button>
          <button className="px-3 py-2 rounded-xl bg-red-500 text-white font-black text-[10px] uppercase tracking-widest" onClick={onClose}>Esci senza salvare</button>
        </div>
      )}

      <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-4 p-4 overflow-auto">
        <div className="flex-1 min-w-0 space-y-3">
          <FloorCanvas gridW={gridW} gridH={gridH} tables={tables} showGrid renderTable={renderTable}
            onBackgroundPointerDown={e => e.target === e.currentTarget && setSelectedId(null)} />
          <p className="text-xs text-[var(--text-muted)]">
            Trascina i tavoli; la maniglia in basso a destra li ridimensiona. Frecce per spostare, Maiusc+frecce per ridimensionare, Canc per toglierli dalla pianta.
          </p>
          {conflicts.size > 0 && <p className="text-xs font-black uppercase tracking-widest text-red-500">Tavoli sovrapposti o fuori dalla sala (in rosso): sistemali per poter salvare.</p>}
        </div>

        <aside className="lg:w-72 shrink-0 space-y-4">
          <section className="p-4 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] space-y-3">
            <p className={label}>Misura della sala (celle)</p>
            <div className="flex items-center gap-2 text-sm text-[var(--text-main)]">
              <input className={numInput} type="number" min={4} max={60} aria-label="Larghezza della sala" value={gridW} onChange={e => setGrid('gridW', e.target.value)} />
              <span>×</span>
              <input className={numInput} type="number" min={4} max={60} aria-label="Altezza della sala" value={gridH} onChange={e => setGrid('gridH', e.target.value)} />
            </div>
          </section>

          <section className="p-4 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] space-y-3">
            <div className="flex items-center justify-between">
              <p className={label}>Da piazzare ({pending.length})</p>
              {pending.length > 1 && <button className={btn} onClick={placeAll}><Wand2 size={12} /> Tutti</button>}
            </div>
            {pending.length === 0
              ? <p className="text-xs text-[var(--text-muted)]">Tutti i tavoli sono sulla pianta. I tavoli nuovi si creano in Impostazioni → Sala e tavoli.</p>
              : <div className="flex flex-wrap gap-2">{pending.map(t => (
                <button key={t.id} className={btn} onClick={() => place(t)} title="Piazza sulla pianta">{t.name}<span className="text-[var(--text-muted)] normal-case tracking-normal">{t.seats}p</span></button>
              ))}</div>}
          </section>

          <section className="p-4 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] space-y-3">
            <p className={label}>Tavolo selezionato</p>
            {selected && isPlaced(selected) ? (
              <>
                <p className="font-black text-[var(--text-main)]">{selected.name} <span className="font-normal text-[var(--text-muted)] text-sm">· {selected.seats} posti</span></p>
                <div className="flex items-center justify-between"><span className="text-sm text-[var(--text-main)]">Larghezza</span>
                  <Stepper name="larghezza" value={selected.w} min={1} max={Math.min(30, gridW - selected.x)} onChange={w => commit(patchTable(selected.id, { w }))} /></div>
                <div className="flex items-center justify-between"><span className="text-sm text-[var(--text-main)]">Altezza</span>
                  <Stepper name="altezza" value={selected.h} min={1} max={Math.min(30, gridH - selected.y)} onChange={h => commit(patchTable(selected.id, { h }))} /></div>
                <div className="flex gap-2">
                  <button className={`${btn} flex-1 justify-center ${selected.shape === 'rect' ? 'bg-[var(--bg-card-2)]' : ''}`} onClick={() => commit(patchTable(selected.id, { shape: 'rect' }))}><Square size={12} /> Rettangolare</button>
                  <button className={`${btn} flex-1 justify-center ${selected.shape === 'round' ? 'bg-[var(--bg-card-2)]' : ''}`} onClick={() => commit(patchTable(selected.id, { shape: 'round' }))}><Circle size={12} /> Tondo</button>
                </div>
                <button className={`${btn} w-full justify-center hover:text-red-500`} onClick={() => removeFromPlan(selected.id)}><Eraser size={12} /> Togli dalla pianta</button>
              </>
            ) : <p className="text-xs text-[var(--text-muted)]">Tocca un tavolo sulla pianta per cambiarne misura e forma.</p>}
          </section>
        </aside>
      </div>
    </div>
  );
};

export default FloorEditor;
