import { z } from 'zod';
import { idSchema } from './common.js';

const name = z.string().trim().min(1).max(40);
const money = z.number().min(-1000).max(1000).refine(v => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, { message: 'al massimo due decimali' });

// Un gruppo con le sue opzioni (tutte insieme: in modifica sostituiscono quelle di prima). `max_select` nullo = nessun limite.
export const modifierGroupSchema = z.object({
  name,
  min_select: z.number().int().min(0).max(20).default(0),
  max_select: z.number().int().min(1).max(20).nullable().default(null),
  options: z.array(z.object({ name, price_delta: money.default(0) })).min(1, 'Serve almeno un\'opzione').max(40),
}).refine(g => g.max_select === null || g.max_select >= g.min_select, { message: 'Il massimo non può essere minore del minimo', path: ['max_select'] })
  .refine(g => g.min_select <= g.options.length, { message: 'Il minimo supera le opzioni disponibili', path: ['min_select'] })
  .refine(g => new Set(g.options.map(o => o.name.toLowerCase())).size === g.options.length, { message: 'Opzione ripetuta', path: ['options'] });

export const productModifierGroupsSchema = z.object({
  group_ids: z.array(idSchema).max(20),
}).refine(v => new Set(v.group_ids).size === v.group_ids.length, { message: 'Gruppo ripetuto', path: ['group_ids'] });
