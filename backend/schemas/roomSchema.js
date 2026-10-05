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

// Pianta della sala: misura della griglia e posizione di ogni tavolo (in celle). x, y, w, h vanno insieme:
// tutti nulli = tavolo da piazzare. Il controllo geometrico (limiti, sovrapposizioni) lo fa la route.
const cell = z.number().int().min(0).max(60);
const layoutTable = z.object({
  id: z.number().int().positive(),
  x: cell.nullable(),
  y: cell.nullable(),
  w: z.number().int().min(1).max(30).nullable(),
  h: z.number().int().min(1).max(30).nullable(),
  shape: z.enum(['rect', 'round']),
}).refine(t => [t.x, t.y, t.w, t.h].every(v => v === null) || [t.x, t.y, t.w, t.h].every(v => v !== null),
  { message: 'Posizione e misure vanno indicate insieme' });

// Muri e separatori (039): `elements` è facoltativo; se c'è sostituisce tutti quelli della sala, se manca restano.
const layoutElement = z.object({
  kind: z.enum(['wall', 'divider']),
  x: cell,
  y: cell,
  w: z.number().int().min(1).max(60),
  h: z.number().int().min(1).max(60),
});

export const roomLayoutSchema = z.object({
  grid_w: z.number().int().min(4).max(60),
  grid_h: z.number().int().min(4).max(60),
  tables: z.array(layoutTable).max(300),
  elements: z.array(layoutElement).max(300).optional(),
}).refine(v => new Set(v.tables.map(t => t.id)).size === v.tables.length, { message: 'Tavolo ripetuto', path: ['tables'] });
