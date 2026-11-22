'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from '@/components/LanguageProvider';

// Admin card: saves the photo-search key (Pexels or Unsplash) used for /chef recipe pictures.
// The key is stored on the server (encrypted when the vault is on) and only a masked value comes back.
const OPTIONS = [
  { envKey: 'PEXELS_API_KEY', label: 'Pexels' },
  { envKey: 'UNSPLASH_ACCESS_KEY', label: 'Unsplash' },
];

export default function ImageKeyCard() {
  const { t } = useTranslation();
  const [envKey, setEnvKey] = useState(OPTIONS[0].envKey);
  const [value, setValue] = useState('');
  const [masked, setMasked] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/keys?t=' + Date.now(), { cache: 'no-store' });
      const j = await r.json();
      if (j && j.envMap) setMasked(j.envMap);
    } catch (_) {}
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!value.trim()) return;
    setBusy(true); setMsg('');
    try {
      const r = await fetch('/api/admin/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'image', envKey, keyValue: value.trim(), name: OPTIONS.find(o => o.envKey === envKey)?.label + ' photos' }),
      });
      const j = await r.json();
      setMsg(j.success ? t('imageKeySaved', 'Saved.') : (j.error || t('imageKeyFailed', 'Could not save the key.')));
      if (j.success) { setValue(''); load(); }
    } catch (_) { setMsg(t('imageKeyFailed', 'Could not save the key.')); }
    setBusy(false);
  };

  return (
    <div role="region" aria-label="Recipe photo search" className="border rounded-2xl p-5 space-y-3 transition-colors duration-200"
      style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }}>
      <h3 className="text-sm font-bold" style={{ color: 'var(--color-text)' }}>{t('imageSearchTitle', 'Recipe photo search')}</h3>
      <p className="text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
        {t('imageSearchDesc', 'Free API key from Pexels or Unsplash. With it, /chef shows a real photo that matches each dish. Without it, a neutral placeholder is shown.')}
      </p>
      <div className="flex flex-col sm:flex-row gap-2">
        <select value={envKey} onChange={(e) => setEnvKey(e.target.value)} aria-label="Provider"
          className="border rounded-xl p-2.5 text-xs outline-none transition-colors duration-200"
          style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}>
          {OPTIONS.map(o => <option key={o.envKey} value={o.envKey}>{o.label}</option>)}
        </select>
        <input type="password" value={value} onChange={(e) => setValue(e.target.value)}
          placeholder={masked[envKey] || t('imageKeyPlaceholder', 'Paste API key')}
          autoComplete="off" data-lpignore="true" data-form-type="other" spellCheck={false}
          className="flex-1 border rounded-xl p-2.5 text-xs font-mono outline-none transition-colors duration-200"
          style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }} />
        <button type="button" onClick={save} disabled={busy || !value.trim()}
          className="px-4 py-2.5 rounded-xl text-xs font-bold disabled:opacity-50 transition-colors duration-200"
          style={{ backgroundColor: 'var(--color-primary)', color: '#fff' }}>
          {t('save', 'Save')}
        </button>
      </div>
      {msg && <p className="text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>{msg}</p>}
    </div>
  );
}
