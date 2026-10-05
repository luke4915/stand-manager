import { useState } from 'react';
import { Plus, Trash2, ChevronDown } from 'lucide-react';
import { fetchWithAuth } from '../utils/apiClient';
import { useToast } from '../context/useToast';
import { btn, btnPrimary, btnDanger, iconBtn, input, label } from './sala/ui';
import { groupHint } from './sala/modifierRules';
import { formatEuro } from './sala/checkMath';

const EMPTY = { name: '', min_select: 0, max_select: null, options: [{ name: '', price: '' }] };
const toDraft = (g) => ({ id: g.id, name: g.name, min_select: g.min_select, max_select: g.max_select, options: g.options.map(o => ({ name: o.name, price: o.price_delta ? String(o.price_delta).replace('.', ',') : '' })) });
const toNumber = (v) => Number(String(v).trim().replace(',', '.')) || 0;

// Un gruppo di opzioni in modifica: nome, quante se ne scelgono e le opzioni con il loro supplemento.
const GroupEditor = ({ draft, setDraft, onSave, onCancel, onDelete, saving }) => {
  const setOption = (i, patch) => setDraft(d => ({ ...d, options: d.options.map((o, j) => (j === i ? { ...o, ...patch } : o)) }));
  const single = draft.max_select === 1;
  return (
    <div className="p-4 space-y-4 bg-[var(--bg-card-2)]">
      <div>
        <label className={label} htmlFor="group-name">Nome del gruppo</label>
        <input id="group-name" className={`${input} mt-1`} maxLength={40} placeholder="Es. Cottura, Aggiunte" value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={label} htmlFor="group-min">Da scegliere</label>
          <select id="group-min" className={`${input} mt-1`} value={draft.min_select} onChange={e => setDraft(d => ({ ...d, min_select: Number(e.target.value) }))}>
            <option value={0}>Facoltativo</option>
            <option value={1}>Almeno una</option>
            <option value={2}>Almeno due</option>
          </select>
        </div>
        <div>
          <label className={label} htmlFor="group-max">Al massimo</label>
          <select id="group-max" className={`${input} mt-1`} value={draft.max_select ?? ''} onChange={e => setDraft(d => ({ ...d, max_select: e.target.value ? Number(e.target.value) : null }))}>
            <option value="">Nessun limite</option>
            {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n === 1 ? 'Una sola' : `${n}`}</option>)}
          </select>
        </div>
      </div>
      {single && <p className="text-xs text-[var(--text-muted)] -mt-2">Scelta singola: toccandone un&apos;altra si sostituisce la precedente.</p>}
      <div className="space-y-2">
        <span className={label}>Opzioni</span>
        {draft.options.map((o, i) => (
          <div key={i} className="flex gap-2 items-center">
            <input className={input} maxLength={40} placeholder="Es. Al sangue" aria-label={`Nome opzione ${i + 1}`} value={o.name} onChange={e => setOption(i, { name: e.target.value })} />
            <div className="relative w-28 shrink-0">
              <input className={`${input} pr-7 text-right tabular-nums`} inputMode="decimal" placeholder="0,00" aria-label={`Supplemento opzione ${i + 1}`} value={o.price} onChange={e => setOption(i, { price: e.target.value })} />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-[var(--text-muted)] pointer-events-none">€</span>
            </div>
            <button className={`${iconBtn} hover:!text-red-500`} aria-label={`Togli l'opzione ${i + 1}`} disabled={draft.options.length === 1}
              onClick={() => setDraft(d => ({ ...d, options: d.options.filter((_, j) => j !== i) }))}><Trash2 size={16} /></button>
          </div>
        ))}
        <button className={`${btn} !h-9`} onClick={() => setDraft(d => ({ ...d, options: [...d.options, { name: '', price: '' }] }))}><Plus size={15} /> Aggiungi opzione</button>
      </div>
      <div className="flex gap-2 pt-1">
        <button className={btnPrimary} disabled={saving || !draft.name.trim() || draft.options.some(o => !o.name.trim())} onClick={onSave}>{saving ? 'Salvataggio…' : 'Salva'}</button>
        <button className={btn} onClick={onCancel}>Annulla</button>
        {onDelete && <button className={`${btnDanger} ml-auto`} onClick={onDelete}>Elimina</button>}
      </div>
    </div>
  );
};

