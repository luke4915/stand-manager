import { useEffect, useState } from 'react';

const Toast = ({ message, type = 'success', duration = 2000, onClose }) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(true);
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(onClose, 300);
    }, duration);
    return () => clearTimeout(timer);
  }, [duration, onClose]);

  const bgColor = {
    success: 'bg-emerald-600 shadow-emerald-600/10',
    error: 'bg-red-500 shadow-red-500/10',
    info: 'bg-indigo-600 shadow-indigo-600/10',
  }[type] || 'bg-gray-600';

  return (
    <div
      className={`fixed bottom-6 left-1/2 transform -translate-x-1/2 ${bgColor} text-white px-6 py-3.5 rounded-xl shadow-xl z-[100]
        max-w-sm font-semibold text-xs transition-all duration-300 ease-in-out
        ${visible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-4 scale-95'}`}
    >
      {message}
    </div>
  );
};

export default Toast;