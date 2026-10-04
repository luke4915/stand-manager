import { useState, useMemo } from 'react';
import { Banknote, CreditCard, CircleEllipsis, Printer, Check, Minus, Plus, Users } from 'lucide-react';
import { fetchWithAuth } from '../../utils/apiClient';
import { useToast } from '../../context/useToast';
import Modal from './Modal';
import { payableLines, estimateSelection, splitEqually, formatEuro, toCents } from './checkMath';
import { btn, btnPrimary, input, label, card } from './ui';

const METHODS = [
  { id: 'cash', label: 'Contanti', icon: Banknote },
  { id: 'card', label: 'Carta', icon: CreditCard },
  { id: 'other', label: 'Altro', icon: CircleEllipsis },
];

// Pagamento di un conto: per voce (conti separati, anche a pezzi di quantità) oppure a importo (alla romana, acconto).
// L'importo vero lo calcola il server; qui c'è l'anteprima.
const PaymentDialog = ({ detail, onClose, onPaid, onPrint }) => {
  const { showToast } = useToast();
  const lines = useMemo(() => payableLines(detail), [detail]);
  const [mode, setMode] = useState(lines.length ? 'items' : 'amount');
  const [method, setMethod] = useState('cash');
  const [selection, setSelection] = useState({});          // { line_id: quantità }
  const [amount, setAmount] = useState(String(detail.due.toFixed(2)));
  const [people, setPeople] = useState(2);
  const [tendered, setTendered] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);                  // risposta del server dopo il pagamento

  const amountValue = mode === 'items' ? estimateSelection(lines, selection) : Number(amount.replace(',', '.'));
  const valid = Number.isFinite(amountValue) && toCents(amountValue) > 0 && toCents(amountValue) <= toCents(detail.due);
  const tenderedValue = tendered === '' ? null : Number(tendered.replace(',', '.'));
  const change = method === 'cash' && tenderedValue !== null ? tenderedValue - amountValue : null;
  const tenderedTooLow = change !== null && toCents(change) < 0;

  const setQty = (line, q) => setSelection(s => ({ ...s, [line.line_id]: Math.max(0, Math.min(line.remaining_quantity, q)) }));
  const selectAll = () => setSelection(Object.fromEntries(lines.map(l => [l.line_id, l.remaining_quantity])));
  const share = splitEqually(detail.due, people)[0];

  const pay = async () => {
    setBusy(true);
    try {
      const body = { method };
      if (mode === 'items') body.items = lines.filter(l => selection[l.line_id] > 0).map(l => ({ order_item_id: l.line_id, quantity: selection[l.line_id] }));
      else body.amount = Number(amountValue.toFixed(2));
      if (method === 'cash' && tenderedValue !== null) body.tendered = tenderedValue;
      setDone(await fetchWithAuth(`/checks/${detail.id}/payments`, { method: 'POST', body }));
      onPaid();
    } catch (err) {
      showToast(err.message, 'error');
      onPaid(); // il conto può essere cambiato nel frattempo: lo si rilegge
    } finally { setBusy(false); }
  };

  if (done) {
    return (
      <Modal title="Pagamento registrato" subtitle={done.check.status === 'paid' ? 'Conto chiuso' : `Resta da pagare ${formatEuro(done.check.due)}`} onClose={onClose}>
        <div className="p-6 space-y-5 text-center">
          <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 flex items-center justify-center mx-auto"><Check size={32} /></div>
          <p className="text-4xl font-black text-[var(--text-main)]">{formatEuro(done.payment.amount)}</p>
          {done.change > 0 && (
            <div className={card}><p className={label}>Resto da dare</p><p className="text-4xl font-black text-amber-500">{formatEuro(done.change)}</p></div>
          )}
          <div className="flex gap-3">
            <button className={`${btn} flex-1`} onClick={() => onPrint(done.payment.id)}><Printer size={16} /> Ricevuta</button>
            <button className={`${btnPrimary} flex-1`} onClick={onClose}>Fatto</button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Incassa" subtitle={`Da pagare ${formatEuro(detail.due)} di ${formatEuro(detail.total)}`} onClose={onClose} size="lg">
      <div className="p-4 sm:p-6 space-y-5">
        <div className="grid grid-cols-2 gap-2" role="tablist" aria-label="Modo di pagamento">
          {[['items', 'Per voce'], ['amount', 'A importo']].map(([id, text]) => (
            <button key={id} role="tab" aria-selected={mode === id} disabled={id === 'items' && !lines.length} onClick={() => setMode(id)}
              className={`${btn} ${mode === id ? '!bg-[var(--accent)] !border-[var(--accent)] !text-white' : ''}`}>{text}</button>
          ))}
        </div>

        {mode === 'items' ? (
          <section className="space-y-2">
            <div className="flex items-center justify-between"><p className={label}>Cosa paga questa persona?</p><button className="text-xs font-black text-[var(--accent)]" onClick={selectAll}>Tutto il resto</button></div>
            {lines.map(line => {
              const q = selection[line.line_id] ?? 0;
              return (
                <div key={line.line_id} className={`${card} !p-3 flex items-center gap-3 ${q > 0 ? '!border-[var(--accent)]' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-[var(--text-main)] truncate">{line.name}</p>
                    <p className="text-xs text-[var(--text-muted)]">{line.remaining_quantity} da pagare · {formatEuro(line.remaining_amount)}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button className={`${btn} !p-2`} aria-label={`Meno ${line.name}`} disabled={q <= 0} onClick={() => setQty(line, q - 1)}><Minus size={14} /></button>
                    <span className="w-7 text-center font-black tabular-nums text-[var(--text-main)]">{q}</span>
                    <button className={`${btn} !p-2`} aria-label={`Più ${line.name}`} disabled={q >= line.remaining_quantity} onClick={() => setQty(line, q + 1)}><Plus size={14} /></button>
                  </div>
                </div>
              );
            })}
          </section>
        ) : (
          <section className="space-y-3">
            <label className="block"><span className={label}>Importo</span>
              <input className={`${input} !text-2xl !font-black`} inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} aria-label="Importo da incassare" /></label>
            <div className={`${card} !p-3 flex flex-wrap items-center gap-3`}>
              <span className={`${label} flex items-center gap-1.5`}><Users size={12} /> Alla romana</span>
              <div className="flex items-center gap-1.5">
                <button className={`${btn} !p-2`} aria-label="Meno persone" disabled={people <= 2} onClick={() => setPeople(p => p - 1)}><Minus size={14} /></button>
                <span className="w-8 text-center font-black text-[var(--text-main)]">{people}</span>
                <button className={`${btn} !p-2`} aria-label="Più persone" disabled={people >= 30} onClick={() => setPeople(p => p + 1)}><Plus size={14} /></button>
              </div>
              <button className={btn} onClick={() => setAmount(share.toFixed(2))}>Quota {formatEuro(share)}</button>
              <button className={btn} onClick={() => setAmount(detail.due.toFixed(2))}>Tutto il residuo</button>
            </div>
          </section>
        )}

        <section className="space-y-2">
          <p className={label}>Metodo</p>
          <div className="grid grid-cols-3 gap-2">
            {METHODS.map(({ id, label: text, icon }) => {
              const Icon = icon;
              return (
                <button key={id} aria-pressed={method === id} onClick={() => setMethod(id)}
                  className={`${btn} flex-col !gap-1 ${method === id ? '!bg-[var(--accent)] !border-[var(--accent)] !text-white' : ''}`}><Icon size={20} />{text}</button>
              );
            })}
          </div>
          {method === 'cash' && (
            <label className="block"><span className={label}>Contanti ricevuti (per il resto)</span>
              <input className={input} inputMode="decimal" placeholder="Facoltativo" value={tendered} onChange={e => setTendered(e.target.value)} aria-label="Contanti ricevuti" /></label>
          )}
        </section>

        <div className={`${card} flex items-center justify-between`}>
          <div><p className={label}>Incasso</p><p className="text-3xl font-black text-[var(--text-main)]">{formatEuro(Number.isFinite(amountValue) ? amountValue : 0)}</p></div>
          {change !== null && !tenderedTooLow && <div className="text-right"><p className={label}>Resto</p><p className="text-2xl font-black text-amber-500">{formatEuro(change)}</p></div>}
          {tenderedTooLow && <p className="text-xs font-black uppercase tracking-widest text-red-500">Contanti insufficienti</p>}
        </div>
        {Number.isFinite(amountValue) && toCents(amountValue) > toCents(detail.due) && <p className="text-xs font-black uppercase tracking-widest text-red-500">L'importo supera il residuo del conto</p>}

        <button className={`${btnPrimary} w-full !py-4`} disabled={!valid || tenderedTooLow || busy} onClick={pay}>{busy ? 'Registrazione…' : 'Conferma incasso'}</button>
      </div>
    </Modal>
  );
};

export default PaymentDialog;
