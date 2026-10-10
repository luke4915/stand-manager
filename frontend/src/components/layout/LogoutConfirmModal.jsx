// Conferma prima di uscire dall'account.
const LogoutConfirmModal = ({ onConfirm, onCancel }) => (
  <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-[2000] px-4">
    <div className="bg-[var(--bg-card)] p-8 rounded-3xl shadow-2xl w-full max-w-sm text-center border border-[var(--border)]">
      <h2 className="text-2xl font-black mb-6 text-[var(--text-main)]">Sei sicuro?</h2>
      <div className="flex gap-4">
        <button onClick={onConfirm} className="flex-1 py-3 bg-red-500 text-white rounded-2xl font-bold">LOGOUT</button>
        <button onClick={onCancel} className="flex-1 py-3 bg-[var(--bg-card-2)] border border-[var(--border)] text-[var(--text-main)] rounded-2xl font-bold">ANNULLA</button>
      </div>
    </div>
  </div>
);

export default LogoutConfirmModal;
