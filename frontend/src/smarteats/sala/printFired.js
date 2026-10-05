import { printOrderTickets } from '../../print/printOrder';

// Stampa dal dispositivo le comande appena mandate in cucina (una per portata), come alla cassa. `orders` sono le
// comande della risposta del server, `fired` gli id di quelle mandate. Un errore di stampa non annulla nulla.
export async function printFired(orders, fired, detail, service, showToast) {
  for (const order of orders.filter(o => fired.includes(o.id))) {
    printOrderTickets({
      cart: order.items.map(i => ({ ...i, type: 'sale', discountMode: null, discountValue: null })),
      displayCode: order.display_code, clientOrderId: order.client_order_id ?? `fire-${order.id}`, sessionId: service.id, isTakeaway: false,
      table: { name: detail.table_name, covers: detail.covers }, courseName: order.course_name,
    }).catch(err => showToast(`Errore di stampa: ${err.message}`, 'error'));
  }
}
