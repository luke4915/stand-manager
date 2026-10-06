import { useState, useEffect, useRef } from 'react';
import { X, Edit, Trash2, Search, Plus, CheckSquare, Square, Eye, EyeOff } from 'lucide-react';

import { fetchWithAuth } from '../../utils/apiClient';
import { useToast } from '../../context/useToast';

const Combobox = ({ name, value, onChange, options, placeholder }) => {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filtered = options.filter(o => o.toLowerCase().includes((value || '').toLowerCase()));
  const exactMatch = options.some(o => o.toLowerCase() === (value || '').trim().toLowerCase());

  return (
    <div className="relative" ref={wrapperRef}>
      <input
        name={name}
        type="text"
        autoComplete="off"
        placeholder={placeholder}
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        className="w-full p-2.5 rounded-xl bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-main)] font-medium text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]"
      />
      {open && (filtered.length > 0 || (value?.trim() && !exactMatch)) && (
        <div className="absolute z-20 mt-1 w-full max-h-48 overflow-y-auto bg-[var(--bg-card)] border border-[var(--border)] rounded-xl shadow-lg no-scrollbar">
          {filtered.map(o => (
            <button
              key={o}
              type="button"
              onClick={() => { onChange(o); setOpen(false); }}
              className="w-full text-left px-3 py-2 text-sm text-[var(--text-main)] hover:bg-[var(--bg-card-2)] transition-colors cursor-pointer"
            >
              {o}
            </button>
          ))}
          {value?.trim() && !exactMatch && (
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="w-full text-left px-3 py-2 text-sm text-[var(--accent)] font-bold hover:bg-[var(--bg-card-2)] transition-colors border-t border-[var(--border)] cursor-pointer flex items-center gap-1.5"
            >
              <Plus size={14} /> Crea nuovo: "{value}"
            </button>
          )}
        </div>
      )}
    </div>
  );
};

