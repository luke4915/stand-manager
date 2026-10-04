import { useState, useEffect, useCallback } from 'react';
import { Plus, Wallet, BellRing, BellOff, Percent, Printer, Trash2, Lock } from 'lucide-react';
import { fetchWithAuth } from '../../utils/apiClient';
import { useToast } from '../../context/useToast';
import { printCheckReceipt } from '../../print/checkReceipt';
import Modal from './Modal';
import CheckOrders from './CheckOrders';
import OrderBuilder from './OrderBuilder';
import PaymentDialog from './PaymentDialog';
import AdjustDialog from './AdjustDialog';
import { formatEuro } from './checkMath';
import { btn, btnPrimary, btnDanger, label, card } from './ui';

const METHOD = { cash: 'Contanti', card: 'Carta', other: 'Altro' };
const time = (iso) => new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
const DISCOUNT_ROLES = ['admin', 'responsabile'];

// Il conto di un tavolo: comande, totale, pagamenti e tutte le azioni (nuova comanda, incasso, sconto, ricevuta,
// richiesta del conto, eliminazione). Si aggiorna da solo quando un altro dispositivo lo modifica.
const CheckPanel = ({ checkId, user, service, event, onClose, onChanged }) => {
  const { showToast } = useToast();
  const [detail, setDetail] = useState(null);
  const [dialog, setDialog] = useState(null);           // 'order' | 'pay' | 'adjust'
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setDetail(await fetchWithAuth(`/checks/${checkId}`)); }
    catch (err) { showToast(err.message, 'error'); onClose(); }
  }, [checkId, showToast, onClose]);
  useEffect(() => { load(); }, [load]);
  // Un altro dispositivo ha toccato questo conto
  useEffect(() => {
    if ((event?.type === 'check_updated' && event.check.id === checkId) || (event?.type === 'order_updated' && event.order.check_id === checkId)) load();
  }, [event, checkId, load]);

  const refresh = async () => { await load(); onChanged(); };
  const act = async (action) => {
    setBusy(true);
    try { await action(); await refresh(); }
    catch (err) { showToast(err.message, 'error'); await refresh(); }
    finally { setBusy(false); }
  };

  const print = async (paymentId = null) => {
    try {
      const receipt = await fetchWithAuth(`/checks/${checkId}/receipt${paymentId ? `?payment_id=${paymentId}` : ''}`);
      const queued = await printCheckReceipt(receipt);
      showToast(queued ? 'Ricevuta in stampa' : 'Nessuna stampante configurata', queued ? 'success' : 'warning');
    } catch (err) { showToast(`Errore di stampa: ${err.message}`, 'error'); }
  };

  if (!detail) return null;

  const open = detail.status === 'open';
  const activeOrders = detail.orders.filter(o => o.status !== 'canceled');
  const canDiscount = DISCOUNT_ROLES.includes(user.role);
  const isAdmin = user.role === 'admin';
  const hasPayments = detail.payments.length > 0;
  const statusLabel = { open: 'Aperto', paid: 'Pagato', void: 'Annullato' }[detail.status];
  const subtitle = `${detail.covers} ${detail.covers === 1 ? 'coperto' : 'coperti'} · conto n. ${detail.number} · aperto alle ${time(detail.opened_at)}${detail.opened_by_name ? ` da ${detail.opened_by_name}` : ''} · ${statusLabel}`;

  const deleteCheck = async () => {
    setBusy(true);
    try {
      await fetchWithAuth(`/checks/${checkId}/void`, { method: 'POST', body: { cancel_orders: activeOrders.length > 0 } });
      showToast('Conto eliminato', 'info');
      onChanged();
      onClose();
    } catch (err) { showToast(err.message, 'error'); await refresh(); }
    finally { setBusy(false); }
  };

  return (
    <>
      <Modal title={`${detail.table_name ?? 'Banco'}${detail.room_name ? ` · ${detail.room_name}` : ''}`} subtitle={subtitle} onClose={onClose} size="xl">
        <div className="grid lg:grid-cols-[1fr_380px] min-h-full">
          <section className="p-4 sm:p-6 order-2 lg:order-1"><CheckOrders detail={detail} onChanged={refresh} /></section>

          <aside className="p-4 sm:p-6 space-y-4 order-1 lg:order-2 lg:border-l border-[var(--border)] bg-[var(--bg-card-2)]">
            <div className={`${card} space-y-1`}>
              <div className="flex justify-between text-sm text-[var(--text-muted)]"><span>Totale</span><span className="tabular-nums">{formatEuro(detail.total)}</span></div>
              <div className="flex justify-between text-sm text-[var(--text-muted)]"><span>Pagato</span><span className="tabular-nums">{formatEuro(detail.paid)}</span></div>
              <div className="flex justify-between items-baseline pt-1 border-t border-[var(--border)]">
                <span className={label}>{open ? 'Da pagare' : 'Residuo'}</span>
                <span className="text-3xl font-black tabular-nums text-[var(--text-main)]">{formatEuro(detail.due)}</span>
              </div>
              {detail.bill_requested_at && open && <p className="text-xs font-black uppercase tracking-widest text-amber-500 pt-1">Conto richiesto alle {time(detail.bill_requested_at)}</p>}
            </div>

            {hasPayments && (
              <div className="space-y-1.5">
                <p className={label}>Pagamenti</p>
                {detail.payments.map(p => (
                  <div key={p.id} className="flex items-center gap-2 text-sm rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-[var(--text-main)]">{METHOD[p.method]} · {formatEuro(p.amount)}</p>
                      <p className="text-xs text-[var(--text-muted)] truncate">{time(p.paid_at)}{p.items.length > 0 && ` · ${p.items.map(i => `${i.quantity}× ${i.name}`).join(', ')}`}</p>
                    </div>
                    <button className="p-2 rounded-lg hover:bg-[var(--bg-card-2)] text-[var(--text-muted)]" aria-label="Stampa ricevuta del pagamento" onClick={() => print(p.id)}><Printer size={15} /></button>
                  </div>
                ))}
              </div>
            )}

            {open ? (
              <div className="grid grid-cols-2 gap-2">
                <button className={`${btnPrimary} col-span-2 !py-4`} disabled={busy || !service} onClick={() => setDialog('order')}><Plus size={16} /> Nuova comanda</button>
                {detail.due > 0
                  ? <button className={`${btn} col-span-2`} disabled={busy} onClick={() => setDialog('pay')}><Wallet size={16} /> Incassa</button>
                  : activeOrders.length > 0 && <button className={`${btnPrimary} col-span-2`} disabled={busy} onClick={() => act(() => fetchWithAuth(`/checks/${checkId}/close`, { method: 'POST', body: {} }))}><Lock size={16} /> Chiudi conto</button>}
                <button className={btn} disabled={busy} onClick={() => act(() => fetchWithAuth(`/checks/${checkId}/bill-request`, { method: 'POST', body: { requested: !detail.bill_requested_at } }))}>
                  {detail.bill_requested_at ? <><BellOff size={16} /> Annulla</> : <><BellRing size={16} /> Chiede il conto</>}
                </button>
                <button className={btn} onClick={() => print()}><Printer size={16} /> Conto</button>
                {canDiscount && activeOrders.length > 0 && <button className={`${btn} col-span-2`} onClick={() => setDialog('adjust')}><Percent size={16} /> Omaggio o sconto</button>}
                {(isAdmin || (canDiscount && activeOrders.length === 0)) && (
                  confirmDelete ? (
                    <div className="col-span-2 space-y-2 rounded-2xl border border-red-500/40 bg-red-500/5 p-3">
                      <p className="text-xs text-[var(--text-main)]">
                        {activeOrders.length > 0
                          ? `Elimina il conto e annulla ${activeOrders.length} ${activeOrders.length === 1 ? 'comanda' : 'comande'}: i prodotti tornano disponibili.`
                          : 'Annulla il conto vuoto: il tavolo torna libero.'}
                      </p>
                      <div className="flex gap-2">
                        <button className={`${btn} flex-1`} onClick={() => setConfirmDelete(false)}>No</button>
                        <button className={`${btnDanger} flex-1`} disabled={busy} onClick={deleteCheck}>Sì, elimina</button>
                      </div>
                    </div>
                  ) : (
                    <button className={`${btnDanger} col-span-2`} disabled={hasPayments} title={hasPayments ? 'Ci sono già pagamenti: il conto non si può eliminare' : undefined} onClick={() => setConfirmDelete(true)}>
                      <Trash2 size={16} /> Elimina conto
                    </button>
                  )
                )}
                {!service && <p className="col-span-2 text-xs text-amber-500">Il servizio è chiuso: non si possono aggiungere comande.</p>}
              </div>
            ) : (
              <button className={`${btn} w-full`} onClick={() => print()}><Printer size={16} /> Stampa ricevuta</button>
            )}
          </aside>
        </div>
      </Modal>

      {dialog === 'order' && <OrderBuilder check={detail} service={service} onClose={() => setDialog(null)} onSent={() => { setDialog(null); refresh(); }} />}
      {dialog === 'pay' && <PaymentDialog detail={detail} onClose={() => setDialog(null)} onPaid={refresh} onPrint={print} />}
      {dialog === 'adjust' && <AdjustDialog detail={detail} onClose={() => setDialog(null)} onDone={refresh} />}
    </>
  );
};

export default CheckPanel;
