// Pianta della sala: regole geometriche, sul server come unica fonte di verità (il client ha un suo controllo
// solo per colorare i tavoli in errore). Posizioni e misure sono in celle della griglia della sala.

export const isPlaced = (t) => t.x != null;

// Primo problema trovato nella pianta, o null se è valida. `tables` sono tutti i tavoli della sala (anche quelli
// già salvati): ogni tavolo piazzato sta dentro la griglia e non ne copre un altro.
export function findLayoutProblem({ gridW, gridH, tables }) {
  const placed = tables.filter(isPlaced);
  for (const t of placed) {
    if (t.x + t.w > gridW || t.y + t.h > gridH)
      return `Il tavolo "${t.name}" esce dalla sala`;
  }
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      const a = placed[i], b = placed[j];
      if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h)
        return `I tavoli "${a.name}" e "${b.name}" si sovrappongono`;
    }
  }
  return null;
}
