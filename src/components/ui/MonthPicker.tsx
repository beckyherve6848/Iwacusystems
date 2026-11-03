import { useEffect, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';

interface MonthPickerProps {
  value: string;
  onChange: (value: string) => void;
  language: string;
  label: string;
  id?: string;
  className?: string;
  showLabel?: boolean;
}

const englishMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const frenchMonths = ['Janv.', 'Févr.', 'Mars', 'Avr.', 'Mai', 'Juin', 'Juil.', 'Août', 'Sept.', 'Oct.', 'Nov.', 'Déc.'];

export default function MonthPicker({ value, onChange, language, label, id, className = '', showLabel = false }: MonthPickerProps) {
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(() => Number(value.slice(0, 4)) || new Date().getFullYear());
  const rootRef = useRef<HTMLDivElement>(null);
  const [selectedYear, selectedMonth] = value.split('-').map(Number);
  const selectedDate = value
    ? new Date(selectedYear, selectedMonth - 1, 1)
    : new Date();
  const displayMonth = selectedDate.toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', {
    month: 'long',
    year: 'numeric',
  });
  const monthNames = language === 'fr' ? frenchMonths : englishMonths;
  const isFrench = language === 'fr';

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const selectMonth = (month: number) => {
    onChange(`${year}-${String(month + 1).padStart(2, '0')}`);
    setOpen(false);
  };

  const selectCurrentMonth = () => {
    const now = new Date();
    const currentValue = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    onChange(currentValue);
    setYear(now.getFullYear());
    setOpen(false);
  };

  return (
    <div className={`month-picker relative ${className}`} ref={rootRef}>
      {showLabel && (
        <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-700">
          {label}
        </label>
      )}
      <button
        id={id}
        type="button"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setYear(selectedYear || new Date().getFullYear());
          setOpen(current => !current);
        }}
        className="month-picker-trigger inline-flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 shadow-sm transition hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
      >
        <span className="truncate capitalize">{displayMonth}</span>
        <CalendarDays className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
      </button>
      {open && (
        <div
          className="month-picker-popover absolute left-0 top-full z-40 mt-2 w-[min(304px,calc(100vw-32px))] rounded-2xl border border-slate-200 bg-white p-3.5 text-slate-900 shadow-xl"
          role="dialog"
          aria-label={label}
        >
          <div className="mb-2 flex items-center justify-between border-b border-slate-200 pb-2">
            <button
              type="button"
              aria-label={isFrench ? 'Année précédente' : 'Previous year'}
              onClick={() => setYear(current => current - 1)}
              className="month-picker-nav rounded-lg p-2 text-slate-600 transition hover:bg-slate-100"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm font-semibold tabular-nums">{year}</span>
            <button
              type="button"
              aria-label={isFrench ? 'Année suivante' : 'Next year'}
              onClick={() => setYear(current => current + 1)}
              className="month-picker-nav rounded-lg p-2 text-slate-600 transition hover:bg-slate-100"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {monthNames.map((name, month) => {
              const isSelected = selectedYear === year && selectedMonth === month + 1;
              const isCurrent = new Date().getFullYear() === year && new Date().getMonth() === month;
              return (
                <button
                  key={name}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => selectMonth(month)}
                  className={`month-picker-option rounded-lg px-2 py-2.5 text-sm font-medium transition ${
                    isSelected ? 'is-selected' : isCurrent ? 'is-current' : ''
                  }`}
                >
                  {name}
                </button>
              );
            })}
          </div>
          <div className="mt-2 border-t border-slate-200 pt-2 text-right">
            <button
              type="button"
              onClick={selectCurrentMonth}
              className="month-picker-current rounded-lg px-2 py-1.5 text-sm font-medium text-blue-700 transition hover:bg-blue-50"
            >
              {isFrench ? 'Ce mois-ci' : 'This month'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
