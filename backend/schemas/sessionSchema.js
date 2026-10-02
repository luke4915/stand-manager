import { z } from 'zod';

export const startSessionSchema = z.object({
    name: z.string().trim().min(1, 'Nome obbligatorio').max(100),
});

// Contanti dichiarati alla chiusura: facoltativi (null = conteggio non fatto).
export const endSessionSchema = z.object({
    declaredCash: z.number().nonnegative().nullable().optional(),
});
