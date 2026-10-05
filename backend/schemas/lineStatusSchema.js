import { z } from 'zod';
import { idSchema } from './common.js';

// Stato di righe di una comanda: tutte, quelle di una postazione (`station`) o alcune (`line_ids`, id in order_items).
export const lineStatusSchema = z.object({
  status: z.enum(['new', 'preparing', 'ready', 'served']),
  station: z.enum(['kitchen', 'bar']).optional(),
  line_ids: z.array(idSchema).min(1).max(200).optional(),
});
