import { useState, useRef } from 'react';
import { Minus, Plus, Trash2, Send, StickyNote } from 'lucide-react';
import { fetchWithAuth, NetworkError } from '../../utils/apiClient';
import { useToast } from '../../context/useToast';
import { printOrderTickets } from '../../print/printOrder';
import PanelFrame from './PanelFrame';
import { cartTotal, formatEuro } from './checkMath';
import { btnPrimary, iconBtn, input, label, row } from './ui';

// La comanda in preparazione per il conto di un tavolo (come il carrello della cassa): si invia alla cucina e il tavolo resta aperto.
// Le comande dei tavoli richiedono il server: lo stato del conto è condiviso fra i dispositivi della sala.
const DraftOrder = ({ detail, service, cart, setCart, products, onBack, onSent }) => {
  const { showToast } = useToast();
  const [noteOf, setNoteOf] = useState(null);       // indice della riga con la nota aperta
  const [sending, setSending] = useState(false);
  // Chiave di idempotenza: se la risposta si perde e si preme di nuovo, la comanda non si duplica.
  const attemptKey = useRef(crypto.randomUUID());

  const total = cartTotal(cart);
  const count = cart.reduce((s, l) => s + l.quantity, 0);

  const change = (index, delta) => setCart(c => c.flatMap((line, i) => {
    if (i !== index) return [line];
    const quantity = line.quantity + delta;
    return quantity > 0 ? [{ ...line, quantity }] : [];
  }));
  // "+" su una riga già in comanda (anche con nota): stessa riga, ma sempre entro lo stock
  const increase = (index) => {
    const line = cart[index];
    const product = products?.find(p => p.id === line.id);
    const inCart = cart.filter(l => l.id === line.id).reduce((s, l) => s + l.quantity, 0);
    if (product?.stock_enabled && product.stock !== null && inCart + 1 > product.stock)
      return showToast(`"${line.name}": disponibilità esaurita`, 'warning');
    change(index, 1);
  };
  const setNote = (index, note) => setCart(c => c.map((line, i) => (i === index ? { ...line, note } : line)));

  const send = async () => {
    if (!navigator.onLine) return showToast('Senza connessione non si inviano comande ai tavoli', 'error');
    setSending(true);
    try {
      const res = await fetchWithAuth('/orders', {
        method: 'POST',
        body: {
          check_id: detail.id,
          client_order_id: attemptKey.current,
          items: cart.map(l => ({ id: l.id, name: l.name, quantity: l.quantity, note: l.note, print_destination: l.print_destination })),
        },
      });
      // La comanda si stampa dal dispositivo, come alla cassa; un errore di stampa non annulla la comanda.
      printOrderTickets({
        cart: cart.map(l => ({ ...l, type: 'sale', discountMode: null, discountValue: null })),
        displayCode: res.displayCode, clientOrderId: attemptKey.current, sessionId: service.id, isTakeaway: false,
        table: { name: detail.table_name, covers: detail.covers },
      }).catch(err => showToast(`Errore di stampa: ${err.message}`, 'error'));
      showToast('Comanda inviata in cucina', 'success');
      attemptKey.current = crypto.randomUUID();
      onSent();
    } catch (err) {
      showToast(err instanceof NetworkError ? 'Server non raggiungibile: la comanda non è stata inviata' : err.message, 'error');
    } finally { setSending(false); }
  };

  return (
    <PanelFrame title="Comanda" subtitle={`${detail.table_name} · ${detail.covers} cop.`} onBack={onBack}
      footer={
        <>
          <div className="flex justify-between items-baseline"><span className={label}>Totale comanda · {count}</span><span className="text-3xl font-black tabular-nums text-[var(--text-main)]">{formatEuro(total)}</span></div>
          <button className={`${btnPrimary} w-full !py-4 !text-sm`} disabled={!cart.length || sending} onClick={send}><Send size={16} /> {sending ? 'Invio…' : 'Invia in cucina'}</button>
        </>
      }>
      {cart.length === 0 && <p className="h-full flex items-center justify-center text-center text-[var(--text-muted)] opacity-50 font-black uppercase tracking-widest text-xs py-10">Tocca un piatto nella carta</p>}
      {cart.map((line, i) => (
        <div key={`${line.id}-${i}`} className={row}>
          <div className="flex items-center gap-2">
            <span className="bg-[var(--accent)] text-white text-[10px] font-black w-5 h-5 flex items-center justify-center rounded shrink-0">{line.quantity}</span>
            <span className="font-bold text-xs uppercase text-[var(--text-main)] leading-tight truncate flex-1">{line.name}</span>
            <button className={`${iconBtn} !p-1 ${line.note ? '!text-[var(--accent)]' : ''}`} aria-label={`Nota per ${line.name}`} onClick={() => setNoteOf(noteOf === i ? null : i)}><StickyNote size={14} /></button>
            <button className={`${iconBtn} !p-1`} aria-label={line.quantity === 1 ? `Togli ${line.name}` : `Una in meno: ${line.name}`} onClick={() => change(i, -1)}>{line.quantity === 1 ? <Trash2 size={14} /> : <Minus size={14} />}</button>
            <button className={`${iconBtn} !p-1`} aria-label={`Una in più: ${line.name}`} onClick={() => increase(i)}><Plus size={14} /></button>
            <span className="font-black text-xs tabular-nums text-[var(--text-main)] shrink-0 w-16 text-right">{formatEuro(line.price * line.quantity)}</span>
          </div>
          {(noteOf === i || line.note) && noteOf !== i && <p className="mt-1 ml-7 text-[11px] text-[var(--text-muted)]">» {line.note}</p>}
          {noteOf === i && <input className={`${input} mt-2 !h-9 !text-xs`} autoFocus maxLength={300} placeholder="Nota (es. senza cipolla)" aria-label={`Nota per ${line.name}`} value={line.note} onChange={e => setNote(i, e.target.value)} onKeyDown={e => e.key === 'Enter' && setNoteOf(null)} />}
        </div>
      ))}
    </PanelFrame>
  );
};

export default DraftOrder;
