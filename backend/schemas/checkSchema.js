import { z } from 'zod';
import { idSchema } from './common.js';
import { VALID_TYPES, VALID_DISCOUNT_MODES } from '../utils/pricing.js';

export const openCheckSchema = z.object({
  table_id: idSchema,
  covers: z.number().int().min(0).max(99).default(0),
});

export const listChecksQuerySchema = z.object({
  status: z.enum(['open', 'paid', 'void']).default('open'),
  table_id: idSchema.optional(),
});

// requested: true la chiede, false la annulla (tocco sbagliato)
export const billRequestSchema = z.object({
  requested: z.boolean().default(true),
});

// Importo in euro con al massimo due decimali.
const money = z.number().positive().max(100000).refine(v => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, { message: 'al massimo due decimali' });

// Pagamento: a importo (`amount`: alla romana, acconto) oppure per voce (`items`: conti separati), mai entrambi.
// Per le voci l'importo lo calcola il server. `tendered` (contanti consegnati) serve solo a dare il resto.
export const paymentSchema = z.object({
  method: z.enum(['cash', 'card', 'other']),
  amount: money.optional(),
  items: z.array(z.object({ order_item_id: idSchema, quantity: z.number().int().positive().max(999) })).min(1).max(200).optional(),
  tendered: money.optional(),
}).refine(v => (v.amount === undefined) !== (v.items === undefined), { message: 'Indica o un importo o le voci da pagare' })
  .refine(v => !v.items || new Set(v.items.map(i => i.order_item_id)).size === v.items.length, { message: 'Voce ripetuta', path: ['items'] })
  .refine(v => v.tendered === undefined || v.method === 'cash', { message: 'Il resto vale solo per i contanti', path: ['tendered'] });

// Omaggio o sconto su delle voci del conto (abbuono). `type: 'sale'` toglie lo sconto.
export const adjustSchema = z.object({
  order_item_ids: z.array(idSchema).min(1).max(500),
  type: z.enum(VALID_TYPES),
  discountMode: z.enum(VALID_DISCOUNT_MODES).optional(),
  discountValue: z.number().nonnegative().max(100000).optional(),
}).refine(v => new Set(v.order_item_ids).size === v.order_item_ids.length, { message: 'Voce ripetuta', path: ['order_item_ids'] })
  .refine(v => v.type !== 'discount' || (v.discountMode !== undefined && v.discountValue !== undefined), { message: 'Indica tipo e valore dello sconto', path: ['discountValue'] });

// Annulla il conto. Con `cancel_orders` annulla anche le sue comande (solo admin).
export const voidCheckSchema = z.object({
  cancel_orders: z.boolean().default(false),
});

export const receiptQuerySchema = z.object({
  payment_id: idSchema.optional(),
});

// Sposta il conto su un altro tavolo libero.
export const moveCheckSchema = z.object({
  table_id: idSchema,
});

// Unisce questo conto in un altro conto aperto (`into`): comande, pagamenti e coperti confluiscono lì.
export const mergeCheckSchema = z.object({
  into: idSchema,
});
