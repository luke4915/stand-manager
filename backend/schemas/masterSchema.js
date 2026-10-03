import { z } from 'zod';

export const masterLoginSchema = z.object({
  password: z.string().min(1),
});

export const createTenantSchema = z.object({
  slug: z.string().trim().regex(/^[a-z0-9-]+$/, 'solo lettere minuscole, numeri e trattini').max(50),
  name: z.string().trim().min(1).max(100),
  plan: z.string().trim().min(1).max(30).default('trial'),
  expiresInDays: z.coerce.number().int().positive().max(3650).nullish(),
  adminUsername: z.string().trim().min(1).max(50),
});

export const extendLicenseSchema = z.object({
  days: z.coerce.number().int().positive().max(3650),
});

export const tenantActiveSchema = z.object({
  active: z.boolean(),
});

export const deleteTenantSchema = z.object({
  confirmSlug: z.string().min(1),
});
