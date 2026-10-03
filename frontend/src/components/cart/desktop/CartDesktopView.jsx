import React from 'react';
import { ShoppingCart, Check, Printer, MessageSquare, QrCode, ShoppingBag, Undo2, Send, Trash } from 'lucide-react';
import { getEffectivePrice, getAdjustmentLabel } from '../../../utils/pricing';
import OrderDiscountPanel from '../OrderDiscountPanel';

const CartDesktopView = ({
    // Props passate dal Container padre
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
    setSelectedItem,
    setIsQRScanModalOpen,
    setIsReprintModalOpen,
    setShowReversePopup,
    setIsClearModalOpen,
    applyOrderDiscount,
    canDiscount,
    isAllGift,
    derivedOrderPercent,
    isTakeaway,
    setIsTakeaway,
}) => {
    return (
        <div className="flex flex-col h-full bg-[var(--bg-card)] rounded-xl border border-[var(--border)] overflow-hidden">

            {/* Header */}
            <div className="px-5 py-3 flex justify-between items-center border-b border-[var(--border)]">
                <div>
                    <h2 className="text-xl font-black tracking-tighter uppercase text-[var(--text-main)]">Carrello</h2>
                    <span className={`text-[11px] font-black uppercase tracking-widest ${sessionActive ? 'text-green-500' : 'text-red-400'}`}>
                        {sessionActive ? '● Sessione attiva' : '● Sessione non attiva'}
                    </span>
                </div>
                <div className="flex items-center gap-2">

                    {/* Pulsante Storno Ordini */}
                    <button
                        disabled={!sessionActive}
                        onClick={() => setShowReversePopup(true)}
                        title="Storno Ordine"
                        className="p-2 rounded-xl border border-[var(--border)] text-[var(--text-muted)] hover:text-red-500 hover:border-red-500/50 transition-all duration-200 active:scale-95 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
                    >
                        <Undo2 size={22} />
                    </button>

                    {/* Pulsante Asporto */}
                    <button
                        disabled={cart.length === 0}
                        onClick={() => setIsTakeaway(v => !v)}
                        title={isTakeaway ? 'Disattiva asporto' : 'Segna come asporto'}
                        className={`p-2 rounded-xl border transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 ${isTakeaway
                            ? 'bg-green-500 border-green-500 text-white'
                            : 'border-[var(--border)] text-[var(--text-muted)] hover:text-green-500 hover:border-green-500/50'}`}>
                        <ShoppingBag size={22} />
                    </button>

                    {/* Pannello Sconto / Omaggio sull'intero ordine (solo admin/responsabile) */}
                    {canDiscount && (
                        <OrderDiscountPanel cart={cart} derivedOrderPercent={derivedOrderPercent} applyOrderDiscount={applyOrderDiscount} />
                    )}

                    {/* Pulsante QR Code */}
                    <button
                        onClick={() => setIsQRScanModalOpen(true)}
                        title="Importa ordine da QR"
                        className="p-2 rounded-xl border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--accent)] hover:border-[var(--accent)]/50 transition-all duration-200 active:scale-95 cursor-pointer"
                    >
                        <QrCode size={22} />
                    </button>

                    {/* Pulsante Ristampa Stampante */}
                    <button
                        disabled={!sessionActive}
                        onClick={() => setIsReprintModalOpen(true)}
                        title="Ristampa scontrini recenti"
                        className="p-2 rounded-xl border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--accent)] hover:border-[var(--accent)]/50 transition-all duration-200 active:scale-95 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
                    >
                        <Printer size={22} />
                    </button>
                </div>
            </div>

            {/* Lista articoli */}
            <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5 no-scrollbar">
                {mergedCart.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-[var(--text-muted)] opacity-30">
                        <ShoppingCart size={32} />
                        <p className="text-sm text-center font-black uppercase tracking-widest mt-2">Vuoto</p>
                    </div>
                ) : mergedCart.map(item => {
                    const adjLabel = getAdjustmentLabel(item);
                    const effTotal = getEffectivePrice(item) * item.quantity;
                    return (
                        <div key={cartKey(item)} onClick={() => setSelectedItem(item)}
                            className="px-3 py-2 rounded-xl cursor-pointer border border-gray-300 dark:border-[var(--border)] bg-[var(--bg-card-2)] hover:border-[var(--accent)]/60 active:scale-[0.99] transition-all">
                            <div className="flex justify-between items-center gap-2">
                                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                    <span className="bg-[var(--accent)] text-white text-[10px] font-black w-5 h-5 flex items-center justify-center rounded shrink-0">{item.quantity}</span>
                                    <span className="font-bold text-xs uppercase text-[var(--text-main)] leading-tight truncate">{item.name}</span>
                                    {adjLabel && (
                                        <span className={`shrink-0 text-[9px] font-black px-1.5 py-0.5 rounded-full ${item.type === 'gift' ? 'bg-purple-500/10 text-purple-500' : 'bg-orange-500/10 text-orange-500'}`}>{adjLabel}</span>
                                    )}
                                </div>
                                {adjLabel ? (
                                    <span className="flex items-baseline gap-1.5 shrink-0">
                                        <span className="text-[10px] font-bold tabular-nums text-[var(--text-muted)] line-through">{(item.price * item.quantity).toFixed(2)}€</span>
                                        <span className={`font-black text-xs tabular-nums ${item.type === 'gift' ? 'text-purple-500' : 'text-orange-500'}`}>{effTotal.toFixed(2)}€</span>
                                    </span>
                                ) : (
                                    <span className="font-black text-xs tabular-nums text-[var(--text-main)] shrink-0">{(item.price * item.quantity).toFixed(2)}€</span>
                                )}
                            </div>
                            {item.note && (
                                <div className="ml-7 mt-1.5 flex items-center gap-1.5 bg-yellow-500/10 border border-yellow-500/30 rounded-lg px-2 py-1">
                                    <MessageSquare size={9} className="text-yellow-500 shrink-0" />
                                    <span className="text-[10px] font-black uppercase tracking-wide text-yellow-500 truncate">{item.note}</span>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Footer Cassa Desktop */}
            <div className="px-4 py-3 border-t border-[var(--border)] space-y-2 bg-[var(--bg-card-2)]">
                <div className="grid grid-cols-2 gap-2">
                    <div className="bg-[var(--bg-card)] px-3 py-1 rounded-xl border border-[var(--border)]">
                        <span className="text-[13px] font-black text-[var(--text-muted)] uppercase tracking-wider block">Ricevuti</span>
                        <div className="flex items-center justify-end w-full gap-1 font-black text-xl text-[var(--text-main)] tabular-nums">
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
                                className="w-full bg-transparent outline-none text-right"
                            />
                            {/* L'euro cambia colore dinamicamente in base a amountReceived */}
                            <span className={`shrink-0 select-none transition-colors duration-150 ${amountReceived ? 'text-[var(--text-main)]' : 'text-[var(--text-muted)]'
                                }`}>
                                €
                            </span>
                        </div>
                    </div>
                    <div className="bg-[var(--bg-card)] px-3 py-1 rounded-xl border border-[var(--border)]">
                        <span className="text-[13px] font-black text-[var(--text-muted)] uppercase tracking-wider block">Resto</span>
                        <span className={`text-xl font-black tabular-nums block text-right transition-colors duration-150 ${!amountReceived
                            ? 'text-[var(--text-muted)]'
                            : change < 0
                                ? 'text-red-500'
                                : 'text-green-500'
                            }`}>
                            {change >= 0 ? change.toFixed(2) : '0.00'} €
                        </span>
                    </div>
                </div>

                <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                        <span className="text-xl font-black text-[var(--text-main)] uppercase">Totale</span>
                        {isAllGift && <span className="text-[9px] font-black uppercase bg-purple-500/10 text-purple-500 border border-purple-500/30 px-2 py-0.5 rounded-full">Omaggio</span>}
                        {!isAllGift && hasAnyDiscount && <span className="text-[9px] font-black uppercase bg-orange-500/10 text-orange-500 border border-orange-500/30 px-2 py-0.5 rounded-full">Scontato</span>}
                    </div>
                    {hasAnyDiscount ? (
                        <div className="flex items-baseline gap-2">
                            <span className="text-base font-black line-through text-[var(--text-muted)] tabular-nums">{fullTotal.toFixed(2)} €</span>
                            <span className={`text-2xl font-black tracking-tighter tabular-nums ${isAllGift ? 'text-purple-500' : 'text-orange-500'}`}>{total.toFixed(2)} €</span>
                        </div>
                    ) : (
                        <span className="text-2xl font-black tracking-tighter text-[var(--text-main)] tabular-nums">{total.toFixed(2)} €</span>
                    )}
                </div>

                <div className="flex gap-2 w-full">
                    {/* Bottone Invia Ordine */}
                    <button
                        onClick={handleSendOrder}
                        disabled={cart.length === 0 || !sessionActive}
                        className="flex-1 h-11 px-2 bg-[var(--accent)] hover:enabled:bg-[var(--accent-hover)] cursor-pointer disabled:cursor-not-allowed disabled:opacity-30 disabled:text-[var(--text-muted)] text-white rounded-xl font-black text-xs sm:text-sm uppercase tracking-wider active:enabled:scale-[0.99] transition-all flex items-center justify-center gap-1.5"
                    >
                        <Send size={16} />
                        <span>Invia Ordine</span>
                    </button>

                    {/* Bottone Svuota Carrello */}
                    <button
                        onClick={() => cart.length > 0 && setIsClearModalOpen(true)}
                        disabled={cart.length === 0}
                        className="flex-1 h-11 px-2 bg-[var(--error)] hover:enabled:bg-[var(--error-hover)] cursor-pointer disabled:cursor-not-allowed disabled:opacity-30 disabled:text-[var(--text-muted)] text-white dark:border-red-900/40 rounded-xl font-black text-xs sm:text-sm uppercase tracking-wider active:enabled:scale-[0.99] transition-all flex items-center justify-center gap-1.5"
                    >
                        <Trash size={16} />
                        <span>Svuota</span>
                    </button>
                </div>
            </div>

        </div>
    );
};

export default CartDesktopView;