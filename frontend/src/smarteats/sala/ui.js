// Classi condivise dai componenti della Sala. Linguaggio visivo: testo normale (niente maiuscolo spaziato), pesi
// medi e semibold, un solo colore d'accento, angoli e bordi sobri, nessuna ombra colorata. Le gerarchie si fanno
// con dimensione e peso, i numeri sono sempre `tabular-nums`.
export const label = 'text-xs font-medium text-[var(--text-muted)]';
const base = 'inline-flex items-center justify-center gap-2 h-11 px-4 rounded-lg font-medium text-sm active:scale-[0.98] transition disabled:opacity-40 disabled:pointer-events-none cursor-pointer select-none';
export const btn = `${base} border border-[var(--border)] bg-transparent text-[var(--text-main)] hover:bg-[var(--bg-card-2)]`;
export const btnPrimary = `${base} bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white`;
export const btnDanger = `${base} border border-red-500/40 text-red-500 hover:bg-red-500/10`;
export const iconBtn = 'inline-flex items-center justify-center p-2 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-card-2)] transition active:scale-95 cursor-pointer disabled:opacity-40 disabled:pointer-events-none';
export const input = 'w-full h-11 px-3 rounded-lg bg-[var(--bg-card-2)] border border-[var(--border)] text-[var(--text-main)] text-sm placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] transition';
export const row = 'px-3 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--bg-card-2)]';
// Interruttore a due o più scelte (un solo pulsante acceso)
export const segment = (on) => `flex-1 h-9 rounded-md text-sm font-medium transition cursor-pointer ${on ? 'bg-[var(--bg-card)] text-[var(--text-main)] shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'}`;
export const segmentBox = 'flex gap-1 p-1 rounded-lg bg-[var(--bg-main)] border border-[var(--border)]';
