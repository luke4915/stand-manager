import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isValidPrinterAddress } from '../schemas/printSettingsSchema.js';

test('indirizzi validi: IP, localhost e nomi host, con o senza porta', () => {
  for (const a of ['192.168.1.100', '192.168.1.100:443', 'localhost', 'localhost:9443', 'epson.local', 'epson-1.lan.local:8443']) {
    assert.equal(isValidPrinterAddress(a), true, a);
  }
});

test('indirizzi non validi', () => {
  for (const a of ['stampante', 'localhost.9443', 'localhost:', 'localhost:0', 'localhost:70000', '192.168.1.100:', 'http://192.168.1.100',
    '.local', 'epson..local', '-epson.local', 'ep son.local', '192.168.1.100:44a']) {
    assert.equal(isValidPrinterAddress(a), false, a);
  }
});
