import { getDriver, parseAddress } from './print.js';
import { renderCheckReceipt } from './templates.js';

// Parte pura della stampa della ricevuta di un conto: quale stampante e come si costruisce il lavoro.

// Impostazione di stampa da usare: la copia "Cliente" se ha una stampante, altrimenti la prima attiva con indirizzo.
export function pickReceiptPrinter(settings) {
  const usable = settings.filter(s => s.enabled !== false && s.printer_address);
  return usable.find(s => s.copy_type === 'Cliente') ?? usable[0] ?? null;
}

// Il lavoro di stampa, pronto per la coda (le immagini arrivano dal contesto, quindi si collauda senza browser).
export async function buildReceiptJob(config, receipt, images) {
  const setting = pickReceiptPrinter(config.settings);
  if (!setting) return null;
  const driver = getDriver(setting.driver || 'epos');
  const builder = driver.createBuilder();
  await renderCheckReceipt(builder, receipt, { branding: config.branding, images, showLogo: true });
  const { host, port } = parseAddress(setting.printer_address);
  return { key: `${driver.id}:${host}:${port}`, driver, host, port, builder, copies: ['Ricevuta conto'] };
}
