import { useState, useEffect, useCallback } from 'react';
import { ArrowUp, ArrowDown, Trash2, Plus } from 'lucide-react';
import { fetchWithAuth } from '../utils/apiClient';
import { useToast } from '../context/useToast';
import { btn, iconBtn, input } from './sala/ui';

// Le portate del locale (antipasto, primo, secondo, dolce…) nell'ordine in cui di solito escono. Ogni piatto della
// carta ne sceglie una; in comanda il cameriere può cambiare ordine e uscita per quel tavolo.
const CourseSettings = () => {
  const { showToast } = useToast();
  const [courses, setCourses] = useState(null);
  const [name, setName] = useState('');
  const [editing, setEditing] = useState(null);     // { id, name }

  const load = useCallback(() => fetchWithAuth('/courses').then(setCourses).catch(err => showToast(err.message, 'error')), [showToast]);
  useEffect(() => { load(); }, [load]);

  const run = async (action) => { try { await action(); await load(); } catch (err) { showToast(err.message, 'error'); } };
  const add = () => run(async () => { await fetchWithAuth('/courses', { method: 'POST', body: { name } }); setName(''); });
  const rename = () => run(async () => { await fetchWithAuth(`/courses/${editing.id}`, { method: 'PUT', body: { name: editing.name } }); setEditing(null); });
  const remove = (c) => run(() => fetchWithAuth(`/courses/${c.id}`, { method: 'DELETE' }));
  const move = (index, delta) => {
    const ids = courses.map(c => c.id);
    [ids[index], ids[index + delta]] = [ids[index + delta], ids[index]];
    run(() => fetchWithAuth('/courses/order', { method: 'PUT', body: { ids } }));
  };

  return (
    <div className="bg-[var(--bg-card)] p-5 rounded-xl border border-[var(--border)]">
      <h2 className="text-sm font-semibold text-[var(--text-main)] mb-1">Portate</h2>
      <p className="text-xs text-[var(--text-muted)] mb-4">Nell&apos;ordine in cui escono di solito. Poi assegni una portata a ogni piatto dalla Carta.</p>
      {courses === null ? <p className="text-sm text-[var(--text-muted)]">Caricamento…</p> : (
        <ul className="divide-y divide-[var(--border)] border border-[var(--border)] rounded-lg mb-3 max-w-md">
          {courses.length === 0 && <li className="px-3 py-3 text-sm text-[var(--text-muted)]">Nessuna portata. Aggiungine una, per esempio «Antipasti».</li>}
          {courses.map((c, i) => (
            <li key={c.id} className="flex items-center gap-1 px-3 py-1.5">
              {editing?.id === c.id
                ? <input className={`${input} !h-9 flex-1`} autoFocus maxLength={40} value={editing.name} aria-label="Nome della portata"
                    onChange={e => setEditing({ id: c.id, name: e.target.value })} onBlur={rename} onKeyDown={e => { if (e.key === 'Enter') rename(); if (e.key === 'Escape') setEditing(null); }} />
                : <button className="flex-1 text-left text-sm text-[var(--text-main)] py-1.5 cursor-text" onClick={() => setEditing({ id: c.id, name: c.name })} title="Rinomina">{c.name}</button>}
              <button className={iconBtn} aria-label={`Anticipa ${c.name}`} disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp size={16} /></button>
              <button className={iconBtn} aria-label={`Posticipa ${c.name}`} disabled={i === courses.length - 1} onClick={() => move(i, 1)}><ArrowDown size={16} /></button>
              <button className={`${iconBtn} hover:!text-red-500`} aria-label={`Elimina ${c.name}`} onClick={() => remove(c)}><Trash2 size={16} /></button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2 max-w-md">
        <input className={input} placeholder="Nuova portata" aria-label="Nuova portata" maxLength={40} value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && name.trim() && add()} />
        <button className={btn} disabled={!name.trim()} onClick={add}><Plus size={16} /> Aggiungi</button>
      </div>
    </div>
  );
};

export default CourseSettings;
