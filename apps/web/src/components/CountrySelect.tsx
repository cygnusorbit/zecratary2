'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { useTranslation } from '@/components/LanguageProvider';
import { ALL_COUNTRIES } from '@/lib/countries';

interface Props {
  value: string;
  onChange: (value: string) => void;
}

// Dropdown with a search box on top, so any country can be found by typing.
export default function CountrySelect({ value, onChange }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const boxRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const options = useMemo(() => {
    const base = value && !ALL_COUNTRIES.includes(value) ? [value, ...ALL_COUNTRIES] : ALL_COUNTRIES;
    const q = term.trim().toLowerCase();
    return q ? base.filter((c) => c.toLowerCase().includes(q)) : base;
  }, [term, value]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    setTimeout(() => searchRef.current?.focus(), 0);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const pick = (c: string) => { onChange(c); setOpen(false); setTerm(''); };

  return (
    <div ref={boxRef} className="relative" role="region">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="w-full border rounded-xl px-4 py-2.5 text-xs outline-none cursor-pointer shadow-sm font-medium text-left flex items-center justify-between transition-colors duration-200"
        style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: open ? 'var(--color-primary)' : 'var(--color-border)', color: 'var(--color-text)' }}
      >
        <span className="truncate">{value || t('selectNationalCuisine', 'Select a country')}</span>
        <ChevronDown className="h-4 w-4 shrink-0" style={{ color: 'var(--color-primary)' }} />
      </button>

      {open && (
        <div
          className="absolute z-50 left-0 right-0 mt-1 rounded-xl border shadow-2xl overflow-hidden"
          style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }}
        >
          <div className="p-2 border-b flex items-center gap-2" style={{ borderColor: 'var(--color-border)' }}>
            <Search className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--color-text-secondary)' }} />
            <input
              ref={searchRef}
              type="text"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder={t('searchCountry', 'Search country...')}
              autoComplete="off"
              data-lpignore="true"
              data-form-type="other"
              className="w-full bg-transparent outline-none text-xs"
              style={{ color: 'var(--color-text)' }}
            />
          </div>
          <ul role="listbox" className="max-h-56 overflow-y-auto py-1">
            {options.length === 0 && (
              <li className="px-4 py-2 text-xs" style={{ color: 'var(--color-text-secondary)' }}>{t('noCountryFound', 'No country found')}</li>
            )}
            {options.map((c) => (
              <li key={c} role="option" aria-selected={c === value}>
                <button
                  type="button"
                  onClick={() => pick(c)}
                  className="w-full text-left px-4 py-1.5 text-xs cursor-pointer hover:opacity-80 transition-colors duration-200"
                  style={{
                    color: c === value ? 'var(--color-primary)' : 'var(--color-text)',
                    backgroundColor: c === value ? 'var(--color-inner-dark)' : 'transparent',
                    fontWeight: c === value ? 700 : 500,
                  }}
                >
                  {c}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
