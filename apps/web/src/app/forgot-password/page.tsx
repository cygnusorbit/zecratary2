'use client';

// Generated / Updated by AI Collaborator

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  Mail, Key, CheckCircle2, AlertCircle, ArrowLeft, Loader2,
  Lock, Eye, EyeOff, ShieldCheck, Check, RefreshCw
} from 'lucide-react';
import { getCurrentUser, initAuthStorage, User, DEFAULT_USERS } from '@/lib/auth';
import { useTranslation } from '@/components/LanguageProvider';

export default function ForgotPasswordPage() {
  const router = useRouter();
  const { t } = useTranslation();

  const [step, setStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState('');
  const [tokenInput, setTokenInput] = useState('');
  const [generatedToken, setGeneratedToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isDayMode, setIsDayMode] = useState(false);

  // Synchronize entire viewport body background to eliminate dark borders
  const applySavedTheme = useCallback(() => {
    try {
      const mode = typeof window !== 'undefined' ? localStorage.getItem('zecratary_theme_mode') : null;
      const isDay = mode === 'light';
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

    const active = getCurrentUser();
    if (active) {
      router.replace(active.role === 'admin' ? '/admin' : '/profile');
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
  }, [router, applySavedTheme]);

  const handleRequestToken = async (e?: React.FormEvent | React.KeyboardEvent | React.MouseEvent) => {
    if (e && 'preventDefault' in e) e.preventDefault();
    setError('');
    setSuccess('');

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setError(t('invalidEmailPrompt', 'Please provide a valid email address.'));
      return;
    }

    // No email service is configured: the administrator sets a temporary password.
    setSuccess(t('contactAdminForReset', 'Password resets are handled by the administrator. Please contact them and ask for a temporary password, then sign in and change it in your profile.'));
  };

  const handleResetPassword = async (e?: React.FormEvent | React.KeyboardEvent | React.MouseEvent) => {
    if (e && 'preventDefault' in e) e.preventDefault();
    setError('');
    setSuccess(t('contactAdminForReset', 'Password resets are handled by the administrator. Please contact them and ask for a temporary password, then sign in and change it in your profile.'));
  };

  const cPageBg = isDayMode ? '#f8fafc' : 'var(--color-bg, #070b13)';
  const cCardBg = isDayMode ? '#ffffff' : 'var(--color-card, #0b0f17)';
  const cInputBg = isDayMode ? '#f8fafc' : '#070b13';
  const cBorder = isDayMode ? '#cbd5e1' : 'var(--color-border, #1e293b)';
  const cText = isDayMode ? '#0f172a' : 'var(--color-text, #ffffff)';
  const cSubText = isDayMode ? '#64748b' : 'var(--color-text-secondary, #94a3b8)';
  const cLabel = isDayMode ? '#334155' : '#cbd5e1';

  return (
    <div 
      className="w-full min-h-screen flex items-center justify-center px-4 py-12 font-sans transition-colors duration-200"
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
            <Key className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-black tracking-tight" style={{ color: cText }}>
            {step === 1 
              ? (t('passwordRecoveryTitle', 'Password Recovery')) 
              : (t('createNewPasswordTitle', 'Create New Password'))}
          </h1>
          <p className="text-xs" style={{ color: cSubText }}>
            {step === 1 
              ? (t('enterEmailTokenPrompt', 'Enter your registered email to generate a secure reset token.')) 
              : (t('enterCodeNewPasswordPrompt', 'Enter the code and create a new password for {email}')).replace('{email}', email)}
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

        {success && (
          <div 
            className={`p-3.5 border rounded-2xl text-xs font-semibold flex items-center gap-2 shadow-md animate-in fade-in ${
              isDayMode ? 'bg-emerald-50 border-emerald-300 text-emerald-800' : 'bg-emerald-950/40 border-emerald-500/50 text-emerald-300'
            }`}
          >
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
            <span>{success}</span>
          </div>
        )}

        {/* STEP 1: REQUEST CODE CONTAINER (NO NATIVE FORM) */}
        {step === 1 ? (
          <div className="space-y-4 text-xs">
            <div>
              <label className="block font-bold mb-1.5" style={{ color: cLabel }}>
                {t('emailAddressLabel', 'Email Address')} *
              </label>
              <div className="relative">
                <Mail className="h-4 w-4 absolute left-3.5 top-3 text-slate-500" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleRequestToken();
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

            <button
              type="button"
              onClick={() => handleRequestToken()}
              disabled={loading}
              className="w-full py-3 mt-2 text-white font-extrabold rounded-xl shadow-lg transition flex items-center justify-center gap-2 cursor-pointer hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: 'var(--color-primary, #E05638)' }}
            >
              {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              {t('sendResetCodeBtn', 'Send Reset Code')}
            </button>
          </div>
        ) : (
          /* STEP 2: RESET PASSWORD CONTAINER (NO NATIVE FORM) */
          <div className="space-y-3.5 text-xs">
            <div>
              <label className="block font-bold mb-1" style={{ color: cLabel }}>
                {t('securityCodeLabel', '6-Digit Security Code')} *
              </label>
              <input
                type="text"
                required
                maxLength={6}
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleResetPassword();
                  }
                }}
                placeholder="123456"
                className="w-full border rounded-xl px-3.5 py-2.5 outline-none font-mono font-bold tracking-widest text-center text-sm transition shadow-inner"
                style={{
                  backgroundColor: cInputBg,
                  borderColor: cBorder,
                  color: cText
                }}
              />
            </div>

            <div>
              <label className="block font-bold mb-1" style={{ color: cLabel }}>
                {t('newPasswordLabel', 'New Password')} *
              </label>
              <div className="relative">
                <Lock className="h-4 w-4 absolute left-3.5 top-3 text-slate-500" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleResetPassword();
                    }
                  }}
                  placeholder={t('passwordMinLengthPlaceholder', 'At least 6 characters')}
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
              <label className="block font-bold mb-1" style={{ color: cLabel }}>
                {t('confirmNewPasswordLabel', 'Confirm New Password')} *
              </label>
              <div className="relative">
                <Lock className="h-4 w-4 absolute left-3.5 top-3 text-slate-500" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleResetPassword();
                    }
                  }}
                  placeholder={t('repeatNewPasswordPlaceholder', 'Repeat new password')}
                  className="w-full border rounded-xl pl-10 pr-3.5 py-2.5 outline-none transition shadow-inner"
                  style={{
                    backgroundColor: cInputBg,
                    borderColor: cBorder,
                    color: cText
                  }}
                />
              </div>
            </div>

            <button
              type="button"
              onClick={() => handleResetPassword()}
              disabled={loading}
              className="w-full py-3 mt-2 text-white font-extrabold rounded-xl shadow-lg transition flex items-center justify-center gap-2 cursor-pointer hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: 'var(--color-primary, #E05638)' }}
            >
              {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {t('setNewPasswordBtn', 'Set New Password')}
            </button>

            <button
              type="button"
              onClick={() => setStep(1)}
              className="w-full py-2 text-slate-400 hover:text-slate-600 text-center font-bold text-[11px] cursor-pointer"
            >
              {t('resendDifferentEmail', 'Re-send to a different email')}
            </button>
          </div>
        )}

        <div className="text-center pt-2 border-t text-xs" style={{ borderColor: isDayMode ? '#e2e8f0' : '#1e293b' }}>
          <Link 
            href="/login" 
            className="font-bold inline-flex items-center gap-1.5 hover:underline"
            style={{ color: 'var(--color-primary, #E05638)' }}
          >
            <ArrowLeft className="h-3.5 w-3.5" /> {t('backToSignIn', 'Back to Sign In')}
          </Link>
        </div>
      </div>
    </div>
  );
}