// I gruppi di opzioni dei piatti (cottura, aggiunte, senza…). Qui si creano e si modificano; da ogni piatto della carta
// si sceglie quali chiedere. Il supplemento si aggiunge al prezzo del piatto.
const ModifierSettings = ({ groups, onChanged }) => {
  const { showToast } = useToast();
  const [draft, setDraft] = useState(null);       // gruppo in modifica (con `id` se esiste già)
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const body = { name: draft.name.trim(), min_select: draft.min_select, max_select: draft.max_select,
      options: draft.options.map(o => ({ name: o.name.trim(), price_delta: toNumber(o.price) })) };
    try {
      await fetchWithAuth(draft.id ? `/modifier-groups/${draft.id}` : '/modifier-groups', { method: draft.id ? 'PUT' : 'POST', body });
      showToast('Gruppo salvato', 'success');
      setDraft(null);
      await onChanged();
    } catch (err) { showToast(err.message, 'error'); }
    finally { setSaving(false); }
  };
  const remove = async () => {
    try { await fetchWithAuth(`/modifier-groups/${draft.id}`, { method: 'DELETE' }); setDraft(null); await onChanged(); }
    catch (err) { showToast(err.message, 'error'); }
  };

  return (
    <section className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] overflow-hidden">
      <header className="flex items-start justify-between gap-3 p-5">
        <div>
          <h2 className="text-sm font-semibold text-[var(--text-main)]">Opzioni dei piatti</h2>
          <p className="text-xs text-[var(--text-muted)] mt-1">Cottura, aggiunte, senza… Il supplemento si somma al prezzo del piatto. Da ogni piatto scegli quali opzioni chiedere.</p>
        </div>
        {draft === null && <button className={`${btn} shrink-0`} onClick={() => setDraft({ ...EMPTY, options: [{ name: '', price: '' }] })}><Plus size={16} /> Nuovo gruppo</button>}
      </header>
      <ul className="divide-y divide-[var(--border)] border-t border-[var(--border)]">
        {groups.length === 0 && draft === null && <li className="px-5 py-4 text-sm text-[var(--text-muted)]">Nessun gruppo. Crea per esempio «Cottura» con Al sangue, Media, Ben cotta.</li>}
        {groups.map(g => (
          <li key={g.id}>
            {draft?.id === g.id
              ? <GroupEditor draft={draft} setDraft={setDraft} onSave={save} onCancel={() => setDraft(null)} onDelete={remove} saving={saving} />
              : (
                <button className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-[var(--bg-card-2)] cursor-pointer" onClick={() => setDraft(toDraft(g))}>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-[var(--text-main)]">{g.name} <span className="font-normal text-[var(--text-muted)]">· {groupHint(g).toLowerCase()}</span></span>
                    <span className="block text-xs text-[var(--text-muted)] truncate">{g.options.map(o => (o.price_delta ? `${o.name} (${o.price_delta > 0 ? '+' : '−'}${formatEuro(Math.abs(o.price_delta))})` : o.name)).join(' · ')}</span>
                  </span>
                  <span className="text-xs text-[var(--text-muted)] shrink-0">{g.product_ids.length} {g.product_ids.length === 1 ? 'piatto' : 'piatti'}</span>
                  <ChevronDown size={16} className="text-[var(--text-muted)] shrink-0" />
                </button>
              )}
          </li>
        ))}
        {draft && !draft.id && <li><GroupEditor draft={draft} setDraft={setDraft} onSave={save} onCancel={() => setDraft(null)} saving={saving} /></li>}
      </ul>
    </section>
  );
};

export default ModifierSettings;
