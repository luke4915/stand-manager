import React, { useState, useMemo, useRef, useCallback } from 'react';
import QuickEditProductModal from './modals/QuickEditProductModal';

const LONG_PRESS_MS = 1500;
const VISIBLE_THRESHOLD_PCT = 10; // sotto questa soglia il bordo resta invisibile: evita il "flash" su un click veloce

const ProductList = ({ products, addToCart, cart, lowStockThreshold = 15, setProducts }) => {
  const [activeCategory, setActiveCategory] = useState('Tutti');
  const [searchTerm, setSearchTerm] = useState('');
  const [progressById, setProgressById] = useState({});
  const [editingProduct, setEditingProduct] = useState(null);

  const timers = useRef({}); // { [productId]: { raf, startTime, triggered } }

  const categories = useMemo(() => {
    const visible = products.filter(p => p.visible !== false);
    return ['Tutti', ...new Set(visible.map(p => p.category || 'Generico'))];
  }, [products]);

  const filteredProducts = useMemo(() => {
    const visible = products.filter(p => p.visible !== false);
    
    if (!searchTerm.trim() && activeCategory === 'Tutti') {
      return visible;
    }

    // Helper per rimuovere accenti e convertire in minuscolo
    const normalize = (str) =>
      (str || '')
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");

    const searchWords = normalize(searchTerm).trim().split(/\s+/);

    return visible.filter(p => {
      // 1. Filtro Categoria Dropdown
      const matchesCategory = activeCategory === 'Tutti' || (p.category || 'Generico') === activeCategory;
      if (!matchesCategory) return false;

      // Se l'input di ricerca è vuoto, basta il filtro categoria
      if (!searchTerm.trim()) return true;

      // Prepariamo il testo su cui cercare (Nome + Categoria + Prezzo)
      const searchableText = normalize(`${p.name} ${p.category || ''} ${p.price.toFixed(2)}`);

      // 2. Verifichiamo che TUTTE le parole cercate siano presenti nel testo
      return searchWords.every(word => searchableText.includes(word));
    });
  }, [products, activeCategory, searchTerm]);

  const clearPress = useCallback((id) => {
    const t = timers.current[id];
    if (t?.raf) cancelAnimationFrame(t.raf);
    delete timers.current[id];
    setProgressById(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const startPress = useCallback((product) => {
    const id = product.id;
    if (timers.current[id]) return; // già in corso
    const state = { startTime: performance.now(), triggered: false, exceededThreshold: false, raf: null };
    timers.current[id] = state;

    const tick = () => {
      const elapsed = performance.now() - state.startTime;
      const pct = Math.min(100, (elapsed / LONG_PRESS_MS) * 100);
      setProgressById(prev => ({ ...prev, [id]: pct }));
      if (pct > VISIBLE_THRESHOLD_PCT) state.exceededThreshold = true;

      if (pct >= 100) {
        state.triggered = true;
        setEditingProduct(product);
        clearPress(id);
        return;
      }
      state.raf = requestAnimationFrame(tick);
    };
    state.raf = requestAnimationFrame(tick);
  }, [clearPress]);

  const endPress = useCallback((id) => {
    const t = timers.current[id];
    const shouldBlockClick = !!(t?.triggered || t?.exceededThreshold);
    clearPress(id);
    return shouldBlockClick;
  }, [clearPress]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Barra Filtri: Dropdown Categoria + Search Bar */}
      <div className="flex gap-2 pb-3 shrink-0">
        {/* Dropdown Categoria */}
        <div className="relative shrink-0 w-40 sm:w-48">
          <select
            value={activeCategory}
            onChange={(e) => setActiveCategory(e.target.value)}
            className="w-full h-10 pl-3 pr-8 rounded-xl bg-[var(--bg-card-2)] border border-[var(--border)] text-[var(--text-main)] font-semibold text-xs appearance-none cursor-pointer focus:outline-none focus:border-[var(--accent)] transition-colors"
          >
            {categories.map(cat => (
              <option key={cat} value={cat} className="bg-[var(--bg-card-2)] text-[var(--text-main)] font-bold">
                {cat}
              </option>
            ))}
          </select>
          {/* Icona Freccia Dropdown */}
          <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-[var(--text-muted)]">
            <svg className="w-4 h-4 fill-current" viewBox="0 0 20 20">
              <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"/>
            </svg>
          </div>
        </div>

        {/* Input Ricerca Rapida */}
        <div className="relative flex-1">
          <input
            type="text"
            placeholder="Cerca prodotto..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full h-10 pl-9 pr-8 rounded-xl bg-[var(--bg-card-2)] border border-[var(--border)] text-[var(--text-main)] text-sm placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] transition-colors"
          />
          {/* Icona Lente d'ingrandimento */}
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none">
            <svg className="w-4 h-4 stroke-current fill-none stroke-2" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
          </div>

          {/* Pulsante "X" per svuotare la ricerca */}
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-main)] p-1 rounded-lg"
            >
              <svg className="w-4 h-4 stroke-current stroke-2" viewBox="0 0 24 24">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Griglia prodotti */}
      <div className="flex-1 overflow-y-auto no-scrollbar">
        {filteredProducts.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-[var(--text-muted)]">
            <p className="font-semibold text-xs">Nessun prodotto disponibile</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
            {filteredProducts.map(product => {
              const nameLen = product.name.length;
              const nameSizeClass = nameLen > 14 ? 'text-sm' : nameLen > 9 ? 'text-base' : 'text-lg';
              const color = product.color || 'var(--accent)';

              const cartQty = cart?.filter(i => i.id === product.id).reduce((sum, i) => sum + i.quantity, 0) || 0;
              const remainingStock = product.stock_enabled && product.stock !== null
                ? product.stock - cartQty
                : null;
              const showStockBadge = remainingStock !== null && remainingStock <= lowStockThreshold;

              const progress = progressById[product.id] || 0;

              return (
                <button
                  key={product.id}
                  onClick={() => { if (!endPress(product.id)) addToCart(product); }}
                  onMouseDown={() => startPress(product)}
                  onMouseLeave={() => clearPress(product.id)}
                  onTouchStart={() => startPress(product)}
                  onTouchCancel={() => clearPress(product.id)}
                  onContextMenu={(e) => e.preventDefault()}
                  onMouseEnter={(e) => e.currentTarget.style.setProperty('--bg-opacity', '12%')}
                  className={`product-card relative flex flex-col rounded-xl pt-4 px-3 pb-2 border-l-4 bg-[var(--bg-card-2)]
                               border border-[var(--border)] hover:border-[var(--text-muted)]/30 
                              transition-all duration-150 text-left overflow-hidden select-none}
                              ${remainingStock===0 ? 'opacity-60 grayscale cursor-not-allowed' : 'active:scale-95 cursor-pointer'}`}
                  style={{
                    borderLeftColor: color,
                    backgroundColor: `color-mix(in srgb, ${color} var(--bg-opacity, 6%), var(--bg-card-2))`
                  }}
                >
                  {/* Brush orizzontale long-press: si riempie da sx verso dx, stesso accent della tile */}
                  {progress > VISIBLE_THRESHOLD_PCT && (
                    <div
                      className="absolute inset-y-0 left-0 pointer-events-none z-20"
                      style={{
                        width: `${progress}%`,
                        backgroundColor: color,
                        opacity: 0.22,
                      }}
                    />
                  )}

                  {showStockBadge && (
                    <div
                      className={`absolute top-2 right-2 text-white px-2 py-0.5 rounded-lg shadow-sm border flex items-center gap-1.5 z-10 backdrop-blur-md transition-colors ${remainingStock === 0 ? 'bg-red-500 border-red-400' : 'border-white/20'}`}
                      style={remainingStock > 0 ? { backgroundColor: color } : {}}
                    >
                      {remainingStock > 0 && (
                        <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse shadow-[0_0_4px_rgba(255,255,255,0.8)]"></span>
                      )}
                      <span className="text-[11px] font-semibold mt-px">
                        {remainingStock === 0
                          ? 'Esaurito'
                          : remainingStock === 1
                            ? 'Ultimo!'
                            : `Ultimi ${remainingStock}`
                        }
                      </span>
                    </div>
                  )}

                  <h3 className={`${nameSizeClass} font-semibold text-[var(--text-main)] mb-2 leading-tight pr-14`}>
                    {product.name}
                  </h3>

                  <div className="w-full mt-auto pt-1 border-t border-[var(--border)] flex justify-between items-center">
                    <span className="text-[11px] font-bold text-[var(--text-muted)] leading-none">
                      Prezzo
                    </span>
                    <span className="text-sm font-semibold tabular-nums leading-none" style={{ color }}>
                      {product.price.toFixed(2)}€
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <QuickEditProductModal
        key={editingProduct?.id}
        product={editingProduct}
        onClose={() => setEditingProduct(null)}
        onSaved={(updated) => setProducts?.(prev => prev.map(p => p.id === updated.id ? { ...p, ...updated } : p))}
      />
    </div>
  );
};

export default ProductList;