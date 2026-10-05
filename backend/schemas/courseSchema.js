import { z } from 'zod';
import { idSchema } from './common.js';
import { orderItemSchema } from './orderSchema.js';

const name = z.string().trim().min(1).max(40);

export const createCourseSchema = z.object({ name });

export const updateCourseSchema = z.object({
  name: name.optional(),
  active: z.boolean().optional(),
}).refine(v => v.name !== undefined || v.active !== undefined, { message: 'Niente da modificare' });

// Nuovo ordine delle portate del locale: tutti gli id, nell'ordine voluto.
export const reorderCoursesSchema = z.object({
  ids: z.array(idSchema).min(1).max(50),
}).refine(v => new Set(v.ids).size === v.ids.length, { message: 'Portata ripetuta', path: ['ids'] });

// Il giro di un tavolo: una voce per portata, con l'ordine di uscita (`seq`, da 1; lo stesso numero = escono insieme).
// `course_id` nullo = piatti senza portata (bevande, pane…). L'importo non si manda mai: lo calcola il server.
export const courseOrdersSchema = z.object({
  groups: z.array(z.object({
    course_id: idSchema.nullable().default(null),
    // Chiave di idempotenza della comanda di questa portata: se la risposta si perde e il giro si reinvia, non si duplica.
    client_order_id: z.uuid().optional(),
    seq: z.number().int().min(1).max(50),
    items: z.array(orderItemSchema).min(1, 'Portata vuota').max(100),
  })).min(1).max(20).refine(gs => { const ids = gs.map(g => g.client_order_id).filter(Boolean); return new Set(ids).size === ids.length; }, { message: 'Chiave ripetuta' }),
  // Se il primo gruppo esce subito (di solito sì) o tutto resta da mandare.
  fire_first: z.boolean().default(true),
});

// `seq` assente = la prossima portata da mandare.
export const fireCoursesSchema = z.object({
  seq: z.number().int().min(1).max(1000).optional(),
});

export const resequenceSchema = z.object({
  orders: z.array(z.object({ id: idSchema, seq: z.number().int().min(1).max(1000) })).min(1).max(100),
}).refine(v => new Set(v.orders.map(o => o.id)).size === v.orders.length, { message: 'Comanda ripetuta', path: ['orders'] });
