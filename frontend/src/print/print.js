// Dalle impostazioni di stampa e da un ordine ai documenti da inviare. Pura: la rete sta nei driver.
import { TEMPLATES } from './templates.js';
import { eposDriver, DEFAULT_PORT } from './drivers/epos.js';

// Per ora esiste solo Epson; altre marche si aggiungono qui con un driver che espone
// { id, createBuilder(), send(builder, target) }.
const DRIVERS = { epos: eposDriver };

// "192.168.1.100" o "192.168.1.100:443" → { host, port }
export function parseAddress(address) {
  const [host, port] = (address || '').split(':');
  return { host, port: port ? parseInt(port, 10) : DEFAULT_PORT };
}

// Una riga di print_settings → destinazione, oppure null se la copia non si può stampare
// (disabilitata, senza indirizzo o senza template).
function resolveTarget(setting) {
  if (setting.enabled === false || !setting.printer_address || !TEMPLATES[setting.copy_type]) return null;
  const driver = DRIVERS[setting.driver || 'epos'];
  if (!driver) return null;
  return { template: TEMPLATES[setting.copy_type], driver, ...parseAddress(setting.printer_address), copyType: setting.copy_type };
}

// Raggruppa le copie per stampante (una sola richiesta per stampante, come il vecchio
// printOrderBatch) e le rende. Ritorna [{ key, driver, host, port, builder, copies }].
export async function buildPrintJobs(settings, order, ctx) {
  const groups = new Map();
  for (const setting of settings) {
    const target = resolveTarget(setting);
    if (!target) continue;
    const key = `${target.driver.id}:${target.host}:${target.port}`;
    if (!groups.has(key)) groups.set(key, { key, driver: target.driver, host: target.host, port: target.port, targets: [] });
    groups.get(key).targets.push({ template: target.template, showLogo: setting.show_logo ?? true, copyType: target.copyType });
  }

  const jobs = [];
  for (const group of groups.values()) {
    const builder = group.driver.createBuilder();
    for (const t of group.targets) await t.template(builder, order, { ...ctx, showLogo: t.showLogo });
    if (builder.isEmpty) continue; // es. copia cucina di un ordine di soli prodotti bar
    jobs.push({ key: group.key, driver: group.driver, host: group.host, port: group.port, builder, copies: group.targets.map(t => t.copyType) });
  }
  return jobs;
}

export function getDriver(id) {
  const driver = DRIVERS[id];
  if (!driver) throw new Error(`Driver di stampa sconosciuto: ${id}`);
  return driver;
}
