import { Minus, Plus } from 'lucide-react';
import { btn, label } from './ui';

// Scelta dei coperti con due tasti grandi (apertura del tavolo e modifica dei coperti).
const CoversStepper = ({ value, onChange }) => (
  <div className="h-full flex flex-col items-center justify-center gap-4 py-8">
    <p className={label}>Coperti</p>
    <div className="flex items-center gap-6">
      <button className={`${btn} !p-4`} aria-label="Meno coperti" disabled={value <= 0} onClick={() => onChange(Math.max(0, value - 1))}><Minus size={20} /></button>
      <span className="text-6xl font-black tabular-nums text-[var(--text-main)] w-24 text-center" aria-live="polite">{value}</span>
      <button className={`${btn} !p-4`} aria-label="Più coperti" disabled={value >= 99} onClick={() => onChange(Math.min(99, value + 1))}><Plus size={20} /></button>
    </div>
  </div>
);

export default CoversStepper;
