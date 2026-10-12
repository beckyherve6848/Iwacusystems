import React from 'react';
import { CheckCircle, XCircle, AlertCircle, Info, X } from 'lucide-react';

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
}

interface ToastContainerProps {
  toasts: Toast[];
  onRemove: (id: string) => void;
}

const icons = {
  success: <CheckCircle className="w-5 h-5 text-emerald-700 shrink-0" />,
  error:   <XCircle className="w-5 h-5 text-red-700 shrink-0" />,
  warning: <AlertCircle className="w-5 h-5 text-amber-700 shrink-0" />,
  info:    <Info className="w-5 h-5 text-blue-700 shrink-0" />,
};

const toastStyles = {
  success: {
    background: 'rgba(236, 253, 245, 0.82)',
    border: '1px solid rgba(16, 185, 129, 0.36)',
    boxShadow: '0 14px 40px rgba(16, 185, 129, 0.16), inset 0 1px 0 rgba(255,255,255,0.9)',
  },
  error: {
    background: 'rgba(254, 242, 242, 0.86)',
    border: '1px solid rgba(239, 68, 68, 0.32)',
    boxShadow: '0 14px 40px rgba(127, 29, 29, 0.12), inset 0 1px 0 rgba(255,255,255,0.9)',
  },
  warning: {
    background: 'rgba(255, 251, 235, 0.86)',
    border: '1px solid rgba(245, 158, 11, 0.32)',
    boxShadow: '0 14px 40px rgba(146, 64, 14, 0.12), inset 0 1px 0 rgba(255,255,255,0.9)',
  },
  info: {
    background: 'rgba(239, 246, 255, 0.86)',
    border: '1px solid rgba(59, 130, 246, 0.3)',
    boxShadow: '0 14px 40px rgba(30, 64, 175, 0.1), inset 0 1px 0 rgba(255,255,255,0.9)',
  },
};

export default function ToastContainer({ toasts, onRemove }: ToastContainerProps) {
  return (
    <div className="fixed top-4 right-4 z-[100] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2 pointer-events-none sm:right-5">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className="flex items-start gap-3 rounded-2xl border p-4 text-slate-900 pointer-events-auto animate-slide-in backdrop-blur-xl"
          style={{
            ...toastStyles[toast.type],
            backdropFilter: 'blur(22px) saturate(165%)',
            WebkitBackdropFilter: 'blur(22px) saturate(165%)',
          }}
        >
          {icons[toast.type]}
          <p className="text-sm font-medium text-slate-800 flex-1 leading-snug">{toast.message}</p>
          <button
            onClick={() => onRemove(toast.id)}
            aria-label="Dismiss notification"
            className="text-slate-500 hover:text-slate-900 transition-colors mt-0.5 shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
