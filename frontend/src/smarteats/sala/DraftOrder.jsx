import { useState, useRef, useMemo } from 'react';
import { Minus, Plus, ArrowUp, ArrowDown } from 'lucide-react';
import { fetchWithAuth, NetworkError } from '../../utils/apiClient';
import { useToast } from '../../context/useToast';
import { printFired } from './printFired';
import PanelFrame from './PanelFrame';
import { cartTotal, formatEuro } from './checkMath';
import { buildGroups, moveGroup, toggleTogether, toPayload, sendSummary } from './courses';
import { btnPrimary, iconBtn, input, label } from './ui';

const names = (groups) => groups.map(g => g.name).join(', ');

// La comanda in preparazione per un tavolo. I piatti si dividono da soli per portata, nell'ordine del locale; qui si
// decide cosa esce prima, cosa dopo e cosa insieme. Alla conferma esce la prima portata, le altre restano sul conto
// «da mandare». Le comande dei tavoli richiedono il server: lo stato del conto è condiviso fra i dispositivi.
const DraftOrder = ({ detail, service, cart, setCart, products, courses, plan, setPlan, onBack, onSent }) => {
  const { showToast } = useToast();
  const [openLine, setOpenLine] = useState(null);       // indice della riga aperta (nota e portata)
  const [holdAll, setHoldAll] = useState(false);        // non mandare niente ora
  const [sending, setSending] = useState(false);
  // Una chiave per portata: se la risposta si perde e si preme di nuovo, il giro non si duplica.
  const attempt = useRef({});

  const groups = useMemo(() => buildGroups(cart, courses, plan), [cart, courses, plan]);
  const split = groups.length > 1 || groups[0]?.key !== 0;    // senza portate in gioco niente intestazioni
  const summary = sendSummary(groups, !holdAll);
  const total = cartTotal(cart);
  const count = cart.reduce((s, l) => s + l.quantity, 0);

  const change = (line, delta) => setCart(c => c.flatMap(l => {
    if (l !== line) return [l];
    const quantity = l.quantity + delta;
    return quantity > 0 ? [{ ...l, quantity }] : [];
  }));
  const increase = (line) => {
    const product = products?.find(p => p.id === line.id);
    const inCart = cart.filter(l => l.id === line.id).reduce((s, l) => s + l.quantity, 0);
    if (product?.stock_enabled && product.stock !== null && inCart + 1 > product.stock)
      return showToast(`"${line.name}": disponibilità esaurita`, 'warning');
    change(line, 1);
  };
  const patch = (line, fields) => setCart(c => c.map(l => (l === line ? { ...l, ...fields } : l)));

  const send = async () => {
    if (!navigator.onLine) return showToast('Senza connessione non si inviano comande ai tavoli', 'error');
    setSending(true);
    try {
      const payload = toPayload(groups).map(g => ({ ...g, client_order_id: (attempt.current[g.course_id ?? 0] ??= crypto.randomUUID()) }));
      const res = await fetchWithAuth(`/checks/${detail.id}/courses`, { method: 'POST', body: { groups: payload, fire_first: !holdAll } });
      if (res.duplicate) showToast('Comanda già inviata', 'info');
      else {
        await printFired(res.orders, res.fired, detail, service, showToast);
        showToast(res.fired.length ? 'Comanda inviata in cucina' : 'Comanda salvata: da mandare', 'success');
      }
      attempt.current = {};
      onSent();
    } catch (err) {
      showToast(err instanceof NetworkError ? 'Server non raggiungibile: la comanda non è stata inviata' : err.message, 'error');
    } finally { setSending(false); }
  };

  return (
    <PanelFrame title="Comanda" subtitle={`${detail.table_name} · ${detail.covers} cop.`} onBack={onBack}
      footer={
        <>
          <div className="flex justify-between items-baseline">
            <span className={label}>{count} {count === 1 ? 'piatto' : 'piatti'}</span>
            <span className="text-2xl font-semibold tabular-nums text-[var(--text-main)]">{formatEuro(total)}</span>
          </div>
          {split && groups.length > 0 && (
            <div className="text-xs text-[var(--text-muted)] space-y-0.5">
              {summary.now.length > 0 && <p>Esce subito: <span className="text-[var(--text-main)]">{names(summary.now)}</span></p>}
              {summary.later.length > 0 && <p>Da mandare dopo: <span className="text-[var(--text-main)]">{names(summary.later)}</span></p>}
              {groups.length > 1 || holdAll ? (
                <label className="flex items-center gap-2 pt-1 cursor-pointer select-none">
                  <input type="checkbox" checked={holdAll} onChange={e => setHoldAll(e.target.checked)} className="accent-[var(--accent)]" /> Non mandare niente ora
                </label>
              ) : null}
            </div>
          )}
          <button className={`${btnPrimary} w-full !h-12`} disabled={!cart.length || sending} onClick={send}>
            {sending ? 'Invio…' : summary.now.length || !split ? 'Invia in cucina' : 'Salva la comanda'}
          </button>
        </>
      }>
      {cart.length === 0 && <p className="h-full flex items-center justify-center text-center text-[var(--text-muted)] text-sm py-10">Tocca un piatto nella carta</p>}
      {groups.map((group, gi) => (
        <section key={group.key} className="space-y-1.5 pb-2">
          {split && (
            <div className="flex items-center gap-2 px-1 pt-2">
              <h3 className="text-sm font-semibold text-[var(--text-main)]">{group.name}</h3>
              {gi === 0
                ? <span className="text-xs text-[var(--text-muted)]">{holdAll ? 'in attesa' : 'esce subito'}</span>
                : (
                  <button onClick={() => setPlan(p => toggleTogether(p, group.key))} title="Cambia: esce dopo la portata precedente, o insieme"
                    className={`h-6 px-2 rounded-full text-xs font-medium border transition cursor-pointer ${group.together ? 'border-[var(--accent)] text-[var(--accent)] bg-[var(--accent)]/10' : 'border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}>
                    {group.together ? 'insieme alla precedente' : 'dopo la precedente'}
                  </button>
                )}
              <span className="ml-auto flex">
                <button className={`${iconBtn} !p-1`} aria-label={`Anticipa ${group.name}`} disabled={gi === 0} onClick={() => setPlan(p => moveGroup(cart, courses, p, group.key, -1))}><ArrowUp size={15} /></button>
                <button className={`${iconBtn} !p-1`} aria-label={`Posticipa ${group.name}`} disabled={gi === groups.length - 1} onClick={() => setPlan(p => moveGroup(cart, courses, p, group.key, 1))}><ArrowDown size={15} /></button>
              </span>
            </div>
          )}
          {group.lines.map((line) => {
            const index = cart.indexOf(line);
            const isOpen = openLine === index;
            return (
              <div key={`${line.id}-${index}`} className="px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-card-2)]">
                <div className="flex items-center gap-2">
                  <div className="flex items-center shrink-0">
                    <button className={`${iconBtn} !p-1`} aria-label={`Una in meno: ${line.name}`} onClick={() => change(line, -1)}><Minus size={14} /></button>
                    <span className="w-6 text-center text-sm font-semibold tabular-nums text-[var(--text-main)]">{line.quantity}</span>
                    <button className={`${iconBtn} !p-1`} aria-label={`Una in più: ${line.name}`} onClick={() => increase(line)}><Plus size={14} /></button>
                  </div>
                  <button className="flex-1 min-w-0 text-left text-sm text-[var(--text-main)] truncate cursor-pointer" onClick={() => setOpenLine(isOpen ? null : index)}>{line.name}</button>
                  <span className="text-sm tabular-nums text-[var(--text-muted)] shrink-0">{formatEuro(line.price * line.quantity)}</span>
                </div>
                {line.note && !isOpen && <p className="mt-1 ml-1 text-xs text-[var(--text-muted)]">{line.note}</p>}
                {isOpen && (
                  <div className="mt-2 space-y-2">
                    <input className={`${input} !h-9 !text-sm`} autoFocus maxLength={300} placeholder="Nota (es. senza cipolla)" aria-label={`Nota per ${line.name}`}
                      value={line.note} onChange={e => patch(line, { note: e.target.value })} onKeyDown={e => e.key === 'Enter' && setOpenLine(null)} />
                    {courses.length > 0 && (
                      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Portata">
                        {[{ id: null, name: 'Subito' }, ...courses].map(c => (
                          <button key={c.id ?? 0} onClick={() => patch(line, { course_id: c.id })}
                            className={`h-7 px-2.5 rounded-full text-xs font-medium border transition cursor-pointer ${(line.course_id ?? null) === c.id ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]' : 'border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}>{c.name}</button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </section>
      ))}
    </PanelFrame>
  );
};

export default DraftOrder;
