import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';

interface PaginationProps {
  page: number;
  total: number;
  perPage: number;
  onChange: (page: number) => void;
}

export default function Pagination({ page, total, perPage, onChange }: PaginationProps) {
  const { language } = useTheme();
  const totalPages = Math.ceil(total / perPage);
  if (totalPages <= 1) return null;

  const pages: number[] = [];
  const start = Math.max(1, page - 2);
  const end = Math.min(totalPages, start + 4);
  for (let i = start; i <= end; i++) pages.push(i);

  return (
    <div className="flex items-center justify-between px-1 py-2">
      <p className="text-sm text-slate-400">
        {language === 'fr' ? 'Affichage' : 'Showing'} {Math.min((page - 1) * perPage + 1, total)}–{Math.min(page * perPage, total)} {language === 'fr' ? 'sur' : 'of'} {total}
      </p>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onChange(page - 1)}
          disabled={page === 1}
          aria-label={language === 'fr' ? 'Page précédente' : 'Previous page'}
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        {pages.map(p => (
          <button
            key={p}
            onClick={() => onChange(p)}
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
          disabled={page === totalPages}
          aria-label={language === 'fr' ? 'Page suivante' : 'Next page'}
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
