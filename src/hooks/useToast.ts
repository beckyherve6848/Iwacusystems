import { useState, useCallback } from 'react';

export function useToast() {
  const [toasts, setToasts] = useState<Array<{ id: string; message: string; type: 'success' | 'error' | 'info' | 'warning' }>>([]);

  const addToast = useCallback((message: string, type: 'success' | 'error' | 'info' | 'warning' = 'info') => {
    const isNetworkError = /failed to fetch|network request failed|networkerror|load failed/i.test(message);
    const friendlyMessage = isNetworkError
      ? localStorage.getItem('language') === 'fr'
        ? 'Connexion au serveur impossible. Vérifiez votre connexion Internet et réessayez.'
        : 'Unable to reach the server. Check your internet connection and try again.'
      : message;
    const id = Math.random().toString(36).slice(2);
    setToasts(prev => prev.some(toast => toast.message === friendlyMessage && toast.type === type)
      ? prev
      : [...prev, { id, message: friendlyMessage, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return { toasts, addToast, removeToast };
}
