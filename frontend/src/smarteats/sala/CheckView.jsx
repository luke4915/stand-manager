import { useState } from 'react';
import { Plus, Wallet, Lock, BellRing, BellOff, Percent, Printer, Trash2 } from 'lucide-react';
import { fetchWithAuth } from '../../utils/apiClient';
import { useToast } from '../../context/useToast';
import PanelFrame from './PanelFrame';
import CheckMenu from './CheckMenu';
import CheckOrders from './CheckOrders';
import { formatEuro } from './checkMath';
import { btn, btnPrimary, btnDanger, label, row } from './ui';

const METHOD = { cash: 'Contanti', card: 'Carta', other: 'Altro' };
const time = (iso) => new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
const DISCOUNT_ROLES = ['admin', 'responsabile'];

// Il conto di un tavolo, nel pannello a destra: righe per comanda e due azioni sempre in vista (Aggiungi, Incassa).
// Tutto il resto sta nel menu «⋯».
const CheckView = ({ detail, user, service, onBack, onOrder, onPay, onAdjust, onChanged, onDeleted, onPrint }) => {
  const { showToast } = useToast();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const open = detail.status === 'open';
  const activeOrders = detail.orders.filter(o => o.status !== 'canceled');
  const canDiscount = DISCOUNT_ROLES.includes(user.role);
  const hasPayments = detail.payments.length > 0;
  const billRequested = open && detail.bill_requested_at;

  const run = async (action) => {
    setBusy(true);
    try { await action(); } catch (err) { showToast(err.message, 'error'); }
    finally { setBusy(false); await onChanged(); }
  };
  const deleteCheck = async () => {
    setBusy(true);
    try {
      await fetchWithAuth(`/checks/${detail.id}/void`, { method: 'POST', body: { cancel_orders: activeOrders.length > 0 } });
      showToast('Conto eliminato', 'info');
      onDeleted();
    } catch (err) { showToast(err.message, 'error'); await onChanged(); }
    finally { setBusy(false); }
  };

  const menu = open && [
    { label: billRequested ? 'Annulla richiesta conto' : 'Il cliente chiede il conto', icon: billRequested ? BellOff : BellRing,
      onClick: () => run(() => fetchWithAuth(`/checks/${detail.id}/bill-request`, { method: 'POST', body: { requested: !detail.bill_requested_at } })) },
    { label: 'Stampa il conto', icon: Printer, onClick: () => onPrint() },
    canDiscount && activeOrders.length > 0 && { label: 'Omaggio o sconto', icon: Percent, onClick: onAdjust },
    (user.role === 'admin' || (canDiscount && activeOrders.length === 0)) && { label: 'Elimina conto', icon: Trash2, danger: true, disabled: hasPayments, hint: 'Ci sono già pagamenti', onClick: () => setConfirmDelete(true) },
  ];

  const subtitle = billRequested ? `Conto richiesto · ${detail.covers} cop.` : `${{ open: 'Aperto', paid: 'Pagato', void: 'Annullato' }[detail.status]} · ${detail.covers} cop. · n. ${detail.number}`;
  const subtitleClass = billRequested ? 'text-amber-500' : open ? 'text-green-500' : 'text-[var(--text-muted)]';

  return (
    <PanelFrame title={detail.table_name ?? 'Banco'} subtitle={subtitle} subtitleClass={subtitleClass} onBack={onBack}
      actions={menu && <CheckMenu items={menu} />}
      footer={
        <>
          <div className="space-y-0.5">
            {hasPayments && <div className="flex justify-between text-xs text-[var(--text-muted)]"><span>Totale {formatEuro(detail.total)}</span><span>Pagato {formatEuro(detail.paid)}</span></div>}
            <div className="flex justify-between items-baseline">
              <span className={label}>{open ? 'Da pagare' : 'Totale'}</span>
              <span className="text-3xl font-black tabular-nums text-[var(--text-main)]">{formatEuro(open ? detail.due : detail.total)}</span>
            </div>
          </div>
          {open ? (
            <div className="grid grid-cols-2 gap-2">
              <button className={btn} disabled={busy || !service} title={service ? undefined : 'Il servizio è chiuso'} onClick={onOrder}><Plus size={16} /> Aggiungi</button>
              {detail.due > 0
                ? <button className={btnPrimary} disabled={busy} onClick={onPay}><Wallet size={16} /> Incassa</button>
                : <button className={btnPrimary} disabled={busy || !activeOrders.length} onClick={() => run(() => fetchWithAuth(`/checks/${detail.id}/close`, { method: 'POST', body: {} }))}><Lock size={16} /> Chiudi</button>}
            </div>
          ) : <button className={`${btn} w-full`} onClick={() => onPrint()}><Printer size={16} /> Stampa ricevuta</button>}
        </>
      }>
      {confirmDelete && (
        <div className="p-3 rounded-xl border border-red-500/40 bg-red-500/5 space-y-2">
          <p className="text-xs text-[var(--text-main)]">
            {activeOrders.length > 0 ? `Elimina il conto e annulla ${activeOrders.length} ${activeOrders.length === 1 ? 'comanda' : 'comande'}: i prodotti tornano disponibili.` : 'Annulla il conto vuoto: il tavolo torna libero.'}
          </p>
          <div className="flex gap-2">
            <button className={`${btn} flex-1 !py-2`} onClick={() => setConfirmDelete(false)}>No</button>
            <button className={`${btnDanger} flex-1 !py-2`} disabled={busy} onClick={deleteCheck}>Sì, elimina</button>
          </div>
        </div>
      )}
      <CheckOrders detail={detail} onChanged={onChanged} />
      {hasPayments && (
        <section className="space-y-1.5 pt-2">
          <p className="px-1 text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">Pagamenti</p>
          {detail.payments.map(p => (
            <button key={p.id} onClick={() => onPrint(p.id)} title="Stampa la ricevuta di questo pagamento" className={`${row} w-full flex items-center gap-2 text-left hover:border-[var(--accent)]/60`}>
              <span className="flex-1 min-w-0 text-xs font-bold uppercase text-[var(--text-main)] truncate">
                {METHOD[p.method]} · {time(p.paid_at)}{p.items.length > 0 && <span className="font-normal normal-case text-[var(--text-muted)]"> · {p.items.map(i => `${i.quantity}× ${i.name}`).join(', ')}</span>}
              </span>
              <span className="font-black text-xs tabular-nums text-[var(--text-main)]">{formatEuro(p.amount)}</span>
              <Printer size={14} className="text-[var(--text-muted)] shrink-0" />
            </button>
          ))}
        </section>
      )}
    </PanelFrame>
  );
};

export default CheckView;
