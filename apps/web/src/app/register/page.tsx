'use client';

// Generated / Updated by AI Collaborator

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  UserPlus, Mail, Lock, User as UserIcon, ArrowLeft, ArrowRight,
  CheckCircle2, AlertCircle, Eye, EyeOff, Sparkles, RefreshCw
} from 'lucide-react';
import { 
  initAuthStorage, getCurrentUser, setCurrentUser, 
  syncSessionCookie, isSessionCookieValid, checkServerSession, DEFAULT_USERS, User 
} from '@/lib/auth';
import { useTranslation } from '@/components/LanguageProvider';

// Safe default subscription tier helper
const getDefaultSubscriptionPlan = () => 'free';

export default function RegisterPage() {
  const router = useRouter();
  const { t } = useTranslation();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isDayMode, setIsDayMode] = useState(false);

  // Synchronize entire page & body background with Day/Night mode
  const applySavedTheme = useCallback(() => {
    try {
      const mode = typeof window !== 'undefined' ? localStorage.getItem('zecratary_theme_mode') : null;
      const isDay = mode === 'light' || mode === 'day';
      setIsDayMode(isDay);

      const root = document.documentElement;
      if (isDay) {
        root.classList.remove('dark');
        root.classList.add('light');
        if (typeof document !== 'undefined' && document.body) {
          document.body.style.color = '#0f172a';
        }
      } else {
        root.classList.remove('light');
        root.classList.add('dark');
        if (typeof document !== 'undefined' && document.body) {
          document.body.style.color = '';
        }
      }
    } catch (_) {}
  }, []);

  useEffect(() => {
    applySavedTheme();
    initAuthStorage();

    // Prevent redirect loop if already authenticated
    if (typeof window !== 'undefined') {
      const active = getCurrentUser();
      const validCookie = isSessionCookieValid();
      if (active && validCookie) {
        checkServerSession().then((r) => {
          if (r === 'valid') window.location.replace(active.role === 'admin' ? '/admin' : '/profile');
        });
        return;
      }
    }

    window.addEventListener('zecratary_theme_mode_changed', applySavedTheme);
    window.addEventListener('zecratary_theme_changed', applySavedTheme);
    window.addEventListener('storage', applySavedTheme);
    return () => {
      window.removeEventListener('zecratary_theme_mode_changed', applySavedTheme);
      window.removeEventListener('zecratary_theme_changed', applySavedTheme);
      window.removeEventListener('storage', applySavedTheme);
      if (typeof document !== 'undefined' && document.body) {
        document.body.style.color = '';
      }
    };
  }, [applySavedTheme]);

  const handleRegister = async (e?: React.FormEvent | React.KeyboardEvent | React.MouseEvent) => {
    if (e && 'preventDefault' in e) e.preventDefault();
    setError('');

    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();
    const cleanPass = password.trim();

    if (!cleanName || !cleanEmail || !cleanPass) {
      setError(t('fillAllFields', 'Please fill in all required fields.'));
      return;
    }

    if (cleanPass.length < 8) {
      setError(t('passwordMinLength', 'Password must be at least 8 characters.'));
      return;
    }

    if (cleanPass !== confirmPassword.trim()) {
      setError(t('passwordsDoNotMatch', 'Passwords do not match.'));
      return;
    }

    if (!agreeTerms) {
      setError(t('agreeTermsPrompt', 'Please agree to the Terms of Service and Privacy Policy.'));
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: cleanName, email: cleanEmail, password: cleanPass })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        setError(data.error || t('registrationFailed', 'Registration failed. Please try again.'));
        setLoading(false);
        return;
      }

      // The server owns the account; the browser keeps only the safe profile (no password).
      setCurrentUser(data.user);
      syncSessionCookie(data.user);

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('zecratary_auth_changed'));
        window.dispatchEvent(new Event('zecratary_users_updated'));
      }

      window.location.replace('/profile');
    } catch (err: any) {
      setError(err.message || 'Registration failed. Please try again.');
      setLoading(false);
    }
  };

  // Color tokens aligned with /manual, /profile and /planner Day Mode
  const cPageBg = isDayMode ? '#f8fafc' : 'var(--color-bg, #070b13)';
  const cCardBg = isDayMode ? '#ffffff' : 'var(--color-card, #0b0f17)';
  const cInputBg = isDayMode ? '#f8fafc' : '#070b13';
  const cBorder = isDayMode ? '#cbd5e1' : 'var(--color-border, #1e293b)';
  const cText = isDayMode ? '#0f172a' : 'var(--color-text, #ffffff)';
  const cSubText = isDayMode ? '#64748b' : 'var(--color-text-secondary, #94a3b8)';
  const cLabel = isDayMode ? '#334155' : '#cbd5e1';

  return (
    <div 
      className="w-full min-h-[90vh] flex items-center justify-center px-4 py-10 font-sans transition-colors duration-200"
      style={{ backgroundColor: cPageBg, color: cText }}
    >
      <div 
        className="w-full max-w-md border rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl transition-colors duration-200"
        style={{
          backgroundColor: cCardBg,
          borderColor: isDayMode ? '#e2e8f0' : '#1e293b'
        }}
      >
        <div className="space-y-1.5 text-center">
          <div 
            className="inline-flex items-center justify-center w-12 h-12 rounded-2xl mb-2 border shadow-inner"
            style={{
              backgroundColor: cInputBg,
              borderColor: cBorder,
              color: 'var(--color-primary, #E05638)'
            }}
          >
            <UserPlus className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-black tracking-tight" style={{ color: cText }}>
            {t('createYourAccount', 'Create Your Account')}
          </h1>
          <p className="text-xs" style={{ color: cSubText }}>
            {t('registerSubtitle', 'Join Zecratary to start planning, saving, and organizing recipes.')}
          </p>
        </div>

        {error && (
          <div 
            className={`p-3.5 border rounded-2xl text-xs font-semibold flex items-center gap-2 shadow-md animate-in fade-in ${
              isDayMode ? 'bg-red-50 border-red-300 text-red-800' : 'bg-red-950/40 border-red-800/80 text-red-300'
            }`}
          >
            <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
            <span>{error}</span>
          </div>
        )}

        {/* REGISTRATION CONTAINER (NO NATIVE FORM) */}
        <div className="space-y-4 text-xs">
          <div>
            <label className="block font-bold mb-1.5" style={{ color: cLabel }}>
              {t('fullNameLabel', 'Full Name')}
            </label>
            <div className="relative">
              <UserIcon className="h-4 w-4 absolute left-3.5 top-3 text-slate-500" />
              <input 
                type="text" 
                required 
                value={name} 
                onChange={e => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleRegister();
                  }
                }}
                placeholder="Marcus Vance"
                className="w-full border rounded-xl pl-10 pr-3.5 py-2.5 outline-none font-medium transition shadow-inner"
                style={{
                  backgroundColor: cInputBg,
                  borderColor: cBorder,
                  color: cText
                }}
              />
            </div>
          </div>

          <div>
            <label className="block font-bold mb-1.5" style={{ color: cLabel }}>
              {t('emailAddressLabel', 'Email Address')}
            </label>
            <div className="relative">
              <Mail className="h-4 w-4 absolute left-3.5 top-3 text-slate-500" />
              <input 
                type="email" 
                required 
                value={email} 
                onChange={e => setEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleRegister();
                  }
                }}
                placeholder="name@example.com"
                className="w-full border rounded-xl pl-10 pr-3.5 py-2.5 outline-none font-mono transition shadow-inner"
                style={{
                  backgroundColor: cInputBg,
                  borderColor: cBorder,
                  color: cText
                }}
              />
            </div>
          </div>

          <div>
            <label className="block font-bold mb-1.5" style={{ color: cLabel }}>
              {t('passwordLabel', 'Password')}
            </label>
            <div className="relative">
              <Lock className="h-4 w-4 absolute left-3.5 top-3 text-slate-500" />
              <input 
                type={showPassword ? 'text' : 'password'} 
                required 
                value={password} 
                onChange={e => setPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleRegister();
                  }
                }}
                placeholder="Min. 6 characters"
                className="w-full border rounded-xl pl-10 pr-10 py-2.5 outline-none transition shadow-inner"
                style={{
                  backgroundColor: cInputBg,
                  borderColor: cBorder,
                  color: cText
                }}
              />
              <button 
                type="button" 
                onClick={() => setShowPassword(!showPassword)} 
                className="absolute right-3 top-3 text-slate-500 hover:text-slate-300 cursor-pointer"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block font-bold mb-1.5" style={{ color: cLabel }}>
              {t('confirmPasswordLabel', 'Confirm Password')}
            </label>
            <div className="relative">
              <Lock className="h-4 w-4 absolute left-3.5 top-3 text-slate-500" />
              <input 
                type={showPassword ? 'text' : 'password'} 
                required 
                value={confirmPassword} 
                onChange={e => setConfirmPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleRegister();
                  }
                }}
                placeholder="Repeat password"
                className="w-full border rounded-xl pl-10 pr-3.5 py-2.5 outline-none transition shadow-inner"
                style={{
                  backgroundColor: cInputBg,
                  borderColor: cBorder,
                  color: cText
                }}
              />
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input 
              type="checkbox" 
              id="terms" 
              checked={agreeTerms} 
              onChange={e => setAgreeTerms(e.target.checked)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleRegister();
                }
              }}
              className="w-4 h-4 rounded accent-[var(--color-primary,#E05638)] cursor-pointer"
            />
            <label htmlFor="terms" className="text-[11px] cursor-pointer" style={{ color: cSubText }}>
              {t('agreeTermsPrefix', 'I agree to the')}{' '}
              <span className="underline hover:opacity-80">{t('termsOfService', 'Terms of Service')}</span>{' '}
              {t('and', 'and')}{' '}
              <span className="underline hover:opacity-80">{t('privacyPolicy', 'Privacy Policy')}</span>
            </label>
          </div>

          <button
            type="button" 
            onClick={() => handleRegister()}
            disabled={loading}
            className="w-full py-3 mt-2 text-white font-extrabold rounded-xl shadow-lg transition flex items-center justify-center gap-2 cursor-pointer hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: 'var(--color-primary, #E05638)' }}
          >
            {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
            {t('createFreeAccount', 'Create Free Account')}
          </button>
        </div>

        <div className="text-center pt-2 border-t text-xs" style={{ borderColor: isDayMode ? '#e2e8f0' : '#1e293b' }}>
          <span style={{ color: cSubText }}>{t('alreadyHaveAccount', 'Already have an account?')} </span>
          <Link href="/login" className="font-bold hover:underline" style={{ color: 'var(--color-primary, #E05638)' }}>
            {t('signIn', 'Sign in')}
          </Link>
        </div>
      </div>
    </div>
  );
}
