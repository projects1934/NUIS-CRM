import { useState, useCallback, useEffect, useRef } from 'react';

let _showToast = null;

export function showToast(message, type = 'info') {
  if (_showToast) _showToast(message, type);
}

export default function ToastContainer() {
  const [toasts, setToasts] = useState([]);
  const counter = useRef(0);

  const addToast = useCallback((message, type) => {
    const id = ++counter.current;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  useEffect(() => {
    _showToast = addToast;
    return () => { _showToast = null; };
  }, [addToast]);

  if (!toasts.length) return null;

  return (
    <div className="toast-container">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.type}`}>{t.message}</div>
      ))}
    </div>
  );
}
