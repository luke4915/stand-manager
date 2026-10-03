import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GripVertical, Wifi, Usb, Pencil, Trash2, Plus, X, Printer } from 'lucide-react';
import { useAuth } from '../../context/useAuth';

import { fetchWithAuth } from '../../utils/apiClient';
const BACKEND_TEMPLATES = ['Cliente', 'Associazione', 'Cucina', 'Ritiro Bar', 'Ritiro Gastronomia', 'Numeretto'];

const PrintProfiles = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [settings, setSettings] = useState([]);
  const [usbPrinters, setUsbPrinters] = useState([]);
  const [copyTypes, setCopyTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);
  const [error, setError] = useState(null);
  const [modal, setModal] = useState(null); // null | 'new' | { id, name, label }
  const [confirmDelete, setConfirmDelete] = useState(null);

  // ─── Drag & Drop ultra-fluido senza rimbalzi ───
  const itemRefs = useRef(new Map());
  const dragInfo = useRef(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const [draggingId, setDraggingId] = useState(null);
  const [isDropping, setIsDropping] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const [targetIndex, setTargetIndex] = useState(null);

  const targetIndexRef = useRef(null);
  const setTargetIndexSync = (idx) => {
    targetIndexRef.current = idx;
    setTargetIndex(idx);
  };

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    setLoading(true);
    // Ogni elenco si carica per conto suo: se uno fallisce gli altri restano utilizzabili.
    const [sRes, pRes, ctRes] = await Promise.allSettled([
      fetchWithAuth('/print-settings'),
      fetchWithAuth('/printers'),
      fetchWithAuth('/print-settings/copy-types'),
    ]);
    if (sRes.status === 'fulfilled') setSettings(sRes.value);
    else setError(`Errore caricamento impostazioni: ${sRes.reason.message}`);
    if (pRes.status === 'fulfilled') setUsbPrinters(pRes.value || []);
    if (ctRes.status === 'fulfilled') setCopyTypes(ctRes.value);
    setLoading(false);
  };

  const updateSetting = async (id, patch) => {
    setSaving(id);
    setError(null);
    const current = settings.find(s => s.id === id);
    const updated = { ...current, ...patch };
    try {
      const saved = await fetchWithAuth(`/print-settings/${id}`, {
        method: 'PUT',
        body: { printer_type: updated.printer_type, printer_address: updated.printer_address, enabled: updated.enabled },
      });
      setSettings(prev => prev.map(s => s.id === id ? { ...s, ...saved } : s));
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(null);
    }
  };

  const persistOrder = useCallback(async (newSettings) => {
    const originalSettings = settingsRef.current;
    try {
      await fetchWithAuth('/print-settings/reorder', { method: 'POST', body: { order: newSettings.map(s => s.id) } });
    } catch (err) {
      setError(err.message);
      setSettings(originalSettings); // rollback
    }
  }, []);

  // ─── Handlers Drag & Drop ──────────────────────────────────────────
  const handlePointerDown = (id) => (e) => {
    if (!isAdmin || isDropping) return;
    e.preventDefault();
    e.stopPropagation();

    const handle = e.currentTarget;
    if (handle.setPointerCapture) {
      try { handle.setPointerCapture(e.pointerId); } catch { /* puntatore già rilasciato */ }
    }

    const currentIndex = settingsRef.current.findIndex(s => s.id === id);
    if (currentIndex === -1) return;

    const rects = settingsRef.current.map(s => {
      const el = itemRefs.current.get(s.id);
      return el ? el.getBoundingClientRect() : null;
    });

    const centers = rects.map(r => r ? r.top + r.height / 2 : 0);

    dragInfo.current = {
      id,
      pointerId: e.pointerId,
      startY: e.clientY,
      draggedIndex: currentIndex,
      centers,
    };

    setDraggingId(id);
    setIsDropping(false);
    setDragOffset(0);
    setTargetIndexSync(currentIndex);
  };

  const handlePointerMove = (e) => {
    if (!dragInfo.current || dragInfo.current.id == null || isDropping) return;
    const { startY, draggedIndex, centers } = dragInfo.current;
    const deltaY = e.clientY - startY;

    const currentCenter = centers[draggedIndex] + deltaY;

    let closestIdx = draggedIndex;
    let minDistance = Infinity;

    centers.forEach((center, idx) => {
      const dist = Math.abs(currentCenter - center);
      if (dist < minDistance) {
        minDistance = dist;
        closestIdx = idx;
      }
    });

    setDragOffset(deltaY);
    if (targetIndexRef.current !== closestIdx) {
      setTargetIndexSync(closestIdx);
    }
  };

  const handlePointerUp = (e) => {
    if (!dragInfo.current || isDropping) return;

    const { pointerId, draggedIndex, centers } = dragInfo.current;
    if (e && e.currentTarget && e.currentTarget.releasePointerCapture && pointerId != null) {
      try { e.currentTarget.releasePointerCapture(pointerId); } catch { /* puntatore già rilasciato */ }
    }

    const finalTargetIndex = targetIndexRef.current;
    const currentSettings = settingsRef.current;

    setIsDropping(true);

    if (
      finalTargetIndex !== null &&
      finalTargetIndex !== -1 &&
      centers &&
      centers[finalTargetIndex] !== undefined &&
      finalTargetIndex !== draggedIndex
    ) {
      // Scivola esattamente al centro della riga target
      const targetOffset = centers[finalTargetIndex] - centers[draggedIndex];
      setDragOffset(targetOffset);

      // Al termine dell'animazione (200ms), riordina lo stato SENZA transizioni CSS residue
      setTimeout(() => {
        const updated = [...currentSettings];
        const [moved] = updated.splice(draggedIndex, 1);
        updated.splice(finalTargetIndex, 0, moved);

        // Reset istantaneo per evitare il rimbalzo
        dragInfo.current = null;
        setDraggingId(null);
        setIsDropping(false);
        setDragOffset(0);
        setTargetIndexSync(null);

        setSettings(updated);
        persistOrder(updated);
      }, 200);
    } else {
      // Ritorna al punto di partenza se non è cambiato l'indice
      setDragOffset(0);
      setTimeout(() => {
        dragInfo.current = null;
        setDraggingId(null);
        setIsDropping(false);
        setDragOffset(0);
        setTargetIndexSync(null);
      }, 200);
    }
  };

  const createCopyType = async ({ name, label }) => {
    try {
      await fetchWithAuth('/print-settings/copy-types', { method: 'POST', body: { name, label } });
      setModal(null);
      await fetchAll();
    } catch (err) { setError(err.message); }
  };

  const editCopyType = async ({ name, label }) => {
    try {
      await fetchWithAuth(`/print-settings/copy-types/${modal.id}`, { method: 'PUT', body: { name, label } });
      setModal(null);
      await fetchAll();
    } catch (err) { setError(err.message); }
  };

  const deleteCopyType = async (id) => {
    try {
      await fetchWithAuth(`/print-settings/copy-types/${id}`, { method: 'DELETE' });
      setConfirmDelete(null);
      await fetchAll();
    } catch (err) { setError(err.message); }
  };

  const availableTemplates = BACKEND_TEMPLATES.filter(
    t => !copyTypes.some(ct => ct.name === t)
  );

  return (
    <div className="mt-6 p-6 rounded-2xl bg-[var(--bg-card)] border border-[var(--border)] shadow-sm">
      <div className="flex items-center justify-between mb-1">
        <div>
          <h2 className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">
            Impostazioni di stampa
          </h2>
          <p className="text-[11px] text-[var(--text-muted)] mt-1">
            {isAdmin ? 'Tieni premuta la maniglia e trascina per definire l\'ordine di stampa.' : 'Configurazione gestita dall\'amministratore.'}
          </p>
        </div>
        {isAdmin && availableTemplates.length > 0 && (
          <button
            onClick={() => setModal('new')}
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-xl bg-[var(--accent)] text-white font-bold hover:bg-[var(--accent-hover)] transition"
          >
            <Plus size={14} /> Tipo copia
          </button>
        )}
      </div>

      {error && (
        <div className="mt-4 flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-bold">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="shrink-0 hover:opacity-70"><X size={13} /></button>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-[var(--text-muted)] mt-6">Caricamento...</p>
      ) : settings.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)] mt-6">
          Nessun tipo di copia configurato.{isAdmin ? ' Aggiungine uno.' : ''}
        </p>
      ) : (
        <div className="mt-5 flex flex-col gap-2.5">
          {settings.map((s, index) => {
            const isDragging = draggingId === s.id;
            const draggedIndex = dragInfo.current?.draggedIndex;
            const centers = dragInfo.current?.centers;

            let translateY = 0;
            let transitionStyle = 'none'; // Di default NESSUNA transizione per evitare il rimbalzo al cambio DOM

            if (draggingId != null) {
              if (isDragging) {
                translateY = dragOffset;
                // Transizione solo durante il drop magnetico finale
                transitionStyle = isDropping
                  ? 'transform 0.2s cubic-bezier(0.2, 0, 0, 1)'
                  : 'none';
              } else if (draggedIndex != null && targetIndex != null && centers) {
                // Calcolo dello slittamento degli altri elementi
                if (draggedIndex < targetIndex && index > draggedIndex && index <= targetIndex) {
                  translateY = centers[index - 1] - centers[index];
                } else if (draggedIndex > targetIndex && index < draggedIndex && index >= targetIndex) {
                  translateY = centers[index + 1] - centers[index];
                }
                transitionStyle = 'transform 0.2s cubic-bezier(0.2, 0, 0, 1)';
              }
            }

            return (
              <div
                key={s.id}
                ref={el => { if (el) itemRefs.current.set(s.id, el); else itemRefs.current.delete(s.id); }}
                style={{
                  transform: translateY ? `translateY(${translateY}px)` : undefined,
                  transition: transitionStyle,
                  zIndex: isDragging ? 30 : 1,
                  boxShadow: isDragging ? '0 12px 28px rgba(0,0,0,0.25)' : undefined,
                }}
                className={`flex flex-col sm:flex-row sm:items-center gap-3 p-3.5 rounded-2xl border
                  ${isDragging ? 'border-[var(--accent)] bg-[var(--bg-card)] scale-[1.01]' : 'border-[var(--border)] bg-[var(--bg-card-2)]'}`}
              >
                {/* Maniglia + posizione + nome */}
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  {isAdmin && (
                    <button
                      type="button"
                      aria-label="Trascina per riordinare"
                      onPointerDown={handlePointerDown(s.id)}
                      onPointerMove={handlePointerMove}
                      onPointerUp={handlePointerUp}
                      onPointerCancel={handlePointerUp}
                      style={{ touchAction: 'none' }}
                      className={`shrink-0 w-9 h-9 flex items-center justify-center rounded-xl text-[var(--text-muted)] border border-transparent select-none
                        ${isDragging ? 'bg-[var(--accent)]/10 border-[var(--accent)]/30 text-[var(--accent)] cursor-grabbing' : 'hover:bg-[var(--bg-card)] hover:text-[var(--text-main)] cursor-grab'}`}
                    >
                      <GripVertical size={18} />
                    </button>
                  )}
                  <span className="shrink-0 w-6 h-6 flex items-center justify-center rounded-lg bg-[var(--accent)]/10 text-[var(--accent)] text-[11px] font-black">
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="font-black text-sm uppercase tracking-tight text-[var(--text-main)] truncate">
                      {s.copy_type_label}
                    </p>
                    <p className="text-[11px] text-[var(--text-muted)] truncate">{s.copy_type_name}</p>
                  </div>
                </div>

                {/* Connessione stampante */}
                <div className={`flex flex-wrap items-center gap-2 sm:flex-1 transition-opacity ${!s.enabled ? 'opacity-40 pointer-events-none' : ''}`}>
                  <div className="flex rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-0.5 shrink-0">
                    <button
                      disabled={!isAdmin || saving === s.id}
                      onClick={() => updateSetting(s.id, { printer_type: 'network', printer_address: '' })}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all ${s.printer_type === 'network' ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-muted)]'}`}
                    >
                      <Wifi size={14} /> Rete
                    </button>
                    <button
                      disabled={!isAdmin || saving === s.id}
                      onClick={() => updateSetting(s.id, { printer_type: 'usb', printer_address: '' })}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all ${s.printer_type === 'usb' ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-muted)]'}`}
                    >
                      <Usb size={14} /> USB
                    </button>
                  </div>

                  {s.printer_type === 'network' ? (
                    <input
                      type="text"
                      placeholder="192.168.1.100:9100"
                      value={s.printer_address || ''}
                      disabled={!isAdmin || saving === s.id}
                      onChange={e => setSettings(prev => prev.map(x => x.id === s.id ? { ...x, printer_address: e.target.value } : x))}
                      onBlur={e => updateSetting(s.id, { printer_address: e.target.value })}
                      className="flex-1 min-w-[150px] px-3 py-1.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border)] text-[var(--text-main)] text-sm outline-none focus:ring-2 focus:ring-[var(--accent)] disabled:cursor-not-allowed"
                    />
                  ) : (
                    <select
                      value={s.printer_address || ''}
                      disabled={!isAdmin || saving === s.id}
                      onChange={e => updateSetting(s.id, { printer_address: e.target.value })}
                      className="flex-1 min-w-[150px] px-3 py-1.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border)] text-[var(--text-main)] text-xs outline-none focus:ring-2 focus:ring-[var(--accent)] disabled:cursor-not-allowed"
                    >
                      <option value="">Seleziona stampante USB</option>
                      {usbPrinters.map(p => (
                        <option key={p.name} value={p.name}>{p.name}{p.isDefault ? ' (default)' : ''}</option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Azioni + toggle */}
                <div className="flex items-center gap-2 shrink-0 justify-end">
                  {/*{saving === s.id && <span className="text-[10px] text-[var(--text-muted)]">Salvataggio...</span>}*/}
                  {isAdmin && (
                    <>
                      <button onClick={() => setModal({ id: s.copy_type_id, name: s.copy_type_name, label: s.copy_type_label })}
                        title="Rinomina"
                        className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--accent)] hover:bg-[var(--accent)]/10 transition-colors">
                        <Pencil size={16} />
                      </button>
                      <button onClick={() => setConfirmDelete(s.copy_type_id)}
                        title="Elimina"
                        className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-red-500 hover:bg-red-500/10 transition-colors">
                        <Trash2 size={16} />
                      </button>
                    </>
                  )}
                  <label className={`relative inline-flex items-center shrink-0 ${!isAdmin ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}>
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={s.enabled}
                      disabled={!isAdmin || saving === s.id}
                      onChange={e => updateSetting(s.id, { enabled: e.target.checked })}
                    />
                    {/* Sfondo track con transizione colore dedicata */}
                    <div className="w-10 h-5.5 bg-gray-200 dark:bg-gray-700 rounded-full peer peer-checked:bg-[var(--accent)] transition-colors duration-200 ease-in-out"></div>

                    {/* Pallina con translate-x-0 base e transizione trasformazione fluida */}
                    <div className="absolute left-1 top-1 w-3.5 h-3.5 bg-white rounded-full shadow transform translate-x-0 peer-checked:translate-x-[18px] transition-transform duration-200 ease-in-out pointer-events-none"></div>
                  </label>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modale nuovo/modifica tipo copia */}
      {modal && (
        <CopyTypeModal
          initial={modal === 'new' ? null : modal}
          templatesOptions={modal === 'new' ? availableTemplates : BACKEND_TEMPLATES}
          onSave={modal === 'new' ? createCopyType : editCopyType}
          onClose={() => setModal(null)}
        />
      )}

      {/* Conferma eliminazione */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
          <div className="bg-[var(--bg-card)] rounded-2xl shadow-xl p-6 w-full max-w-sm text-center border border-[var(--border)]">
            <p className="text-[var(--text-main)] mb-2 font-bold">Eliminare questo tipo di copia?</p>
            <p className="text-sm text-[var(--text-muted)] mb-6">Tutte le impostazioni associate verranno perse.</p>
            <div className="flex justify-center gap-4">
              <button onClick={() => setConfirmDelete(null)}
                className="px-4 py-2 rounded-xl bg-[var(--bg-card-2)] text-[var(--text-main)] text-sm">Annulla</button>
              <button onClick={() => deleteCopyType(confirmDelete)}
                className="px-4 py-2 rounded-xl bg-red-500 text-white text-sm font-bold">Elimina</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const CopyTypeModal = ({ initial, templatesOptions, onSave, onClose }) => {
  const [name, setName] = useState(initial?.name || '');
  const [label, setLabel] = useState(initial?.label || '');
  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
      <div className="bg-[var(--bg-card)] rounded-2xl shadow-xl p-6 w-full max-w-sm border border-[var(--border)]">
        <h3 className="font-black text-sm uppercase tracking-widest text-[var(--text-muted)] mb-4 flex items-center gap-2">
          <Printer size={14} /> {initial ? 'Modifica tipo copia' : 'Nuovo tipo copia'}
        </h3>
        <div className="flex flex-col gap-3">
          <div>
            <select
              className="w-full px-3 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border)] text-[var(--text-main)] text-sm outline-none focus:ring-2 focus:ring-[var(--accent)] disabled:opacity-50"
              value={name}
              onChange={e => setName(e.target.value)}
              disabled={!!initial}
            >
              <option value="">Seleziona template...</option>
              {templatesOptions.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-[var(--text-muted)] mb-1">Etichetta UI <span className="font-normal opacity-60">(es. Copia Associazione)</span></label>
            <input className="w-full px-3 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border)] text-[var(--text-main)] text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]"
              value={label} onChange={e => setLabel(e.target.value)} placeholder="Copia Associazione" />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={onClose} className="px-4 py-2 rounded-xl bg-[var(--bg-card-2)] text-[var(--text-main)] text-sm">Annulla</button>
          <button onClick={() => onSave({ name: name.trim(), label: label.trim() })}
            disabled={!name.trim() || !label.trim()}
            className="px-4 py-2 rounded-xl bg-[var(--accent)] text-white text-sm font-bold disabled:opacity-50">Salva</button>
        </div>
      </div>
    </div>
  );
};

export default PrintProfiles;