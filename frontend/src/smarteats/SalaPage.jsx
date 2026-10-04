import { useState, useEffect, useCallback } from 'react';
import { Users, Receipt } from 'lucide-react';
import { fetchWithAuth } from '../utils/apiClient';
import { useToast } from '../context/useToast';
import FloorCanvas from './floor/FloorCanvas';
import { isPlaced } from './floor/geometry';
import OpenTableDialog from './sala/OpenTableDialog';
import CheckPanel from './sala/CheckPanel';
import { tableState, formatEuro } from './sala/checkMath';

const minutesSince = (iso) => Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));

const STATE_STYLE = {
  free: 'border-[var(--border)] bg-[var(--bg-card-2)] text-[var(--text-muted)]',
  busy: 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--text-main)]',
  bill: 'border-amber-500 bg-amber-500/10 text-[var(--text-main)]',
};
const STATE_LABEL = { free: 'Libero', busy: 'Occupato', bill: 'Conto richiesto' };
const interactive = 'cursor-pointer hover:brightness-110 active:scale-[0.98] transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]';

// Scheda di un tavolo (per i tavoli non ancora piazzati sulla pianta)
const TableCard = ({ table, check, onSelect }) => {
  const state = tableState(check);
  return (
    <button disabled={!table.active} onClick={() => onSelect(table, check)} aria-label={`${table.name}: ${STATE_LABEL[state]}`}
      className={`text-left rounded-2xl border-2 p-4 min-h-[110px] flex flex-col justify-between ${STATE_STYLE[state]} ${table.active ? interactive : 'opacity-40'}`}>
      <div className="flex items-start justify-between gap-2 w-full">
        <span className="text-xl font-black leading-none">{table.name}</span>
        <span className="flex items-center gap-1 text-xs font-bold text-[var(--text-muted)]"><Users size={12} />{check ? check.covers : table.seats}</span>
      </div>
      <div className="text-xs">
        <p className="font-black uppercase tracking-widest">{table.active ? STATE_LABEL[state] : 'Non in uso'}</p>
        {check && <p className="mt-0.5 flex items-center gap-1.5 text-[var(--text-muted)]"><Receipt size={12} /> {formatEuro(check.total)} · {minutesSince(check.opened_at)} min</p>}
      </div>
    </button>
  );
};

// Un tavolo sulla pianta: forma e misura scelte dall'admin, colore dallo stato.
const mapTable = (checkOf, onSelect) => (table, style, cell) => {
  const check = checkOf(table);
  const state = tableState(check);
  return (
    <button key={table.id} style={style} disabled={!table.active} onClick={() => onSelect(table, check)}
      title={`${table.name} · ${STATE_LABEL[state]}`} aria-label={`${table.name}: ${STATE_LABEL[state]}`}
      className={`flex flex-col items-center justify-center border-2 box-border overflow-hidden text-center ${table.shape === 'round' ? 'rounded-full' : 'rounded-lg'} ${STATE_STYLE[state]} ${table.active ? interactive : 'opacity-40'}`}>
      <span className="font-black leading-none text-[var(--text-main)] truncate max-w-full px-1" style={{ fontSize: Math.max(10, Math.min(cell * 0.45, 18)) }}>{table.name}</span>
      {check && cell >= 24 && table.h > 1 && <span className="leading-none mt-0.5 text-[var(--text-muted)]" style={{ fontSize: Math.max(9, cell * 0.3) }}>{check.covers}p · {formatEuro(check.total)}</span>}
    </button>
  );
};

// La Sala: tavoli per sala con lo stato dal vivo. Un tavolo libero si apre (coperti), uno occupato mostra il suo conto.
const SalaPage = ({ user, service, event }) => {
  const { showToast } = useToast();
  const [rooms, setRooms] = useState(null);
  const [checks, setChecks] = useState([]);
  const [opening, setOpening] = useState(null);   // tavolo libero da aprire
  const [panelId, setPanelId] = useState(null);   // conto aperto nel pannello

  const load = useCallback(async () => {
    try {
      const [r, c] = await Promise.all([fetchWithAuth('/rooms'), fetchWithAuth('/checks?status=open')]);
      setRooms(r); setChecks(c);
    } catch (err) { showToast(err.message || 'Errore caricamento sala', 'error'); }
  }, [showToast]);

  useEffect(() => { load(); }, [load, service?.id]);
  // Un conto cambia su un altro dispositivo
  useEffect(() => { if (event?.type === 'check_updated') load(); }, [event, load]);

  const select = (table, check) => {
    if (check) return setPanelId(check.id);
    if (!service) return showToast('Apri il servizio per aprire i tavoli', 'warning');
    setOpening(table);
  };

  if (!rooms) return <p className="text-[var(--text-muted)]">Caricamento sala…</p>;

  const byTable = new Map(checks.map(c => [c.table_id, c]));
  const checkOf = (t) => byTable.get(t.id);
  const activeRooms = rooms.filter(r => r.active);
  const covers = checks.reduce((s, c) => s + c.covers, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-3xl font-black tracking-tighter text-[var(--text-main)]">SALA</h2>
          <p className="text-xs font-black uppercase tracking-widest text-[var(--text-muted)] mt-1">{service ? service.name : 'Nessun servizio aperto'}</p>
        </div>
        <div className="flex gap-6 text-right">
          <div><p className="text-2xl font-black text-[var(--text-main)]">{checks.length}</p><p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">Tavoli occupati</p></div>
          <div><p className="text-2xl font-black text-[var(--text-main)]">{covers}</p><p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">Coperti</p></div>
        </div>
      </div>

      {!activeRooms.length && <p className="text-sm text-[var(--text-muted)]">Nessuna sala configurata. Un amministratore può crearle in Impostazioni.</p>}
      {activeRooms.map(room => (
        <section key={room.id}>
          <h3 className="text-xs font-black uppercase tracking-widest text-[var(--text-muted)] mb-3">{room.name}</h3>
          {room.tables.some(isPlaced) && (
            <div className="mb-3"><FloorCanvas gridW={room.grid_w} gridH={room.grid_h} tables={room.tables} renderTable={mapTable(checkOf, select)} /></div>
          )}
          {/* Senza pianta disegnata tutti i tavoli sono schede; con la pianta restano schede solo quelli non ancora piazzati */}
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
            {room.tables.filter(t => !isPlaced(t)).map(t => <TableCard key={t.id} table={t} check={checkOf(t)} onSelect={select} />)}
          </div>
          {!room.tables.length && <p className="text-sm text-[var(--text-muted)]">Nessun tavolo in questa sala.</p>}
        </section>
      ))}

      {opening && <OpenTableDialog table={opening} onClose={() => { setOpening(null); load(); }} onOpened={(check) => { setOpening(null); setPanelId(check.id); load(); }} />}
      {panelId && <CheckPanel checkId={panelId} user={user} service={service} event={event} onClose={() => { setPanelId(null); load(); }} onChanged={load} />}
    </div>
  );
};

export default SalaPage;
