'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { 
  ShieldCheck, Copy, Check, Eye, EyeOff, KeyRound, 
  Globe, ArrowLeft, RefreshCw, AlertCircle, CheckCircle2, 
  ExternalLink, Sparkles 
} from 'lucide-react';
import { useTranslation } from '@/components/LanguageProvider';
import { applyThemeToDocument } from '@/lib/themeConfig';

interface SocialSettingsState {
  googleEnabled: boolean;
  googleClientId: string;
  googleClientSecret: string;
  facebookEnabled: boolean;
  facebookAppId: string;
  facebookAppSecret: string;
  appleEnabled: boolean;
  appleTeamId: string;
  appleKeyId: string;
  applePrivateKey: string;
}

function SocialLoginSettingContent() {
  const { t } = useTranslation();

  const [settings, setSettings] = useState<SocialSettingsState>({
    googleEnabled: false,
    googleClientId: '',
    googleClientSecret: '',
    facebookEnabled: false,
    facebookAppId: '',
    facebookAppSecret: '',
    appleEnabled: false,
    appleTeamId: '',
    appleKeyId: '',
    applePrivateKey: ''
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isDayMode, setIsDayMode] = useState(false);
  const [computedOrigin, setComputedOrigin] = useState('http://localhost:3000');

  // 1. Theme Synchronization
  const syncTheme = useCallback(() => {
    try {
      if (typeof document !== 'undefined') {
        const isDark = document.documentElement.classList.contains('dark');
        setIsDayMode(!isDark);
      }
      const storedColors = typeof window !== 'undefined'
        ? (localStorage.getItem('zecratary_theme_colors') || localStorage.getItem('zecratary_theme_config'))
        : null;
      if (storedColors) {
        applyThemeToDocument(JSON.parse(storedColors));
      } else {
        applyThemeToDocument(null);
      }
    } catch (_) {}
  }, []);

  useEffect(() => {
    syncTheme();
    window.addEventListener('zecratary_theme_mode_changed', syncTheme);
    window.addEventListener('zecratary_theme_changed', syncTheme);
    window.addEventListener('storage', syncTheme);
    return () => {
      window.removeEventListener('zecratary_theme_mode_changed', syncTheme);
      window.removeEventListener('zecratary_theme_changed', syncTheme);
      window.removeEventListener('storage', syncTheme);
    };
  }, [syncTheme]);

  // 2. Compute dynamic, non-0.0.0.0 callback URL origin
  useEffect(() => {
    if (typeof window !== 'undefined') {
      let orig = window.location.origin;
      if (orig.includes('0.0.0.0')) {
        orig = orig.replace(/0\.0\.0\.0/g, 'localhost');
      }
      setComputedOrigin(orig);
    }
  }, []);

  // 3. Fetch Settings from PostgreSQL/MySQL-backed Endpoint
  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/settings', {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' }
      });
      if (res.ok) {
        const data = await res.json();
        const social = data.settings?.socialLogin || data.socialLogin;
        if (social) {
          setSettings({
            googleEnabled: Boolean(social.googleEnabled),
            googleClientId: social.googleClientId || '',
            googleClientSecret: social.googleClientSecret || '',
            facebookEnabled: Boolean(social.facebookEnabled),
            facebookAppId: social.facebookAppId || '',
            facebookAppSecret: social.facebookAppSecret || '',
            appleEnabled: Boolean(social.appleEnabled),
            appleTeamId: social.appleTeamId || '',
            appleKeyId: social.appleKeyId || '',
            applePrivateKey: social.applePrivateKey || ''
          });
        }
      }
    } catch (err) {
      console.error('[social-settings] Failed to load settings:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  // 4. Handle Save to PostgreSQL & MySQL
  const handleSave = async () => {
    setSaving(true);
    setStatusMsg(null);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ socialLogin: settings })
      });
      if (res.ok) {
        setStatusMsg({
          type: 'success',
          text: t('socialSettingsSavedSuccess', 'Social login settings saved successfully!')
        });
        window.dispatchEvent(new Event('zecratary_social_login_updated'));
        window.dispatchEvent(new Event('zecratary_admin_settings_updated'));
      } else {
        throw new Error('Save failed');
      }
    } catch (err: any) {
      setStatusMsg({
        type: 'error',
        text: t('socialSettingsSaveError', 'Failed to save social login settings.')
      });
    } finally {
      setSaving(false);
      setTimeout(() => setStatusMsg(null), 5000);
    }
  };

  const handleCopy = (text: string, key: string) => {
    if (typeof navigator !== 'undefined') {
      navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2500);
    }
  };

  const toggleSecret = (field: string) => {
    setShowSecrets(prev => ({ ...prev, [field]: !prev[field] }));
  };

  const handleTestGoogle = () => {
    setTesting(true);
    setTimeout(() => {
      setTesting(false);
      if (!settings.googleClientId.trim()) {
        setStatusMsg({
          type: 'error',
          text: t('testMissingCredentials', 'Please provide both Client ID and Client Secret before testing.')
        });
      } else if (!settings.googleClientId.includes('.apps.googleusercontent.com')) {
        setStatusMsg({
          type: 'error',
          text: 'Google Client ID must end with .apps.googleusercontent.com'
        });
      } else {
        setStatusMsg({
          type: 'success',
          text: t('testSuccessToast', 'OAuth configuration validated successfully!')
        });
      }
      setTimeout(() => setStatusMsg(null), 5000);
    }, 600);
  };

  const googleCallbackUrl = `${computedOrigin}/api/auth/callback/google`;
  const facebookCallbackUrl = `${computedOrigin}/api/auth/callback/facebook`;
  const appleCallbackUrl = `${computedOrigin}/api/auth/callback/apple`;

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Link 
            href="/admin" 
            className="inline-flex items-center gap-1.5 text-xs font-bold hover:underline mb-2"
            style={{ color: 'var(--color-primary, #E05638)' }}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>{t('backToAdmin', 'Back to Admin Settings')}</span>
          </Link>
          <h1 
            className="text-2xl sm:text-3xl font-black tracking-tight"
            style={{ color: isDayMode ? '#0f172a' : 'var(--color-text, #ffffff)' }}
          >
            {t('socialLoginTitle', 'Social Login Settings')}
          </h1>
          <p 
            className="text-xs sm:text-sm mt-1"
            style={{ color: isDayMode ? '#64748b' : 'var(--color-text-secondary, #94a3b8)' }}
          >
            {t('socialLoginSubtitle', 'Configure OAuth 2.0 authentication providers, client credentials, and callback endpoints.')}
          </p>
        </div>

        <button 
          type="button"
          onClick={handleSave}
          disabled={saving || loading}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white shadow-lg transition cursor-pointer disabled:opacity-50"
          style={{ backgroundColor: 'var(--color-primary, #E05638)' }}
        >
          {saving ? (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <ShieldCheck className="h-4 w-4" />
          )}
          <span>{saving ? (t('savingSocialSettings', 'Saving Settings...')) : (t('saveSocialSettingsBtn', 'Save Social Login Settings'))}</span>
        </button>
      </div>

      {/* Status Alerts */}
      {statusMsg && (
        <div 
          className="p-3.5 border rounded-2xl text-xs font-semibold flex items-center gap-2.5 shadow-xs transition-colors duration-200"
          style={{
            backgroundColor: statusMsg.type === 'success' 
              ? (isDayMode ? '#ecfdf5' : 'rgba(16, 185, 129, 0.2)') 
              : (isDayMode ? '#fef2f2' : 'rgba(127, 29, 29, 0.3)'),
            borderColor: statusMsg.type === 'success' ? 'var(--color-emerald, #10b981)' : '#ef4444',
            color: statusMsg.type === 'success' ? (isDayMode ? '#047857' : 'var(--color-emerald, #10b981)') : '#ef4444'
          }}
        >
          {statusMsg.type === 'success' ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
          <span>{statusMsg.text}</span>
        </div>
      )}

      {/* Provider 1: Google Identity Services */}
      <div 
        className="border rounded-2xl p-5 sm:p-6 shadow-md transition-colors duration-200 space-y-4"
        style={{
          backgroundColor: isDayMode ? '#ffffff' : 'var(--color-card, #0b0f17)',
          borderColor: isDayMode ? '#e2e8f0' : 'var(--color-border, #1e293b)'
        }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl border" style={{ borderColor: isDayMode ? '#e2e8f0' : 'var(--color-border, #1e293b)' }}>
              <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"/>
                <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"/>
                <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.98 0 12s.45 3.82 1.25 5.42l4.03-3.15z"/>
                <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"/>
              </svg>
            </div>
            <div>
              <h2 className="text-sm font-bold" style={{ color: isDayMode ? '#0f172a' : '#ffffff' }}>
                {t('googleProviderTitle', 'Google Identity Services')}
              </h2>
              <p className="text-[11px]" style={{ color: isDayMode ? '#64748b' : '#94a3b8' }}>
                {t('googleProviderDesc', 'Allow users to sign in with their Google accounts using OAuth 2.0.')}
              </p>
            </div>
          </div>

          <label className="relative inline-flex items-center cursor-pointer">
            <input 
              type="checkbox" 
              checked={settings.googleEnabled}
              onChange={(e) => setSettings({ ...settings, googleEnabled: e.target.checked })}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer dark:bg-slate-800 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[var(--color-primary,#E05638)]"></div>
          </label>
        </div>

        {/* Form Fields */}
        <div className="grid gap-3.5 pt-2">
          {/* Client ID */}
          <div>
            <label className="block text-xs font-bold mb-1" style={{ color: isDayMode ? '#334155' : '#cbd5e1' }}>
              {t('clientIdLabel', 'Client ID')}
            </label>
            <input 
              type="text"
              autoComplete="new-password"
              data-lpignore="true"
              data-form-type="other"
              value={settings.googleClientId}
              onChange={(e) => setSettings({ ...settings, googleClientId: e.target.value })}
              placeholder={t('clientIdPlaceholder', 'Enter OAuth Client ID (e.g. ...apps.googleusercontent.com)')}
              className="w-full text-xs font-mono border rounded-xl px-3 py-2.5 outline-none transition"
              style={{
                backgroundColor: isDayMode ? '#f8fafc' : 'var(--color-inner-dark, #070b13)',
                borderColor: isDayMode ? '#cbd5e1' : 'var(--color-border, #1e293b)',
                color: isDayMode ? '#0f172a' : '#ffffff'
              }}
            />
          </div>

          {/* Client Secret */}
          <div>
            <label className="block text-xs font-bold mb-1" style={{ color: isDayMode ? '#334155' : '#cbd5e1' }}>
              {t('clientSecretLabel', 'Client Secret')}
            </label>
            <div className="relative">
              <input 
                type={showSecrets['google'] ? 'text' : 'password'}
                autoComplete="new-password"
                data-lpignore="true"
                data-form-type="other"
                value={settings.googleClientSecret}
                onChange={(e) => setSettings({ ...settings, googleClientSecret: e.target.value })}
                placeholder={t('clientSecretPlaceholder', 'Enter OAuth Client Secret (e.g. GOCSPX-...)')}
                className="w-full text-xs font-mono border rounded-xl pl-3 pr-10 py-2.5 outline-none transition"
                style={{
                  backgroundColor: isDayMode ? '#f8fafc' : 'var(--color-inner-dark, #070b13)',
                  borderColor: isDayMode ? '#cbd5e1' : 'var(--color-border, #1e293b)',
                  color: isDayMode ? '#0f172a' : '#ffffff'
                }}
              />
              <button 
                type="button"
                onClick={() => toggleSecret('google')}
                className="absolute right-3 top-2.5 cursor-pointer hover:opacity-80 transition"
                style={{ color: isDayMode ? '#64748b' : '#94a3b8' }}
              >
                {showSecrets['google'] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Authorized Callback URL Display */}
          <div>
            <label className="block text-xs font-bold mb-1" style={{ color: isDayMode ? '#334155' : '#cbd5e1' }}>
              {t('callbackUrlLabel', 'Authorized Redirect URI (Callback URL)')}
            </label>
            <div className="flex items-center gap-2">
              <input 
                type="text"
                readOnly
                value={googleCallbackUrl}
                className="w-full text-xs font-mono border rounded-xl px-3 py-2 outline-none select-all"
                style={{
                  backgroundColor: isDayMode ? '#f1f5f9' : 'var(--color-inner-dark, #070b13)',
                  borderColor: isDayMode ? '#cbd5e1' : 'var(--color-border, #1e293b)',
                  color: isDayMode ? '#475569' : '#94a3b8'
                }}
              />
              <button 
                type="button"
                onClick={() => handleCopy(googleCallbackUrl, 'google_cb')}
                className="inline-flex items-center gap-1.5 px-3 py-2 border rounded-xl text-xs font-bold hover:opacity-80 transition cursor-pointer shrink-0"
                style={{
                  backgroundColor: isDayMode ? '#f8fafc' : 'var(--color-inner-dark, #070b13)',
                  borderColor: isDayMode ? '#cbd5e1' : 'var(--color-border, #1e293b)',
                  color: isDayMode ? '#0f172a' : '#ffffff'
                }}
              >
                {copiedKey === 'google_cb' ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{copiedKey === 'google_cb' ? 'Copied' : (t('copyCallbackUrlBtn', 'Copy URL'))}</span>
              </button>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-1">
            <button 
              type="button"
              onClick={handleTestGoogle}
              disabled={testing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-xs font-bold hover:opacity-85 transition cursor-pointer"
              style={{
                borderColor: isDayMode ? '#cbd5e1' : 'var(--color-border, #1e293b)',
                color: isDayMode ? '#334155' : '#cbd5e1'
              }}
            >
              <RefreshCw className={`h-3 w-3 ${testing ? 'animate-spin' : ''}`} />
              <span>{testing ? (t('testingConnection', 'Testing...')) : (t('testConnectionBtn', 'Test Connection'))}</span>
            </button>

            <span 
              className="text-[11px] font-bold px-2 py-0.5 rounded-md"
              style={{
                backgroundColor: settings.googleEnabled && settings.googleClientId 
                  ? 'rgba(16, 185, 129, 0.15)' 
                  : (settings.googleEnabled ? 'rgba(234, 179, 8, 0.15)' : 'rgba(148, 163, 184, 0.15)'),
                color: settings.googleEnabled && settings.googleClientId 
                  ? 'var(--color-emerald, #10b981)' 
                  : (settings.googleEnabled ? '#eab308' : '#94a3b8')
              }}
            >
              {settings.googleEnabled && settings.googleClientId 
                ? (t('statusConfigured', 'Configured & Active')) 
                : (settings.googleEnabled ? (t('statusIncomplete', 'Credentials Incomplete')) : (t('statusDisabled', 'Disabled')))}
            </span>
          </div>
        </div>
      </div>

      {/* Provider 2: Facebook Login */}
      <div 
        className="border rounded-2xl p-5 sm:p-6 shadow-md transition-colors duration-200 space-y-4"
        style={{
          backgroundColor: isDayMode ? '#ffffff' : 'var(--color-card, #0b0f17)',
          borderColor: isDayMode ? '#e2e8f0' : 'var(--color-border, #1e293b)'
        }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl border" style={{ borderColor: isDayMode ? '#e2e8f0' : 'var(--color-border, #1e293b)' }}>
              <svg className="w-5 h-5 text-[#1877F2] fill-current shrink-0" viewBox="0 0 24 24">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
              </svg>
            </div>
            <div>
              <h2 className="text-sm font-bold" style={{ color: isDayMode ? '#0f172a' : '#ffffff' }}>
                {t('facebookProviderTitle', 'Facebook Login (Meta Graph)')}
              </h2>
              <p className="text-[11px]" style={{ color: isDayMode ? '#64748b' : '#94a3b8' }}>
                {t('facebookProviderDesc', 'Allow users to sign in with their Facebook profiles via Meta Graph API.')}
              </p>
            </div>
          </div>

          <label className="relative inline-flex items-center cursor-pointer">
            <input 
              type="checkbox" 
              checked={settings.facebookEnabled}
              onChange={(e) => setSettings({ ...settings, facebookEnabled: e.target.checked })}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer dark:bg-slate-800 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[var(--color-primary,#E05638)]"></div>
          </label>
        </div>

        <div className="grid gap-3.5 pt-2">
          <div>
            <label className="block text-xs font-bold mb-1" style={{ color: isDayMode ? '#334155' : '#cbd5e1' }}>
              {t('facebookAppIdLabel', 'Facebook App ID')}
            </label>
            <input 
              type="text"
              autoComplete="new-password"
              data-lpignore="true"
              value={settings.facebookAppId}
              onChange={(e) => setSettings({ ...settings, facebookAppId: e.target.value })}
              placeholder={t('facebookAppIdPlaceholder', 'Enter Facebook App ID...')}
              className="w-full text-xs font-mono border rounded-xl px-3 py-2 outline-none"
              style={{
                backgroundColor: isDayMode ? '#f8fafc' : 'var(--color-inner-dark, #070b13)',
                borderColor: isDayMode ? '#cbd5e1' : 'var(--color-border, #1e293b)',
                color: isDayMode ? '#0f172a' : '#ffffff'
              }}
            />
          </div>

          <div>
            <label className="block text-xs font-bold mb-1" style={{ color: isDayMode ? '#334155' : '#cbd5e1' }}>
              {t('facebookAppSecretLabel', 'Facebook App Secret')}
            </label>
            <div className="relative">
              <input 
                type={showSecrets['fb'] ? 'text' : 'password'}
                autoComplete="new-password"
                data-lpignore="true"
                value={settings.facebookAppSecret}
                onChange={(e) => setSettings({ ...settings, facebookAppSecret: e.target.value })}
                placeholder={t('facebookAppSecretPlaceholder', 'Enter Facebook App Secret...')}
                className="w-full text-xs font-mono border rounded-xl pl-3 pr-10 py-2 outline-none"
                style={{
                  backgroundColor: isDayMode ? '#f8fafc' : 'var(--color-inner-dark, #070b13)',
                  borderColor: isDayMode ? '#cbd5e1' : 'var(--color-border, #1e293b)',
                  color: isDayMode ? '#0f172a' : '#ffffff'
                }}
              />
              <button 
                type="button"
                onClick={() => toggleSecret('fb')}
                className="absolute right-3 top-2 cursor-pointer hover:opacity-80 transition"
                style={{ color: isDayMode ? '#64748b' : '#94a3b8' }}
              >
                {showSecrets['fb'] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold mb-1" style={{ color: isDayMode ? '#334155' : '#cbd5e1' }}>
              {t('callbackUrlLabel', 'Authorized Redirect URI (Callback URL)')}
            </label>
            <div className="flex items-center gap-2">
              <input 
                type="text"
                readOnly
                value={facebookCallbackUrl}
                className="w-full text-xs font-mono border rounded-xl px-3 py-2 outline-none select-all"
                style={{
                  backgroundColor: isDayMode ? '#f1f5f9' : 'var(--color-inner-dark, #070b13)',
                  borderColor: isDayMode ? '#cbd5e1' : 'var(--color-border, #1e293b)',
                  color: isDayMode ? '#475569' : '#94a3b8'
                }}
              />
              <button 
                type="button"
                onClick={() => handleCopy(facebookCallbackUrl, 'fb_cb')}
                className="inline-flex items-center gap-1.5 px-3 py-2 border rounded-xl text-xs font-bold hover:opacity-80 transition cursor-pointer shrink-0"
                style={{
                  backgroundColor: isDayMode ? '#f8fafc' : 'var(--color-inner-dark, #070b13)',
                  borderColor: isDayMode ? '#cbd5e1' : 'var(--color-border, #1e293b)',
                  color: isDayMode ? '#0f172a' : '#ffffff'
                }}
              >
                {copiedKey === 'fb_cb' ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{copiedKey === 'fb_cb' ? 'Copied' : (t('copyCallbackUrlBtn', 'Copy URL'))}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Provider 3: Sign in with Apple */}
      <div 
        className="border rounded-2xl p-5 sm:p-6 shadow-md transition-colors duration-200 space-y-4"
        style={{
          backgroundColor: isDayMode ? '#ffffff' : 'var(--color-card, #0b0f17)',
          borderColor: isDayMode ? '#e2e8f0' : 'var(--color-border, #1e293b)'
        }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl border" style={{ borderColor: isDayMode ? '#e2e8f0' : 'var(--color-border, #1e293b)' }}>
              <svg className="w-5 h-5 fill-current shrink-0" viewBox="0 0 24 24" style={{ color: isDayMode ? '#0f172a' : '#ffffff' }}>
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.37c.62-.75 1.04-1.8 0.92-2.85-.9.04-2 0.6-2.65 1.35-.58.66-1.09 1.73-.95 2.76.99.08 2.05-.51 2.68-1.26z" />
              </svg>
            </div>
            <div>
              <h2 className="text-sm font-bold" style={{ color: isDayMode ? '#0f172a' : '#ffffff' }}>
                {t('appleProviderTitle', 'Sign in with Apple')}
              </h2>
              <p className="text-[11px]" style={{ color: isDayMode ? '#64748b' : '#94a3b8' }}>
                {t('appleProviderDesc', 'Enable Apple ID authentication with private email relay support.')}
              </p>
            </div>
          </div>

          <label className="relative inline-flex items-center cursor-pointer">
            <input 
              type="checkbox" 
              checked={settings.appleEnabled}
              onChange={(e) => setSettings({ ...settings, appleEnabled: e.target.checked })}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer dark:bg-slate-800 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[var(--color-primary,#E05638)]"></div>
          </label>
        </div>

        <div className="grid gap-3.5 pt-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold mb-1" style={{ color: isDayMode ? '#334155' : '#cbd5e1' }}>
                {t('appleTeamIdLabel', 'Apple Team ID')}
              </label>
              <input 
                type="text"
                autoComplete="new-password"
                data-lpignore="true"
                value={settings.appleTeamId}
                onChange={(e) => setSettings({ ...settings, appleTeamId: e.target.value })}
                placeholder={t('appleTeamIdPlaceholder', '10-character Team ID')}
                className="w-full text-xs font-mono border rounded-xl px-3 py-2 outline-none"
                style={{
                  backgroundColor: isDayMode ? '#f8fafc' : 'var(--color-inner-dark, #070b13)',
                  borderColor: isDayMode ? '#cbd5e1' : 'var(--color-border, #1e293b)',
                  color: isDayMode ? '#0f172a' : '#ffffff'
                }}
              />
            </div>

            <div>
              <label className="block text-xs font-bold mb-1" style={{ color: isDayMode ? '#334155' : '#cbd5e1' }}>
                {t('appleKeyIdLabel', 'Apple Key ID')}
              </label>
              <input 
                type="text"
                autoComplete="new-password"
                data-lpignore="true"
                value={settings.appleKeyId}
                onChange={(e) => setSettings({ ...settings, appleKeyId: e.target.value })}
                placeholder={t('appleKeyIdPlaceholder', '10-character Key ID')}
                className="w-full text-xs font-mono border rounded-xl px-3 py-2 outline-none"
                style={{
                  backgroundColor: isDayMode ? '#f8fafc' : 'var(--color-inner-dark, #070b13)',
                  borderColor: isDayMode ? '#cbd5e1' : 'var(--color-border, #1e293b)',
                  color: isDayMode ? '#0f172a' : '#ffffff'
                }}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold mb-1" style={{ color: isDayMode ? '#334155' : '#cbd5e1' }}>
              {t('applePrivateKeyLabel', 'Apple Private Key (.p8)')}
            </label>
            <textarea 
              rows={3}
              autoComplete="new-password"
              data-lpignore="true"
              value={settings.applePrivateKey}
              onChange={(e) => setSettings({ ...settings, applePrivateKey: e.target.value })}
              placeholder={t('applePrivateKeyPlaceholder', '-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----')}
              className="w-full text-xs font-mono border rounded-xl px-3 py-2 outline-none resize-none"
              style={{
                backgroundColor: isDayMode ? '#f8fafc' : 'var(--color-inner-dark, #070b13)',
                borderColor: isDayMode ? '#cbd5e1' : 'var(--color-border, #1e293b)',
                color: isDayMode ? '#0f172a' : '#ffffff'
              }}
            />
          </div>

          <div>
            <label className="block text-xs font-bold mb-1" style={{ color: isDayMode ? '#334155' : '#cbd5e1' }}>
              {t('callbackUrlLabel', 'Authorized Redirect URI (Callback URL)')}
            </label>
            <div className="flex items-center gap-2">
              <input 
                type="text"
                readOnly
                value={appleCallbackUrl}
                className="w-full text-xs font-mono border rounded-xl px-3 py-2 outline-none select-all"
                style={{
                  backgroundColor: isDayMode ? '#f1f5f9' : 'var(--color-inner-dark, #070b13)',
                  borderColor: isDayMode ? '#cbd5e1' : 'var(--color-border, #1e293b)',
                  color: isDayMode ? '#475569' : '#94a3b8'
                }}
              />
              <button 
                type="button"
                onClick={() => handleCopy(appleCallbackUrl, 'apple_cb')}
                className="inline-flex items-center gap-1.5 px-3 py-2 border rounded-xl text-xs font-bold hover:opacity-80 transition cursor-pointer shrink-0"
                style={{
                  backgroundColor: isDayMode ? '#f8fafc' : 'var(--color-inner-dark, #070b13)',
                  borderColor: isDayMode ? '#cbd5e1' : 'var(--color-border, #1e293b)',
                  color: isDayMode ? '#0f172a' : '#ffffff'
                }}
              >
                {copiedKey === 'apple_cb' ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{copiedKey === 'apple_cb' ? 'Copied' : (t('copyCallbackUrlBtn', 'Copy URL'))}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SocialLoginSettingPage() {
  return (
    <div className="min-h-screen px-4 py-8 sm:px-6 lg:px-8 transition-colors duration-200">
      <Suspense fallback={
        <div className="flex items-center justify-center min-h-[50vh]">
          <div 
            className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin"
            style={{ borderColor: 'var(--color-primary, #E05638)', borderTopColor: 'transparent' }}
          />
        </div>
      }>
        <SocialLoginSettingContent />
      </Suspense>
    </div>
  );
}
