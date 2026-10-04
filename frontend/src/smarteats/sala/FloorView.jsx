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
        <span className="text-lg font-black leading-none">{table.name}</span>
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
const mapTable = (checkOf, selectedId, onSelect) => (table, style, cell) => {
  const check = checkOf(table);
  const state = tableState(check);
  return (
    <button key={table.id} style={style} disabled={!table.active} onClick={() => onSelect(table, check)}
      title={`${table.name} · ${STATE_LABEL[state]}`} aria-label={`${table.name}: ${STATE_LABEL[state]}`}
      className={`flex flex-col items-center justify-center border-2 box-border overflow-hidden text-center ${table.shape === 'round' ? 'rounded-full' : 'rounded-lg'} ${STATE_STYLE[state]} ${table.active ? interactive : 'opacity-40'} ${table.id === selectedId ? `${ring} z-10` : ''}`}>
      <span className="font-black leading-none text-[var(--text-main)] truncate max-w-full px-1" style={{ fontSize: Math.max(10, Math.min(cell * 0.45, 18)) }}>{table.name}</span>
      {check && cell >= 24 && table.h > 1 && <span className="leading-none mt-0.5 text-[var(--text-muted)]" style={{ fontSize: Math.max(9, cell * 0.3) }}>{check.covers}p · {formatEuro(check.total)}</span>}
    </button>
  );
};

// Le sale con i tavoli: la pianta disegnata dall'admin (o le schede, finché non c'è) e lo stato dal vivo.
const FloorView = ({ rooms, checks, service, selectedTableId, onSelect }) => {
  const byTable = new Map(checks.map(c => [c.table_id, c]));
  const checkOf = (t) => byTable.get(t.id);
  const activeRooms = rooms.filter(r => r.active);
  const covers = checks.reduce((s, c) => s + c.covers, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-black tracking-tighter uppercase text-[var(--text-main)]">Sala</h2>
          <span className={`text-[11px] font-black uppercase tracking-widest ${service ? 'text-green-500' : 'text-red-400'}`}>{service ? `● ${service.name}` : '● Servizio chiuso'}</span>
        </div>
        <div className="flex gap-5 text-right">
          <div><p className="text-xl font-black text-[var(--text-main)] leading-none">{checks.length}</p><p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] mt-1">Tavoli</p></div>
          <div><p className="text-xl font-black text-[var(--text-main)] leading-none">{covers}</p><p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] mt-1">Coperti</p></div>
        </div>
      </div>

      {!activeRooms.length && <p className="text-sm text-[var(--text-muted)]">Nessuna sala configurata. Un amministratore può crearle in Impostazioni.</p>}
      {activeRooms.map(room => (
        <section key={room.id} className="space-y-3">
          {activeRooms.length > 1 && <h3 className="text-xs font-black uppercase tracking-widest text-[var(--text-muted)]">{room.name}</h3>}
          {room.tables.some(isPlaced) && <FloorCanvas gridW={room.grid_w} gridH={room.grid_h} tables={room.tables} renderTable={mapTable(checkOf, selectedTableId, onSelect)} />}
          {/* Senza pianta disegnata tutti i tavoli sono schede; con la pianta restano schede solo quelli non ancora piazzati */}
          <div className="grid gap-2.5 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
            {room.tables.filter(t => !isPlaced(t)).map(t => <TableCard key={t.id} table={t} check={checkOf(t)} selected={t.id === selectedTableId} onSelect={onSelect} />)}
          </div>
          {!room.tables.length && <p className="text-sm text-[var(--text-muted)]">Nessun tavolo in questa sala.</p>}
        </section>
      ))}
    </div>
  );
};

export default FloorView;
