import { useState, useEffect, useCallback } from 'react';
import { ShoppingBag } from 'lucide-react';
import { fetchWithAuth } from '../utils/apiClient';
import { useToast } from '../context/useToast';
import { useIsMobile } from '../hooks/useBreakpoint';
import FloorView from './sala/FloorView';
import SidePanel from './sala/SidePanel';
import OrderMenu from './sala/OrderMenu';
import { useProducts } from './sala/useProducts';
import { useCourses } from './sala/useCourses';
import { useModifiers } from './sala/useModifiers';
import ModifierPicker from './sala/ModifierPicker';
import { emptyPlan, courseOfProduct } from './sala/courses';
import { addToCart, cartTotal, formatEuro } from './sala/checkMath';
import { btnPrimary } from './sala/ui';

const card = 'bg-[var(--bg-card)] rounded-xl border border-[var(--border)] p-4 sm:p-5 min-w-0';

// La Sala come la cassa: a sinistra l'area di lavoro (i tavoli, oppure la carta quando si fa una comanda), a destra un
// solo pannello che cambia contenuto (apri tavolo, conto, incasso, comanda). Sotto i 1280 px il pannello è a tutto schermo.
const SalaPage = ({ user, service, event }) => {
  const { showToast } = useToast();
  const narrow = useIsMobile(1280);
  const [rooms, setRooms] = useState(null);
  const [checks, setChecks] = useState([]);
  const [selection, setSelection] = useState(null);   // { table, checkId|null }
  const [ordering, setOrdering] = useState(false);
  const [draftOpen, setDraftOpen] = useState(false);  // solo su schermo stretto: la comanda sopra la carta
  const [cart, setCart] = useState([]);
  const [plan, setPlan] = useState(emptyPlan);    // ordine d'uscita delle portate della comanda
  const products = useProducts(ordering);
  const courses = useCourses();
  const modifiers = useModifiers();
  const [picking, setPicking] = useState(null);       // piatto con opzioni da scegliere prima di aggiungerlo

  const load = useCallback(async () => {
    try {
      const [r, c] = await Promise.all([fetchWithAuth('/rooms'), fetchWithAuth('/checks?status=open')]);
      setRooms(r); setChecks(c);
    } catch (err) { showToast(err.message || 'Errore caricamento sala', 'error'); }
  }, [showToast]);

  useEffect(() => { load(); }, [load, service?.id]);
  // La cucina segna pronta una portata: lo si dice a chi è in sala, così la porta al tavolo (niente da confermare)
  useEffect(() => {
    const o = event?.type === 'order_updated' ? event.order : null;
    if (o?.status === 'completed' && o.check_id && o.order_type !== 'cover')
      showToast(`${o.table_name ? `Tavolo ${o.table_name}` : 'Conto'}: ${o.course_name ?? 'piatti'} pronti`, 'success');
  }, [event, showToast]);
  // Un conto cambia su un altro dispositivo
  useEffect(() => { if (event?.type === 'check_updated') load(); }, [event, load]);

  const reset = () => { setPicking(null); setOrdering(false); setDraftOpen(false); setCart([]); setPlan(emptyPlan()); };
  const close = () => { reset(); setSelection(null); load(); };
  const select = (table, check) => {
    if (!check && !service) return showToast('Apri il servizio per aprire i tavoli', 'warning');
    if (selection?.checkId !== (check?.id ?? null) || selection?.table.id !== table.id) reset();
    setSelection({ table, checkId: check?.id ?? null });
  };
  const addWith = (product, chosen = []) => {
    const res = addToCart(cart, { ...product, course_id: courseOfProduct(product, courses) }, 1, chosen);
    if (res.blocked) return showToast(`"${product.name}": disponibilità esaurita`, 'warning');
    setCart(res.cart);
  };
  // Un piatto con opzioni passa dalla scelta; gli altri entrano subito
  const add = (product) => (modifiers.forProduct(product).length ? setPicking(product) : addWith(product));

  if (!rooms) return <div className={`${card} flex-1`}><p className="text-[var(--text-muted)]">Caricamento sala…</p></div>;

  const side = (
    <SidePanel selection={selection} user={user} service={service} event={event} ordering={ordering}
      cart={cart} setCart={setCart} products={products} courses={courses} plan={plan} setPlan={setPlan}
      onBack={close} onOpened={(check) => { setSelection(s => ({ ...s, checkId: check.id })); load(); }} onBusy={close}
      onOrder={() => setOrdering(true)} onDraftBack={() => (narrow ? setDraftOpen(false) : setOrdering(false))}
      onSent={() => { reset(); load(); }} onChanged={load}
      onSwitch={(check) => { reset(); setSelection({ table: rooms.flatMap(r => r.tables).find(t => t.id === check.table_id), checkId: check.id }); load(); }} />
  );
  const floor = <FloorView rooms={rooms} checks={checks} service={service} selectedTableId={selection?.table.id} onSelect={select} />;
  const menu = picking
    ? <ModifierPicker key={picking.id} product={picking} groups={modifiers.forProduct(picking)} onCancel={() => setPicking(null)} onAdd={(chosen) => { addWith(picking, chosen); setPicking(null); }} />
    : <OrderMenu products={products} cart={cart} tableName={selection?.table.name} onAdd={add} onBack={() => { setOrdering(false); setDraftOpen(false); }} />;

  if (!narrow) {
    return (
      <>
        <div className={`${card} flex-1 min-h-0 ${ordering ? 'overflow-y-auto no-scrollbar' : 'overflow-hidden'}`}>{ordering ? menu : floor}</div>
        <div className="w-[420px] shrink-0 h-full">{side}</div>
      </>
    );
  }

  // Schermo stretto: i tavoli, e sopra a tutto schermo il pannello (o la carta con la comanda in basso)
  return (
    <>
      <div className={`${card} flex-1 min-h-0 overflow-hidden`}>{floor}</div>
      {selection && (
        <div className="fixed inset-0 z-[1700] bg-[var(--bg-main)] p-3" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))', paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
          {ordering ? (
            <div className="flex flex-col h-full gap-3">
              <div className={`${card} flex-1 min-h-0 overflow-hidden`}>{menu}</div>
              <button className={`${btnPrimary} w-full !py-4 !text-sm shrink-0`} onClick={() => setDraftOpen(true)}>
                <ShoppingBag size={18} /> Comanda · {cart.reduce((s, l) => s + l.quantity, 0)} · {formatEuro(cartTotal(cart))}
              </button>
              {draftOpen && <div className="fixed inset-0 z-[1750] bg-[var(--bg-main)] p-3">{side}</div>}
            </div>
          ) : side}
        </div>
      )}
    </>
  );
};

export default SalaPage;
