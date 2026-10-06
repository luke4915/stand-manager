import React from 'react';
import { ShoppingCart, Check, Printer, MessageSquare, QrCode, Trash2, ShoppingBag, ChevronLeft, Minus, Plus } from 'lucide-react';
import { getLineTotal, getAdjustmentLabel } from '../../../utils/pricing';
import OrderDiscountPanel from '../OrderDiscountPanel';

// Il carrello da telefono, a tutto schermo. Dall'alto: intestazione con «indietro» e le azioni, le righe (con più e
// meno direttamente sulla riga; un tocco sul nome apre nota e sconto), poi in basso, alla portata del pollice: totale,
// contanti ricevuti e resto, e «Invia ordine». La logica è quella di sempre (Cart.jsx): qui cambia solo la disposizione.
const CartMobileView = ({
    onClose,
    cart,
    mergedCart,
    cartKey,
    total,
    fullTotal,
    hasAnyDiscount,
    amountReceived,
    setAmountReceived,
    change,
    sessionActive,
    handleSendOrder,
    sending,
    setSelectedItem,
    setIsQRScanModalOpen,
    setIsReprintModalOpen,
    setIsClearModalOpen,
    applyOrderDiscount,
    canDiscount,
    isAllGift,
    derivedOrderPercent,
    isTakeaway,
    setIsTakeaway,
    addToCart,
    removeLastItem,
    children
}) => {

    // Scorciatoie per i contanti ricevuti
    const quickCashOptions = [5, 10, 20, 50];
    const pieces = cart.reduce((s, i) => s + i.quantity, 0);

    const iconBtn = 'h-11 w-11 shrink-0 flex items-center justify-center rounded-lg border border-[var(--border)] text-[var(--text-muted)] active:scale-95 transition disabled:opacity-40';

    return (
        <div className="flex flex-col h-[100dvh] bg-[var(--bg-card)] text-[var(--text-main)] overflow-hidden safe-bottom">

            {/* ─── Intestazione ─── */}
            <div className="px-2 py-2 flex items-center gap-1 border-b border-[var(--border)] shrink-0">
                <button onClick={onClose} aria-label="Torna ai prodotti" className="h-11 w-11 flex items-center justify-center rounded-lg text-[var(--text-main)] active:bg-[var(--bg-card-2)]">
                    <ChevronLeft size={24} />
                </button>
                <div className="min-w-0 flex-1">
                    <h2 className="text-base font-semibold leading-tight">Ordine</h2>
                    <p className={`text-xs ${sessionActive ? 'text-green-500' : 'text-red-400'}`}>
                        {pieces} {pieces === 1 ? 'articolo' : 'articoli'} · {sessionActive ? 'sessione attiva' : 'sessione non attiva'}
                    </p>
                </div>

                <button onClick={() => setIsTakeaway(v => !v)} aria-pressed={isTakeaway} title={isTakeaway ? 'Asporto attivo' : 'Segna come asporto'}
                    className={`${iconBtn} ${isTakeaway ? '!bg-green-500 !border-green-500 !text-white' : ''}`}>
                    <ShoppingBag size={20} />
                </button>
                {canDiscount && (
                    <OrderDiscountPanel cart={cart} derivedOrderPercent={derivedOrderPercent} applyOrderDiscount={applyOrderDiscount}
                        buttonClassName="p-3 min-w-[44px] min-h-[44px] flex items-center justify-center" />
                )}
                <button onClick={() => setIsQRScanModalOpen(true)} aria-label="Scansiona QR" className={iconBtn}><QrCode size={20} /></button>
                <button disabled={!sessionActive} onClick={() => setIsReprintModalOpen(true)} aria-label="Ristampa" className={iconBtn}><Printer size={20} /></button>
            </div>

            {/* ─── Righe ─── */}
            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2 no-scrollbar">
                {mergedCart.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-[var(--text-muted)] opacity-40">
                        <ShoppingCart size={44} />
                        <p className="text-sm mt-3">Il carrello è vuoto</p>
                    </div>
                ) : (
                    mergedCart.map(item => {
                        const adjLabel = getAdjustmentLabel(item);
                        const effTotal = getLineTotal(item);
                        return (
                            <div key={cartKey(item)} className="rounded-lg border border-[var(--border)] bg-[var(--bg-card-2)] p-2.5 flex items-center gap-2 select-none">
                                <button onClick={() => setSelectedItem(item)} className="min-w-0 flex-1 text-left py-1 pl-1 cursor-pointer" aria-label={`Modifica ${item.name}`}>
                                    <span className="flex items-center gap-2 min-w-0">
                                        <span className="font-medium text-sm leading-snug truncate">{item.name}</span>
                                        {adjLabel && <span className={`shrink-0 text-[11px] font-semibold px-1.5 py-0.5 rounded-full ${item.type === 'gift' ? 'bg-purple-500/10 text-purple-500' : 'bg-orange-500/10 text-orange-500'}`}>{adjLabel}</span>}
                                    </span>
                                    {item.note && (
                                        <span className="mt-1 flex items-center gap-1.5 text-xs text-yellow-500 min-w-0">
                                            <MessageSquare size={12} className="shrink-0" /><span className="truncate">{item.note}</span>
                                        </span>
                                    )}
                                    <span className="mt-0.5 block text-xs tabular-nums text-[var(--text-muted)]">
                                        {adjLabel
                                            ? <><span className="line-through">{(item.price * item.quantity).toFixed(2)} €</span> <span className={item.type === 'gift' ? 'text-purple-500' : 'text-orange-500'}>{effTotal.toFixed(2)} €</span></>
                                            : `${item.price.toFixed(2)} € l'uno`}
                                    </span>
                                </button>

                                {/* Più e meno direttamente sulla riga */}
                                <div className="flex items-center shrink-0">
                                    <button onClick={() => removeLastItem(item)} aria-label={`Una in meno: ${item.name}`}
                                        className="h-10 w-10 flex items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--bg-card)] active:scale-90 transition">
                                        {item.quantity === 1 ? <Trash2 size={16} className="text-red-500" /> : <Minus size={16} />}
                                    </button>
                                    <span className="w-8 text-center text-base font-semibold tabular-nums">{item.quantity}</span>
                                    <button onClick={() => addToCart(item)} aria-label={`Una in più: ${item.name}`}
                                        className="h-10 w-10 flex items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--bg-card)] active:scale-90 transition">
                                        <Plus size={16} />
                                    </button>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {/* ─── Pagamento, alla portata del pollice ─── */}
            <div className="border-t border-[var(--border)] bg-[var(--bg-card-2)] px-3 pt-3 pb-safe-bottom space-y-3 shrink-0">

                {/* Totale */}
                <div className="flex items-end justify-between px-1">
                    <div>
                        <span className="text-sm text-[var(--text-muted)]">Totale</span>
                        {isAllGift && <span className="ml-2 text-xs font-semibold bg-purple-500/10 text-purple-500 px-2 py-0.5 rounded-full">Omaggio</span>}
                        {!isAllGift && hasAnyDiscount && <span className="ml-2 text-xs font-semibold bg-orange-500/10 text-orange-500 px-2 py-0.5 rounded-full">Scontato</span>}
                    </div>
                    {hasAnyDiscount ? (
                        <div className="flex items-baseline gap-2">
                            <span className="text-sm line-through text-[var(--text-muted)] tabular-nums">{fullTotal.toFixed(2)} €</span>
                            <span className={`text-3xl font-semibold tabular-nums ${isAllGift ? 'text-purple-500' : 'text-orange-500'}`}>{total.toFixed(2)} €</span>
                        </div>
                    ) : (
                        <span className="text-3xl font-semibold tabular-nums text-[var(--text-main)]">{total.toFixed(2)} €</span>
                    )}
                </div>

                {/* Contanti: ricevuti e resto */}
                <div className="grid grid-cols-2 gap-2">
                    <label className="bg-[var(--bg-card)] px-3 py-1.5 rounded-lg border border-[var(--border)] flex flex-col">
                        <span className="text-xs text-[var(--text-muted)]">Ricevuti</span>
                        <input type="text" inputMode="decimal" value={amountReceived} placeholder="0.00"
                            onChange={e => { const val = e.target.value; if (val === '' || /^\d*\.?\d{0,2}$/.test(val)) setAmountReceived(val); }}
                            className="w-full bg-transparent outline-none text-lg font-semibold tabular-nums text-[var(--text-main)]" />
                    </label>
                    <div className="bg-[var(--bg-card)] px-3 py-1.5 rounded-lg border border-[var(--border)] flex flex-col">
                        <span className="text-xs text-[var(--text-muted)]">Resto</span>
                        <span className={`text-lg font-semibold tabular-nums ${change < 0 ? 'text-red-500' : 'text-green-500'}`}>{change >= 0 ? change.toFixed(2) : '0.00'} €</span>
                    </div>
                </div>
                <div className="flex gap-2 overflow-x-auto no-scrollbar">
                    <button onClick={() => setAmountReceived(total.toFixed(2))} disabled={cart.length === 0}
                        className="px-3.5 h-10 bg-[var(--bg-card)] border border-[var(--border)] text-sm font-medium rounded-lg shrink-0 active:bg-[var(--accent)] active:text-white disabled:opacity-40">Esatto</button>
                    {quickCashOptions.map(amount => (
                        <button key={amount} onClick={() => setAmountReceived(amount.toString())} disabled={cart.length === 0}
                            className="px-4 h-10 bg-[var(--bg-card)] border border-[var(--border)] text-sm font-medium tabular-nums rounded-lg shrink-0 active:bg-[var(--accent)] active:text-white disabled:opacity-40">{amount} €</button>
                    ))}
                </div>

                <button onClick={handleSendOrder} disabled={cart.length === 0 || !sessionActive || sending}
                    className="w-full h-14 bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:bg-[var(--bg-input)] disabled:text-[var(--text-muted)] text-white rounded-xl font-semibold text-base active:scale-[0.98] transition flex items-center justify-center gap-2.5">
                    <Check size={20} /> {sending ? 'Invio…' : 'Invia ordine'}
                </button>

                <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => cart.length > 0 && setIsClearModalOpen(true)} disabled={cart.length === 0}
                        className="h-10 border border-red-500/30 text-red-500 rounded-lg text-sm font-medium transition disabled:opacity-30 flex items-center justify-center gap-1.5 active:bg-red-500/10">
                        <Trash2 size={14} /> Svuota
                    </button>
                    {children && (
                        <div className="[&>*]:w-full [&>*]:h-10 [&>*]:rounded-lg [&>*]:text-sm [&>*]:font-medium [&>*]:flex [&>*]:items-center [&>*]:justify-center [&>*]:gap-1.5 [&>*]:border [&>*]:border-[var(--border)] [&>*]:bg-[var(--bg-card)]">
                            {children}
                        </div>
                    )}
                </div>
            </div>

        </div>
    );
};

export default CartMobileView;
