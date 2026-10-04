// Classi condivise dai componenti della Sala: stesso aspetto della cassa (angoli xl, etichette maiuscole spaziate).
export const label = 'text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]';
const base = 'flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-black text-xs uppercase tracking-widest active:scale-95 transition-all disabled:opacity-40 disabled:pointer-events-none cursor-pointer';
export const btn = `${base} border border-[var(--border)] bg-[var(--bg-card-2)] text-[var(--text-main)] hover:border-[var(--accent)]/60`;
export const btnPrimary = `${base} bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white shadow-md shadow-[var(--accent-shadow)]`;
export const btnDanger = `${base} border border-red-500/40 bg-red-500/10 text-red-500 hover:bg-red-500/20`;
export const iconBtn = 'p-2 rounded-xl border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--accent)] hover:border-[var(--accent)]/50 transition-all active:scale-95 cursor-pointer disabled:opacity-40 disabled:pointer-events-none';
export const input = 'w-full h-11 px-3 rounded-xl bg-[var(--bg-card-2)] border border-[var(--border)] text-[var(--text-main)] text-sm placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] transition';
export const row = 'px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--bg-card-2)]';
// Interruttore a due o più scelte (un solo pulsante acceso)
export const segment = (on) => `flex-1 py-2.5 rounded-lg text-[11px] font-black uppercase tracking-widest transition-all cursor-pointer ${on ? 'bg-[var(--accent)] text-white shadow' : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'}`;
export const segmentBox = 'flex gap-1 p-1 rounded-xl bg-[var(--bg-card-2)] border border-[var(--border)]';
