import { useState, useMemo } from 'react';
import { Search, ChevronLeft, X } from 'lucide-react';
import { formatEuro, normalizeText } from './checkMath';

// La carta per fare una comanda: stessa disposizione della cassa (categoria, ricerca, tessere dei prodotti).
const OrderMenu = ({ products, cart, tableName, onAdd, onBack }) => {
  const [category, setCategory] = useState('Tutti');
  const [search, setSearch] = useState('');

  const categories = useMemo(() => ['Tutti', ...new Set((products ?? []).map(p => p.category || 'Generico'))], [products]);
  const shown = useMemo(() => {
    const words = normalizeText(search).trim().split(/\s+/).filter(Boolean);
    return (products ?? []).filter(p =>
      (category === 'Tutti' || (p.category || 'Generico') === category)
      && words.every(w => normalizeText(`${p.name} ${p.category || ''} ${p.price.toFixed(2)}`).includes(w)));
  }, [products, category, search]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 pb-3 shrink-0">
        <button onClick={onBack} className="flex items-center gap-1 pr-3 py-1.5 text-[var(--text-muted)] hover:text-[var(--text-main)] text-xs font-semibold"><ChevronLeft size={18} /> Sala</button>
        <h2 className="text-xl font-semibold text-[var(--text-main)] truncate">Carta · {tableName}</h2>
      </div>
      <div className="flex gap-2 pb-3 shrink-0">
        <select value={category} onChange={e => setCategory(e.target.value)} aria-label="Categoria"
          className="shrink-0 w-40 sm:w-48 h-10 pl-3 pr-8 rounded-xl bg-[var(--bg-card-2)] border border-[var(--border)] text-[var(--text-main)] font-semibold text-xs focus:outline-none focus:border-[var(--accent)]">
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none" />
          <input type="text" placeholder="Cerca prodotto..." aria-label="Cerca prodotto" value={search} onChange={e => setSearch(e.target.value)}
            className="w-full h-10 pl-9 pr-8 rounded-xl bg-[var(--bg-card-2)] border border-[var(--border)] text-[var(--text-main)] text-sm placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] transition" />
          {search && <button onClick={() => setSearch('')} aria-label="Svuota la ricerca" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-main)] p-1"><X size={14} /></button>}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar">
        {!products && <p className="text-[var(--text-muted)] text-sm">Caricamento carta…</p>}
        {products && !shown.length && <div className="flex items-center justify-center h-40 text-[var(--text-muted)]"><p className="font-semibold text-xs">Nessun prodotto disponibile</p></div>}
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
          {shown.map(p => {
            const inCart = cart.filter(l => l.id === p.id).reduce((s, l) => s + l.quantity, 0);
            const remaining = p.stock_enabled && p.stock !== null ? p.stock - inCart : null;
            const out = remaining !== null && remaining <= 0;
            const color = p.color || 'var(--accent)';
            return (
              <button key={p.id} disabled={out} onClick={() => onAdd(p)}
                className={`relative flex flex-col justify-between rounded-lg p-3 min-h-[84px] border border-[var(--border)] bg-[var(--bg-card-2)] text-left select-none transition ${out ? 'opacity-50 grayscale cursor-not-allowed' : 'hover:border-[var(--border-hover)] active:scale-[0.98] cursor-pointer'}`}>
                <span className="flex items-start gap-2 font-medium text-sm leading-tight text-[var(--text-main)]"><span className="mt-1 w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} aria-hidden="true" />{p.name}</span>
                <span className="flex items-baseline justify-between w-full mt-2">
                  <span className="text-xs font-semibold tabular-nums text-[var(--text-muted)]">{formatEuro(p.price)}</span>
                  {remaining !== null && remaining <= 10 && <span className="text-[11px] font-semibold text-orange-500">{out ? 'Esaurito' : `${remaining} rimasti`}</span>}
                </span>
                {inCart > 0 && <span className="absolute top-2 right-2 min-w-5 h-5 px-1 rounded-full bg-[var(--accent)] text-white text-xs font-semibold flex items-center justify-center">{inCart}</span>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default OrderMenu;
