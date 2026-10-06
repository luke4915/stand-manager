import React from 'react';

// ─── Modale Svuota Carrello ─────────────────────────────────────
const ClearCartModal = ({ onConfirm, onClose }) => (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
        <div className="relative w-full max-w-sm bg-[var(--bg-card)] rounded-xl border border-[var(--border)] shadow-2xl p-6 text-center" onClick={e => e.stopPropagation()}>
            <p className="font-semibold text-[var(--text-main)] mb-1">Svuotare il carrello?</p>
            <p className="text-xs text-[var(--text-muted)] mb-6">Tutti gli articoli verranno rimossi.</p>
            <div className="flex gap-3">
                <button 
                    onClick={onClose} 
                    className="flex-1 h-10 rounded-xl border border-[var(--border)] text-[var(--text-main)] cursor-pointer font-semibold text-xs hover:bg-[var(--bg-card-2)] hover:border-[var(--text-muted)]/30 transition-all duration-150 active:scale-95"
                >
                    Annulla
                </button>
                <button 
                    onClick={() => { onConfirm(); onClose(); }} 
                    className="flex-1 h-10 rounded-xl bg-red-500/90 hover:bg-red-500 border border-red-500 cursor-pointer text-white font-semibold text-xs transition-all duration-150 active:scale-95 shadow-md shadow-red-500/20"
                >
                    Svuota
                </button>
            </div>
        </div>
    </div>
);

export default ClearCartModal;