import { parseAddress, getDriver } from './print.js';
import { PrintError } from './drivers/epos.js';

// Indirizzo da aprire nel browser per accettare il certificato della stampante (una volta per dispositivo).
export function printerPageUrl(address) {
  const { host, port } = parseAddress(address);
  return `https://${host}:${port}/`;
}

// Stampa di prova diretta, senza coda: serve a verificare rete, certificato e stampante.
// Ritorna null se è andata bene, altrimenti il messaggio per l'operatore.
export async function testPrint(address) {
  const driver = getDriver('epos');
  const builder = driver.createBuilder()
    .align('CT').size(2, 2).style('B').text('PROVA DI STAMPA').size(1, 1).style('NORMAL')
    .text(new Date().toLocaleString('it-IT'))
    .text('Stand Manager')
    .feed(2)
    .cut();
  try {
    await driver.send(builder, parseAddress(address));
    return null;
  } catch (err) {
    return err instanceof PrintError ? err.message : `Errore imprevisto: ${err.message}`;
  }
}
