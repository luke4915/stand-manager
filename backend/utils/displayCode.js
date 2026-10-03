// Codice ordine mostrato a clienti e cucina: blocchi da 100 per lettera.
// 1 → A1, 100 → A100, 101 → B1, … dopo Z100 si riparte da A1.
// `position` è il progressivo dell'ordine nella sessione (sessions.order_counter).
export function formatDisplayCode(position) {
  const index = position - 1;
  const letter = String.fromCharCode(65 + (Math.floor(index / 100) % 26));
  return `${letter}${(index % 100) + 1}`;
}

// Codice di un ordine battuto da una cassa: la lettera del dispositivo e il suo progressivo
// nella sessione (A1, A2, … B1, …). Lo stesso formato è composto dal client per stampare offline.
export function formatDeviceCode(letter, seq) {
  return `${letter}${seq}`;
}
