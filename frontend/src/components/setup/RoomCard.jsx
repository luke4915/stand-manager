import { useState } from 'react';
import { Pencil, Check, X, Plus, Trash2, Power, ListPlus, LayoutTemplate } from 'lucide-react';
import { fetchWithAuth } from '../../utils/apiClient';
import { useToast } from '../../context/useToast';
import TableRow from './TableRow';
import FloorEditor from '../../smarteats/floor/FloorEditor';

// Una sala con i suoi tavoli: rinomina, attiva/disattiva, elimina (se vuota), aggiunta di un tavolo o di più in serie.
const inputClass = 'p-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border)] text-[var(--text-main)] text-sm outline-none focus:ring-2 focus:ring-[var(--accent)] placeholder:text-[var(--text-muted)]';
const btn = 'flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[var(--border)] text-[var(--text-main)] font-semibold text-xs hover:bg-[var(--bg-card)] transition-all disabled:opacity-50';
const iconBtn = 'p-2 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-card)] transition-colors disabled:opacity-40';

const RoomCard = ({ room, onChanged }) => {
  const { showToast } = useToast();
  const [renaming, setRenaming] = useState(null);       // nuovo nome
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [adding, setAdding] = useState('none');         // 'none' | 'one' | 'bulk'
  const [one, setOne] = useState({ name: '', seats: 2 });
  const [bulk, setBulk] = useState({ prefix: 'T', from: 1, to: 10, seats: 4 });
  const [busy, setBusy] = useState(false);
  const [designing, setDesigning] = useState(false);

  const run = async (action, after) => {
    setBusy(true);
    try { const result = await action(); after?.(result); await onChanged(); }
    catch (err) { showToast(err.message, 'error'); }
    finally { setBusy(false); }
  };

  const rename = () => run(() => fetchWithAuth(`/rooms/${room.id}`, { method: 'PUT', body: { name: renaming.trim() } }), () => setRenaming(null));
  const toggleActive = () => run(() => fetchWithAuth(`/rooms/${room.id}`, { method: 'PUT', body: { active: !room.active } }));
  const remove = () => run(() => fetchWithAuth(`/rooms/${room.id}`, { method: 'DELETE' }));
  const addOne = () => run(
    () => fetchWithAuth(`/rooms/${room.id}/tables`, { method: 'POST', body: { name: one.name.trim(), seats: Number(one.seats) } }),
    () => { setOne({ name: '', seats: one.seats }); });
  const addBulk = () => run(
    () => fetchWithAuth(`/rooms/${room.id}/tables/bulk`, { method: 'POST', body: { prefix: bulk.prefix.trim(), from: Number(bulk.from), to: Number(bulk.to), seats: Number(bulk.seats) } }),
    ({ created, skipped }) => {
      showToast(`${created.length} tavoli creati${skipped ? `, ${skipped} già presenti` : ''}`, 'success');
      setAdding('none');
    });

  return (
    <section className={`rounded-xl border border-[var(--border)] bg-[var(--bg-card-2)] p-4 ${room.active ? '' : 'opacity-70'}`}>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {renaming !== null ? (
          <>
            <input className={`${inputClass} flex-1 min-w-40`} aria-label="Nome della sala" maxLength={50} autoFocus value={renaming}
              onChange={e => setRenaming(e.target.value)} onKeyDown={e => e.key === 'Enter' && renaming.trim() && rename()} />
            <button className={iconBtn} disabled={busy || !renaming.trim()} onClick={rename} aria-label="Salva"><Check size={16} /></button>
            <button className={iconBtn} onClick={() => setRenaming(null)} aria-label="Annulla"><X size={16} /></button>
          </>
        ) : (
          <>
            <h3 className="font-semibold text-[var(--text-main)]">{room.name}</h3>
            <span className="text-xs text-[var(--text-muted)]">{room.tables.length} tavoli · {room.tables.reduce((n, t) => n + t.seats, 0)} posti</span>
            {!room.active && <span className="text-xs font-semibold text-[var(--text-muted)]">disattiva</span>}
            <span className="ml-auto flex items-center">
              <button className={iconBtn} disabled={busy} onClick={() => setRenaming(room.name)} aria-label={`Rinomina ${room.name}`}><Pencil size={15} /></button>
              <button className={iconBtn} disabled={busy} onClick={toggleActive} aria-label={room.active ? `Disattiva ${room.name}` : `Riattiva ${room.name}`} title={room.active ? 'Disattiva' : 'Riattiva'}><Power size={15} /></button>
              {confirmDelete ? (
                <>
                  <button className="px-2.5 py-1.5 rounded-lg bg-red-500 text-white text-xs font-semibold" disabled={busy} onClick={remove}>Elimina sala</button>
                  <button className={iconBtn} onClick={() => setConfirmDelete(false)} aria-label="Annulla"><X size={15} /></button>
                </>
              ) : (
                <button className={`${iconBtn} hover:text-red-500`} disabled={busy || room.tables.length > 0}
                  title={room.tables.length ? 'Elimina prima i tavoli, oppure disattiva la sala' : 'Elimina la sala'}
                  onClick={() => setConfirmDelete(true)} aria-label={`Elimina ${room.name}`}><Trash2 size={15} /></button>
              )}
            </span>
          </>
        )}
      </div>

      {room.tables.length === 0
        ? <p className="text-sm text-[var(--text-muted)] mb-3">Nessun tavolo in questa sala.</p>
        : <ul className="grid gap-2 sm:grid-cols-2 mb-3">{room.tables.map(table => <TableRow key={table.id} table={table} onChanged={onChanged} />)}</ul>}

      {adding === 'one' && (
        <div className="flex flex-wrap items-end gap-2 p-3 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] mb-3">
          <input className={`${inputClass} w-32`} aria-label="Nome del tavolo" placeholder="Nome (es. T1)" maxLength={50} autoFocus value={one.name} onChange={e => setOne(v => ({ ...v, name: e.target.value }))} />
          <input className={`${inputClass} w-20`} aria-label="Posti" type="number" min={1} max={99} value={one.seats} onChange={e => setOne(v => ({ ...v, seats: e.target.value }))} />
          <button className={btn} disabled={busy || !one.name.trim()} onClick={addOne}><Plus size={12} /> Aggiungi</button>
          <button className={btn} onClick={() => setAdding('none')}>Chiudi</button>
        </div>
      )}
      {adding === 'bulk' && (
        <div className="flex flex-wrap items-end gap-2 p-3 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] mb-3">
          <label className="text-xs font-semibold text-[var(--text-muted)]">Prefisso
            <input className={`${inputClass} block w-20 mt-1`} maxLength={20} value={bulk.prefix} onChange={e => setBulk(v => ({ ...v, prefix: e.target.value }))} /></label>
          <label className="text-xs font-semibold text-[var(--text-muted)]">Dal
            <input className={`${inputClass} block w-20 mt-1`} type="number" min={1} value={bulk.from} onChange={e => setBulk(v => ({ ...v, from: e.target.value }))} /></label>
          <label className="text-xs font-semibold text-[var(--text-muted)]">Al
            <input className={`${inputClass} block w-20 mt-1`} type="number" min={1} value={bulk.to} onChange={e => setBulk(v => ({ ...v, to: e.target.value }))} /></label>
          <label className="text-xs font-semibold text-[var(--text-muted)]">Posti
            <input className={`${inputClass} block w-20 mt-1`} type="number" min={1} max={99} value={bulk.seats} onChange={e => setBulk(v => ({ ...v, seats: e.target.value }))} /></label>
          <button className={btn} disabled={busy || Number(bulk.to) < Number(bulk.from)} onClick={addBulk}><ListPlus size={12} /> Crea {Math.max(0, Number(bulk.to) - Number(bulk.from) + 1)} tavoli</button>
          <button className={btn} onClick={() => setAdding('none')}>Chiudi</button>
        </div>
      )}
      {adding === 'none' && (
        <div className="flex gap-2">
          <button className={btn} onClick={() => setAdding('one')}><Plus size={12} /> Tavolo</button>
          <button className={btn} onClick={() => setAdding('bulk')}><ListPlus size={12} /> Più tavoli in serie</button>
          <button className={`${btn} ml-auto`} disabled={room.tables.length === 0} onClick={() => setDesigning(true)}
            title={room.tables.length ? 'Disegna la pianta della sala' : 'Crea prima dei tavoli'}><LayoutTemplate size={12} /> Disegna pianta</button>
        </div>
      )}
      {designing && <FloorEditor room={room} onClose={() => setDesigning(false)} onSaved={onChanged} />}
    </section>
  );
};

export default RoomCard;
