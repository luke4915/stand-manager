import { useState, useEffect, useMemo, useRef } from 'react';
import { Search, Minus, Plus, Trash2, Send, ShoppingBag, StickyNote } from 'lucide-react';
import { fetchWithAuth, NetworkError } from '../../utils/apiClient';
import { useToast } from '../../context/useToast';
import { printOrderTickets } from '../../print/printOrder';
import Modal from './Modal';
import { addToCart, cartTotal, formatEuro, normalizeText } from './checkMath';
import { btn, btnPrimary, input, label } from './ui';

// Nuova comanda per il conto di un tavolo: si sceglie dalla carta, si invia alla cucina e il tavolo resta aperto.
// Le comande dei tavoli richiedono il server (lo stato del conto è condiviso fra i dispositivi della sala).
const OrderBuilder = ({ check, service, onClose, onSent }) => {
  const { showToast } = useToast();
  const [products, setProducts] = useState(null);
  const [cart, setCart] = useState([]);
  const [category, setCategory] = useState('TUTTI');
  const [search, setSearch] = useState('');
  const [cartOpen, setCartOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [confirmExit, setConfirmExit] = useState(false);
  // Chiave di idempotenza: se la risposta si perde e si preme di nuovo, la comanda non si duplica.
  const attemptKey = useRef(crypto.randomUUID());

  useEffect(() => {
    fetchWithAuth('/products')
      .then(list => setProducts(list.filter(p => p.visible !== false).map(p => ({ ...p, price: parseFloat(p.price) }))))
      .catch(err => showToast(err.message || 'Errore caricamento carta', 'error'));
  }, [showToast]);

  const categories = useMemo(() => ['TUTTI', ...new Set((products ?? []).map(p => p.category || 'Generico'))], [products]);
  const shown = useMemo(() => {
    const words = normalizeText(search).trim().split(/\s+/).filter(Boolean);
    return (products ?? []).filter(p =>
      (category === 'TUTTI' || (p.category || 'Generico') === category)
      && words.every(w => normalizeText(`${p.name} ${p.category || ''}`).includes(w)));
  }, [products, category, search]);

  const add = (product) => {
    const res = addToCart(cart, product);
    if (res.blocked) return showToast(`"${product.name}": disponibilità esaurita`, 'warning');
    setCart(res.cart);
  };
  const change = (index, delta) => setCart(c => c.flatMap((line, i) => {
    if (i !== index) return [line];
    const quantity = line.quantity + delta;
    return quantity > 0 ? [{ ...line, quantity }] : [];
  }));
  // "+" su una riga già in comanda (anche con nota): stessa riga, ma sempre entro lo stock
  const increase = (index) => {
    const line = cart[index];
    const product = products.find(p => p.id === line.id);
    const inCart = cart.filter(l => l.id === line.id).reduce((s, l) => s + l.quantity, 0);
    if (product?.stock_enabled && product.stock !== null && inCart + 1 > product.stock)
      return showToast(`"${line.name}": disponibilità esaurita`, 'warning');
    change(index, 1);
  };
  const setNote = (index, note) => setCart(c => c.map((line, i) => (i === index ? { ...line, note } : line)));
  // Con righe in comanda non si esce per sbaglio (tocco fuori, Esc): prima si chiede.
  const requestClose = () => (cart.length && !sending ? setConfirmExit(true) : onClose());
  const total = cartTotal(cart);
  const count = cart.reduce((s, l) => s + l.quantity, 0);

  const send = async () => {
    if (!navigator.onLine) return showToast('Senza connessione non si inviano comande ai tavoli', 'error');
    setSending(true);
    try {
      const res = await fetchWithAuth('/orders', {
        method: 'POST',
        body: {
          check_id: check.id,
          client_order_id: attemptKey.current,
          items: cart.map(l => ({ id: l.id, name: l.name, quantity: l.quantity, note: l.note, print_destination: l.print_destination })),
        },
      });
      // La comanda si stampa dal dispositivo, come alla cassa; un errore di stampa non annulla la comanda.
      printOrderTickets({
        cart: cart.map(l => ({ ...l, type: 'sale', discountMode: null, discountValue: null })),
        displayCode: res.displayCode, clientOrderId: attemptKey.current, sessionId: service.id, isTakeaway: false,
        table: { name: check.table_name, covers: check.covers },
      }).catch(err => showToast(`Errore di stampa: ${err.message}`, 'error'));
      showToast('Comanda inviata in cucina', 'success');
      onSent();
    } catch (err) {
      showToast(err instanceof NetworkError ? 'Server non raggiungibile: la comanda non è stata inviata' : err.message, 'error');
    } finally { setSending(false); }
  };

  const cartList = (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto space-y-2 p-1">
        {cart.length === 0 && <p className="text-sm text-[var(--text-muted)] text-center py-8">Tocca un piatto per aggiungerlo alla comanda.</p>}
        {cart.map((line, i) => (
          <div key={`${line.id}-${i}`} className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-2.5">
            <div className="flex items-center gap-2">
              <span className="flex-1 min-w-0 text-sm font-bold text-[var(--text-main)] truncate">{line.name}</span>
              <span className="text-xs font-black tabular-nums text-[var(--text-muted)]">{formatEuro(line.price * line.quantity)}</span>
            </div>
            <div className="flex items-center gap-1.5 mt-2">
              <button className={`${btn} !p-2`} aria-label={`Una in meno: ${line.name}`} onClick={() => change(i, -1)}>{line.quantity === 1 ? <Trash2 size={14} /> : <Minus size={14} />}</button>
              <span className="w-8 text-center font-black tabular-nums text-[var(--text-main)]">{line.quantity}</span>
              <button className={`${btn} !p-2`} aria-label={`Una in più: ${line.name}`} onClick={() => increase(i)}><Plus size={14} /></button>
              <div className="relative flex-1 ml-1">
                <StickyNote size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                <input className={`${input} !py-2 !pl-7 !text-xs`} placeholder="Nota (es. senza cipolla)" maxLength={300} aria-label={`Nota per ${line.name}`}
                  value={line.note} onChange={e => setNote(i, e.target.value)} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <Modal title={`Comanda · ${check.table_name}`} subtitle={`${check.covers} ${check.covers === 1 ? 'coperto' : 'coperti'} · conto n. ${check.number}`} onClose={requestClose} size="xl" closeOnOverlay={false}>
      {confirmExit && (
        <div className="px-4 py-3 bg-amber-500/10 border-b border-amber-500/30 flex flex-wrap items-center gap-3 text-sm text-[var(--text-main)]">
          <span className="mr-auto">La comanda non è stata inviata: uscendo si perde.</span>
          <button className={btn} onClick={() => setConfirmExit(false)}>Continua</button>
          <button className="px-4 py-3 rounded-2xl bg-red-500 text-white font-black text-xs uppercase tracking-widest" onClick={onClose}>Esci senza inviare</button>
        </div>
      )}
      <div className="h-full md:grid md:grid-cols-[1fr_360px] min-h-[70dvh]">
        <section className="p-4 space-y-3 md:overflow-y-auto pb-28 md:pb-4">
          <div className="relative">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <input className={`${input} !pl-10`} placeholder="Cerca nella carta…" aria-label="Cerca nella carta" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1" role="tablist" aria-label="Categorie">
            {categories.map(c => (
              <button key={c} role="tab" aria-selected={category === c} onClick={() => setCategory(c)}
                className={`shrink-0 px-3.5 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest border transition-all ${category === c ? 'bg-[var(--accent)] border-[var(--accent)] text-white' : 'border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-muted)]'}`}>{c}</button>
            ))}
          </div>
          {!products && <p className="text-[var(--text-muted)]">Caricamento carta…</p>}
          {products && !shown.length && <p className="text-sm text-[var(--text-muted)]">Nessun prodotto trovato.</p>}
          <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
            {shown.map(p => {
              const out = p.stock_enabled && p.stock !== null && p.stock <= 0;
              const inCart = cart.filter(l => l.id === p.id).reduce((s, l) => s + l.quantity, 0);
              return (
                <button key={p.id} disabled={out} onClick={() => add(p)}
                  className="relative text-left p-3 min-h-[84px] rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] hover:border-[var(--accent)] active:scale-95 transition-all disabled:opacity-40 disabled:pointer-events-none">
                  <span className="block text-sm font-black text-[var(--text-main)] leading-tight">{p.name}</span>
                  <span className="block text-xs text-[var(--text-muted)] mt-1">{formatEuro(p.price)}{out && ' · esaurito'}{!out && p.stock_enabled && p.stock !== null && p.stock <= 10 && ` · ${p.stock} rimasti`}</span>
                  {inCart > 0 && <span className="absolute top-2 right-2 min-w-6 h-6 px-1.5 rounded-full bg-[var(--accent)] text-white text-xs font-black flex items-center justify-center">{inCart}</span>}
                </button>
              );
            })}
          </div>
        </section>

        {/* Comanda: colonna a destra su schermo largo, pannello a scomparsa sul telefono */}
        <aside className="hidden md:flex flex-col border-l border-[var(--border)] bg-[var(--bg-card-2)] p-4 gap-3">
          <p className={label}>Comanda ({count})</p>
          <div className="flex-1 min-h-0">{cartList}</div>
          <div className="flex items-center justify-between"><span className={label}>Totale comanda</span><span className="text-2xl font-black text-[var(--text-main)]">{formatEuro(total)}</span></div>
          <button className={btnPrimary} disabled={!cart.length || sending} onClick={send}><Send size={16} /> {sending ? 'Invio…' : 'Invia in cucina'}</button>
        </aside>
      </div>

      <div className="md:hidden fixed bottom-0 inset-x-0 z-[1900] bg-[var(--bg-card)] border-t border-[var(--border)] p-3 space-y-2" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
        {cartOpen && <div className="max-h-[45dvh] overflow-y-auto">{cartList}</div>}
        <div className="flex gap-2">
          <button className={`${btn} flex-1`} onClick={() => setCartOpen(o => !o)}><ShoppingBag size={16} /> {count} · {formatEuro(total)}</button>
          <button className={`${btnPrimary} flex-1`} disabled={!cart.length || sending} onClick={send}><Send size={16} /> {sending ? 'Invio…' : 'Invia'}</button>
        </div>
      </div>
    </Modal>
  );
};

export default OrderBuilder;
