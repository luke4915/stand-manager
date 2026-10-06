import { useState, useEffect, useCallback } from 'react';
import { LayoutGrid, Plus } from 'lucide-react';
import { fetchWithAuth } from '../../utils/apiClient';
import { useToast } from '../../context/useToast';
import RoomCard from './RoomCard';

// Sale e tavoli del locale (solo admin, modulo `tables`).
const RoomsSettings = () => {
  const { showToast } = useToast();
  const [rooms, setRooms] = useState(null);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setRooms(await fetchWithAuth('/rooms')); setError(''); }
    catch (err) { setError(err.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const addRoom = async () => {
    setBusy(true);
    try { await fetchWithAuth('/rooms', { method: 'POST', body: { name: name.trim() } }); setName(''); await load(); }
    catch (err) { showToast(err.message, 'error'); }
    finally { setBusy(false); }
  };

  return (
    <div className="bg-[var(--bg-card)] p-5 rounded-xl border border-[var(--border)]">
      <h2 className="text-sm font-semibold text-[var(--text-main)] mb-1 flex items-center gap-2">
        <LayoutGrid size={15} /> Sala e tavoli
      </h2>
      <p className="text-xs text-[var(--text-muted)] mb-4">Le sale del locale e i loro tavoli. Un tavolo con conti registrati non si elimina: si disattiva.</p>

      {error && <p className="text-red-500 text-xs font-semibold mb-3">{error}</p>}
      {!rooms && !error && <p className="text-sm text-[var(--text-muted)]">Caricamento…</p>}

      <div className="space-y-3">
        {rooms?.map(room => <RoomCard key={room.id} room={room} onChanged={load} />)}
      </div>

      {rooms && (
        <div className="flex gap-2 mt-4">
          <input className="flex-1 min-w-0 p-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border)] text-[var(--text-main)] text-sm outline-none focus:ring-2 focus:ring-[var(--accent)] placeholder:text-[var(--text-muted)]"
            aria-label="Nome della nuova sala" placeholder={rooms.length ? 'Nuova sala' : 'Prima sala (es. Sala interna)'} maxLength={50}
            value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && name.trim() && addRoom()} />
          <button className="flex items-center gap-1.5 px-4 py-2.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-xl font-semibold text-xs disabled:opacity-50"
            disabled={busy || !name.trim()} onClick={addRoom}><Plus size={14} /> Sala</button>
        </div>
      )}
    </div>
  );
};

export default RoomsSettings;
