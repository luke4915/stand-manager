import { z } from 'zod';

const DEFAULT_COLOR = '#3b82f6';

// Prodotto a catalogo (creazione e modifica). I campi extra che il frontend invia
// insieme al prodotto (id, stock, tenant_id…) vengono ignorati.
export const productSchema = z.object({
  name: z.string().trim().min(1).max(40),
  price: z.coerce.number().nonnegative().max(100000),
  category: z.string().trim().min(1).max(50),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullish().transform(c => c || DEFAULT_COLOR),
  visible: z.boolean().default(true),
  print_destination: z.enum(['bar', 'kitchen', 'both']).default('both'),
  // Portata (modulo tavoli). Assente = non si cambia; null = nessuna portata.
  course_id: z.number().int().positive().nullable().optional(),
});

export const bulkVisibilitySchema = z.object({
  ids: z.array(z.number().int().positive()).min(1),
  visible: z.boolean(),
});

// Stock attivo → quantità obbligatoria; stock disattivo → disponibilità illimitata.
export const stockSchema = z.object({
  stock_enabled: z.boolean(),
  stock: z.number().int().nonnegative().nullable(),
}).refine(s => !s.stock_enabled || s.stock !== null, { message: 'Con lo stock attivo serve una quantità', path: ['stock'] })
  .transform(s => ({ stock_enabled: s.stock_enabled, stock: s.stock_enabled ? s.stock : null }));
