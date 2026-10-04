import { useState, useEffect, useCallback } from 'react';
import { Users, Receipt } from 'lucide-react';
import { fetchWithAuth } from '../utils/apiClient';
import { useToast } from '../context/useToast';

const minutesSince = (iso) => Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
const euro = (n) => `${Number(n).toFixed(2).replace('.', ',')} €`;

// Stato del tavolo: libero, occupato o conto richiesto (non si memorizza: lo dice il conto aperto).
const tableState = (check) => (!check ? 'free' : check.bill_requested_at ? 'bill' : 'busy');
const STATE_STYLE = {
  free: 'border-[var(--border)] bg-[var(--bg-card-2)] text-[var(--text-muted)]',
  busy: 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--text-main)]',
  bill: 'border-amber-500 bg-amber-500/10 text-[var(--text-main)]',
};
const STATE_LABEL = { free: 'Libero', busy: 'Occupato', bill: 'Conto richiesto' };

const TableCard = ({ table, check }) => {
  const state = tableState(check);
  return (
    <div className={`rounded-2xl border-2 p-4 min-h-[110px] flex flex-col justify-between ${STATE_STYLE[state]} ${table.active ? '' : 'opacity-40'}`}>
      <div className="flex items-start justify-between gap-2">
        <span className="text-xl font-black leading-none">{table.name}</span>
        <span className="flex items-center gap-1 text-xs font-bold text-[var(--text-muted)]"><Users size={12} />{check ? check.covers : table.seats}</span>
      </div>
      <div className="text-xs">
        <p className="font-black uppercase tracking-widest">{table.active ? STATE_LABEL[state] : 'Non in uso'}</p>
        {check && (
          <p className="mt-0.5 flex items-center gap-1.5 text-[var(--text-muted)]">
            <Receipt size={12} /> {euro(check.total)} · {minutesSince(check.opened_at)} min
          </p>
        )}
      </div>
    </div>
  );
};

// Vista d'insieme della sala: tavoli per sala con il loro stato, aggiornata in tempo reale.
// L'apertura dei tavoli e le comande arrivano col passo 2-6.
const SalaPage = ({ service, event }) => {
  const { showToast } = useToast();
  const [rooms, setRooms] = useState(null);
  const [checks, setChecks] = useState([]);

  const load = useCallback(async () => {
    try {
      const [r, c] = await Promise.all([fetchWithAuth('/rooms'), fetchWithAuth('/checks?status=open')]);
      setRooms(r); setChecks(c);
    } catch (err) { showToast(err.message || 'Errore caricamento sala', 'error'); }
  }, [showToast]);

  useEffect(() => { load(); }, [load, service?.id]);
  // Un conto cambia su un altro dispositivo
  useEffect(() => { if (event?.type === 'check_updated') load(); }, [event, load]);

  if (!rooms) return <p className="text-[var(--text-muted)]">Caricamento sala…</p>;

  const byTable = new Map(checks.map(c => [c.table_id, c]));
  const activeRooms = rooms.filter(r => r.active);
  const busy = checks.length;
  const covers = checks.reduce((s, c) => s + c.covers, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-3xl font-black tracking-tighter text-[var(--text-main)]">SALA</h2>
          <p className="text-xs font-black uppercase tracking-widest text-[var(--text-muted)] mt-1">
            {service ? service.name : 'Nessun servizio aperto'}
          </p>
        </div>
        <div className="flex gap-6 text-right">
          <div><p className="text-2xl font-black text-[var(--text-main)]">{busy}</p><p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">Tavoli occupati</p></div>
          <div><p className="text-2xl font-black text-[var(--text-main)]">{covers}</p><p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">Coperti</p></div>
        </div>
      </div>

      {!activeRooms.length && (
        <p className="text-sm text-[var(--text-muted)]">Nessuna sala configurata. Un amministratore può crearle in Impostazioni.</p>
      )}
      {activeRooms.map(room => (
        <section key={room.id}>
          <h3 className="text-xs font-black uppercase tracking-widest text-[var(--text-muted)] mb-3">{room.name}</h3>
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
            {room.tables.map(t => <TableCard key={t.id} table={t} check={byTable.get(t.id)} />)}
          </div>
          {!room.tables.length && <p className="text-sm text-[var(--text-muted)]">Nessun tavolo in questa sala.</p>}
        </section>
      ))}
    </div>
  );
};

export default SalaPage;
