import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';

interface PaginationProps {
  page: number;
  total: number;
  perPage: number;
  onChange: (page: number) => void;
  onPerPageChange?: (perPage: number) => void;
  totalLabel?: string;
}

export default function Pagination({ page, total, perPage, onChange, onPerPageChange, totalLabel }: PaginationProps) {
  const { language } = useTheme();
  const totalPages = Math.ceil(total / perPage);
  if (totalPages <= 1 && !onPerPageChange) return null;

  const pages: number[] = [];
  const start = Math.max(1, page - 2);
  const end = Math.min(totalPages, start + 4);
  for (let i = start; i <= end; i++) pages.push(i);

  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 px-1 py-2 ${onPerPageChange ? 'pagination-controls' : ''}`}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="text-sm text-slate-400">
          {language === 'fr' ? 'Affichage' : 'Showing'} {total === 0 ? 0 : (page - 1) * perPage + 1}–{Math.min(page * perPage, total)} {language === 'fr' ? 'sur' : 'of'} {total}
        </p>
        {totalLabel && (
          <p className="text-sm font-medium text-slate-500">
            {totalLabel}: <span className="font-semibold text-slate-700 dark:text-slate-200">{total}</span>
          </p>
        )}
        {onPerPageChange && (
          <label className="flex items-center gap-2 text-sm text-slate-500">
            <span>{language === 'fr' ? 'Afficher' : 'Show'}</span>
            <select
              aria-label={language === 'fr' ? 'Nombre de maisons par page' : 'Houses per page'}
              value={perPage}
              onChange={event => onPerPageChange(Number(event.target.value))}
              className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            >
              {[10, 25, 50, 100].map(size => <option key={size} value={size}>{size}</option>)}
            </select>
            <span>{language === 'fr' ? 'par page' : 'per page'}</span>
          </label>
        )}
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onChange(page - 1)}
          disabled={page === 1}
          aria-label={language === 'fr' ? 'Page précédente' : 'Previous page'}
          className={`flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm transition-all disabled:cursor-not-allowed disabled:opacity-30 ${
            onPerPageChange
              ? 'pagination-nav-button text-slate-500 hover:bg-slate-100 hover:text-slate-900'
              : 'p-1.5 text-slate-400 hover:bg-white/5 hover:text-white'
          }`}
        >
          <ChevronLeft className="w-4 h-4" />
          {onPerPageChange && <span>{language === 'fr' ? 'Précédent' : 'Previous'}</span>}
        </button>
        {pages.map(p => (
          <button
            key={p}
            onClick={() => onChange(p)}
            aria-current={p === page ? 'page' : undefined}
            className={`min-w-[32px] h-8 px-2 rounded-lg text-sm font-medium transition-all ${
              p === page ? 'text-[#0d1422] font-semibold' : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
            style={p === page ? { background: 'linear-gradient(135deg,#fdb022,#f59e0b)', boxShadow: '0 2px 8px rgba(245,158,11,0.3)' } : {}}
          >
            {p}
          </button>
        ))}
        <button
          onClick={() => onChange(page + 1)}
          disabled={totalPages === 0 || page === totalPages}
          aria-label={language === 'fr' ? 'Page suivante' : 'Next page'}
          className={`flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm transition-all disabled:cursor-not-allowed disabled:opacity-30 ${
            onPerPageChange
              ? 'pagination-nav-button text-slate-500 hover:bg-slate-100 hover:text-slate-900'
              : 'p-1.5 text-slate-400 hover:bg-white/5 hover:text-white'
          }`}
        >
          {onPerPageChange && <span>{language === 'fr' ? 'Suivant' : 'Next'}</span>}
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
