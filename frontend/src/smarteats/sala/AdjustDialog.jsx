import { useState } from 'react';
import { fetchWithAuth } from '../../utils/apiClient';
import { useToast } from '../../context/useToast';
import Modal from './Modal';
import { formatEuro } from './checkMath';
import { btn, btnPrimary, input, label, card } from './ui';

const TYPES = [
  ['gift', 'Omaggio'],
  ['percent', 'Sconto %'],
  ['amount', 'Sconto €'],
  ['sale', 'Togli sconto'],
];

// Abbuono: omaggio o sconto su delle voci del conto (admin e responsabile). Le voci già pagate non si toccano.
const AdjustDialog = ({ detail, onClose, onDone }) => {
  const { showToast } = useToast();
  const lines = detail.orders.filter(o => o.status !== 'canceled').flatMap(o => o.items).filter(i => i.line_id !== null);
  const [selected, setSelected] = useState(new Set());
  const [kind, setKind] = useState('gift');
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);

  const editable = (line) => line.paid_quantity === 0;
  const toggle = (id) => setSelected(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const selectAll = () => setSelected(new Set(lines.filter(editable).map(l => l.line_id)));
  const number = Number(value.replace(',', '.'));
  const needsValue = kind === 'percent' || kind === 'amount';
  const valid = selected.size > 0 && (!needsValue || (Number.isFinite(number) && number > 0 && (kind !== 'percent' || number <= 100)));

  const apply = async () => {
    const body = { order_item_ids: [...selected], type: kind === 'gift' ? 'gift' : kind === 'sale' ? 'sale' : 'discount' };
    if (needsValue) { body.discountMode = kind; body.discountValue = number; }
    setBusy(true);
    try {
      await fetchWithAuth(`/checks/${detail.id}/adjust`, { method: 'POST', body });
      showToast('Conto aggiornato', 'success');
      onDone();
      onClose();
    } catch (err) { showToast(err.message, 'error'); }
    finally { setBusy(false); }
  };

  return (
    <Modal title="Omaggio o sconto" subtitle="Scegli le voci e cosa applicare" onClose={onClose} size="lg">
      <div className="p-4 sm:p-6 space-y-5">
        <section className="space-y-2">
          <div className="flex items-center justify-between"><p className={label}>Voci</p><button className="text-xs font-black text-[var(--accent)]" onClick={selectAll}>Tutte quelle modificabili</button></div>
          {lines.map(line => (
            <label key={line.line_id} className={`${card} !p-3 flex items-center gap-3 cursor-pointer ${editable(line) ? '' : 'opacity-50 cursor-not-allowed'} ${selected.has(line.line_id) ? '!border-[var(--accent)]' : ''}`}>
              <input type="checkbox" className="accent-[var(--accent)] w-5 h-5" disabled={!editable(line)} checked={selected.has(line.line_id)} onChange={() => toggle(line.line_id)} />
              <span className="flex-1 min-w-0 text-sm font-bold text-[var(--text-main)] truncate">{line.quantity}× {line.name}</span>
              {line.type !== 'sale' && <span className="text-[10px] font-black uppercase tracking-widest text-amber-500">{line.type === 'gift' ? 'omaggio' : 'scontata'}</span>}
              <span className="text-sm font-black tabular-nums text-[var(--text-main)]">{formatEuro(line.line_total)}</span>
              {!editable(line) && <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">pagata</span>}
            </label>
          ))}
        </section>
        <section className="space-y-2">
          <p className={label}>Cosa applicare</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {TYPES.map(([id, text]) => (
              <button key={id} aria-pressed={kind === id} onClick={() => setKind(id)} className={`${btn} ${kind === id ? '!bg-[var(--accent)] !border-[var(--accent)] !text-white' : ''}`}>{text}</button>
            ))}
          </div>
          {needsValue && <input className={input} inputMode="decimal" autoFocus placeholder={kind === 'percent' ? 'Percentuale (es. 10)' : 'Euro da togliere alla riga (es. 2,50)'} aria-label="Valore dello sconto" value={value} onChange={e => setValue(e.target.value)} />}
        </section>
        <button className={`${btnPrimary} w-full !py-4`} disabled={!valid || busy} onClick={apply}>{busy ? 'Applico…' : 'Applica'}</button>
      </div>
    </Modal>
  );
};

export default AdjustDialog;