// `courses` (solo ristoranti): le portate del locale; con la lista il prodotto ne sceglie una.
// `modifierGroups` (solo ristoranti): i gruppi di modificatori; il prodotto sceglie quali chiedere. `onModifiersSaved` li rilegge.
const ProductConfig = ({ products, setProducts, courses = null, modifierGroups = null, onModifiersSaved }) => {
  const { showToast } = useToast();
  const [editingProduct, setEditingProduct] = useState(null);
  const [formData, setFormData] = useState({ 
    name: '', 
    price: '', 
    category: '', 
    color: '#3b82f6', 
    visible: true, 
    print_destination: 'both',
    stock_enabled: false,
    stock: ''
  });
  const [showForm, setShowForm] = useState(false);
  const [popupVisible, setPopupVisible] = useState(false);
  const [filterCategory, setFilterCategory] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Stato per gestione conflitti di categoria
  const [duplicateConflict, setDuplicateConflict] = useState(null);

  // Stati per la Selezione Multipla
  const [isBulkMode, setIsBulkMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);

  // Stato per filtrare solo i prodotti visibili
  const [showOnlyVisible, setShowOnlyVisible] = useState(true);

  const openAddForm = () => {
    setEditingProduct(null);
    setFormData({ 
      name: '', 
      price: '', 
      category: '', 
      color: '#3b82f6', 
      visible: true, 
      print_destination: 'both',
      ...(courses && { course_id: null }),
      ...(modifierGroups && { modifier_group_ids: [] }),
      stock_enabled: false,
      stock: ''
    });
    setShowForm(true);
  };

  const openEditForm = (p) => {
    setEditingProduct(p);
    setFormData({
      name: p.name || '',
      price: p.price !== undefined && p.price !== null ? String(p.price) : '',
      category: p.category || '',
      color: p.color || '#3b82f6',
      visible: p.visible ?? true,
      print_destination: p.print_destination || 'both',
      ...(courses && { course_id: p.course_id ?? null }),
      ...(modifierGroups && { modifier_group_ids: modifierGroups.filter(g => g.product_ids.includes(p.id)).map(g => g.id) }),
      stock_enabled: p.stock_enabled ?? false,
      stock: p.stock !== undefined && p.stock !== null ? String(p.stock) : ''
    });
    setShowForm(true);
  };

  useEffect(() => {
    if (showForm) { const t = setTimeout(() => setPopupVisible(true), 20); return () => clearTimeout(t); }
    else setPopupVisible(false);
  }, [showForm]);

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    if (name === 'price') {
      const val = value.replace(',', '.');
      if (/^\d*\.?\d{0,2}$/.test(val)) {
        setFormData(prev => ({ ...prev, price: val }));
      }
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: type === 'checkbox' ? checked : value
      }));
    }
  };

  const setField = (name, value) => {
    setFormData(prev => {
      const updated = { ...prev, [name]: value };
      if (name === 'category' && value.trim() !== '') {
        const existingProductWithSameCat = products.find(
          p => p.category && p.category.toLowerCase() === value.trim().toLowerCase()
        );
        if (existingProductWithSameCat && existingProductWithSameCat.color) {
          updated.color = existingProductWithSameCat.color;
        }
      }
      return updated;
    });
  };

  const handleToggleSingleVisibility = async (product) => {
    const updatedStatus = !product.visible;
    try {
      await fetchWithAuth(`/products/${product.id}`, { method: 'PUT', body: { ...product, visible: updatedStatus } });

      setProducts(prev => prev.map(p => p.id === product.id ? { ...p, visible: updatedStatus } : p));
      showToast(`Visibilità "${product.name}" aggiornata`, 'success');
    } catch (err) {
      console.error("Errore cambio visibilità", err);
      showToast(err.message || "Errore nel cambio visibilità", 'error');
    }
  };

  const handleSelectProduct = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]);
  };

  const handleBulkVisibilityChange = async (visibleStatus) => {
    if (selectedIds.length === 0) return;
    try {
      await fetchWithAuth('/products/bulk-visibility', { method: 'PATCH', body: { ids: selectedIds, visible: visibleStatus } });

      setProducts(prev => prev.map(p => selectedIds.includes(p.id) ? { ...p, visible: visibleStatus } : p));
      showToast(`Visibilità aggiornata per ${selectedIds.length} prodotti`, 'success');
      setSelectedIds([]);
      setIsBulkMode(false);
    } catch (err) {
      console.error("Errore modifica visibilità di massa", err);
      showToast(err.message || "Errore durante l'aggiornamento della visibilità", 'error');
    }
  };

  const doSubmit = async () => {
    if (formData.stock_enabled) {
      const parsedStock = parseInt(formData.stock, 10);
      if (formData.stock === '' || isNaN(parsedStock) || parsedStock < 0) {
        showToast('Inserisci una quantità valida per la disponibilità limitata', 'error');
        return;
      }
    }

    try {
      const parsedPrice = parseFloat(String(formData.price).replace(',', '.')) || 0;
      const payload = {
        ...formData,
        price: parsedPrice
      };

      const updatedProduct = await fetchWithAuth(editingProduct ? `/products/${editingProduct.id}` : '/products', {
        method: editingProduct ? 'PUT' : 'POST',
        body: payload,
      });

      if (formData.stock_enabled !== undefined) {
        try {
          const stockData = await fetchWithAuth(`/products/${updatedProduct.id}/stock`, {
            method: 'PATCH',
            body: {
              stock: formData.stock_enabled ? parseInt(formData.stock, 10) : null,
              stock_enabled: !!formData.stock_enabled,
            },
          });
          Object.assign(updatedProduct, { stock: stockData.stock, stock_enabled: stockData.stock_enabled });
        } catch (err) {
          showToast(`Prodotto salvato, ma errore nell'aggiornamento dello stock: ${err.message}`, 'error');
        }
      }

      if (modifierGroups) {
        try {
          await fetchWithAuth(`/products/${updatedProduct.id}/modifier-groups`, { method: 'PUT', body: { group_ids: formData.modifier_group_ids ?? [] } });
          onModifiersSaved?.();
        } catch (err) {
          showToast(`Prodotto salvato, ma errore nei modificatori: ${err.message}`, 'error');
        }
      }

      const parsedProduct = { ...updatedProduct, price: parseFloat(updatedProduct.price) };

      if (editingProduct) {
        setProducts(prev => prev.map(p => p.id === parsedProduct.id ? parsedProduct : p));
        showToast(`Prodotto "${parsedProduct.name}" modificato con successo`, 'success');
      } else {
        setProducts(prev => [...prev, parsedProduct]);
        showToast(`Prodotto "${parsedProduct.name}" aggiunto con successo`, 'success');
      }

      setShowForm(false);
    } catch (err) {
      console.error("Errore salvataggio prodotto", err);
      showToast(err.message || "Impossibile salvare il prodotto", 'error');
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.name) return;

    const nameNorm = formData.name.trim().toLowerCase();
    const catNorm = (formData.category || '').trim().toLowerCase();

    const exactDuplicate = products.find(p =>
      p.name.trim().toLowerCase() === nameNorm &&
      (p.category || '').trim().toLowerCase() === catNorm &&
      (!editingProduct || p.id !== editingProduct.id)
    );
    if (exactDuplicate) {
      setDuplicateConflict({ product: exactDuplicate, sameCategory: true });
      return;
    }

    const crossCategoryConflict = products.find(p =>
      p.name.trim().toLowerCase() === nameNorm &&
      (p.category || '').trim().toLowerCase() !== catNorm &&
      (!editingProduct || p.id !== editingProduct.id)
    );
    if (crossCategoryConflict) {
      setDuplicateConflict({ product: crossCategoryConflict, sameCategory: false });
      return;
    }

    doSubmit();
  };

  const useExistingCategory = () => {
    setField('category', duplicateConflict.product.category);
    setDuplicateConflict(null);
  };

  const [deleteTarget, setDeleteTarget] = useState(null);

  const confirmDelete = async () => {
    try {
      await fetchWithAuth(`/products/${deleteTarget.id}`, { method: 'DELETE' });

      setProducts(prev => prev.filter(p => p.id !== deleteTarget.id));
      showToast(`Prodotto "${deleteTarget.name}" eliminato`, 'success');
      setDeleteTarget(null);
    } catch (err) {
      console.error("Errore eliminazione prodotto", err);
      showToast(err.message || "Impossibile eliminare il prodotto", 'error');
    }
  };

  const categories = [...new Set(products.map(p => p.category).filter(Boolean))];

  const productNamesForCategory = (() => {
    const catNorm = (formData.category || '').trim().toLowerCase();
    const categoryExists = categories.some(c => c.toLowerCase() === catNorm);
    const pool = catNorm && categoryExists
      ? products.filter(p => (p.category || '').trim().toLowerCase() === catNorm)
      : products;
    return [...new Set(pool.map(p => p.name).filter(Boolean))];
  })();

  const filteredGroups = categories
    .filter(c => filterCategory === 'all' || c === filterCategory)
    .map(c => ({
      category: c,
      items: products.filter(p =>
        p.category === c &&
        (!searchTerm || p.name.toLowerCase().includes(searchTerm.toLowerCase())) &&
        (!showOnlyVisible || p.visible !== false)
      )
    }))
    .filter(g => g.items.length > 0);

  const isFormSubmitDisabled = formData.stock_enabled && (
    formData.stock === '' || 
    isNaN(parseInt(formData.stock, 10)) || 
    parseInt(formData.stock, 10) < 0
  );

  return (
    <div className="max-w-5xl mx-auto space-y-5 relative">
      {/* Header Titolo */}
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-[var(--text-main)]">Menu</h2>
        <p className="text-xs font-semibold text-gray-400 mt-1">Gestione prodotti</p>
      </div>

      {/* Top Bar Unificata */}
      <div className="flex items-center justify-between flex-wrap gap-2.5 w-full">
        {/* Filtri a Sinistra: Dropdown Categoria + Search Input */}
        <div className="flex items-center gap-2 flex-1 min-w-[280px]">
          {/* Select Categoria con Freccia Singola */}
          <div className="relative w-44 sm:w-52 shrink-0">
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="w-full h-10 pl-3.5 pr-8 rounded-xl bg-[var(--bg-card-2)] border border-[var(--border)] text-[var(--text-main)] font-semibold text-xs appearance-none cursor-pointer focus:outline-none focus:border-[var(--accent)] transition-colors"
            >
              <option value="all">Tutte le categorie</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-[var(--text-muted)]">
              <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 20 20">
                <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"/>
              </svg>
            </div>
          </div>

          {/* Search Input con icona e Clear Button */}
          <div className="relative flex-1">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Cerca..."
              className="w-full h-10 pl-9 pr-8 rounded-xl bg-[var(--bg-card-2)] border border-[var(--border)] text-[var(--text-main)] text-xs font-bold placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] transition-colors"
            />
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none" />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-main)] p-1 rounded-lg"
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        {/* Azioni a Destra: Visibilità, Selezione Multipla, Aggiungi */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setShowOnlyVisible(!showOnlyVisible)}
            title={showOnlyVisible ? "Mostra anche i prodotti nascosti" : "Mostra solo i prodotti visibili"}
            className={`flex items-center gap-1.5 h-10 px-3.5 rounded-xl font-semibold text-xs transition-all border cursor-pointer ${
              showOnlyVisible
                ? 'bg-green-600/10 border-green-500/30 text-green-400 hover:bg-green-600/20'
                : 'bg-[var(--bg-card-2)] border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-main)] hover:border-gray-400'
            }`}
          >
            {showOnlyVisible ? <Eye size={14} /> : <EyeOff size={14} />}
            <span className="hidden sm:inline">{showOnlyVisible ? 'Solo Visibili' : 'Tutti'}</span>
          </button>

          <button
            onClick={() => { setIsBulkMode(!isBulkMode); setSelectedIds([]); }}
            className={`flex items-center gap-1.5 h-10 px-3.5 rounded-xl font-semibold text-xs transition-all border cursor-pointer ${
              isBulkMode
                ? 'bg-blue-600 border-blue-500 text-white hover:bg-blue-700 shadow-sm'
                : 'bg-[var(--bg-card-2)] border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-main)]'
            }`}
          >
            <span className="hidden sm:inline">{isBulkMode ? 'Annulla Multi' : 'Multi-Select'}</span>
            <span className="sm:hidden">{isBulkMode ? 'Annulla' : 'Multi'}</span>
          </button>

          <button
            onClick={openAddForm}
            className="flex items-center gap-1.5 h-10 px-4 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-xl font-semibold text-xs transition-all cursor-pointer"
          >
            <Plus size={15} />
            <span>Aggiungi</span>
          </button>
        </div>
      </div>

      {/* Banner Selezione Multipla */}
      {isBulkMode && (
        <div className="flex items-center justify-between p-4 bg-blue-950/40 border border-blue-500/30 rounded-xl animate-in fade-in slide-in-from-top-2">
          <span className="text-xs font-bold text-blue-300">{selectedIds.length} Prodotti Selezionati</span>
          <div className="flex gap-2">
            <button
              onClick={() => handleBulkVisibilityChange(true)}
              disabled={selectedIds.length === 0}
              className="flex items-center gap-1.5 px-4 py-2 bg-green-600 disabled:opacity-40 hover:bg-green-700 text-white font-semibold text-xs rounded-xl transition-all cursor-pointer disabled:cursor-not-allowed"
            >
              <Eye size={14} /> Mostra nel Listino
            </button>
            <button
              onClick={() => handleBulkVisibilityChange(false)}
              disabled={selectedIds.length === 0}
              className="flex items-center gap-1.5 px-4 py-2 bg-red-600 disabled:opacity-40 hover:bg-red-700 text-white font-semibold text-xs rounded-xl transition-all cursor-pointer disabled:cursor-not-allowed"
            >
              <EyeOff size={14} /> Nascondi nel Listino
            </button>
          </div>
        </div>
      )}

      {/* Lista Gruppi Prodotti */}
      <div className="space-y-6">
        {filteredGroups.map(group => (
          <div key={group.category}>
            <p className="text-xs font-semibold text-gray-400 mb-3">{group.category}</p>
            <div className="space-y-2">
              {group.items.map(product => (
                <div
                  key={product.id}
                  onClick={() => isBulkMode && handleSelectProduct(product.id)}
                  className={`flex justify-between items-center p-4 bg-[var(--bg-card)] rounded-xl border-l-4 border border-[var(--border)] transition-all ${isBulkMode ? 'cursor-pointer select-none hover:bg-[var(--bg-card-2)]' : ''} ${product.visible === false ? 'opacity-50' : ''}`}
                  style={{ borderLeftColor: product.color || '#3b82f6' }}
                >
                  <div className="flex items-center gap-4">
                    {isBulkMode && (
                      <div className="text-blue-500">
                        {selectedIds.includes(product.id) ? <CheckSquare size={20} /> : <Square size={20} className="text-gray-500" />}
                      </div>
                    )}
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-sm tracking-tight text-[var(--text-main)]">{product.name}</p>
                        {product.visible === false && <span className="bg-red-500/20 text-red-400 font-bold px-1.5 py-0.5 rounded text-[11px] border border-red-500/20">Nascosto</span>}
                        {product.print_destination === 'bar' && <span className="bg-blue-500/10 text-blue-400 font-bold px-1.5 py-0.5 rounded text-[11px] border border-blue-500/20">Bar</span>}
                        {product.print_destination === 'kitchen' && <span className="bg-green-500/10 text-green-400 font-bold px-1.5 py-0.5 rounded text-[11px] border border-green-500/20">Cucina</span>}
                      </div>
                      <p className="text-xs font-bold" style={{ color: product.color || '#3b82f6' }}>{(product.price || 0).toFixed(2)} €</p>
                    </div>
                  </div>

                  {!isBulkMode && (
                    <div className="flex items-center gap-4">
                      <button
                        onClick={() => handleToggleSingleVisibility(product)}
                        title={product.visible !== false ? "Nascondi dal menu rapido" : "Mostra nel menu rapido"}
                        className={`p-2 rounded-xl transition-colors cursor-pointer ${product.visible !== false ? 'text-green-500 hover:bg-green-500/10' : 'text-gray-500 hover:bg-gray-500/10'}`}
                      >
                        {product.visible !== false ? <Eye size={18} /> : <EyeOff size={18} />}
                      </button>

                      <div className="flex gap-1 border-l border-[var(--border)] pl-2">
                        <button onClick={() => openEditForm(product)} className="p-2 rounded-xl hover:bg-[var(--bg-card-2)] transition-colors cursor-pointer"><Edit size={16} className="text-gray-500" /></button>
                        <button onClick={() => setDeleteTarget(product)} className="p-2 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors cursor-pointer"><Trash2 size={16} className="text-red-500" /></button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Modal Aggiungi/Modifica */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className={`bg-[var(--bg-card)] rounded-xl shadow-2xl w-full max-w-2xl border border-[var(--border)] transform transition-all duration-300 ${popupVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'} overflow-hidden`}>
            <div className="flex justify-between items-center px-6 py-4 border-b border-[var(--border)]">
              <h3 className="text-base font-semibold tracking-tight text-[var(--text-main)]">{editingProduct ? 'Modifica prodotto' : 'Nuovo prodotto'}</h3>
              <button onClick={() => setShowForm(false)} className="p-1.5 rounded-xl hover:bg-[var(--bg-card-2)] transition-colors cursor-pointer"><X size={16} className="text-[var(--text-muted)]" /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-6">
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="col-span-2 p-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border)] space-y-1.5">
                  <label className="text-xs font-semibold text-[var(--text-muted)] block">
                    Categoria
                  </label>
                  <Combobox
                    name="category"
                    value={formData.category}
                    onChange={(v) => setField('category', v)}
                    options={categories}
                    placeholder="Seleziona o inserisci categoria (es. Pizze, Bevande)"
                  />
                </div>

                <div className="col-span-2 p-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border)] space-y-1.5">
                  <label className="text-xs font-semibold text-[var(--text-muted)] block">
                    Nome Prodotto
                  </label>
                  <Combobox
                    name="name"
                    value={formData.name}
                    onChange={(v) => setField('name', v)}
                    options={productNamesForCategory}
                    placeholder="Inserisci nome prodotto (es. Margherita, Coca Cola)"
                  />
                </div>

                <div className="col-span-2 p-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border)] space-y-1.5">
                  <label className="text-xs font-semibold text-[var(--text-muted)] block">
                    Prezzo (€)
                  </label>
                  <input
                    name="price"
                    type="text"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={formData.price}
                    onChange={handleInputChange}
                    required
                    className="w-full p-2.5 rounded-xl bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-main)] font-medium text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border)] flex flex-col justify-between space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-[var(--text-muted)]">
                      Colore Categoria
                    </label>
                    <input 
                      type="color" 
                      name="color" 
                      value={formData.color} 
                      onChange={handleInputChange} 
                      className="w-8 h-8 rounded-lg cursor-pointer border-0 bg-transparent" 
                    />
                  </div>

                  {products.length > 0 && (
                    <div className="pt-2 border-t border-[var(--border)]/40">
                      <div className="flex flex-wrap gap-1.5">
                        {[...new Map(products.filter(p => p.category && p.color).map(p => [p.category.toLowerCase(), p])).values()].map(p => (
                          <button
                            key={p.id}
                            type="button"
                            title={p.category}
                            onClick={() => setFormData(prev => ({ ...prev, color: p.color, category: prev.category || p.category }))}
                            className="w-7 h-7 rounded-full border-2 transition-transform hover:scale-110 active:scale-95 cursor-pointer"
                            style={{
                              backgroundColor: p.color,
                              borderColor: formData.color.toLowerCase() === p.color.toLowerCase() ? 'var(--text-main)' : 'transparent'
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="p-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border)]">
                  <span className="text-xs font-semibold text-[var(--text-muted)] block mb-2">
                    Stampa
                  </span>
                  <div className="flex gap-1.5">
                    {[
                      { value: 'both', label: 'Tutti', desc: 'Bar + Cucina' },
                      { value: 'bar', label: 'Solo Bar', desc: 'Ritiro Bar' },
                      { value: 'kitchen', label: 'Solo Cucina', desc: 'Gastronomia' },
                    ].map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setFormData(prev => ({ ...prev, print_destination: opt.value }))}
                        className={`flex-1 py-2 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${formData.print_destination === opt.value
                          ? 'bg-[var(--accent)] border-[var(--accent)] text-white'
                          : 'bg-[var(--bg-card)] border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--accent)]'
                          }`}
                      >
                        <div>{opt.label}</div>
                        <div className="text-[11px] font-medium opacity-70 mt-0.5">{opt.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {modifierGroups && modifierGroups.length > 0 && (
                  <div className="p-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border)]">
                    <span className="text-xs font-medium text-[var(--text-muted)] block mb-2">Opzioni da chiedere (cottura, aggiunte…)</span>
                    <div className="flex flex-wrap gap-1.5">
                      {modifierGroups.map(g => {
                        const on = (formData.modifier_group_ids ?? []).includes(g.id);
                        return (
                          <button key={g.id} type="button" aria-pressed={on}
                            onClick={() => setFormData(prev => ({ ...prev, modifier_group_ids: on ? prev.modifier_group_ids.filter(id => id !== g.id) : [...(prev.modifier_group_ids ?? []), g.id] }))}
                            className={`h-8 px-3 rounded-full text-xs font-medium border transition cursor-pointer ${on ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]' : 'border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}>{g.name}</button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {courses && (
                  <div className="p-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border)]">
                    <label htmlFor="course" className="text-xs font-medium text-[var(--text-muted)] block mb-2">Portata</label>
                    <select id="course" value={formData.course_id ?? ''} onChange={e => setFormData(prev => ({ ...prev, course_id: e.target.value ? Number(e.target.value) : null }))}
                      className="w-full h-10 px-3 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-main)] text-sm focus:outline-none focus:border-[var(--accent)]">
                      <option value="">Nessuna (esce subito: bevande, pane…)</option>
                      {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                )}

                {editingProduct && (
                  <div className="p-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border)] flex items-center gap-3">
                    <input type="checkbox" id="visible" name="visible" checked={formData.visible} onChange={handleInputChange} className="w-4 h-4 rounded cursor-pointer" />
                    <label htmlFor="visible" className="text-xs font-bold text-[var(--text-main)] cursor-pointer">Visibile nel listino</label>
                  </div>
                )}

                <div className="p-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border)] space-y-2">
                  <div className="flex items-center gap-3">
                    <input type="checkbox" id="stock_enabled" name="stock_enabled" checked={formData.stock_enabled || false}
                      onChange={handleInputChange} className="w-4 h-4 rounded cursor-pointer" />
                    <label htmlFor="stock_enabled" className="text-xs font-bold text-[var(--text-main)] cursor-pointer">Disponibilità limitata</label>
                  </div>
                  {formData.stock_enabled && (
                    <input type="number" name="stock" min="0" value={formData.stock} onChange={handleInputChange} placeholder="Quantità disponibile"
                      className="w-full p-2 rounded-xl bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-main)] text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]" />
                  )}
                </div>
              </div>

              <button 
                type="submit" 
                disabled={isFormSubmitDisabled}
                className="w-full mt-4 py-2.5 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-semibold text-sm transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {editingProduct ? 'Salva modifiche' : 'Aggiungi prodotto'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Modal Duplicato */}
      {duplicateConflict && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" onClick={() => setDuplicateConflict(null)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative w-full max-w-sm bg-[var(--bg-card)] rounded-xl border border-[var(--border)] shadow-2xl p-6" onClick={e => e.stopPropagation()}>
            <p className="font-semibold text-[var(--text-main)] mb-2 text-center">Prodotto già esistente</p>
            {duplicateConflict.sameCategory ? (
              <p className="text-xs text-[var(--text-muted)] mb-4 text-center">
                <b>"{duplicateConflict.product.name}"</b> esiste già in <b>"{duplicateConflict.product.category}"</b>.
                Non puoi creare due prodotti identici nella stessa categoria.
              </p>
            ) : (
              <p className="text-xs text-[var(--text-muted)] mb-4 text-center">
                <b>"{duplicateConflict.product.name}"</b> esiste già nella categoria <b>"{duplicateConflict.product.category}"</b>.
                Non puoi creare due prodotti con lo stesso nome in categorie diverse.
              </p>
            )}
            <div className="flex flex-col gap-2">
              {!duplicateConflict.sameCategory && (
                <button onClick={useExistingCategory} className="w-full h-10 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-semibold text-xs transition-all cursor-pointer">
                  Usa quella categoria
                </button>
              )}
              <button onClick={() => setDuplicateConflict(null)} className="w-full h-10 rounded-xl border border-[var(--border)] text-[var(--text-main)] font-semibold text-xs hover:bg-[var(--bg-card-2)] transition-all cursor-pointer">
                {duplicateConflict.sameCategory ? 'Ho capito' : 'Annulla'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Elimina */}
      {deleteTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" onClick={() => setDeleteTarget(null)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative w-full max-w-sm bg-[var(--bg-card)] rounded-xl border border-[var(--border)] shadow-2xl p-6" onClick={e => e.stopPropagation()}>
            <p className="font-semibold text-[var(--text-main)] mb-2 text-center">Eliminare il prodotto "{deleteTarget.name}"?</p>
            <p className="text-xs text-[var(--text-muted)] mb-4 text-center">L'azione è irreversibile!</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(null)} className="flex-1 h-10 rounded-xl border border-[var(--border)] text-[var(--text-main)] font-semibold text-xs hover:bg-[var(--bg-card-2)] transition-all cursor-pointer">
                Annulla
              </button>
              <button onClick={confirmDelete} className="flex-1 h-10 rounded-xl bg-red-500 hover:bg-red-600 text-white font-semibold text-xs transition-all cursor-pointer">
                Elimina
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductConfig;