import { useState } from 'react';
import { X } from 'lucide-react';
import { formatEuro } from './checkMath';
import { toggleOption, isComplete, missingGroups, extraOf, toLineModifiers, groupHint, countIn } from './modifierRules';
import { btnPrimary, iconBtn } from './ui';

// Le opzioni di un piatto (cottura, aggiunte, senza…), scelte prima di metterlo in comanda. Occupa l'area di lavoro,
// come la carta: niente finestre sopra le finestre. «Aggiungi» si accende solo con i minimi rispettati.
const ModifierPicker = ({ product, groups, onAdd, onCancel }) => {
  const [selected, setSelected] = useState([]);
  const complete = isComplete(selected, groups);
  const missing = missingGroups(selected, groups);
  const total = Number(product.price) + extraOf(selected, groups);

  return (
    <div className="h-full flex flex-col">
      <header className="flex items-start gap-3 pb-3 shrink-0">
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-semibold tracking-tight text-[var(--text-main)] truncate">{product.name}</h2>
          <p className="text-sm text-[var(--text-muted)]">{formatEuro(product.price)}</p>
        </div>
        <button className={iconBtn} aria-label="Annulla" onClick={onCancel}><X size={20} /></button>
      </header>

      <div className="flex-1 overflow-y-auto no-scrollbar space-y-5 pr-1">
        {groups.map(group => (
          <section key={group.id}>
            <div className="flex items-baseline justify-between gap-2 mb-2">
              <h3 className="text-sm font-semibold text-[var(--text-main)]">{group.name}</h3>
              <span className={`text-xs ${missing.includes(group) ? 'text-amber-500' : 'text-[var(--text-muted)]'}`}>{groupHint(group)}{group.max_select !== 1 && countIn(selected, group) > 0 ? ` · ${countIn(selected, group)}` : ''}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {group.options.map(option => {
                const on = selected.includes(option.id);
                return (
                  <button key={option.id} aria-pressed={on} onClick={() => setSelected(s => toggleOption(s, group, option.id))}
                    className={`min-h-12 px-3 py-2 rounded-lg border text-left text-sm transition cursor-pointer active:scale-[0.98] ${on ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--text-main)]' : 'border-[var(--border)] bg-[var(--bg-card-2)] text-[var(--text-main)] hover:border-[var(--border-hover)]'}`}>
                    <span className="block font-medium">{option.name}</span>
                    {option.price_delta !== 0 && <span className="text-xs text-[var(--text-muted)] tabular-nums">{option.price_delta > 0 ? '+' : '−'} {formatEuro(Math.abs(option.price_delta))}</span>}
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <footer className="pt-3 shrink-0">
        <button className={`${btnPrimary} w-full !h-12`} disabled={!complete}
          onClick={() => onAdd(toLineModifiers(selected, groups))}>
          {complete ? `Aggiungi · ${formatEuro(total)}` : `Scegli: ${missing.map(g => g.name).join(', ')}`}
        </button>
      </footer>
    </div>
  );
};

export default ModifierPicker;
