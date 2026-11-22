'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Server, Cloud, Zap, CheckCircle2 } from 'lucide-react';
import { useTranslation } from '@/components/LanguageProvider';

type Engine = 'mysql' | 'postgres';
const TOKEN_KEY = 'zecratary_admin_db_token';

export default function SetupPage() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<{ needsSetup: boolean; adminTokenConfigured: boolean; production: boolean } | null>(null);
  const [engine, setEngine] = useState<Engine>('mysql');
  const [uri, setUri] = useState('');
  const [token, setToken] = useState('');
  const [createSchema, setCreateSchema] = useState(true);
  const [busy, setBusy] = useState<'' | 'test' | 'complete'>('');
  const [result, setResult] = useState<{ ok: boolean; text: string; note?: string } | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    try { setToken(window.sessionStorage.getItem(TOKEN_KEY) || ''); } catch (_) {}
    fetch('/api/setup').then((r) => r.json()).then(setStatus).catch(() => setStatus({ needsSetup: true, adminTokenConfigured: false, production: false }));
  }, []);

  const saveToken = (v: string) => {
    setToken(v);
    try { if (v) window.sessionStorage.setItem(TOKEN_KEY, v); else window.sessionStorage.removeItem(TOKEN_KEY); } catch (_) {}
  };

  const call = async (action: 'test' | 'complete') => {
    setBusy(action);
    setResult(null);
    try {
      const res = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { 'x-admin-token': token } : {}) },
        body: JSON.stringify({ action, engine, uri, createSchema })
      });
      const data = await res.json().catch(() => ({}));
      if (data.success) {
        setResult({ ok: true, text: data.message || 'OK', note: data.note });
        if (action === 'complete') {
          setDone(true);
          try { window.sessionStorage.setItem('zecratary_setup_ok', '1'); } catch (_) {}
        }
      } else {
        setResult({ ok: false, text: data.error || `Request failed (${res.status}).` });
      }
    } catch (_) {
      setResult({ ok: false, text: t('setupNetworkError', 'Network error. Please try again.') });
    } finally {
      setBusy('');
    }
  };

  const card = { backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' } as React.CSSProperties;
  const inner = { backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)', color: 'var(--color-text)' } as React.CSSProperties;
  const placeholder = engine === 'mysql' ? 'mysql://user:password@host:3306/database' : 'postgresql://user:password@host:5432/database';

  if (!status) {
    return <div className="max-w-xl mx-auto mt-16 h-64 rounded-3xl animate-pulse" style={{ backgroundColor: 'var(--color-inner-dark)' }} />;
  }

  if (!status.needsSetup && !done) {
    return (
      <div className="max-w-xl mx-auto mt-16 rounded-3xl border p-8 text-center space-y-3 transition-colors duration-200" style={card}>
        <CheckCircle2 className="h-8 w-8 mx-auto" style={{ color: 'var(--color-emerald)' }} />
        <h1 className="text-lg font-bold" style={{ color: 'var(--color-text)' }}>{t('setupAlready', 'The database is already configured')}</h1>
        <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          {t('setupAlreadyDesc', 'To change engines, sign in as admin and use Admin → Database.')}
        </p>
        <Link href="/admin/database" className="inline-block text-sm font-bold" style={{ color: 'var(--color-primary)' }}>/admin/database</Link>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto mt-10 space-y-5">
      <div>
        <h1 className="text-xl font-bold" style={{ color: 'var(--color-text)' }}>{t('setupTitle', 'Welcome — set up your database')}</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>
          {t('setupDesc', 'Pick the database engine for this site. You can switch later from Admin → Database.')}
        </p>
      </div>

      {status.production && !status.adminTokenConfigured && (
        <div role="region" aria-label="Admin token required" className="rounded-2xl border p-4 text-xs font-bold" style={{ ...card, color: '#f59e0b' }}>
          {t('setupNeedToken', 'First set ADMIN_DB_TOKEN in the server environment variables and redeploy. Setup stays disabled until it exists, so nobody else can claim a fresh site.')}
        </div>
      )}

      <div role="region" aria-label="Database setup" data-lpignore="true" data-form-type="other" className="rounded-3xl border p-6 space-y-5 shadow-xl transition-colors duration-200" style={card}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {([
            { id: 'mysql', label: 'MySQL / MariaDB', sub: t('dbOptMysqlSub', 'Hostinger or a local server'), Icon: Server },
            { id: 'postgres', label: 'PostgreSQL', sub: t('dbOptPgSub', 'Supabase cloud or a local server'), Icon: Cloud }
          ] as { id: Engine; label: string; sub: string; Icon: any }[]).map((o) => (
            <button
              key={o.id}
              type="button"
              disabled={done}
              onClick={() => { setEngine(o.id); setResult(null); }}
              className="text-left p-4 rounded-2xl border transition-colors duration-200 cursor-pointer"
              style={{ ...inner, borderColor: engine === o.id ? 'var(--color-primary)' : 'var(--color-border)' }}
            >
              <span className="flex items-center gap-2 text-sm font-bold">
                <o.Icon className="h-4 w-4" style={{ color: 'var(--color-primary)' }} />{o.label}
              </span>
              <p className="text-[11px] mt-1" style={{ color: 'var(--color-text-secondary)' }}>{o.sub}</p>
            </button>
          ))}
        </div>

        <div>
          <label className="block text-[11px] font-bold mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>
            {t('setupConnString', 'Connection string')}
          </label>
          <input
            type="password"
            value={uri}
            disabled={done}
            onChange={(e) => { setUri(e.target.value); setResult(null); }}
            placeholder={placeholder}
            autoComplete="off"
            data-lpignore="true"
            data-form-type="other"
            className="w-full px-3 py-2 rounded-xl border text-xs font-mono outline-none transition-colors duration-200"
            style={inner}
          />
          <p className="text-[10px] mt-1.5" style={{ color: 'var(--color-text-secondary)' }}>
            {t('setupConnHint', 'Stored only on the server (never in the database). Special characters in the password such as # or @ are fine.')}
          </p>
        </div>

        <div>
          <label className="block text-[11px] font-bold mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>
            {t('dbAdminToken', 'Admin token (ADMIN_DB_TOKEN)')}
          </label>
          <input
            type="password"
            value={token}
            disabled={done}
            onChange={(e) => saveToken(e.target.value)}
            placeholder={t('dbAdminTokenPh', 'Paste the token set on the server')}
            autoComplete="off"
            data-lpignore="true"
            data-form-type="other"
            className="w-full px-3 py-2 rounded-xl border text-xs font-mono outline-none transition-colors duration-200"
            style={inner}
          />
        </div>

        <label className="flex items-start gap-2 text-xs cursor-pointer" style={{ color: 'var(--color-text-secondary)' }}>
          <input type="checkbox" checked={createSchema} disabled={done} onChange={(e) => setCreateSchema(e.target.checked)} className="mt-0.5" autoComplete="off" data-lpignore="true" data-form-type="other" />
          <span>{t('setupCreateTables', 'Create the tables (safe to repeat; existing tables are kept).')}</span>
        </label>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => call('test')}
            disabled={busy !== '' || !uri || done}
            className="px-4 py-2 rounded-xl border text-xs font-bold flex items-center gap-2 cursor-pointer disabled:opacity-50 transition hover:opacity-90"
            style={inner}
          >
            <Zap className={`h-3.5 w-3.5 ${busy === 'test' ? 'animate-pulse' : ''}`} style={{ color: 'var(--color-primary)' }} />
            {busy === 'test' ? t('dbTesting', 'Testing...') : t('dbTestConn', 'Test connection')}
          </button>
          <button
            type="button"
            onClick={() => call('complete')}
            disabled={busy !== '' || !uri || done}
            className="px-4 py-2 rounded-xl text-xs font-bold cursor-pointer disabled:opacity-40 transition hover:opacity-90"
            style={{ backgroundColor: 'var(--color-primary)', color: '#ffffff' }}
          >
            {busy === 'complete' ? t('setupSaving', 'Setting up...') : t('setupFinish', 'Save & create tables')}
          </button>
        </div>

        {result && (
          <div className="space-y-1">
            <p className="text-xs font-bold" style={{ color: result.ok ? 'var(--color-emerald)' : '#ef4444' }}>{result.text}</p>
            {result.note && <p className="text-[11px]" style={{ color: '#f59e0b' }}>{result.note}</p>}
          </div>
        )}

        {done && (
          <Link href="/login" className="inline-block text-sm font-bold" style={{ color: 'var(--color-primary)' }}>
            {t('setupContinue', 'Continue to sign in →')}
          </Link>
        )}
      </div>
    </div>
  );
}
