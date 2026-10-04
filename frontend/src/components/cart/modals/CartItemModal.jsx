import React, { useState } from 'react';
import { Trash2, Plus, Minus, Check, X, MessageSquare, Gift, Percent } from 'lucide-react';
import { getLineTotal } from '../../../utils/pricing';

// ─── Modale Item Carrello ───────────────────────────────────────
const CartItemModal = ({ item, onClose, onAdd, onRemove, onDelete, onNoteChange, onTypeChange, canDiscount }) => {

    const [note, setNote] = useState(item.note || '');

    const handleClose = () => {
        if (note !== (item.note || '')) onNoteChange(item, note);
        onClose();
    };

    // Logica di blocco: se ha lo stock abilitato e la quantità ha raggiunto il massimo
    const isMaxStockReached = item.stock_enabled && item.stock !== null && item.quantity >= item.stock;

    const discountMode = item.discountMode || 'percent';
    const discountValue = item.discountValue ?? 0;
    const lineTotal = getLineTotal(item);

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" onClick={handleClose}>
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            <div className="relative w-full max-w-sm bg-[var(--bg-card)] rounded-xl border border-[var(--border)] shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>

                {/* Header Modale */}
                <div className="flex items-start justify-between px-5 pt-5 pb-4 border-b border-[var(--border)]">
                    <div className="flex-1 min-w-0 pr-3">
                        <h3 className="font-black text-base uppercase tracking-tight text-[var(--text-main)] leading-tight">{item.name}</h3>
                        {item.type === 'sale' ? (
                            <p className="text-[var(--accent)] font-black text-sm tabular-nums mt-0.5">{(item.price * item.quantity).toFixed(2)} €</p>
                        ) : (
                            <div className="flex items-baseline gap-1.5 mt-0.5">
                                <p className="text-[var(--text-muted)] font-bold text-xs tabular-nums line-through">{(item.price * item.quantity).toFixed(2)} €</p>
                                <p className={`font-black text-sm tabular-nums ${item.type === 'gift' ? 'text-purple-500' : 'text-orange-500'}`}>{lineTotal.toFixed(2)} €</p>
                            </div>
                        )}
                    </div>
                    <button onClick={handleClose} className="p-2 rounded-xl bg-[var(--bg-card-2)] border border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--text-accent)] cursor-pointer transition-colors shrink-0"><X size={15} /></button>
                </div>

                {/* Gestione Quantità */}
                <div className="px-5 py-4 border-b border-[var(--border)]">
                    <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] mb-3">Quantità</p>
                    <div className="flex items-center justify-between gap-3">
                        {/* Tasto MINUS */}
                        <button onClick={() => onRemove(item)} className="flex-1 py-3 rounded-xl bg-[var(--bg-card-2)] border border-[var(--border)] flex justify-center text-[var(--text-main)] hover:border-[var(--accent)] hover:text-[var(--accent)] cursor-pointer transition-all active:scale-95">
                            <Minus size={16} />
                        </button>

                        <span className="text-3xl font-black tabular-nums text-[var(--text-main)] w-12 text-center">{item.quantity}</span>

                        {/* Tasto PLUS allineato (aggiunta classe "border") */}
                        <button
                            onClick={() => { if (!isMaxStockReached) onAdd(item); }}
                            disabled={isMaxStockReached}
                            className={`flex-1 py-3 rounded-xl border flex justify-center transition-all ${isMaxStockReached
                                ? 'bg-gray-500/10 border-gray-500/20 text-gray-500 cursor-not-allowed opacity-50'
                                : 'bg-[var(--bg-card-2)] border-[var(--border)] text-[var(--text-main)] hover:border-[var(--accent)] hover:text-[var(--accent)] cursor-pointer active:scale-95'
                                }`}
                        >
                            <Plus size={16} />
                        </button>
                    </div>
                    {/* Opzionale: piccolo alert sotto i bottoni per spiegare il blocco */}
                    {isMaxStockReached && (
                        <p className="text-[9px] text-orange-500 text-center mt-2 font-bold uppercase tracking-wider">
                            Scorte terminate per questo articolo
                        </p>
                    )}
                </div>

                {/* Sconto / Omaggio sul singolo prodotto (solo admin/responsabile) */}
                {canDiscount && (
                    <div className="px-5 py-4 border-b border-[var(--border)]">
                        <div className="flex items-center gap-2 mb-3">
                            <Percent size={11} className="text-[var(--text-muted)]" />
                            <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">Sconto su questo prodotto</p>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                            <button onClick={() => onTypeChange(item, 'sale')}
                                className={`py-2 rounded-xl border text-[10px] font-black uppercase tracking-wider cursor-pointer transition-all ${item.type === 'sale' ? 'bg-[var(--accent)] border-[var(--accent)] text-white' : 'border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--accent)]/50'}`}>
                                Normale
                            </button>
                            <button onClick={() => onTypeChange(item, 'discount', discountMode, discountValue || 10)}
                                className={`py-2 rounded-xl border text-[10px] font-black uppercase tracking-wider cursor-pointer transition-all ${item.type === 'discount' ? 'bg-orange-500 border-orange-500 text-white' : 'border-[var(--border)] text-[var(--text-muted)] hover:border-orange-500/50'}`}>
                                Sconto
                            </button>
                            <button onClick={() => onTypeChange(item, 'gift')}
                                className={`py-2 rounded-xl border text-[10px] font-black uppercase tracking-wider cursor-pointer transition-all flex items-center justify-center gap-1 ${item.type === 'gift' ? 'bg-purple-500 border-purple-500 text-white' : 'border-[var(--border)] text-[var(--text-muted)] hover:border-purple-500/50'}`}>
                                <Gift size={11} /> Omaggio
                            </button>
                        </div>

                        {item.type === 'discount' && (
                            <div className="flex items-center gap-2 mt-3">
                                <div className="flex rounded-xl border border-[var(--border)] bg-[var(--bg-card-2)] p-0.5 shrink-0">
                                    <button onClick={() => onTypeChange(item, 'discount', 'percent', discountValue)}
                                        className={`px-3 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer transition-all ${discountMode === 'percent' ? 'bg-orange-500 text-white' : 'text-[var(--text-muted)]'}`}>%</button>
                                    <button onClick={() => onTypeChange(item, 'discount', 'amount', discountValue)}
                                        className={`px-3 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer transition-all ${discountMode === 'amount' ? 'bg-orange-500 text-white' : 'text-[var(--text-muted)]'}`}>€</button>
                                </div>
                                <input
                                    type="number"
                                    min={0}
                                    max={discountMode === 'percent' ? 100 : item.price}
                                    step={discountMode === 'percent' ? 1 : 0.1}
                                    value={discountValue}
                                    onChange={e => onTypeChange(item, 'discount', discountMode, e.target.value === '' ? 0 : Number(e.target.value))}
                                    className="flex-1 min-w-0 px-3 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border)] text-[var(--text-main)] text-sm font-bold outline-none focus:ring-2 focus:ring-orange-500"
                                />
                            </div>
                        )}
                    </div>
                )}

                {/* Gestione Note */}
                <div className="px-5 py-4 border-b border-[var(--border)]">
                    <div className="flex items-center gap-2 mb-2">
                        <MessageSquare size={11} className="text-[var(--text-muted)]" />
                        <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">Note cucina</p>
                    </div>
                    <textarea rows={2} placeholder="Es: senza cipolla, ben cotto..."
                        value={note} onChange={e => setNote(e.target.value.toUpperCase())}
                        className="w-full bg-[var(--bg-input)] px-3 py-2.5 rounded-xl text-sm font-medium outline-none ring-1 ring-[var(--border)] focus:ring-[var(--accent)] text-[var(--text-main)] resize-none placeholder:text-[var(--text-muted)] placeholder:font-normal transition-[ring]" />
                </div>

                {/* Bottoni Affiancati (Rimuovi e Conferma) */}
                <div className="px-5 py-4 flex gap-3">
                    <button onClick={() => { onDelete(item); onClose(); }}
                        className="flex-1 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-500 font-black text-xs uppercase tracking-widest hover:bg-red-500 cursor-pointer hover:text-white transition-all flex items-center justify-center gap-2 shadow-sm">
                        <Trash2 size={13} /> Rimuovi
                    </button>

                    <button onClick={handleClose}
                        className="flex-1 py-3 bg-[var(--accent)] hover:bg-[var(--accent-hover)] cursor-pointer text-white rounded-xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-sm">
                        <Check size={14} /> Conferma
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CartItemModal;