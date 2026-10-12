import React from 'react';

const fieldBase: React.CSSProperties = {
  background: '#ffffff',
  border: '1px solid #e5e7eb',
  color: '#111827',
  borderRadius: '0.5rem',
  fontSize: '0.875rem',
  transition: 'border-color 0.15s, box-shadow 0.15s',
};

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  labelClassName?: string;
  error?: string;
  icon?: React.ReactNode;
  wrapperClassName?: string;
}

export default function Input({ label, labelClassName = '', error, icon, className = '', wrapperClassName = '', id, style, onFocus, onBlur, ...props }: InputProps) {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className={`text-sm font-medium text-slate-700 ${labelClassName}`}>
          {label}
        </label>
      )}
      <div className={`relative ${wrapperClassName}`}>
        {icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
            {icon}
          </div>
        )}
        <input
          id={inputId}
          style={{ ...fieldBase, borderColor: error ? '#ef4444' : undefined, ...style }}
          className={`w-full py-2.5 pr-4 placeholder-slate-400 focus:outline-none ${icon ? 'pl-10' : 'pl-4'} ${className}`}
          onFocus={e => {
            e.currentTarget.style.borderColor = '#111827';
            e.currentTarget.style.boxShadow = '0 0 0 3px rgba(17,24,39,0.08)';
            onFocus?.(e);
          }}
          onBlur={e => {
            e.currentTarget.style.borderColor = error ? '#ef4444' : '#e5e7eb';
            e.currentTarget.style.boxShadow = 'none';
            onBlur?.(e);
          }}
          {...props}
        />
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
}

export function Select({ label, error, className = '', id, children, style, ...props }: SelectProps) {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="text-sm font-medium text-slate-700">
          {label}
        </label>
      )}
      <select
        id={inputId}
        style={{ ...fieldBase, borderColor: error ? '#ef4444' : undefined, ...style }}
        className={`w-full py-2.5 px-4 focus:outline-none ${className}`}
        onFocus={e => { e.currentTarget.style.borderColor = '#111827'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(17,24,39,0.08)'; }}
        onBlur={e => { e.currentTarget.style.borderColor = error ? '#ef4444' : '#e5e7eb'; e.currentTarget.style.boxShadow = 'none'; }}
        {...props}
      >
        {children}
      </select>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export function Textarea({ label, error, className = '', id, style, ...props }: TextareaProps) {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="text-sm font-medium text-slate-700">
          {label}
        </label>
      )}
      <textarea
        id={inputId}
        style={{ ...fieldBase, borderColor: error ? '#ef4444' : undefined, ...style }}
        className={`w-full py-2.5 px-4 placeholder-slate-400 focus:outline-none resize-none ${className}`}
        onFocus={e => { e.currentTarget.style.borderColor = '#111827'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(17,24,39,0.08)'; }}
        onBlur={e => { e.currentTarget.style.borderColor = error ? '#ef4444' : '#e5e7eb'; e.currentTarget.style.boxShadow = 'none'; }}
        {...props}
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
