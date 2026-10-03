import { z } from 'zod';

// Nome facoltativo: se manca il server usa "Cassa <lettera>".
export const createDeviceSchema = z.object({
  name: z.string().trim().min(1).max(50).optional(),
});

export const updateDeviceSchema = z.object({
  name: z.string().trim().min(1).max(50),
});
