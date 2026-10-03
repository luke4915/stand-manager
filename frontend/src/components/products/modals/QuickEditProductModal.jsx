import { useState } from 'react';
import { Check } from 'lucide-react';
import { API_URL } from '../../../config/api';
import { useToast } from '../../../context/useToast';

const QuickEditProductModal = ({ product, onClose, onSaved }) => {
  const { showToast } = useToast();
  const [price, setPrice] = useState(
    product?.price !== undefined && product?.price !== null ? String(product.price) : ''
  );
  const [stockEnabled, setStockEnabled] = useState(product?.stock_enabled ?? false);
  const [stock, setStock] = useState(
    product?.stock !== undefined && product?.stock !== null ? String(product.stock) : ''
  );
  const [saving, setSaving] = useState(false);

  if (!product) return null;

  const handlePriceChange = (e) => {
    const val = e.target.value.replace(',', '.');
    // Limita a max 2 cifre decimali dopo il punto
    if (/^\d*\.?\d{0,2}$/.test(val)) {
      setPrice(val);
    }
  };

  const handleSave = async () => {
    // Validazione disponibilità limitata
    if (stockEnabled) {
      const parsedStock = parseInt(stock, 10);
      if (stock === '' || isNaN(parsedStock) || parsedStock < 0) {
        showToast('Inserisci una quantità valida per la disponibilità limitata', 'error');
        return;
      }
    }

    setSaving(true);
    try {
      const parsedPrice = parseFloat(String(price).replace(',', '.')) || 0;
      
      // 1. Aggiornamento Prodotto (Prezzo)
      const res = await fetch(`${API_URL}/products/${product.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ...product, price: parsedPrice }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Errore durante l'aggiornamento del prezzo");
      }

      const updated = await res.json();

      // 2. Aggiornamento Stock
      const stockRes = await fetch(`${API_URL}/products/${product.id}/stock`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          stock: stockEnabled ? parseInt(stock, 10) : null,
          stock_enabled: !!stockEnabled,
        }),
      });

      if (!stockRes.ok) {
        const stockErrData = await stockRes.json().catch(() => ({}));
        showToast(stockErrData.error || "Prezzo aggiornato, ma errore nella gestione dello stock", 'error');
      }

      const stockData = stockRes.ok ? await stockRes.json() : {};

      // Notifica di successo e chiusura
      showToast(`Prodotto "${product.name}" aggiornato con successo`, 'success');
      onSaved({
        ...updated,
        price: parseFloat(updated.price),
        stock: stockData.stock ?? null,
        stock_enabled: !!stockData.stock_enabled
      });
      onClose();
    } catch (err) {
      console.error("Errore modifica rapida prodotto:", err);
      showToast(err.message || "Impossibile salvare le modifiche al prodotto", 'error');
      setSaving(false);
    }
  };

  const isSaveDisabled = saving || (stockEnabled && (stock === '' || isNaN(parseInt(stock, 10)) || parseInt(stock, 10) < 0));

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-sm bg-[var(--bg-card)] rounded-2xl border border-[var(--border)] shadow-2xl p-6" onClick={e => e.stopPropagation()}>
        <h3 className="text-base font-black uppercase tracking-tight text-[var(--text-main)] mb-4">{product.name}</h3>

        <label className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] block mb-1.5">Prezzo</label>
        <input
          type="text"
          inputMode="decimal"
          value={price}
          onChange={handlePriceChange}
          placeholder="Prezzo (es. 8.50 o 8,50)"
          className="w-full p-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border)] text-[var(--text-main)] font-medium text-sm outline-none focus:ring-2 focus:ring-[var(--accent)] mb-4"
        />

        <div className="p-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border)] space-y-2">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="qe_stock_enabled"
              checked={stockEnabled}
              onChange={(e) => setStockEnabled(e.target.checked)}
              className="w-4 h-4 rounded cursor-pointer"
            />
            <label htmlFor="qe_stock_enabled" className="text-xs font-bold text-[var(--text-main)] cursor-pointer">Disponibilità limitata</label>
          </div>
          {stockEnabled && (
            <input
              type="number"
              min="0"
              value={stock}
              onChange={(e) => setStock(e.target.value)}
              placeholder="Quantità disponibile"
              className="w-full p-2 rounded-xl bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-main)] text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]"
            />
          )}
        </div>

        <div className="flex gap-3 mt-5">
          <button
            onClick={onClose}
            className="flex-1 h-11 rounded-xl border border-red-500/30 text-red-500 font-black text-xs uppercase tracking-widest hover:bg-red-500/10 transition-all cursor-pointer"
          >
            Annulla
          </button>
          <button
            onClick={handleSave}
            disabled={isSaveDisabled}
            className="flex-1 h-11 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-black text-xs uppercase tracking-widest transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Check size={16} /> {saving ? 'Salvataggio...' : 'Salva'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default QuickEditProductModal;