import { z } from 'zod';

// La vecchia password serve solo se l'utente ne ha già una (primo accesso: nessuna).
export const changePasswordSchema = z.object({
    oldPassword: z.string().max(200).optional(),
    newPassword: z.string().min(6, 'Password troppo corta (min 6 caratteri)').max(200),
});
