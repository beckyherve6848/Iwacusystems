import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';

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

interface DropdownOption {
  value: string;
  label: React.ReactNode;
  disabled: boolean;
  group?: string;
}

function getDropdownOptions(children: React.ReactNode, group?: string): DropdownOption[] {
  const options: DropdownOption[] = [];
  React.Children.forEach(children, child => {
    if (!React.isValidElement(child)) return;
    if (child.type === 'option') {
      const option = child as React.ReactElement<React.OptionHTMLAttributes<HTMLOptionElement>>;
      options.push({
        value: String(option.props.value ?? ''),
        label: option.props.children,
        disabled: option.props.disabled ?? false,
        group,
      });
    } else if (child.type === 'optgroup') {
      const optionGroup = child as React.ReactElement<React.OptgroupHTMLAttributes<HTMLOptGroupElement>>;
      options.push(...getDropdownOptions(optionGroup.props.children, optionGroup.props.label));
    }
  });
  return options;
}

export function Select({
  label,
  error,
  className = '',
  id,
  children,
  style,
  onChange,
  value,
  defaultValue,
  disabled,
  required,
  ...props
}: SelectProps) {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');
  const labelId = inputId ? `${inputId}-label` : undefined;
  const selectRef = useRef<HTMLSelectElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const options = useMemo(() => getDropdownOptions(children), [children]);
  const selectedValue = String(value ?? defaultValue ?? '');
  const selectedOption = options.find(option => option.value === selectedValue);
  const menuId = inputId ? `${inputId}-options` : undefined;

  const updateMenuPosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const viewportPadding = 8;
    const optionHeight = 42;
    const menuPadding = 12;
    const desiredHeight = options.length * optionHeight + menuPadding;
    const spaceAbove = Math.max(0, rect.top - viewportPadding - 6);
    const spaceBelow = Math.max(0, window.innerHeight - rect.bottom - viewportPadding - 6);
    const openAbove = spaceBelow < desiredHeight && spaceAbove > spaceBelow;
    const availableHeight = openAbove ? spaceAbove : spaceBelow;
    const menuHeight = Math.min(desiredHeight, availableHeight);
    const menuWidth = Math.min(Math.max(rect.width, 220), window.innerWidth - viewportPadding * 2);
    const left = Math.min(
      Math.max(viewportPadding, rect.left),
      window.innerWidth - menuWidth - viewportPadding,
    );
    setMenuStyle({
      position: 'fixed',
      left,
      width: menuWidth,
      height: menuHeight,
      ...(openAbove
        ? { bottom: window.innerHeight - rect.top + 6 }
        : { top: rect.bottom + 6 }),
    });
  }, [options.length]);

  useEffect(() => {
    if (!open) return;
    updateMenuPosition();
    const closeOnOutsideClick = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false);
    };
    const reposition = () => updateMenuPosition();
    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [open, updateMenuPosition]);

  const chooseOption = (option: DropdownOption) => {
    const select = selectRef.current;
    const valueSetter = select && Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
    if (!select || !valueSetter) return;
    valueSetter.call(select, option.value);
    select.dispatchEvent(new Event('change', { bubbles: true }));
    setOpen(false);
    triggerRef.current?.focus();
  };

  const moveActiveOption = (direction: 1 | -1) => {
    if (!options.length) return;
    setActiveIndex(current => {
      let next = current;
      for (let attempts = 0; attempts < options.length; attempts += 1) {
        next = (next + direction + options.length) % options.length;
        if (!options[next]?.disabled) break;
      }
      return next;
    });
  };

  return (
    <div className="custom-select-wrap flex min-w-0 flex-col gap-1.5">
      {label && (
        <label id={labelId} htmlFor={inputId} className="text-sm font-medium text-slate-700">
          {label}
        </label>
      )}
      <select
        {...props}
        id={inputId ? `${inputId}-native` : undefined}
        ref={selectRef}
        value={value}
        defaultValue={value === undefined ? defaultValue : undefined}
        disabled={disabled}
        required={required}
        onChange={onChange}
        tabIndex={-1}
        aria-hidden="true"
        className="custom-select-native"
      >
        {children}
      </select>
      <button
        ref={triggerRef}
        id={inputId}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={menuId}
        aria-activedescendant={open && inputId ? `${inputId}-option-${activeIndex}` : undefined}
        aria-labelledby={labelId}
        aria-label={!label ? props['aria-label'] : undefined}
        aria-required={required || undefined}
        aria-invalid={Boolean(error) || undefined}
        disabled={disabled}
        className={`custom-select-trigger w-full ${className}`}
        style={{ ...fieldBase, borderColor: error ? '#ef4444' : undefined, ...style }}
        onClick={() => {
          if (!open) {
            const selectedIndex = options.findIndex(option => option.value === selectedValue);
            setActiveIndex(selectedIndex >= 0 ? selectedIndex : options.findIndex(option => !option.disabled));
          }
          setOpen(current => !current);
        }}
        onKeyDown={event => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            if (!open) {
              setOpen(true);
              const selectedIndex = options.findIndex(option => option.value === selectedValue);
              setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
            } else {
              moveActiveOption(event.key === 'ArrowDown' ? 1 : -1);
            }
          } else if (event.key === 'Enter' || event.key === ' ') {
            if (open) {
              event.preventDefault();
              const option = options[activeIndex];
              if (option && !option.disabled) chooseOption(option);
            } else if (event.key === ' ') {
              event.preventDefault();
              setOpen(true);
            }
          } else if (event.key === 'Escape' && open) {
            setOpen(false);
          } else if (event.key === 'Tab') {
            setOpen(false);
          }
        }}
      >
        <span className="custom-select-value">{selectedOption?.label ?? '\u00a0'}</span>
        <ChevronDown className={`custom-select-chevron h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && typeof document !== 'undefined' && createPortal(
        <div
          ref={menuRef}
          id={menuId}
          role="listbox"
          className="custom-select-menu"
          style={menuStyle}
        >
          {options.map((option, index) => (
            <React.Fragment key={`${option.value}-${index}`}>
              {option.group && (index === 0 || options[index - 1]?.group !== option.group) && (
                <div className="custom-select-group-label">{option.group}</div>
              )}
              <button
                type="button"
                role="option"
                id={inputId ? `${inputId}-option-${index}` : undefined}
                aria-selected={option.value === selectedValue}
                disabled={option.disabled}
                className={`custom-select-option ${index === activeIndex ? 'is-active' : ''} ${
                  option.value === selectedValue ? 'is-selected' : ''
                }`}
                onMouseEnter={() => setActiveIndex(index)}
                onMouseDown={event => event.preventDefault()}
                onClick={() => chooseOption(option)}
              >
                <span>{option.label}</span>
                {option.value === selectedValue && <Check className="h-4 w-4 shrink-0" aria-hidden="true" />}
              </button>
            </React.Fragment>
          ))}
        </div>,
        document.body,
      )}
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
