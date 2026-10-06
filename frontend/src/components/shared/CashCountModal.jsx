import { useState, useMemo } from 'react';
import { X, Banknote, Coins, Check, Minus, Plus } from 'lucide-react';

const NOTES = [100, 50, 20, 10, 5];
const COINS = [2, 1, 0.5, 0.2, 0.1, 0.05, 0.02, 0.01];

const DenomTile = ({ value, qty, onChange }) => {
  const label = value >= 1 ? `${value} €` : `${Math.round(value * 100)} c`;
  const subtotal = value * (qty || 0);

  return (
    <div className="flex items-center gap-3 p-3 bg-[var(--bg-card-2)] rounded-xl border border-[var(--border)]">
      <img
        src={`/cash/${value}.png`}
        alt={label}
        className="w-14 h-14 object-contain shrink-0"
        onError={(e) => { e.target.style.visibility = 'hidden'; }}
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-[var(--text-main)]">{label}</p>
        <p className="text-xs font-bold text-[var(--text-muted)]">{subtotal.toFixed(2)} €</p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          onClick={() => onChange(Math.max(0, (qty || 0) - 1))}
          className="w-8 h-8 rounded-xl border border-[var(--border)] flex items-center justify-center text-[var(--text-main)] hover:bg-[var(--bg-card)] transition-all cursor-pointer"
        >
          <Minus size={14} />
        </button>
        <input
          type="number"
          min="0"
          inputMode="numeric"
          value={qty || ''}
          onChange={(e) => onChange(Math.max(0, parseInt(e.target.value) || 0))}
          placeholder="0"
          className="w-12 h-8 rounded-xl bg-[var(--bg-input)] border border-[var(--border)] text-[var(--text-main)] text-sm font-semibold text-center outline-none focus:ring-2 focus:ring-[var(--accent)]"
        />
        <button
          type="button"
          onClick={() => onChange((qty || 0) + 1)}
          className="w-8 h-8 rounded-xl border border-[var(--border)] flex items-center justify-center text-[var(--text-main)] hover:bg-[var(--bg-card)] transition-all cursor-pointer"
        >
          <Plus size={14} />
        </button>
      </div>
    </div>
  );
};

const CashCountModal = ({ expectedCash = 0, onConfirm, onClose }) => {
  const [counts, setCounts] = useState({});

  const setQty = (value, qty) => setCounts(prev => ({ ...prev, [value]: qty }));

  const total = useMemo(
    () => Object.entries(counts).reduce((sum, [value, qty]) => sum + parseFloat(value) * (qty || 0), 0),
    [counts]
  );

  const difference = +(total - expectedCash).toFixed(2);
  const diffColor = difference === 0 ? 'text-green-500' : Math.abs(difference) < 1 ? 'text-orange-500' : 'text-red-500';

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-2xl bg-[var(--bg-card)] rounded-xl border border-[var(--border)] shadow-2xl flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-between items-center px-6 sm:px-8 py-5 border-b border-[var(--border)] shrink-0">
          <div>
            <h3 className="text-xl font-semibold tracking-tight text-[var(--text-main)]">Conteggio cassa</h3>
            <p className="text-xs font-semibold text-[var(--text-muted)] mt-0.5">Conta contanti a taglio</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-[var(--bg-card-2)] transition-colors cursor-pointer">
            <X size={18} className="text-[var(--text-muted)]" />
          </button>
        </div>

        <div className="overflow-y-auto px-6 sm:px-8 py-5 no-scrollbar">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-muted)] mb-2">
            <Banknote size={13} /> Banconote
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-6">
            {NOTES.map(v => (
              <DenomTile key={v} value={v} qty={counts[v]} onChange={(q) => setQty(v, q)} />
            ))}
          </div>

          <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-muted)] mb-2">
            <Coins size={13} /> Monete
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {COINS.map(v => (
              <DenomTile key={v} value={v} qty={counts[v]} onChange={(q) => setQty(v, q)} />
            ))}
          </div>
        </div>

        <div className="px-6 sm:px-8 py-5 border-t border-[var(--border)] shrink-0 space-y-2 bg-[var(--bg-card-2)] rounded-b-3xl">
          <div className="flex justify-between text-xs font-bold text-[var(--text-muted)]">
            <span>Atteso da sistema</span>
            <span>{expectedCash.toFixed(2)} €</span>
          </div>
          <div className="flex justify-between text-base font-semibold text-[var(--text-main)]">
            <span>Contato</span>
            <span>{total.toFixed(2)} €</span>
          </div>
          <div className={`flex justify-between text-base font-semibold ${diffColor}`}>
            <span>Differenza</span>
            <span>{difference > 0 ? '+' : ''}{difference.toFixed(2)} €</span>
          </div>

          <button
            onClick={() => onConfirm(total)}
            className="w-full mt-3 py-3.5 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-semibold text-sm transition-all cursor-pointer flex items-center justify-center gap-2"
          >
            <Check size={18} /> Conferma chiusura
          </button>
        </div>
      </div>
    </div>
  );
};

export default CashCountModal;