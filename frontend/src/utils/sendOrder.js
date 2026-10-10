import { enqueueOrder } from '../offline/syncQueue';
import { nextOrderNumber } from '../offline/device';
import { printOrderTickets } from '../print/printOrder';
import { fetchWithAuth, NetworkError } from './apiClient';

// Invio di un ordine dalla cassa. In ordine:
// 1. la cassa dà il numero all'ordine (A13), anche senza rete;
// 2. lo manda al server; se la rete non c'è lo mette in coda locale (verrà inviato al ritorno);
// 3. stampa le comande dalla cassa, solo dopo che il server l'ha accettato o messo in coda;
// 4. svuota il carrello e chiama `onSent`.
export async function sendOrder({ cart, isTakeaway = false, activeSession, orderMode, clearCart, playSound, showToast, onSent }) {
  if (!activeSession) return showToast('Nessuna sessione attiva!', 'error');
  if (cart.length === 0) return showToast('Carrello vuoto!', 'error');

  // Numero ordine dato dalla cassa (anche offline): resta lo stesso a ogni nuovo invio.
  const { displayCode, ...numbering } = await nextOrderNumber(activeSession.id);
  const payload = {
    items: cart.map(i => ({
      id: i.id, name: i.name, quantity: i.quantity, price: i.price, note: i.note || '',
      print_destination: i.print_destination || 'both',
      type: i.type || 'sale',
      discountMode: i.discountMode || null,
      discountValue: i.discountValue ?? null,
    })),
    status: orderMode === 'simple' ? 'completed' : 'pending',
    is_takeaway: isTakeaway,
    // Chiave di idempotenza: se la risposta si perde e l'ordine riparte dalla coda, non si duplica.
    client_order_id: crypto.randomUUID(),
    ...numbering,
  };

  const confirmOrder = (message, type) => {
    playSound('order_confirm_sound');
    clearCart();
    showToast(message, type);
    onSent?.();
  };
  // Le copie si stampano dalla cassa (anche offline): solo dopo che l'ordine è accettato
  // dal server, oppure quando va in coda perché il server non c'è.
  const printTickets = (code) => {
    if (!code) return showToast('Stampa non disponibile: dispositivo non ancora abbinato, serve una connessione.', 'warning');
    printOrderTickets({ cart, displayCode: code, clientOrderId: payload.client_order_id, sessionId: activeSession.id, isTakeaway })
      .catch(err => showToast(`Errore di stampa: ${err.message}`, 'error'));
  };
  const queueOffline = async () => {
    await enqueueOrder(payload, activeSession.id);
    printTickets(displayCode);
    confirmOrder('Sei offline: ordine salvato, verrà inviato al ritorno della connessione', 'warning');
  };

  if (!navigator.onLine) return queueOffline();
  try {
    const saved = await fetchWithAuth('/orders', { method: 'POST', body: payload });
    // Se il dispositivo non era abbinato il codice lo ha dato il server
    printTickets(saved.displayCode ?? displayCode);
    confirmOrder('Ordine inviato!', 'success');
  } catch (err) {
    // Rete caduta durante l'invio: l'ordine va in coda con la stessa chiave, quindi
    // se il server l'aveva già ricevuto non viene duplicato.
    if (err instanceof NetworkError) return queueOffline();
    showToast(`Errore: ${err.message}`, 'error');
  }
}
