import { z } from 'zod';

const name = z.string().trim().min(1).max(50);
const seats = z.number().int().min(1).max(99);

export const createRoomSchema = z.object({ name });

// Almeno un campo da cambiare.
export const updateRoomSchema = z.object({
  name: name.optional(),
  active: z.boolean().optional(),
}).refine(v => v.name !== undefined || v.active !== undefined, { message: 'Niente da modificare' });

export const createTableSchema = z.object({
  name,
  seats: seats.default(2),
});

export const updateTableSchema = z.object({
  name: name.optional(),
  seats: seats.optional(),
  active: z.boolean().optional(),
}).refine(v => v.name !== undefined || v.seats !== undefined || v.active !== undefined, { message: 'Niente da modificare' });

// Più tavoli insieme: "T1" … "T20". Al massimo 100 per volta.
export const bulkTablesSchema = z.object({
  prefix: z.string().trim().max(20).default(''),
  from: z.number().int().min(1).max(9999),
  to: z.number().int().min(1).max(9999),
  seats: seats.default(2),
}).refine(v => v.to >= v.from, { message: 'Il numero finale deve essere maggiore o uguale a quello iniziale', path: ['to'] })
  .refine(v => v.to - v.from < 100, { message: 'Al massimo 100 tavoli per volta', path: ['to'] });
