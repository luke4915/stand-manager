// Scelta del tipo di attività e dei moduli di un tenant. Il tipo si sceglie solo alla creazione e poi è fisso:
// sagra e ristorante sono due prodotti diversi, quindi ogni tipo mostra solo i moduli che esistono per lui.
// Il tipo propone i moduli (preset), poi si possono accendere o spegnere. Il catalogo arriva dal server (GET /master/catalog).
const labelClass = 'block text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] mb-1.5';
const selectClass = 'w-full p-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border)] text-[var(--text-main)] text-sm focus:ring-2 focus:ring-[var(--accent)] outline-none';

const ModulePicker = ({ catalog, value, onChange, typeLocked = false }) => {
  const { businessType, modules } = value;
  const preset = catalog.businessTypes.find(b => b.id === businessType)?.modules ?? [];
  const isPreset = modules.length === preset.length && preset.every(m => modules.includes(m));

  const available = catalog.modules.filter(m => m.types.includes(businessType));
  const typeLabel = catalog.businessTypes.find(b => b.id === businessType)?.label ?? businessType;

  const toggle = (id) => onChange({ businessType, modules: modules.includes(id) ? modules.filter(m => m !== id) : [...modules, id] });

  return (
    <div className="space-y-3">
      {typeLocked ? (
        <div>
          <span className={labelClass}>Tipo di attività</span>
          <p className="text-sm font-bold text-[var(--text-main)]">{typeLabel} <span className="font-normal text-[var(--text-muted)]">· fisso dopo la creazione</span></p>
        </div>
      ) : (
      <label className="block">
        <span className={labelClass}>Tipo di attività</span>
        <select className={selectClass} value={businessType}
          onChange={e => onChange({ businessType: e.target.value, modules: catalog.businessTypes.find(b => b.id === e.target.value).modules })}>
          {catalog.businessTypes.map(b => <option key={b.id} value={b.id}>{b.label}</option>)}
        </select>
      </label>
      )}
      <fieldset>
        <legend className={labelClass}>Moduli attivi {!isPreset && <span className="font-normal normal-case">(personalizzati)</span>}</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {available.map(m => (
            <label key={m.id} className="flex items-center gap-2 p-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-card-2)] text-sm text-[var(--text-main)] cursor-pointer">
              <input type="checkbox" className="accent-[var(--accent)]" checked={modules.includes(m.id)} onChange={() => toggle(m.id)} />
              {m.label}
            </label>
          ))}
        </div>
        <p className="text-[11px] text-[var(--text-muted)] mt-2">Cassa, ordini, utenti, prodotti e stampa ci sono sempre.</p>
      </fieldset>
    </div>
  );
};

export default ModulePicker;
