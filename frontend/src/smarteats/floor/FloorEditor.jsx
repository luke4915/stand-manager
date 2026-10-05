import { useState, useEffect, useRef, useMemo } from 'react';
import { X, Undo2, Redo2, Save, Minus, Plus, Square, Circle, Eraser, Wand2, MousePointer2, BrickWall, SeparatorVertical } from 'lucide-react';
import { fetchWithAuth } from '../../utils/apiClient';
import { useToast } from '../../context/useToast';
import FloorCanvas from './FloorCanvas';
import { useDraft } from './useDraft';
import { conflictIds, moveBy, resizeBy, defaultSize, findFreeSpot, isPlaced, clamp, lineBetween } from './geometry';
import { ELEMENT_CLASS, ELEMENT_LABEL } from './elementStyle';

const toDraft = (room) => ({
  gridW: room.grid_w, gridH: room.grid_h,
  tables: room.tables.map(({ id, name, seats, active, x, y, w, h, shape }) => ({ id, name, seats, active, x, y, w, h, shape })),
  // id solo lato client ("e12" salvati, "n3" nuovi): il server li risalva tutti insieme alla pianta
  elements: (room.elements ?? []).map(({ id, kind, x, y, w, h }) => ({ id: `e${id}`, kind, x, y, w, h })),
});
const TOOLS = [
  { id: 'select', name: 'Seleziona', icon: MousePointer2 },
  { id: 'wall', name: 'Muro', icon: BrickWall },
  { id: 'divider', name: 'Separatore', icon: SeparatorVertical },
];
const unplaced = { x: null, y: null, w: null, h: null };

const btn = 'flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[var(--border)] text-[var(--text-main)] font-semibold text-xs hover:bg-[var(--bg-card-2)] disabled:opacity-40 transition-colors';
const numInput = 'w-16 p-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border)] text-[var(--text-main)] text-sm text-center outline-none focus:ring-2 focus:ring-[var(--accent)]';
const label = 'text-xs font-semibold text-[var(--text-muted)]';

const Stepper = ({ name, value, min, max, onChange }) => (
  <div className="flex items-center gap-1" role="group" aria-label={name}>
    <button className={`${btn} px-2`} aria-label={`Riduci ${name}`} disabled={value <= min} onClick={() => onChange(value - 1)}><Minus size={12} /></button>
    <span className="w-8 text-center font-semibold text-[var(--text-main)]">{value}</span>
    <button className={`${btn} px-2`} aria-label={`Aumenta ${name}`} disabled={value >= max} onClick={() => onChange(value + 1)}><Plus size={12} /></button>
  </div>
);

