import { useState } from 'react';
import { fetchWithAuth } from '../../utils/apiClient';
import { useToast } from '../../context/useToast';
import PanelFrame from './PanelFrame';
import { formatEuro } from './checkMath';
import { btnPrimary, input, label, row, segment, segmentBox } from './ui';

const TYPES = [['gift', 'Omaggio'], ['percent', 'Sconto %'], ['amount', 'Sconto €'], ['sale', 'Togli']];

// Omaggio o sconto sulle voci del conto (admin e responsabile): si toccano le voci e si applica. Le voci già pagate non si toccano.
const AdjustView = ({ detail, onBack, onDone }) => {
  const { showToast } = useToast();
  const lines = detail.orders.filter(o => o.status !== 'canceled').flatMap(o => o.items).filter(i => i.line_id !== null);
  const editable = lines.filter(l => l.paid_quantity === 0);
  const [selected, setSelected] = useState(new Set());
  const [kind, setKind] = useState('gift');
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);

  const toggle = (id) => setSelected(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allSelected = editable.length > 0 && editable.every(l => selected.has(l.line_id));
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
      await onDone();
      onBack();
    } catch (err) { showToast(err.message, 'error'); }
    finally { setBusy(false); }
  };

  return (
    <PanelFrame title="Omaggio o sconto" subtitle="Tocca le voci" onBack={onBack}
      footer={
        <>
          <div className={segmentBox} role="group" aria-label="Cosa applicare">
            {TYPES.map(([id, text]) => <button key={id} aria-pressed={kind === id} className={segment(kind === id)} onClick={() => setKind(id)}>{text}</button>)}
          </div>
          {needsValue && <input className={input} inputMode="decimal" autoFocus placeholder={kind === 'percent' ? 'Percentuale (es. 10)' : 'Euro da togliere alla riga (es. 2,50)'} aria-label="Valore dello sconto" value={value} onChange={e => setValue(e.target.value)} />}
          <button className={`${btnPrimary} w-full !py-4`} disabled={!valid || busy} onClick={apply}>{busy ? 'Applico…' : `Applica a ${selected.size} ${selected.size === 1 ? 'voce' : 'voci'}`}</button>
        </>
      }>
      <div className="flex items-center justify-between px-1 pt-1">
        <span className={label}>Voci del conto</span>
        <button className="text-[10px] font-black uppercase tracking-widest text-[var(--accent)]" onClick={() => setSelected(allSelected ? new Set() : new Set(editable.map(l => l.line_id)))}>{allSelected ? 'Nessuna' : 'Tutte'}</button>
      </div>
      {lines.map(line => {
        const locked = line.paid_quantity > 0;
        const on = selected.has(line.line_id);
        return (
          <button key={line.line_id} disabled={locked} aria-pressed={on} onClick={() => toggle(line.line_id)}
            className={`${row} w-full flex items-center gap-2.5 text-left disabled:opacity-50 disabled:cursor-not-allowed ${on ? '!border-[var(--accent)]' : ''}`}>
            <span className={`text-[10px] font-black w-5 h-5 flex items-center justify-center rounded shrink-0 ${on ? 'bg-[var(--accent)] text-white' : 'bg-[var(--border)] text-[var(--text-muted)]'}`}>{line.quantity}</span>
            <span className="flex-1 min-w-0 font-bold text-xs uppercase text-[var(--text-main)] truncate">{line.name}</span>
            {locked && <span className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)]">pagata</span>}
            {!locked && line.type !== 'sale' && <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${line.type === 'gift' ? 'bg-purple-500/10 text-purple-500' : 'bg-orange-500/10 text-orange-500'}`}>{line.type === 'gift' ? 'Omaggio' : 'Sconto'}</span>}
            <span className="font-black text-xs tabular-nums text-[var(--text-main)] shrink-0">{formatEuro(line.line_total)}</span>
          </button>
        );
      })}
    </PanelFrame>
  );
};

export default AdjustView;
