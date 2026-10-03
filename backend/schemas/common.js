import { z } from 'zod';

// Messaggi di errore di zod in italiano per tutto il backend.
z.config(z.locales.it());

// Id numerico nei parametri di percorso (es. /orders/:id).
export const idSchema = z.coerce.number().int().positive();
export const idParamsSchema = z.object({ id: idSchema });
