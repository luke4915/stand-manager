import { useState, useMemo } from 'react';
import { Banknote, CreditCard, CircleEllipsis, Printer, Check, Minus, Plus } from 'lucide-react';
import { fetchWithAuth } from '../../utils/apiClient';
import { useToast } from '../../context/useToast';
import PanelFrame from './PanelFrame';
import { payableLines, estimateSelection, splitEqually, formatEuro, toCents } from './checkMath';
import { btn, btnPrimary, input, label, row, segment, segmentBox, iconBtn } from './ui';

const METHODS = [['cash', 'Contanti', Banknote], ['card', 'Carta', CreditCard], ['other', 'Altro', CircleEllipsis]];

// Incasso, nel pannello del conto. «Per voce» (conti separati, anche a pezzi) oppure «A importo» (alla romana, acconto).
// L'importo vero lo calcola il server; qui c'è l'anteprima.
// Dopo il pagamento: senza resto da mostrare si torna da soli (al conto, o alla sala se il conto si è chiuso, così il
// tavolo si libera); con il resto da dare resta la schermata «Incassato», con la ricevuta, finché si preme «Fatto».
const PayView = ({ detail, onBack, onClosed, onPaid, onPrint }) => {
  const { showToast } = useToast();
  const lines = useMemo(() => payableLines(detail), [detail]);
  const [mode, setMode] = useState(lines.length ? 'items' : 'amount');
  const [method, setMethod] = useState('cash');
  const [selection, setSelection] = useState({});          // { line_id: quantità }
  const [amount, setAmount] = useState(detail.due.toFixed(2));
  const [people, setPeople] = useState(1);
  const [tendered, setTendered] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);                  // risposta del server dopo il pagamento

  const amountValue = mode === 'items' ? estimateSelection(lines, selection) : Number(amount.replace(',', '.'));
  const valid = Number.isFinite(amountValue) && toCents(amountValue) > 0 && toCents(amountValue) <= toCents(detail.due);
  const tenderedValue = tendered === '' ? null : Number(tendered.replace(',', '.'));
  const change = method === 'cash' && tenderedValue !== null ? tenderedValue - amountValue : null;
  const tooLow = change !== null && toCents(change) < 0;

  const setQty = (line, q) => setSelection(s => ({ ...s, [line.line_id]: Math.max(0, Math.min(line.remaining_quantity, q)) }));
  const allSelected = lines.length > 0 && lines.every(l => selection[l.line_id] === l.remaining_quantity);
  const toggleAll = () => setSelection(allSelected ? {} : Object.fromEntries(lines.map(l => [l.line_id, l.remaining_quantity])));
  // «Alla romana»: persone che dividono il residuo; il campo importo prende la quota
  const splitIn = (n) => { setPeople(n); setAmount(splitEqually(detail.due, n)[0].toFixed(2)); };

  const pay = async () => {
    setBusy(true);
    try {
      const body = { method };
      if (mode === 'items') body.items = lines.filter(l => selection[l.line_id] > 0).map(l => ({ order_item_id: l.line_id, quantity: selection[l.line_id] }));
      else body.amount = Number(amountValue.toFixed(2));
      if (method === 'cash' && tenderedValue !== null) body.tendered = tenderedValue;
      const res = await fetchWithAuth(`/checks/${detail.id}/payments`, { method: 'POST', body });
      if (res.change > 0) setDone(res);
      else if (res.check.status === 'paid') { showToast(`Conto chiuso · ${formatEuro(res.payment.amount)} incassati`, 'success'); onClosed(); }
      else { showToast(`Incassati ${formatEuro(res.payment.amount)} · restano ${formatEuro(res.check.due)}`, 'success'); onBack(); }
    } catch (err) { showToast(err.message, 'error'); }
    finally { setBusy(false); onPaid(); } // il conto può essere cambiato nel frattempo: lo si rilegge
  };

  if (done) {
    const closed = done.check.status === 'paid';
    return (
      <PanelFrame title="Incassato" subtitle={closed ? 'Conto chiuso' : `Restano ${formatEuro(done.check.due)}`} subtitleClass="text-green-500"
        footer={
          <div className="grid grid-cols-2 gap-2">
            <button className={btn} onClick={() => onPrint(done.payment.id)}><Printer size={16} /> Ricevuta</button>
            <button className={btnPrimary} onClick={closed ? onClosed : onBack}>Fatto</button>
          </div>
        }>
        <div className="h-full flex flex-col items-center justify-center gap-3 py-8 text-center">
          <div className="w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 flex items-center justify-center"><Check size={28} /></div>
          <p className="text-4xl font-semibold tabular-nums text-[var(--text-main)]">{formatEuro(done.payment.amount)}</p>
          {done.change > 0 && <div><p className={label}>Resto da dare</p><p className="text-3xl font-semibold tabular-nums text-amber-500">{formatEuro(done.change)}</p></div>}
        </div>
      </PanelFrame>
    );
  }

  return (
    <PanelFrame title="Incassa" subtitle={`Da pagare ${formatEuro(detail.due)}`} onBack={onBack}
      footer={
        <>
          {method === 'cash' && (
            <div className="flex items-center gap-3">
              <input className={`${input} flex-1`} inputMode="decimal" placeholder="Contanti ricevuti (facoltativo)" aria-label="Contanti ricevuti" value={tendered} onChange={e => setTendered(e.target.value)} />
              {change !== null && <span className={`text-sm font-semibold tabular-nums shrink-0 ${tooLow ? 'text-red-500' : 'text-amber-500'}`}>{tooLow ? 'Insufficienti' : `Resto ${formatEuro(change)}`}</span>}
            </div>
          )}
          <button className={`${btnPrimary} w-full !py-4 !text-sm`} disabled={!valid || tooLow || busy} onClick={pay}>
            {busy ? 'Registrazione…' : `Incassa ${formatEuro(Number.isFinite(amountValue) ? amountValue : 0)}`}
          </button>
        </>
      }>
      <div className={segmentBox} role="tablist" aria-label="Modo di pagamento">
        {[['items', 'Per voce'], ['amount', 'A importo']].map(([id, text]) => (
          <button key={id} role="tab" aria-selected={mode === id} disabled={id === 'items' && !lines.length} className={`${segment(mode === id)} disabled:opacity-40`} onClick={() => setMode(id)}>{text}</button>
        ))}
      </div>
      <div className={segmentBox} role="group" aria-label="Metodo">
        {METHODS.map(([id, text, icon]) => {
          const Icon = icon;
          return <button key={id} aria-pressed={method === id} className={`${segment(method === id)} flex items-center justify-center gap-1.5`} onClick={() => setMethod(id)}><Icon size={14} />{text}</button>;
        })}
      </div>

      {mode === 'items' ? (
        <>
          <div className="flex items-center justify-between px-1 pt-1">
            <span className={label}>Cosa paga questa persona</span>
            <button className="text-xs font-semibold text-[var(--accent)]" onClick={toggleAll}>{allSelected ? 'Nessuna' : 'Tutto'}</button>
          </div>
          {lines.map(line => {
            const q = selection[line.line_id] ?? 0;
            return (
              <div key={line.line_id} className={`${row} flex items-center gap-2 ${q > 0 ? '!border-[var(--accent)]' : ''}`}>
                <button className="flex items-center gap-2.5 min-w-0 flex-1 text-left" onClick={() => setQty(line, q > 0 ? 0 : line.remaining_quantity)} aria-pressed={q > 0}>
                  <span className={`text-xs font-semibold w-5 h-5 flex items-center justify-center rounded shrink-0 ${q > 0 ? 'bg-[var(--accent)] text-white' : 'bg-[var(--border)] text-[var(--text-muted)]'}`}>{line.remaining_quantity}</span>
                  <span className="font-bold text-xs text-[var(--text-main)] truncate">{line.name}</span>
                </button>
                {line.remaining_quantity > 1 && q > 0 && (
                  <span className="flex items-center gap-1 shrink-0">
                    <button className={`${iconBtn} !p-1`} aria-label={`Meno ${line.name}`} onClick={() => setQty(line, q - 1)}><Minus size={12} /></button>
                    <span className="w-5 text-center text-xs font-semibold tabular-nums text-[var(--text-main)]">{q}</span>
                    <button className={`${iconBtn} !p-1`} aria-label={`Più ${line.name}`} disabled={q >= line.remaining_quantity} onClick={() => setQty(line, q + 1)}><Plus size={12} /></button>
                  </span>
                )}
                <span className="font-semibold text-xs tabular-nums text-[var(--text-main)] shrink-0 w-16 text-right">{formatEuro(line.remaining_amount)}</span>
              </div>
            );
          })}
        </>
      ) : (
        <div className="space-y-3 pt-1">
          <label className="block"><span className={label}>Importo</span>
            <input className={`${input} !h-14 !text-2xl !font-semibold`} inputMode="decimal" aria-label="Importo da incassare" value={amount} onChange={e => setAmount(e.target.value)} /></label>
          <div>
            <span className={label}>Alla romana · in quanti</span>
            <div className="flex gap-1.5 mt-1.5 flex-wrap">
              {[1, 2, 3, 4, 5, 6, 8].map(n => (
                <button key={n} aria-pressed={people === n} className={`${btn} !px-3.5 !py-2 ${people === n ? '!bg-[var(--accent)] !border-[var(--accent)] !text-white' : ''}`} onClick={() => splitIn(n)}>{n === 1 ? 'Tutto' : n}</button>
              ))}
            </div>
            {people > 1 && <p className="text-xs text-[var(--text-muted)] mt-2">Quota di una persona: {formatEuro(splitEqually(detail.due, people)[0])}</p>}
          </div>
        </div>
      )}
      {Number.isFinite(amountValue) && toCents(amountValue) > toCents(detail.due) && <p className="text-xs font-semibold text-red-500 px-1">Supera il residuo del conto</p>}
    </PanelFrame>
  );
};

export default PayView;
