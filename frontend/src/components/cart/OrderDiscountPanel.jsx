import React, { useState } from 'react';
import { Percent, Gift } from 'lucide-react';

const PRESETS = [10, 20, 50, 100];

// Pannello unico "Sconto ordine": 0% = nessuno sconto, 100% = omaggio (sostituisce
// il vecchio pulsante Regalo), valori intermedi = sconto percentuale su tutte le righe.
// Renderizzato dal genitore solo se canDiscount === true.
const OrderDiscountPanel = ({ cart, derivedOrderPercent, applyOrderDiscount, buttonClassName = 'p-2' }) => {
    const [open, setOpen] = useState(false);
    const [value, setValue] = useState(derivedOrderPercent ?? 0);

    const isActive = cart.length > 0 && (derivedOrderPercent === null || derivedOrderPercent > 0);

    const handleApply = (pct) => {
        applyOrderDiscount(pct);
        setValue(pct);
        setOpen(false);
    };

    return (
        <div className="relative">
            <button
                disabled={cart.length === 0}
                onClick={() => { setValue(derivedOrderPercent ?? 0); setOpen(v => !v); }}
                title="Sconto sull'intero ordine"
                className={`${buttonClassName} rounded-xl border transition-all duration-200 active:scale-95 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 ${isActive
                    ? 'bg-orange-500 border-orange-500 text-white hover:bg-orange-500/90'
                    : 'border-[var(--border)] text-[var(--text-muted)] hover:text-orange-500 hover:border-orange-500/50'
                    }`}
            >
                <Percent size={20} />
            </button>

            {open && (
                <>
                    {/* Click fuori per chiudere */}
                    <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
                    <div className="absolute right-0 top-full mt-2 z-50 w-64 p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border)] shadow-2xl">
                        <p className="text-[11px] font-semibold text-[var(--text-muted)] mb-3">Sconto sull'intero ordine</p>

                        {derivedOrderPercent === null && (
                            <p className="text-xs text-orange-500 font-bold mb-2">Sconti diversi riga per riga attivi</p>
                        )}

                        <div className="flex items-center gap-2 mb-3">
                            <input
                                type="number" min={0} max={100}
                                value={value}
                                onChange={e => setValue(e.target.value === '' ? 0 : Math.min(100, Math.max(0, Number(e.target.value))))}
                                className="flex-1 px-3 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border)] text-[var(--text-main)] text-sm font-bold outline-none focus:ring-2 focus:ring-orange-500"
                            />
                            <span className="text-sm font-semibold text-[var(--text-muted)]">%</span>
                        </div>

                        <div className="grid grid-cols-4 gap-1.5 mb-3">
                            {PRESETS.map(p => (
                                <button key={p} onClick={() => handleApply(p)}
                                    title={p === 100 ? 'Omaggio (100%)' : `${p}%`}
                                    className="py-1.5 rounded-lg bg-[var(--bg-card-2)] border border-[var(--border)] text-xs font-semibold text-[var(--text-main)] hover:border-orange-500/50 transition-all flex items-center justify-center">
                                    {p === 100 ? <Gift size={12} /> : `${p}%`}
                                </button>
                            ))}
                        </div>

                        <div className="flex gap-2">
                            <button onClick={() => handleApply(0)}
                                className="flex-1 py-2 rounded-xl border border-[var(--border)] text-[var(--text-main)] text-xs font-semibold hover:bg-[var(--bg-card-2)] transition-all">
                                Rimuovi
                            </button>
                            <button onClick={() => handleApply(value)}
                                className="flex-1 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold transition-all">
                                Applica
                            </button>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default OrderDiscountPanel;