// Editor della pianta di una sala (solo admin). I tavoli si trascinano sulla griglia con scatto alla cella; la maniglia
// in basso a destra li ridimensiona; con la tastiera: frecce = sposta, Maiusc+frecce = ridimensiona, Canc = togli dalla
// pianta, Ctrl+Z / Ctrl+Y = annulla / ripristina. Muri e separatori si tracciano trascinando sulla griglia con lo
// strumento scelto a destra. Si salva tutto insieme, e solo se non ci sono elementi sovrapposti a un tavolo o fuori.
const FloorEditor = ({ room, onClose, onSaved }) => {
  const { showToast } = useToast();
  const initial = useMemo(() => toDraft(room), [room]);
  const { draft, commit, startGesture, update, endGesture, undo, redo, canUndo, canRedo } = useDraft(initial);
  const [selectedId, setSelectedId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [confirmExit, setConfirmExit] = useState(false);
  const [tool, setTool] = useState('select');   // select | wall | divider
  const [ghost, setGhost] = useState(null);
  const drag = useRef(null);
  const drawing = useRef(null);
  const canvasRef = useRef(null);
  const newId = useRef(0);

  const { gridW, gridH, tables, elements } = draft;
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const conflicts = useMemo(() => conflictIds(tables, gridW, gridH, elements), [tables, gridW, gridH, elements]);
  const selected = tables.find(t => t.id === selectedId);
  const selectedEl = elements.find(e => e.id === selectedId);
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
  const removeElement = (id) => { commit({ ...draft, elements: elements.filter(e => e.id !== id) }); setSelectedId(null); };
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
      const el = elements.find(x => x.id === selectedId);
      if (el) {
        if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); return removeElement(el.id); }
        const move = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
        if (!move) return;
        e.preventDefault();
        return commit({ ...draft, elements: elements.map(x => (x.id === el.id ? { ...x, ...moveBy(el, move[0], move[1], gridW, gridH) } : x)) });
      }
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
    if (tool !== 'select') return;
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

  // Muri e separatori: si traccia una linea trascinando da una cella all'altra; un tocco è una cella sola.
  const cellAt = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const cell = rect.width / gridW;
    return { x: clamp(Math.floor((e.clientX - rect.left) / cell), 0, gridW - 1), y: clamp(Math.floor((e.clientY - rect.top) / cell), 0, gridH - 1) };
  };
  const backgroundDown = (e) => {
    if (e.target !== e.currentTarget) return;
    if (tool === 'select') return setSelectedId(null);
    e.currentTarget.setPointerCapture(e.pointerId);
    const from = cellAt(e);
    drawing.current = from;
    setGhost({ id: 'ghost', kind: tool, ...lineBetween(from, from) });
  };
  const backgroundMove = (e) => {
    if (drawing.current) setGhost({ id: 'ghost', kind: tool, ...lineBetween(drawing.current, cellAt(e)) });
  };
  const backgroundUp = (e) => {
    if (!drawing.current) return;
    const line = lineBetween(drawing.current, cellAt(e));
    drawing.current = null;
    setGhost(null);
    const id = `n${++newId.current}`;
    commit({ ...draft, elements: [...elements, { id, kind: tool, ...line }] });
    setSelectedId(id);
  };
  const renderElement = (el, style) => {
    const bad = conflicts.has(el.id), isSel = el.id === selectedId, isGhost = el.id === 'ghost';
    return (
      <div key={el.id} style={style} role="button" aria-label={ELEMENT_LABEL[el.kind]}
        onPointerDown={e => { if (tool === 'select' && !isGhost) { e.stopPropagation(); setSelectedId(el.id); } }}
        className={`box-border ${ELEMENT_CLASS[el.kind]} ${bad ? '!bg-red-500/60 !border-red-500' : ''} ${isGhost ? 'opacity-50 pointer-events-none' : tool === 'select' ? 'cursor-pointer' : 'pointer-events-none'}
          ${isSel ? 'ring-2 ring-offset-1 ring-[var(--text-main)] z-10' : ''}`} />
    );
  };

  const renderTable = (t, style, cell) => {
    const bad = conflicts.has(t.id), isSel = t.id === selectedId;
    return (
      <div key={t.id} style={{ ...style, touchAction: 'none' }} role="button" aria-label={`Tavolo ${t.name}`}
        onPointerDown={e => beginDrag(e, t, 'move', cell)} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}
        className={`flex flex-col items-center justify-center cursor-grab active:cursor-grabbing border-2 box-border overflow-hidden
          ${t.shape === 'round' ? 'rounded-full' : 'rounded-lg'}
          ${bad ? 'border-red-500 bg-red-500/20' : 'border-[var(--accent)] bg-[var(--accent)]/15'}
          ${isSel ? 'ring-2 ring-offset-1 ring-[var(--text-main)] z-10' : ''} ${t.active ? '' : 'opacity-50'}`}>
        <span className="font-semibold text-[var(--text-main)] leading-none truncate max-w-full px-1" style={{ fontSize: Math.max(10, Math.min(cell * 0.45, 18)) }}>{t.name}</span>
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
        body: { grid_w: gridW, grid_h: gridH, tables: tables.map(({ id, x, y, w, h, shape }) => ({ id, x, y, w, h, shape })),
          elements: elements.map(({ kind, x, y, w, h }) => ({ kind, x, y, w, h })) },
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
          <h2 className="text-lg font-semibold text-[var(--text-main)] truncate">{room.name}</h2>
        </div>
        <button className={btn} onClick={undo} disabled={!canUndo} aria-label="Annulla"><Undo2 size={14} /></button>
        <button className={btn} onClick={redo} disabled={!canRedo} aria-label="Ripristina"><Redo2 size={14} /></button>
        <button className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-semibold text-xs disabled:opacity-40"
          onClick={save} disabled={!dirty || conflicts.size > 0 || saving}><Save size={14} /> {saving ? 'Salvataggio…' : 'Salva'}</button>
        <button className={btn} onClick={requestClose} aria-label="Chiudi"><X size={14} /></button>
      </header>

      {confirmExit && (
        <div className="px-4 py-3 bg-amber-500/10 border-b border-amber-500/30 flex flex-wrap items-center gap-3 text-sm text-[var(--text-main)]">
          <span className="mr-auto">Hai modifiche non salvate.</span>
          <button className={btn} onClick={() => setConfirmExit(false)}>Continua a modificare</button>
          <button className="px-3 py-2 rounded-xl bg-red-500 text-white font-semibold text-xs" onClick={onClose}>Esci senza salvare</button>
        </div>
      )}

      <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-4 p-4 overflow-auto">
        <div className="flex-1 min-w-0 space-y-3">
          <div className={tool === 'select' ? '' : 'cursor-crosshair'}>
            <FloorCanvas gridW={gridW} gridH={gridH} tables={tables} elements={ghost ? [...elements, ghost] : elements} showGrid
              renderTable={renderTable} renderElement={renderElement} canvasRef={canvasRef}
              onBackgroundPointerDown={backgroundDown} onBackgroundPointerMove={backgroundMove} onBackgroundPointerUp={backgroundUp} />
          </div>
          <p className="text-xs text-[var(--text-muted)]">
            {tool === 'select'
              ? 'Trascina i tavoli; la maniglia in basso a destra li ridimensiona. Frecce per spostare, Maiusc+frecce per ridimensionare, Canc per toglierli dalla pianta.'
              : `Trascina sulla griglia per tracciare un ${ELEMENT_LABEL[tool].toLowerCase()}; un tocco ne mette una cella. Torna a «Seleziona» per spostare i tavoli.`}
          </p>
          {conflicts.size > 0 && <p className="text-xs font-semibold text-red-500">Elementi sovrapposti o fuori dalla sala (in rosso): sistemali per poter salvare.</p>}
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
            <p className={label}>Strumento</p>
            <div className="grid grid-cols-3 gap-2" role="group" aria-label="Strumento">
              {TOOLS.map((t) => {
                const Icon = t.icon;
                return (
                  <button key={t.id} aria-pressed={tool === t.id} onClick={() => setTool(t.id)}
                    className={`${btn} flex-col justify-center gap-1 ${tool === t.id ? 'bg-[var(--accent)] !text-white border-transparent' : ''}`}><Icon size={14} />{t.name}</button>
                );
              })}
            </div>
            {selectedEl && (
              <button className={`${btn} w-full justify-center hover:text-red-500`} onClick={() => removeElement(selectedEl.id)}><Eraser size={12} /> Elimina {ELEMENT_LABEL[selectedEl.kind].toLowerCase()}</button>
            )}
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
                <p className="font-semibold text-[var(--text-main)]">{selected.name} <span className="font-normal text-[var(--text-muted)] text-sm">· {selected.seats} posti</span></p>
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
