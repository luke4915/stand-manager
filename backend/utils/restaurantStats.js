// Statistiche del ristorante (SmartEats): dal risultato delle query di routes/stats.js ai numeri mostrati. Funzione pura,
// con test (tests/restaurantStats.test.js). Gli importi sono in euro, le durate in minuti, tutto arrotondato qui.

const round = (n, digits = 2) => (n === null || n === undefined || Number.isNaN(Number(n)) ? null : +Number(n).toFixed(digits));
const num = (v) => Number(v ?? 0);
const ratio = (a, b) => (b > 0 ? a / b : null);

// `checks`: { n, covers, tables, avg_minutes }; `revenue`: incasso totale; `byHour`: [{ hour, n, covers, revenue }];
// `courses`: [{ course, quantity, revenue }]; `products`: [{ product_id, name, quantity, revenue }];
// `kitchen`: [{ station, avg_minutes, n }]; `discounts`: { discount, gift, lines }; `payments`: [{ method, amount }].
export function buildRestaurantStats({ checks, revenue, byHour, courses, products, kitchen, discounts, payments }) {
  const total = num(revenue);
  const n = num(checks.n), covers = num(checks.covers), tables = num(checks.tables);

  const station = (name) => kitchen.find(k => k.station === name);
  const allN = kitchen.reduce((s, k) => s + num(k.n), 0);
  const allMinutes = allN ? kitchen.reduce((s, k) => s + num(k.avg_minutes) * num(k.n), 0) / allN : null;

  const bigProducts = products.map(p => ({ id: p.product_id === null ? null : Number(p.product_id), name: p.name, quantity: num(p.quantity), revenue: round(num(p.revenue)) }))
    .sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue || a.name.localeCompare(b.name));

  return {
    totals: {
      revenue: round(total),
      checks: n,
      covers,
      avgCheck: round(ratio(total, n)),
      avgPerCover: round(ratio(total, covers)),
      avgDurationMinutes: round(checks.avg_minutes, 0),
      tablesUsed: tables,
      rotation: round(ratio(n, tables), 1),
    },
    byHour: [...byHour].map(h => ({ hour: num(h.hour), checks: num(h.n), covers: num(h.covers), revenue: round(num(h.revenue)) })).sort((a, b) => a.hour - b.hour),
    courses: courses.map(c => ({ course: c.course, quantity: num(c.quantity), revenue: round(num(c.revenue)) })).sort((a, b) => b.revenue - a.revenue),
    topProducts: bigProducts.slice(0, 10),
    kitchen: {
      avgMinutes: round(allMinutes, 0),
      kitchen: station('kitchen') ? round(num(station('kitchen').avg_minutes), 0) : null,
      bar: station('bar') ? round(num(station('bar').avg_minutes), 0) : null,
      dishes: allN,
    },
    discounts: { discount: round(num(discounts.discount)), gift: round(num(discounts.gift)), lines: num(discounts.lines) },
    payments: payments.map(p => ({ method: p.method, amount: round(num(p.amount)) })).sort((a, b) => b.amount - a.amount),
  };
}
