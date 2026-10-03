import { z } from 'zod';

export const copyTypeSchema = z.object({
  name: z.string().trim().min(1).max(50),
  label: z.string().trim().min(1).max(100),
});

export const reorderSchema = z.object({
  order: z.array(z.number().int().positive()),
});

// Indirizzo di una stampante di rete: IPv4, "localhost" o nome host con almeno un punto (es. epson.local),
// con porta facoltativa. Un nome senza punto ("stampante") è escluso: quasi sempre è un errore di battitura.
const LABEL = '[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?';
const ADDRESS_RE = new RegExp(`^(((\\d{1,3}\\.){3}\\d{1,3})|localhost|(${LABEL}(\\.${LABEL})+))(:(\\d{1,5}))?$`);

export function isValidPrinterAddress(address) {
  const match = ADDRESS_RE.exec(address);
  if (!match) return false;
  const port = match[match.length - 1];
  if (port !== undefined && !(Number(port) >= 1 && Number(port) <= 65535)) return false;
  // Un nome host (non IP) deve finire con una parte che contiene una lettera, come ogni dominio reale:
  // così "localhost.9443" (punto al posto dei due punti) o un IP incompleto non passano per nomi.
  const host = address.replace(/:\d+$/, '');
  const isIp = /^(\d{1,3}\.){3}\d{1,3}$/.test(host);
  return isIp || host === 'localhost' || /[A-Za-z]/.test(host.split('.').pop());
}

// Stampante di rete: indirizzo con porta facoltativa (es. 192.168.1.100, 192.168.1.100:443, localhost:9443); vuoto = non configurata.
export const printSettingSchema = z.object({
  printer_type: z.enum(['network', 'usb']),
  printer_address: z.string().trim().max(100).nullish().transform(a => a || null),
  enabled: z.boolean(),
}).refine(
  s => s.printer_type !== 'network' || !s.printer_address || isValidPrinterAddress(s.printer_address),
  { message: 'Indirizzo di rete non valido. Esempi: 192.168.1.100, epson.local, localhost:9443', path: ['printer_address'] }
);
