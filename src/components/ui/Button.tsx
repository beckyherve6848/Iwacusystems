import React from 'react';
import { Loader2 } from 'lucide-react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: React.ReactNode;
}

const variantClasses = {
  primary:   'text-white font-semibold shadow-sm hover:opacity-90',
  secondary: 'bg-slate-900 hover:bg-slate-800 text-white',
  danger:    'bg-red-600 hover:bg-red-500 text-white shadow-sm',
  ghost:     'bg-transparent hover:bg-slate-100 text-slate-600 hover:text-slate-900',
  outline:   'border border-slate-200 hover:border-slate-300 text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-50',
};

const variantStyles: Record<string, React.CSSProperties> = {
  primary: { background: '#111827', boxShadow: '0 1px 3px rgba(0,0,0,0.12)' },
  secondary: {},
  danger: {},
  ghost: {},
  outline: {},
};

const sizes = {
  sm: 'px-3 py-1.5 text-xs rounded-lg',
  md: 'px-4 py-2.5 text-sm rounded-lg',
  lg: 'px-6 py-3 text-base rounded-xl',
};

export default function Button({
  variant = 'primary',
  size = 'md',
  loading,
  icon,
  children,
  className = '',
  disabled,
  style,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      style={{ ...variantStyles[variant], ...style }}
      className={`inline-flex items-center justify-center gap-2 font-medium transition-all duration-150 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed ${variantClasses[variant]} ${sizes[size]} ${className}`}
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}
