import React from 'react';
import { ShoppingCart, Check, Printer, MessageSquare, QrCode, Trash2, ShoppingBag } from 'lucide-react';
import { getLineTotal, getAdjustmentLabel } from '../../../utils/pricing';
import OrderDiscountPanel from '../OrderDiscountPanel';

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
    children
}) => {

    // Tastierino numerico rapido per velocizzare la cassa da smartphone
    const quickCashOptions = [5, 10, 20, 50];

    const handleQuickCash = (value) => {
        setAmountReceived(value.toString());
    };

    const handleExactCash = () => {
        // "total" è già il totale REALE da incassare (netto sconti/omaggi)
        setAmountReceived(total.toFixed(2));
    };

    return (
        <div className="flex flex-col h-[100dvh] bg-[var(--bg-card)] text-[var(--text-main)] overflow-hidden safe-bottom">

            {/* Handle swipe-down — pattern nativo iOS */}
            <div className="flex justify-center pt-3 pb-1 shrink-0" onClick={onClose}>
                <div className="w-10 h-1 rounded-full bg-[var(--border)]" />
            </div>

            {/* ─── HEADER MOBILE OPTIMIZED ─── */}
            <div className="px-4 py-3 flex justify-between items-center border-b border-[var(--border)] bg-[var(--bg-card)] shrink-0">
                <div>
                    <div className="flex items-center gap-2">
                        <h2 className="text-lg font-semibold tracking-tight">Carrello</h2>
                        <span className="bg-[var(--accent)]/10 text-[var(--accent)] text-xs font-semibold px-2 py-0.5 rounded-full">
                            {cart.length} pezzi
                        </span>
                    </div>
                    <span className={`text-xs font-bold ${sessionActive ? 'text-green-500' : 'text-red-400'}`}>
                        {sessionActive ? '● Sessione attiva' : '● Non attiva'}
                    </span>
                </div>

                {/* Pulsanti azione rapidi e grandi */}
                <div className="flex items-center gap-1.5">

                    {/* Pulsante flag asporto */}
                    <button
                        onClick={() => setIsTakeaway(v => !v)}
                        title={isTakeaway ? 'Disattiva asporto' : 'Segna come asporto'}
                        className={`p-2 rounded-xl border transition-all ${isTakeaway
                            ? 'bg-green-500 border-green-500 text-white'
                            : 'border-[var(--border)] text-[var(--text-muted)] hover:text-green-500 hover:border-green-500/50'}`}>
                        <ShoppingBag size={20} />
                    </button>

                    {/* Pannello Sconto / Omaggio sull'intero ordine (solo admin/responsabile) */}
                    {canDiscount && (
                        <OrderDiscountPanel cart={cart} derivedOrderPercent={derivedOrderPercent} applyOrderDiscount={applyOrderDiscount}
                            buttonClassName="p-3 min-w-[44px] min-h-[44px] flex items-center justify-center" />
                    )}

                    <button
                        onClick={() => setIsQRScanModalOpen(true)}
                        className="p-3 rounded-xl bg-[var(--bg-card-2)] border border-[var(--border)] text-[var(--text-main)] active:scale-95 transition-all min-w-[44px] min-h-[44px] flex items-center justify-center"
                    >
                        <QrCode size={20} />
                    </button>

                    <button
                        disabled={!sessionActive}
                        onClick={() => setIsReprintModalOpen(true)}
                        className="p-3 rounded-xl bg-[var(--bg-card-2)] border border-[var(--border)] text-[var(--text-main)] active:scale-95 transition-all min-w-[44px] min-h-[44px] flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
                    >
                        <Printer size={20} />
                    </button>
                </div>
            </div>

            {/* ─── LISTA ARTICOLI (Touch area maggiorata) ─── */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2.5 no-scrollbar bg-[var(--bg-card)]">
                {mergedCart.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-[var(--text-muted)] opacity-25">
                        <ShoppingCart size={48} />
                        <p className="text-xs font-semibold mt-3">Il carrello è vuoto</p>
                    </div>
                ) : (
                    mergedCart.map(item => {
                        const adjLabel = getAdjustmentLabel(item);
                        const effTotal = getLineTotal(item);
                        return (
                            <div
                                key={cartKey(item)}
                                onClick={() => setSelectedItem(item)}
                                className="p-4 rounded-xl border border-gray-300 dark:border-[var(--border)] bg-[var(--bg-card-2)] active:bg-[var(--border)] active:scale-[0.98] transition-all flex flex-col gap-2 select-none"
                            >
                                <div className="flex justify-between items-center gap-3">
                                    <div className="flex items-center gap-3 min-w-0 flex-1">
                                        <span className="bg-[var(--accent)] text-white text-xs font-semibold min-w-[24px] h-6 px-1.5 flex items-center justify-center rounded-lg shrink-0">
                                            {item.quantity}
                                        </span>
                                        <span className="font-bold text-sm leading-snug truncate">
                                            {item.name}
                                        </span>
                                        {adjLabel && (
                                            <span className={`shrink-0 text-[11px] font-semibold px-1.5 py-0.5 rounded-full ${item.type === 'gift' ? 'bg-purple-500/10 text-purple-500' : 'bg-orange-500/10 text-orange-500'}`}>{adjLabel}</span>
                                        )}
                                    </div>
                                    {adjLabel ? (
                                        <span className="flex items-baseline gap-1.5 shrink-0">
                                            <span className="text-xs font-bold tabular-nums text-[var(--text-muted)] line-through">{(item.price * item.quantity).toFixed(2)}€</span>
                                            <span className={`font-semibold text-sm tabular-nums ${item.type === 'gift' ? 'text-purple-500' : 'text-orange-500'}`}>{effTotal.toFixed(2)}€</span>
                                        </span>
                                    ) : (
                                        <span className="font-semibold text-sm tabular-nums shrink-0">
                                            {(item.price * item.quantity).toFixed(2)}€
                                        </span>
                                    )}
                                </div>

                                {item.note && (
                                    <div className="flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/20 rounded-xl px-3 py-1.5 self-start max-w-full">
                                        <MessageSquare size={12} className="text-yellow-500 shrink-0" />
                                        <span className="text-xs font-bold tracking-wide text-yellow-500 truncate">
                                            {item.note}
                                        </span>
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </div>

            {/* ─── CONTROLLI DI CASSA INFERIORI (Thumb-Zone) ─── */}
            <div className="border-t border-[var(--border)] bg-[var(--bg-card-2)] px-4 pt-3 pb-safe-bottom space-y-3 shadow-[0_-8px_24px_rgba(0,0,0,0.05)] shrink-0">

                {/* Gestione Contanti & Input */}
                <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2.5">
                        <div className="bg-[var(--bg-card)] px-3 py-2 rounded-xl border border-[var(--border)] flex flex-col justify-center">
                            <span className="text-xs font-semibold text-[var(--text-muted)]">Ricevuti</span>
                            <input
                                type="text"
                                inputMode="decimal"
                                value={amountReceived}
                                onChange={e => {
                                    const val = e.target.value;
                                    if (val === '' || /^\d*\.?\d{0,2}$/.test(val)) {
                                        setAmountReceived(val);
                                    }
                                }}
                                placeholder="0.00"
                                className="w-full bg-transparent outline-none font-semibold text-lg tabular-nums text-right text-[var(--text-main)]"
                            />
                        </div>
                        <div className="bg-[var(--bg-card)] px-3 py-2 rounded-xl border border-[var(--border)] flex flex-col justify-center">
                            <span className="text-xs font-semibold text-[var(--text-muted)]">Resto</span>
                            <span className={`text-lg font-semibold tabular-nums text-right block ${change < 0 ? 'text-red-500' : 'text-green-500'}`}>
                                {change >= 0 ? change.toFixed(2) : '0.00'} €
                            </span>
                        </div>
                    </div>

                    {/* Scorciatoie Contanti veloci */}
                    <div className="flex gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                        <button
                            onClick={handleExactCash}
                            disabled={cart.length === 0}
                            className="px-3 h-8 bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-main)] font-semibold text-[11px] rounded-lg shrink-0 active:bg-[var(--accent)] active:text-white disabled:opacity-40"
                        >
                            Importo esatto
                        </button>
                        {quickCashOptions.map(amount => (
                            <button
                                key={amount}
                                onClick={() => handleQuickCash(amount)}
                                disabled={cart.length === 0}
                                className="px-3.5 h-8 bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-main)] font-semibold text-xs tabular-nums rounded-lg shrink-0 active:bg-[var(--accent)] active:text-white disabled:opacity-40"
                            >
                                €{amount}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Totale Economico con gestione Omaggio */}
                <div className="flex justify-between items-center px-1">
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-[var(--text-muted)]">Totale comanda</span>
                        {isAllGift && <span className="text-[11px] font-semibold bg-purple-500/10 text-purple-500 border border-purple-500/30 px-2 py-0.5 rounded-full">Omaggio</span>}
                        {!isAllGift && hasAnyDiscount && <span className="text-[11px] font-semibold bg-orange-500/10 text-orange-500 border border-orange-500/30 px-2 py-0.5 rounded-full">Scontato</span>}
                    </div>
                    {hasAnyDiscount ? (
                        <div className="flex items-baseline gap-2">
                            <span className="text-sm font-semibold line-through text-[var(--text-muted)] tabular-nums">{fullTotal.toFixed(2)} €</span>
                            <span className={`text-3xl font-semibold tracking-tight tabular-nums ${isAllGift ? 'text-purple-500' : 'text-orange-500'}`}>{total.toFixed(2)} €</span>
                        </div>
                    ) : (
                        <span className="text-3xl font-semibold tracking-tight text-[var(--accent)] tabular-nums">{total.toFixed(2)} €</span>
                    )}
                </div>

                {/* ACTION BUTTON GIGANTE (Invia ordine) */}
                <button
                    onClick={handleSendOrder}
                    disabled={cart.length === 0 || !sessionActive || sending}
                    className="w-full h-14 bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:bg-[var(--bg-input)] disabled:text-[var(--text-muted)] text-white rounded-xl font-semibold text-sm active:scale-[0.97] transition-all flex items-center justify-center gap-2.5/20"
                >
                    <Check size={18} /> Invia ordine
                </button>

                {/* Pulsanti ausiliari inferiori */}
                <div className="grid grid-cols-2 gap-2">
                    <button
                        onClick={() => cart.length > 0 && setIsClearModalOpen(true)}
                        disabled={cart.length === 0}
                        className="h-10 border border-red-200 dark:border-red-900/30 text-red-500 active:bg-red-50 active:text-red-600 rounded-xl font-semibold text-xs transition-all disabled:opacity-20 flex items-center justify-center gap-1.5"
                    >
                        <Trash2 size={12} /> Svuota
                    </button>

                    {children && (
                        <div className="[&>*]:w-full [&>*]:h-10 [&>*]:rounded-xl [&>*]:font-semibold [&>*]:text-xs [&>*]:uppercase [&>*]:tracking-widest [&>*]:transition-all [&>*]:flex [&>*]:items-center [&>*]:justify-center [&>*]:gap-1.5 [&>*]:border [&>*]:border-[var(--border)] [&>*]:bg-[var(--bg-card)]">
                            {children}
                        </div>
                    )}
                </div>
            </div>

        </div>
    );
};

export default CartMobileView;