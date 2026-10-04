import { Dices, Copy } from 'lucide-react';
import { useToast } from '../../context/useToast';
import { generateTempPassword } from '../../utils/tempPassword';

// Campo per la password temporanea: si scrive a mano o si genera (leggibile, senza caratteri ambigui) e si copia
// per passarla all'utente. È sempre in chiaro perché chi la imposta deve poterla comunicare.
const TempPasswordField = ({ value, onChange, className = '', autoFocus = false, placeholder = 'Password temporanea (min 8)' }) => {
  const { showToast } = useToast();

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      showToast('Password copiata', 'success');
    } catch {
      showToast('Copia non riuscita: selezionala e copiala a mano', 'warning');
    }
  };

  const small = 'p-2.5 rounded-xl border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--accent)] hover:bg-[var(--bg-card)] disabled:opacity-40 transition-colors';
  return (
    <div className="flex gap-1.5">
      <input className={`${className} min-w-0 flex-1 font-mono`} type="text" autoComplete="off" spellCheck={false} autoFocus={autoFocus}
        placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)} />
      <button type="button" className={small} title="Genera una password" aria-label="Genera una password" onClick={() => onChange(generateTempPassword())}><Dices size={16} /></button>
      <button type="button" className={small} title="Copia" aria-label="Copia la password" disabled={!value} onClick={copy}><Copy size={16} /></button>
    </div>
  );
};

export default TempPasswordField;
