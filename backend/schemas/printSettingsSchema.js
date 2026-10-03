import { z } from 'zod';

export const copyTypeSchema = z.object({
  name: z.string().trim().min(1).max(50),
  label: z.string().trim().min(1).max(100),
});

export const reorderSchema = z.object({
  order: z.array(z.number().int().positive()),
});

// Stampante di rete: indirizzo IP:porta (es. 192.168.1.100:9100); vuoto = non configurata.
export const printSettingSchema = z.object({
  printer_type: z.enum(['network', 'usb']),
  printer_address: z.string().trim().max(100).nullish().transform(a => a || null),
  enabled: z.boolean(),
}).refine(
  s => s.printer_type !== 'network' || !s.printer_address || /^(\d{1,3}\.){3}\d{1,3}:\d{2,5}$/.test(s.printer_address),
  { message: 'Indirizzo di rete non valido. Formato atteso: 192.168.1.100:9100', path: ['printer_address'] }
);
