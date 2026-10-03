// Stampante Epson simulata, per provare la stampa senza hardware.
//
//   node scripts/mock-epos.js [--port 9443] [--fail EPTR_COVER_OPEN]
//
// Espone https://localhost:<porta>/cgi-bin/epos/service.cgi come una TM con ePOS-Print:
// certificato mkcert (o autofirmato, da accettare come con la stampante vera), CORS attivo,
// risposta <response success="true"/> e lo scontrino disegnato in testo nel terminale.
// In app, come indirizzo della stampante usa  localhost:9443  (o l'IP del Mac dagli altri dispositivi).
import https from 'node:https';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const WIDTH = 42; // caratteri per riga, come la TM-T20 a 80 mm con font A

const decode = (s) => s.replace(/&#10;/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const attr = (tag, name) => tag.match(new RegExp(`${name}="([^"]*)"`))?.[1];

// Disegna l'XML ePOS come uno scontrino di testo: allineamento, ingrandimenti in larghezza,
// banda inversa, immagini e QR (questi ultimi indicati con un segnaposto).
export function renderReceipt(xml) {
  const lines = [];
  const edge = `+${'-'.repeat(WIDTH)}+`;
  const row = (text) => lines.push(`|${text.padEnd(WIDTH).slice(0, WIDTH)}|`);

  for (const [, name, attrs, body = ''] of xml.matchAll(/<(text|feed|cut|image|barcode)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/\1>)/g)) {
    if (name === 'text') {
      const content = decode(body);
      if (!content) continue; // <text align="center"/> da solo: cambia solo l'allineamento
      const width = Number(attr(attrs, 'width') || 1);
      const shown = attr(attrs, 'reverse') === 'true' ? `▌${content}▐` : content;
      const spaced = width > 1 ? [...shown].join(' '.repeat(width - 1)) : shown;
      const align = attr(attrs, 'align');
      const pad = align === 'center' ? Math.floor((WIDTH - spaced.length) / 2) : align === 'right' ? WIDTH - spaced.length : 0;
      row(' '.repeat(Math.max(0, pad)) + spaced);
      if (Number(attr(attrs, 'height') || 1) > 1) row('');
    } else if (name === 'feed') {
      for (let i = 0; i < Number(attr(attrs, 'line') || 1); i++) row('');
    } else if (name === 'image') {
      row(`   [immagine ${attr(attrs, 'width')}x${attr(attrs, 'height')}px]`);
    } else if (name === 'barcode') {
      row(`   [${attr(attrs, 'type')}: ${decode(body)}]`);
    } else if (name === 'cut') {
      lines.push(`${'- '.repeat(WIDTH / 2 + 1)}✂ taglio`);
    }
  }
  return [edge, ...lines, edge].join('\n');
}

// Certificato della stampante finta. Con mkcert (già usato per il frontend) il browser si fida senza
// avvisi; altrimenti ne crea uno autofirmato, che va accettato una volta dal browser.
function serverCert() {
  const dir = mkdtempSync(join(tmpdir(), 'mock-epos-'));
  const key = join(dir, 'key.pem');
  const cert = join(dir, 'cert.pem');
  try {
    execFileSync('mkcert', ['-key-file', key, '-cert-file', cert, 'localhost', '127.0.0.1', '::1'], { stdio: 'ignore' });
    return { key: readFileSync(key), cert: readFileSync(cert), trusted: true };
  } catch { /* mkcert non installato: ripiego su OpenSSL */ }
  // Safari e i browser più severi richiedono SAN, keyUsage ed extendedKeyUsage=serverAuth
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '30', '-subj', '/CN=localhost',
    '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1,IP:::1',
    '-addext', 'basicConstraints=critical,CA:FALSE',
    '-addext', 'keyUsage=critical,digitalSignature,keyEncipherment',
    '-addext', 'extendedKeyUsage=serverAuth',
    '-keyout', key, '-out', cert], { stdio: 'ignore' });
  return { key: readFileSync(key), cert: readFileSync(cert), trusted: false };
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, If-Modified-Since',
};

// Avvia la stampante finta. `printer.failWith` (es. 'EPTR_COVER_OPEN') la fa rifiutare i lavori,
// `printer.jobs` raccoglie quelli ricevuti, `onJob` li segnala (il terminale li disegna).
export function startMockEpos({ port = 0, failWith = null, onJob } = {}) {
  const printer = { failWith, jobs: [], server: null, port: null, close: () => new Promise(r => printer.server.close(r)) };
  const { trusted, ...tls } = serverCert();
  printer.trusted = trusted;
  printer.server = https.createServer(tls, (req, res) => {
    if (req.method === 'OPTIONS') return res.writeHead(204, CORS).end();
    // Come la pagina web della stampante vera: serve a vedere nel browser che il certificato è accettato
    if (req.method === 'GET' && req.url === '/') {
      return res.writeHead(200, { ...CORS, 'Content-Type': 'text/html; charset=utf-8' })
        .end('<!doctype html><meta charset="utf-8"><title>Stampante simulata</title><body style="font:18px system-ui;padding:2rem"><h1>Stampante Epson simulata</h1><p>Attiva. Puoi tornare all\'app e premere "Stampa di prova".</p>');
    }
    if (req.method !== 'POST' || !req.url.startsWith('/cgi-bin/epos/service.cgi')) return res.writeHead(404, CORS).end();
    let xml = '';
    req.on('data', (c) => { xml += c; });
    req.on('end', () => {
      const ok = !printer.failWith;
      if (ok) {
        const job = { xml, receipt: renderReceipt(xml), receivedAt: new Date() };
        printer.jobs.push(job);
        onJob?.(job);
      }
      res.writeHead(200, { ...CORS, 'Content-Type': 'text/xml; charset=utf-8' });
      res.end(`<?xml version="1.0" encoding="utf-8"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body>` +
        `<response success="${ok}" code="${ok ? '' : printer.failWith}" status="0" battery="0" xmlns="http://www.epson-pos.com/schemas/2011/03/epos-print"/></s:Body></s:Envelope>`);
    });
  });
  return new Promise((resolve) => printer.server.listen(port, () => { printer.port = printer.server.address().port; resolve(printer); }));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const arg = (name) => { const i = process.argv.indexOf(`--${name}`); return i > -1 ? process.argv[i + 1] : null; };
  const printer = await startMockEpos({
    port: Number(arg('port') ?? 9443),
    failWith: arg('fail'),
    onJob: (job) => console.log(`\n── lavoro ricevuto alle ${job.receivedAt.toLocaleTimeString('it-IT')} ──\n${job.receipt}`),
  });
  console.log(`Stampante Epson simulata su https://localhost:${printer.port}  ${printer.failWith ? `(rifiuta con ${printer.failWith})` : ''}`);
  console.log(printer.trusted
    ? `Certificato mkcert: il browser lo accetta da solo. In app usa come indirizzo  localhost:${printer.port}`
    : `Certificato autofirmato: apri https://localhost:${printer.port} nel browser e accetta l'avviso una volta. In app usa  localhost:${printer.port}`);
}
