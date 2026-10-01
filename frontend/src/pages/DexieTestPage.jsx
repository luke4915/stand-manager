import { useState } from 'react';
import { db } from '../offline/db';

export default function DexieTestPage() {
  const [log, setLog] = useState([]);
  const add = (msg) => setLog(prev => [...prev, msg]);

  const runTest = async () => {
    setLog([]);
    const id = await db.pendingOrders.add({ payload: { test: true }, status: 'pending', createdAt: Date.now() });
    add(`Scritto ordine test, id locale: ${id}`);

    const rows = await db.pendingOrders.toArray();
    add(`Righe in pendingOrders: ${rows.length}`);

    await db.pendingOrders.delete(id);
    add('Riga cancellata, test completato ✅');
  };

  return (
    <div style={{ padding: 20, fontFamily: 'monospace' }}>
      <button onClick={runTest}>Testa Dexie</button>
      <pre>{log.join('\n')}</pre>
    </div>
  );
}