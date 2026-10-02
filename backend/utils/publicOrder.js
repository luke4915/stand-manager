// Vista "pubblica" di un ordine per il KDS senza login (REST e WebSocket):
// solo ciò che serve alla cucina. Niente prezzi, totali, sconti o created_by.
export function toPublicOrder(order) {
  const items = Array.isArray(order.items) ? order.items : [];
  return {
    id: order.id,
    display_code: order.display_code,
    status: order.status,
    is_takeaway: !!order.is_takeaway,
    created_at: order.created_at,
    items: items.map(i => ({
      id: i.id,
      name: i.name,
      quantity: i.quantity,
      note: i.note || '',
      category: i.category ?? null,
    })),
  };
}
