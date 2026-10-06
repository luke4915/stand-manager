import { useState } from 'react';
import { Users, Pencil, Check, X, Power, Trash2 } from 'lucide-react';
import { fetchWithAuth } from '../../utils/apiClient';
import { useToast } from '../../context/useToast';

// Un tavolo nell'elenco di una sala: nome e posti modificabili, disattivabile, eliminabile (con conferma).
const inputClass = 'p-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border)] text-[var(--text-main)] text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]';
const iconBtn = 'p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-card)] transition-colors disabled:opacity-40';

const TableRow = ({ table, onChanged }) => {
  const { showToast } = useToast();
  const [editing, setEditing] = useState(null); // { name, seats }
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const run = async (action, after) => {
    setBusy(true);
    try { await action(); after?.(); await onChanged(); }
    catch (err) { showToast(err.message, 'error'); }
    finally { setBusy(false); }
  };

  const save = () => run(
    () => fetchWithAuth(`/tables/${table.id}`, { method: 'PUT', body: { name: editing.name.trim(), seats: Number(editing.seats) } }),
    () => setEditing(null));
  const toggleActive = () => run(() => fetchWithAuth(`/tables/${table.id}`, { method: 'PUT', body: { active: !table.active } }));
  const remove = () => run(() => fetchWithAuth(`/tables/${table.id}`, { method: 'DELETE' }));

  if (editing) return (
    <li className="flex flex-wrap items-center gap-2 p-2 rounded-xl border border-[var(--accent)] bg-[var(--bg-card)]">
      <input className={`${inputClass} w-28`} aria-label="Nome del tavolo" maxLength={50} value={editing.name} onChange={e => setEditing(v => ({ ...v, name: e.target.value }))} />
      <input className={`${inputClass} w-20`} aria-label="Posti" type="number" min={1} max={99} value={editing.seats} onChange={e => setEditing(v => ({ ...v, seats: e.target.value }))} />
      <button className={iconBtn} disabled={busy || !editing.name.trim()} onClick={save} aria-label="Salva"><Check size={15} /></button>
      <button className={iconBtn} onClick={() => setEditing(null)} aria-label="Annulla"><X size={15} /></button>
    </li>
  );

  return (
    <li className={`flex items-center gap-2 p-2 pl-3 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] ${table.active ? '' : 'opacity-50'}`}>
      <span className="font-semibold text-sm text-[var(--text-main)]">{table.name}</span>
      <span className="flex items-center gap-1 text-xs text-[var(--text-muted)]"><Users size={12} /> {table.seats}</span>
      {!table.active && <span className="text-xs font-semibold text-[var(--text-muted)]">disattivo</span>}
      <span className="ml-auto flex items-center">
        <button className={iconBtn} disabled={busy} onClick={() => setEditing({ name: table.name, seats: table.seats })} aria-label={`Modifica ${table.name}`}><Pencil size={14} /></button>
        <button className={iconBtn} disabled={busy} onClick={toggleActive} aria-label={table.active ? `Disattiva ${table.name}` : `Riattiva ${table.name}`} title={table.active ? 'Disattiva' : 'Riattiva'}><Power size={14} /></button>
        {confirmDelete ? (
          <>
            <button className="px-2 py-1 rounded-lg bg-red-500 text-white text-xs font-semibold" disabled={busy} onClick={remove}>Elimina</button>
            <button className={iconBtn} onClick={() => setConfirmDelete(false)} aria-label="Annulla"><X size={14} /></button>
          </>
        ) : (
          <button className={`${iconBtn} hover:text-red-500`} disabled={busy} onClick={() => setConfirmDelete(true)} aria-label={`Elimina ${table.name}`}><Trash2 size={14} /></button>
        )}
      </span>
    </li>
  );
};

export default TableRow;
