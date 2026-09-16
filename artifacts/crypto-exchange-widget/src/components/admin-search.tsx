import { useEffect, useRef, useState } from 'react';
import type { KeyboardEventHandler } from 'react';
import { Search, X } from 'lucide-react';

type AdminSearchProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
  debounceMs?: number;
  testId?: string;
  autoFocus?: boolean;
  onKeyDown?: KeyboardEventHandler<HTMLInputElement>;
};

export function AdminSearch({
  value,
  onChange,
  placeholder = 'Search...',
  ariaLabel,
  className,
  debounceMs = 0,
  testId = 'admin-search',
  autoFocus = false,
  onKeyDown,
}: AdminSearchProps) {
  const [localValue, setLocalValue] = useState(value);
  const [focused, setFocused] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setLocalValue(newValue);

    if (debounceMs > 0) {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        onChange(newValue.trim());
      }, debounceMs);
    } else {
      onChange(newValue);
    }
  };

  const handleClear = () => {
    setLocalValue('');
    if (debounceRef.current) clearTimeout(debounceRef.current);
    onChange('');
  };

  return (
    <div
      className={`admin-search-field group relative flex w-full min-w-0 items-center${className ? ` ${className}` : ''}`}
      data-focused={focused ? 'true' : undefined}
    >
      <Search size={15} className="admin-search-icon absolute left-3.5 pointer-events-none transition-colors" aria-hidden="true" />
      <input
        type="search"
        autoFocus={autoFocus}
        aria-label={ariaLabel || placeholder}
        autoComplete="off"
        spellCheck={false}
        value={localValue}
        onChange={handleChange}
        onKeyDown={onKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        data-testid={testId}
        className="admin-search-input"
      />
      {localValue && (
        <button
          type="button"
          onClick={handleClear}
          className="admin-search-clear absolute right-2"
          aria-label="Clear search"
          title="Clear search"
          data-testid={`${testId}-clear`}
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}
