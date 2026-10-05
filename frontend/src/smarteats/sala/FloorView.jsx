import { useState } from 'react';
import { Users, Receipt } from 'lucide-react';
import FloorCanvas from '../floor/FloorCanvas';
import { isPlaced } from '../floor/geometry';
import { tableState, formatEuro } from './checkMath';

const minutesSince = (iso) => Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));

const STATE_STYLE = {
  free: 'border-[var(--border)] bg-[var(--bg-card-2)] text-[var(--text-muted)]',
  busy: 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--text-main)]',
  bill: 'border-amber-500 bg-amber-500/10 text-[var(--text-main)]',
};
const STATE_LABEL = { free: 'Libero', busy: 'Occupato', bill: 'Conto richiesto' };
const interactive = 'cursor-pointer hover:brightness-110 active:scale-[0.98] transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]';
const ring = 'ring-2 ring-offset-2 ring-offset-[var(--bg-card)] ring-[var(--text-main)]';

// Scheda di un tavolo (per i tavoli non ancora piazzati sulla pianta)
const TableCard = ({ table, check, selected, onSelect }) => {
  const state = tableState(check);
  return (
    <button disabled={!table.active} onClick={() => onSelect(table, check)} aria-label={`${table.name}: ${STATE_LABEL[state]}`}
      className={`text-left rounded-xl border-2 p-3 min-h-[92px] flex flex-col justify-between ${STATE_STYLE[state]} ${table.active ? interactive : 'opacity-40'} ${selected ? ring : ''}`}>
      <div className="flex items-start justify-between gap-2 w-full">
        <span className="text-lg font-semibold leading-none">{table.name}</span>
        <span className="flex items-center gap-1 text-xs font-bold text-[var(--text-muted)]"><Users size={12} />{check ? check.covers : table.seats}</span>
      </div>
      <div className="text-xs">
        <p className="font-semibold">{table.active ? STATE_LABEL[state] : 'Non in uso'}</p>
        {check && <p className="mt-0.5 flex items-center gap-1.5 text-[var(--text-muted)]"><Receipt size={12} /> {formatEuro(check.total)} · {minutesSince(check.opened_at)} min</p>}
      </div>
    </button>
  );
};

// Un tavolo sulla pianta: forma e misura scelte dall'admin, colore dallo stato.
const mapTable = (checkOf, selectedId, onSelect) => (table, style, cell) => {
  const check = checkOf(table);
  const state = tableState(check);
  return (
    <button key={table.id} style={style} disabled={!table.active} onClick={() => onSelect(table, check)}
      title={`${table.name} · ${STATE_LABEL[state]}`} aria-label={`${table.name}: ${STATE_LABEL[state]}`}
      className={`flex flex-col items-center justify-center border-2 box-border overflow-hidden text-center ${table.shape === 'round' ? 'rounded-full' : 'rounded-lg'} ${STATE_STYLE[state]} ${table.active ? interactive : 'opacity-40'} ${table.id === selectedId ? `${ring} z-10` : ''}`}>
      <span className="font-semibold leading-none text-[var(--text-main)] truncate max-w-full px-1" style={{ fontSize: Math.max(10, Math.min(cell * 0.45, 18)) }}>{table.name}</span>
      {cell >= 24 && table.h > 1 && (
        <span className="leading-none mt-0.5 text-[var(--text-muted)]" style={{ fontSize: Math.max(9, cell * 0.3) }}>
          {check ? `${check.covers}/${table.seats} · ${formatEuro(check.total)}` : `${table.seats} posti`}
        </span>
      )}
    </button>
  );
};

// Le sale con i tavoli: un selettore in alto sceglie la sala, la pianta disegnata dall'admin occupa tutta l'area
// (scalata per starci intera) e mostra lo stato dal vivo. I tavoli non ancora piazzati restano schede sotto la pianta.
const FloorView = ({ rooms, checks, service, selectedTableId, onSelect }) => {
  const byTable = new Map(checks.map(c => [c.table_id, c]));
  const checkOf = (t) => byTable.get(t.id);
  const activeRooms = rooms.filter(r => r.active);
  const [roomId, setRoomId] = useState(null);
  const room = activeRooms.find(r => r.id === roomId) ?? activeRooms[0];
  const covers = checks.reduce((s, c) => s + c.covers, 0);
  const openIn = (r) => r.tables.filter(t => byTable.has(t.id)).length;
  const loose = room ? room.tables.filter(t => !isPlaced(t)) : [];

  return (
    <div className="h-full flex flex-col gap-3 min-h-0">
      <div className="flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2 min-w-0 overflow-x-auto no-scrollbar" role="tablist" aria-label="Sale">
          {activeRooms.map(r => (
            <button key={r.id} role="tab" aria-selected={r.id === room.id} onClick={() => setRoomId(r.id)}
              className={`shrink-0 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${r.id === room.id ? 'bg-[var(--accent)] text-white' : 'bg-[var(--bg-card-2)] text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}>
              {r.name}{openIn(r) > 0 && <span className={`ml-2 text-xs ${r.id === room.id ? 'text-white/80' : 'text-[var(--accent)]'}`}>{openIn(r)}</span>}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-4 text-xs font-bold text-[var(--text-muted)]">
          <span className={service ? 'text-green-500' : 'text-red-400'}>● {service ? service.name : 'Servizio chiuso'}</span>
          <span>{checks.length} tavoli</span>
          <span>{covers} coperti</span>
        </div>
      </div>

      {!room && <p className="text-sm text-[var(--text-muted)]">Nessuna sala configurata. Un amministratore può crearle in Impostazioni.</p>}
      {room && room.tables.some(isPlaced) && (
        <div className="flex-1 min-h-[200px]">
          <FloorCanvas fit gridW={room.grid_w} gridH={room.grid_h} tables={room.tables} elements={room.elements} renderTable={mapTable(checkOf, selectedTableId, onSelect)} />
        </div>
      )}
      {loose.length > 0 && (
        <div className="grid gap-2.5 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5 shrink-0 max-h-[40%] overflow-y-auto no-scrollbar">
          {loose.map(t => <TableCard key={t.id} table={t} check={checkOf(t)} selected={t.id === selectedTableId} onSelect={onSelect} />)}
        </div>
      )}
      {room && !room.tables.length && <p className="text-sm text-[var(--text-muted)]">Nessun tavolo in questa sala.</p>}
    </div>
  );
};

export default FloorView;
