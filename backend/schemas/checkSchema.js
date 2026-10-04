import { z } from 'zod';
import { idSchema } from './common.js';

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
