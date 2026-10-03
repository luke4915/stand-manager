import { z } from 'zod';
import { VALID_TYPES, VALID_DISCOUNT_MODES } from '../utils/pricing.js';

// Una riga carrello così come arriva dal client.
// NB: id/quantity sono l'unica cosa "di fiducia" qui — prezzo, sconto,
// permessi ecc. vengono ricalcolati e riautorizzati server-side in
// orders.js (vedi sanitizeAdjustment in pricing.js). Questo schema valida
// solo la FORMA della richiesta, non decide se lo sconto è ammesso.
export const orderItemSchema = z.object({
    id: z.coerce.number().int().positive(),
    name: z.string().min(1).max(200),
    quantity: z.number().int().positive().max(999),
    price: z.number().nonnegative().optional(), // non usato per il calcolo, solo compatibilità payload
    note: z.string().max(300).optional().default(''),
    category: z.string().max(100).optional().nullable(),
    print_destination: z.enum(['bar', 'kitchen', 'both']).optional(),
    type: z.enum(VALID_TYPES).optional().default('sale'),
    discountMode: z.enum(VALID_DISCOUNT_MODES).optional().nullable(),
    discountValue: z.number().optional().nullable(),
});

export const createOrderSchema = z.object({
    items: z.array(orderItemSchema).min(1, 'Ordine vuoto o malformato'),
    status: z.enum(['pending', 'completed']).optional(),
    is_takeaway: z.boolean().optional().default(false),
    // Chiave di idempotenza generata dalla cassa: un nuovo invio dello stesso ordine non lo duplica.
    client_order_id: z.uuid().optional(),
    // Solo per gli ordini creati offline e sincronizzati dopo: sessione e ora in cui sono stati battuti.
    session_id: z.number().int().positive().optional(),
    client_created_at: z.iso.datetime().optional(),
    // Dispositivo (cassa) e numero progressivo che ha dato all'ordine: il codice è lettera + numero.
    device_id: z.number().int().positive().optional(),
    device_seq: z.number().int().positive().max(99999).optional(),
}).refine(
    (o) => (o.device_id === undefined) === (o.device_seq === undefined),
    { message: 'device_id e device_seq vanno inviati insieme' }
).refine(
    (o) => (o.session_id === undefined) === (o.client_created_at === undefined),
    { message: 'session_id e client_created_at vanno inviati insieme' }
);
export const ORDER_STATUSES = ['pending', 'preparing', 'completed', 'canceled'];

export const updateOrderStatusSchema = z.object({
    status: z.enum(ORDER_STATUSES),
});
