'use client';
// @ts-nocheck

import DynamicTokenIcon from '@/components/DynamicTokenIcon';
import React, { useState, useEffect, useCallback, useMemo, useRef, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { 
  User as UserIcon, Shield, Key, Mail, Lock, CheckCircle2, 
  AlertCircle, RefreshCw, Coins, Wallet, Layers, Activity, 
  Trash2, Save, ExternalLink, Search, ChevronLeft, ChevronRight,
  Sparkles, Check, X, ShieldAlert, ArrowUpRight
} from 'lucide-react';
import { getCurrentUser, initAuthStorage, logoutUser, User } from '@/lib/auth';
import { useTranslation } from '@/components/LanguageProvider';
import FontAwesomeIcon from '@/components/FontAwesomeIcon';

type SocialProvider = 'google' | 'facebook' | 'apple';

interface SocialAccountStatus {
  id: SocialProvider;
  name: string;
  unicode: string; // f1a0, f09a, f179
  brandColor: string;
}

// Exactly mapped to requested Font Awesome unicodes
const SOCIAL_PROVIDERS: SocialAccountStatus[] = [
  { id: 'google', name: 'Google', unicode: 'f1a0', brandColor: '#EA4335' },
  { id: 'facebook', name: 'Facebook', unicode: 'f09a', brandColor: '#1877F2' },
  { id: 'apple', name: 'Apple', unicode: 'f179', brandColor: 'var(--color-text)' }
];

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$', EUR: '€', GBP: '£', CAD: 'CA$', AUD: 'AU$', JPY: '¥', THB: '฿'
};

const detectUserSocialProviders = (u: any): SocialProvider[] => {
  if (!u) return [];
  const providers = new Set<SocialProvider>();

  const parseProviderList = (val: any) => {
    if (!val) return;
    if (Array.isArray(val)) {
      val.forEach((p: any) => {
        const low = String(p).toLowerCase().trim();
        if (low === 'google' || low === 'facebook' || low === 'apple') providers.add(low as SocialProvider);
      });
      return;
    }
    if (typeof val === 'string') {
      let str = val.trim();
      if (str.startsWith('{') && str.endsWith('}')) str = str.slice(1, -1);
      if (str.startsWith('[') && str.endsWith(']')) {
        try {
          const parsed = JSON.parse(str);
          if (Array.isArray(parsed)) {
            parsed.forEach((p: any) => {
              const low = String(p).toLowerCase().trim();
              if (low === 'google' || low === 'facebook' || low === 'apple') providers.add(low as SocialProvider);
            });
            return;
          }
        } catch (_) {}
      }
      str.split(',').forEach(item => {
        const clean = item.replace(/["'{}]/g, '').toLowerCase().trim();
        if (clean === 'google' || clean === 'facebook' || clean === 'apple') providers.add(clean as SocialProvider);
      });
    }
  };

  parseProviderList(u.linkedProviders);
  parseProviderList(u.linked_providers);

  const mainProv = String(
    u.provider || u.authProvider || u.auth_provider || 
    u.socialProvider || u.social_provider || 
    u.oauthProvider || u.oauth_provider || 
    u.loginMethod || u.login_method || ''
  ).toLowerCase();
  if (mainProv.includes('google')) providers.add('google');
  if (mainProv.includes('facebook')) providers.add('facebook');
  if (mainProv.includes('apple')) providers.add('apple');

  const uid = String(u.id || '').toLowerCase();
  if (uid.startsWith('usr_g_') || uid.startsWith('usr_goog') || uid.startsWith('g_') || uid.includes('google')) providers.add('google');
  if (uid.startsWith('usr_fb_') || uid.startsWith('usr_f_') || uid.startsWith('fb_') || uid.includes('facebook')) providers.add('facebook');
  if (uid.startsWith('usr_apple') || uid.startsWith('usr_a_') || uid.startsWith('apple_') || uid.includes('apple')) providers.add('apple');

  return Array.from(providers);
};

const getActiveLoginProvider = (u: any): SocialProvider | null => {
  if (!u) return null;
  const mainProv = String(
    u.provider || u.authProvider || u.auth_provider || 
    u.socialProvider || u.social_provider || 
    u.oauthProvider || u.oauth_provider || 
    u.loginMethod || u.login_method || ''
  ).toLowerCase();
  if (mainProv.includes('google')) return 'google';
  if (mainProv.includes('facebook')) return 'facebook';
  if (mainProv.includes('apple')) return 'apple';

  const uid = String(u.id || '').toLowerCase();
  if (uid.startsWith('usr_g_') || uid.startsWith('usr_goog') || uid.startsWith('g_') || uid.includes('google')) return 'google';
  if (uid.startsWith('usr_fb_') || uid.startsWith('usr_f_') || uid.startsWith('fb_') || uid.includes('facebook')) return 'facebook';
  if (uid.startsWith('usr_apple') || uid.startsWith('usr_a_') || uid.startsWith('apple_') || uid.includes('apple')) return 'apple';

  const detected = detectUserSocialProviders(u);
  if (detected.length > 0 && (!u.password || u.password === '')) {
    return detected[0];
  }
  return null;
};

function ProfileContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useTranslation();

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'tokens' | 'wallet'>('overview');

  // Form State (Autofill Safe)
  const [name, setName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [newPassword, setNewPassword] = useState<string>('');
  const [currentPasswordInput, setCurrentPasswordInput] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Balances & Currency
  const [tokenBalance, setTokenBalance] = useState<number>(50);
  const [walletBalance, setWalletBalance] = useState<number>(0.00);
  const [currencySymbol, setCurrencySymbol] = useState<string>('$');
  const [stats, setStats] = useState({ totalDeducted: 0, totalGranted: 0, totalEvents: 0 });

  // Social Login Enabled Config
  const [socialConfig, setSocialConfig] = useState({ google: true, facebook: true, apple: true });

  // Modals State
  const [unlinkModalProvider, setUnlinkModalProvider] = useState<SocialAccountStatus | null>(null);
  const [linkModalProvider, setLinkModalProvider] = useState<SocialAccountStatus | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState<boolean>(false);

  // Tab 2 & 3 Ledger State
  const [tabTransactions, setTabTransactions] = useState<any[]>([]);
  const [tabSearch, setTabSearch] = useState<string>('');
  const [tabTypeFilter, setTabTypeFilter] = useState<string>('all');
  const [tabLimit, setTabLimit] = useState<number>(10);
  const [tabTotalPages, setTabTotalPages] = useState<number>(1);
  const [tabTotalCount, setTabTotalCount] = useState<number>(0);

  // Re-entrancy guards
  const isFetchingRef = useRef<boolean>(false);
  const syncTimeoutRef = useRef<any>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ type, text });
    setTimeout(() => setToastMessage(null), 3800);
  };

  // 1. Fetch User Data & Balances Idempotently
  const fetchProfileData = useCallback(async (activeUser: User | null) => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    setLoading(true);

    const targetUserId = activeUser?.id || 'usr_admin_1';
    const targetEmail = activeUser?.email || 'admin@zecratary.com';

    try {
      if (typeof window !== 'undefined') {
        const cur = localStorage.getItem('zecratary_currency') || 'USD';
        setCurrencySymbol(CURRENCY_SYMBOLS[cur] || '$');
      }

      // Fetch User & Social Config
      try {
        const sRes = await fetch('/api/admin/settings', { cache: 'no-store' });
        if (sRes.ok) {
          const sData = await sRes.json();
          const sc = sData?.socialLogin || sData?.settings?.socialLogin;
          if (sc) {
            setSocialConfig({
              google: sc.google?.enabled !== false,
              facebook: sc.facebook?.enabled !== false,
              apple: sc.apple?.enabled !== false
            });
          }
        }
      } catch (_) {}

      // Fetch Balances & Telemetry
      try {
        const tRes = await fetch(`/api/tokens?userId=${encodeURIComponent(targetUserId)}&email=${encodeURIComponent(targetEmail)}&limit=1`, { cache: 'no-store' });
        if (tRes.ok) {
          const tData = await tRes.json();
          if (tData.success) {
            if (tData.balance !== undefined) setTokenBalance(Number(tData.balance));
            if (tData.stats) setStats(tData.stats);
          }
        }
      } catch (_) {}

      try {
        const wRes = await fetch(`/api/wallet?userId=${encodeURIComponent(targetUserId)}&email=${encodeURIComponent(targetEmail)}&limit=1`, { cache: 'no-store' });
        if (wRes.ok) {
          const wData = await wRes.json();
          const wBal = typeof wData.wallet_balance === 'number' 
            ? wData.wallet_balance 
            : (typeof wData.balance === 'number' ? wData.balance : Number(wData.user?.wallet_balance || 0));
          setWalletBalance(wBal);
          if (wData.settings?.currency) setCurrencySymbol(CURRENCY_SYMBOLS[wData.settings.currency] || '$');
        }
      } catch (_) {}

    } catch (err) {
      console.warn('[ProfilePage] Fetch notice:', err);
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  }, []);

  const fetchRef = useRef(fetchProfileData);
  useEffect(() => {
    fetchRef.current = fetchProfileData;
  });

  useEffect(() => {
    document.title = `${t('accountProfileTitle', 'User Profile & Account')} - Zecratary`;
  }, [t]);

  // Initial Mount Effect
  useEffect(() => {
    initAuthStorage();
    const u = getCurrentUser();
    if (!u) {
      router.replace('/login');
      return;
    }
    setCurrentUser(u);
    setName(u.name || '');
    setEmail(u.email || '');

    // Check OAuth Return Parameters
    const verifyProvider = searchParams?.get('verify_link');
    const isVerified = searchParams?.get('verified') === 'true';
    if (verifyProvider && isVerified) {
      showToast(`Successfully verified and linked ${verifyProvider.toUpperCase()} account!`, 'success');
      try {
        window.history.replaceState({}, '', '/profile');
      } catch (_) {}
    }

    fetchRef.current(u);

    const handleDebouncedSync = () => {
      if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
      syncTimeoutRef.current = setTimeout(() => {
        const active = getCurrentUser();
        if (active) {
          setCurrentUser(active);
          setName(active.name || '');
          setEmail(active.email || '');
          fetchRef.current(active);
        }
      }, 300);
    };

    window.addEventListener('storage', handleDebouncedSync);
    window.addEventListener('zecratary_users_updated', handleDebouncedSync);
    window.addEventListener('zecratary_tokens_updated', handleDebouncedSync);
    window.addEventListener('zecratary_wallet_updated', handleDebouncedSync);
    window.addEventListener('zecratary_languages_updated', handleDebouncedSync);
    window.addEventListener('zecratary_dictionary_updated', handleDebouncedSync);
    window.addEventListener('zecratary_locale_changed', handleDebouncedSync);

    return () => {
      if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
      window.removeEventListener('storage', handleDebouncedSync);
      window.removeEventListener('zecratary_users_updated', handleDebouncedSync);
      window.removeEventListener('zecratary_tokens_updated', handleDebouncedSync);
      window.removeEventListener('zecratary_wallet_updated', handleDebouncedSync);
      window.removeEventListener('zecratary_languages_updated', handleDebouncedSync);
      window.removeEventListener('zecratary_dictionary_updated', handleDebouncedSync);
      window.removeEventListener('zecratary_locale_changed', handleDebouncedSync);
    };
  }, []); // Mount strictly once: []

  // 2. Fetch Ledger Records on Tab 2 (Tokens) or Tab 3 (Wallet)
  const fetchLedgerData = useCallback(async (targetPage = 1, currentTab = activeTab, query = tabSearch, filter = tabTypeFilter) => {
    if (currentTab === 'overview' || !currentUser) return;

    const targetUserId = currentUser.id || 'usr_admin_1';
    const targetEmail = currentUser.email || 'admin@zecratary.com';

    try {
      if (currentTab === 'tokens') {
        const qParams = new URLSearchParams({
          userId: targetUserId,
          email: targetEmail,
          page: String(targetPage),
          limit: String(tabLimit),
          search: query,
          type: filter
        });
        const res = await fetch(`/api/tokens?${qParams.toString()}`, { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          if (data.success) {
            setTabTransactions(data.transactions || []);
            setTabTotalPages(data.totalPages || 1);
            setTabTotalCount(data.totalCount || 0);
          }
        }
      } else if (currentTab === 'wallet') {
        const qParams = new URLSearchParams({
          userId: targetUserId,
          email: targetEmail,
          page: String(targetPage),
          limit: String(tabLimit),
          search: query,
          type: filter
        });
        const res = await fetch(`/api/wallet?${qParams.toString()}`, { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          if (data.success) {
            setTabTransactions(data.transactions || []);
            setTabTotalPages(data.totalPages || 1);
            setTabTotalCount(data.totalCount || 0);
          }
        }
      }
    } catch (_) {}
  }, [currentUser, activeTab, tabSearch, tabTypeFilter, tabLimit]);

  useEffect(() => {
    if (activeTab !== 'overview') {
      fetchLedgerData(1, activeTab, tabSearch, tabTypeFilter);
    }
  }, [activeTab, tabSearch, tabTypeFilter, fetchLedgerData]);

  // Social Identity Detection
  const linkedProviders = useMemo(() => {
    return detectUserSocialProviders(currentUser);
  }, [currentUser]);

  const activeLoginProvider = useMemo(() => {
    return getActiveLoginProvider(currentUser);
  }, [currentUser]);

  // Save Profile Credentials
  const handleSaveProfile = async () => {
    if (newPassword && newPassword !== confirmPassword) {
      showToast(t('passwordMismatchError', 'New passwords do not match.'), 'error');
      return;
    }
    if (!currentUser || submitting) return;
    setSubmitting(true);

    try {
      const res = await fetch('/api/auth/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to save profile changes.');
      }

      if (newPassword) {
        const pwRes = await fetch('/api/auth/password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ currentPassword: currentPasswordInput, newPassword })
        });
        const pwData = await pwRes.json().catch(() => ({}));
        if (!pwRes.ok || !pwData.success) {
          throw new Error(pwData.error || 'Failed to change password.');
        }
      }

      const updatedUser = {
        ...currentUser,
        name: name.trim()
      };
      setCurrentUser(updatedUser);

      if (typeof window !== 'undefined') {
        localStorage.setItem('zecratary_user', JSON.stringify(updatedUser));
        window.dispatchEvent(new Event('zecratary_users_updated'));
        window.dispatchEvent(new Event('storage'));
      }

      setNewPassword('');
      setCurrentPasswordInput('');
      setConfirmPassword('');
      showToast(t('profileSavedSuccessToast', 'Profile updated successfully!'), 'success');
    } catch (err: any) {
      showToast(err.message || 'Error saving profile.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Social Account Linking Flow
  const handleInitiateLink = (providerObj: SocialAccountStatus) => {
    if (!socialConfig[providerObj.id]) {
      showToast(`${providerObj.name} login is disabled by the administrator.`, 'error');
      return;
    }
    setLinkModalProvider(providerObj);
  };

  const handleConfirmVerifyLink = () => {
    if (!linkModalProvider) return;
    const provider = linkModalProvider.id;
    setLinkModalProvider(null);

    // Direct to OAuth Provider Link Handshake
    const returnUrl = encodeURIComponent(`${window.location.origin}/profile?verify_link=${provider}&verified=true`);
    window.location.href = `/api/auth/login/${provider}?action=link&callbackUrl=${returnUrl}`;
  };

  // Social Account Unlinking Flow
  const handleInitiateUnlink = (providerObj: SocialAccountStatus) => {
    const isPrimary = activeLoginProvider === providerObj.id;
    if (isPrimary && (!currentUser?.password || currentUser?.password === '')) {
      showToast(
        (t('unlinkActiveProviderError', 'Cannot unlink {provider}: This is your active social login method. Please set a password first before disconnecting.'))
          .replace('{provider}', providerObj.name),
        'error'
      );
      return;
    }
    setUnlinkModalProvider(providerObj);
  };

  const handleConfirmUnlink = async () => {
    if (!unlinkModalProvider || !currentUser) return;
    const provider = unlinkModalProvider.id;
    setUnlinkModalProvider(null);

    const updatedProviders = linkedProviders.filter(p => p !== provider);
    const updatedUser = {
      ...currentUser,
      linkedProviders: updatedProviders,
      linked_providers: updatedProviders
    };

    setCurrentUser(updatedUser);

    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem('zecratary_user', JSON.stringify(updatedUser));
        window.dispatchEvent(new Event('zecratary_users_updated'));
      }
      showToast(`Disconnected ${unlinkModalProvider.name} account successfully.`, 'success');
    } catch (_) {
      showToast('Error updating account providers.', 'error');
    }
  };

  // Delete Account
  const handleConfirmDeleteAccount = async () => {
    if (!currentUser) return;
    setShowDeleteModal(false);

    try {
      await fetch('/api/auth/profile', { method: 'DELETE' });
      logoutUser();
      window.location.href = '/login';
    } catch (_) {
      showToast('Error deleting account.', 'error');
    }
  };

  return (
    <div 
      className="max-w-6xl mx-auto space-y-6 pb-24 px-4 font-sans transition-colors duration-200"
      style={{ color: 'var(--color-text)' }}
    >
      {/* Toast Alert Banner */}
      {toastMessage && (
        <div 
          className="fixed top-20 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 rounded-2xl text-xs font-bold shadow-2xl flex items-center gap-2 animate-in fade-in slide-in-from-top-3 border"
          style={{
            backgroundColor: 'var(--color-card)',
            borderColor: toastMessage.type === 'success' ? 'var(--color-emerald)' : '#ef4444',
            color: 'var(--color-text)'
          }}
        >
          {toastMessage.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4" style={{ color: 'var(--color-emerald)' }} />
          ) : (
            <AlertCircle className="h-4 w-4 text-red-500" />
          )}
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Top Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4" style={{ borderColor: 'var(--color-border)' }}>
        <div>
          <h1 className="text-2xl font-black tracking-tight" style={{ color: 'var(--color-primary)' }}>
            {t('accountProfileTitle', 'User Profile & Account')}
          </h1>
          <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
            {t('accountProfileSubtitle', 'Manage your personal information, security credentials, and connected accounts.')}
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => fetchRef.current(currentUser)}
            disabled={loading}
            className="border font-bold text-xs px-3.5 py-2.5 rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50 hover:opacity-80"
            style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
            title={t('reloadBtn', 'Reload')}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} style={{ color: 'var(--color-primary)' }} />
            <span>{t('reloadBtn', 'Reload')}</span>
          </button>
        </div>
      </div>

      {/* Executive KPI Summary Cards Banner */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Token Balance */}
        <div 
          className="p-5 rounded-3xl border shadow-xs flex flex-col justify-between space-y-3"
          style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold opacity-75">{t('currentTokens', 'Foodie Token Balance')}</span>
            <Link href="/token" className="text-[10px] font-bold text-amber-500 hover:underline">
              {t('topUpTokens', '+ Top Up')}
            </Link>
          </div>
          <div className="text-2xl font-black font-mono">
            {tokenBalance.toLocaleString()} <span className="text-amber-500 text-xs"><DynamicTokenIcon size={16} className="w-4 h-4 inline-block" /></span>
          </div>
        </div>

        {/* Card 2: Store Credit */}
        <div 
          className="p-5 rounded-3xl border shadow-xs flex flex-col justify-between space-y-3"
          style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold opacity-75">{t('storeCredit', 'Store Credit')}</span>
            <Link href="/wallet" className="text-[10px] font-bold text-emerald-400 hover:underline">
              {t('addFunds', '+ Add Funds')}
            </Link>
          </div>
          <div className="text-2xl font-black font-mono text-emerald-400">
            {currencySymbol}{walletBalance.toFixed(2)}
          </div>
        </div>

        {/* Card 3: Membership Tier */}
        <div 
          className="p-5 rounded-3xl border shadow-xs flex flex-col justify-between space-y-3"
          style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold opacity-75">{t('membershipTier', 'Membership Tier')}</span>
            <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase text-emerald-400 border border-emerald-500/30 bg-emerald-500/10">
              {t('activePlanBadge', 'ACTIVE')}
            </span>
          </div>
          <div className="text-base font-black capitalize truncate" style={{ color: 'var(--color-primary)' }}>
            {(currentUser?.subscription_plan || 'Taster').replace(/-/g, ' ')}
          </div>
        </div>

        {/* Card 4: Total Activity */}
        <div 
          className="p-5 rounded-3xl border shadow-xs flex flex-col justify-between space-y-3"
          style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold opacity-75">{t('totalActivity', 'Total Activity')}</span>
            <button type="button" onClick={() => setActiveTab('tokens')} className="text-[10px] font-bold text-[var(--color-primary)] hover:underline cursor-pointer">
              {t('viewLedger', 'View Ledger')}
            </button>
          </div>
          <div className="text-2xl font-black font-mono">
            {stats.totalEvents || stats.totalDeducted || 0}
          </div>
        </div>
      </div>

      {/* Tab Navigation Switcher */}
      <div 
        className="flex p-1.5 rounded-2xl border shadow-xs"
        style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)' }}
      >
        {[
          { id: 'overview', label: t('profileOverviewTab', 'Profile Overview'), icon: UserIcon },
          { id: 'tokens', label: t('tokenLedgerTab', 'Token Transactions'), icon: Coins },
          { id: 'wallet', label: t('walletLedgerTab', 'Wallet Transactions'), icon: Wallet }
        ].map(tab => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as any)}
              className="flex-1 py-2.5 text-xs font-bold rounded-xl flex items-center justify-center gap-2 transition cursor-pointer border"
              style={isActive ? {
                backgroundColor: 'var(--color-card)',
                color: 'var(--color-primary)',
                borderColor: 'var(--color-border)'
              } : {
                backgroundColor: 'transparent',
                borderColor: 'transparent',
                color: 'var(--color-text-secondary)'
              }}
            >
              <tab.icon className="h-4 w-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: PROFILE OVERVIEW (Form-Free Container, Constraint 9) */}
      {activeTab === 'overview' && (
        <div 
          role="region"
          data-lpignore="true"
          className="space-y-6 animate-in fade-in"
        >
          {/* Section 1: Credentials & Information */}
          <div 
            className="p-6 rounded-3xl border shadow-sm space-y-5"
            style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }}
          >
            <h3 className="font-extrabold text-sm border-b pb-3" style={{ borderColor: 'var(--color-border)', color: 'var(--color-primary)' }}>
              {t('personalInfoHeading', 'Personal Information')}
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block font-bold mb-1 opacity-80">{t('fullNameLabel', 'Full Name')}</label>
                <input
                  type="text"
                  autoComplete="off"
                  data-lpignore="true"
                  data-form-type="other"
                  spellCheck="false"
                  placeholder={t('fullNamePlaceholder', 'Enter your full name')}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full border rounded-xl p-2.5 text-xs outline-none font-bold"
                  style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                />
              </div>

              <div>
                <label className="block font-bold mb-1 opacity-80">{t('emailAddressLabel', 'Email Address')}</label>
                <input
                  type="email"
                  disabled
                  value={email}
                  className="w-full border rounded-xl p-2.5 text-xs outline-none font-bold opacity-60 cursor-not-allowed"
                  style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                />
                <span className="text-[10px] opacity-60 mt-1 block">{t('emailNote', 'Email address cannot be changed directly.')}</span>
              </div>
            </div>

            <div className="pt-3 border-t space-y-3" style={{ borderColor: 'var(--color-border)' }}>
              <h4 className="font-extrabold text-xs uppercase tracking-wider text-[var(--color-primary)]">
                {t('securityCredentialsHeading', 'Security & Password')}
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div>
                  <label className="block font-bold mb-1 opacity-80">{t('currentPasswordLabel', 'Current Password')}</label>
                  <input
                    type="password"
                    autoComplete="off"
                    data-lpignore="true"
                    data-form-type="other"
                    spellCheck="false"
                    placeholder={t('currentPasswordPlaceholder', 'Required to change your password')}
                    value={currentPasswordInput}
                    onChange={(e) => setCurrentPasswordInput(e.target.value)}
                    className="w-full border rounded-xl p-2.5 text-xs outline-none"
                    style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                  />
                </div>

                <div>
                  <label className="block font-bold mb-1 opacity-80">{t('newPasswordLabel', 'New Password')}</label>
                  <input
                    type="password"
                    autoComplete="off"
                    data-lpignore="true"
                    data-form-type="other"
                    spellCheck="false"
                    placeholder={t('newPasswordPlaceholder', 'Leave blank to keep current password')}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full border rounded-xl p-2.5 text-xs outline-none"
                    style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                  />
                </div>

                <div>
                  <label className="block font-bold mb-1 opacity-80">{t('confirmPasswordLabel', 'Confirm New Password')}</label>
                  <input
                    type="password"
                    autoComplete="off"
                    data-lpignore="true"
                    data-form-type="other"
                    spellCheck="false"
                    placeholder={t('confirmPasswordPlaceholder', 'Confirm your new password')}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full border rounded-xl p-2.5 text-xs outline-none"
                    style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t" style={{ borderColor: 'var(--color-border)' }}>
              <button
                type="button"
                onClick={handleSaveProfile}
                disabled={submitting}
                className="px-6 py-2.5 text-white font-bold text-xs rounded-xl shadow cursor-pointer hover:opacity-90 disabled:opacity-40"
                style={{ backgroundColor: 'var(--color-primary)' }}
              >
                {submitting ? t('savingProfile', 'Saving Profile...') : t('saveProfileBtn', 'Save Profile Changes')}
              </button>
            </div>
          </div>

          {/* Section 2: Connected Social Accounts (WITH EXACT FONT AWESOME ICONS: f179, f09a, f1a0) */}
          <div 
            className="p-6 rounded-3xl border shadow-sm space-y-4"
            style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }}
          >
            <div className="border-b pb-3" style={{ borderColor: 'var(--color-border)' }}>
              <h3 className="font-extrabold text-sm" style={{ color: 'var(--color-primary)' }}>
                {t('connectedSocialAccountsHeading', 'Connected Social Accounts')}
              </h3>
              <p className="text-xs opacity-75 mt-0.5">
                {t('connectedSocialAccountsDesc', 'Link your social accounts for seamless single sign-on access.')}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {SOCIAL_PROVIDERS.map(prov => {
                const isPrimary = activeLoginProvider === prov.id;
                const isLinked = linkedProviders.includes(prov.id) || isPrimary;
                const isEnabledByAdmin = socialConfig[prov.id];

                return (
                  <div
                    key={prov.id}
                    className="p-4 rounded-2xl border flex flex-col justify-between space-y-3 shadow-xs"
                    style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)' }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        {/* Font Awesome Icon Box */}
                        <div 
                          className="w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 shadow-xs"
                          style={{
                            backgroundColor: 'var(--color-card)',
                            borderColor: 'var(--color-border)'
                          }}
                        >
                          <FontAwesomeIcon
                            unicode={prov.unicode}
                            name={prov.id}
                            size={18}
                            className="shrink-0"
                            style={{
                              color: prov.id === 'google' 
                                ? '#EA4335' 
                                : prov.id === 'facebook' 
                                ? '#1877F2' 
                                : 'var(--color-text)'
                            }}
                          />
                        </div>

                        <div>
                          <span className="font-bold text-xs block" style={{ color: 'var(--color-text)' }}>{prov.name}</span>
                          {!isEnabledByAdmin && (
                            <span className="text-[9px] text-amber-500 font-bold block">
                              ({t('disabledByAdmin', 'Disabled by Admin')})
                            </span>
                          )}
                        </div>
                      </div>

                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border ${
                        isLinked 
                          ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' 
                          : 'opacity-50 border-slate-700'
                      }`}>
                        {isPrimary 
                          ? t('linkedLoginMethod', 'Linked (Login Method)') 
                          : isLinked 
                          ? t('linked', 'Linked') 
                          : t('notLinked', 'Not Linked')}
                      </span>
                    </div>

                    <div>
                      {isLinked ? (
                        <button
                          type="button"
                          onClick={() => handleInitiateUnlink(prov)}
                          className="w-full py-2 rounded-xl border text-[11px] font-bold text-red-400 hover:bg-red-500/10 transition cursor-pointer"
                          style={{ borderColor: 'rgba(239, 68, 68, 0.4)' }}
                        >
                          {t('unlinkBtn', 'Unlink')}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleInitiateLink(prov)}
                          disabled={!isEnabledByAdmin}
                          className="w-full py-2 rounded-xl text-[11px] font-bold transition shadow cursor-pointer text-white hover:opacity-90 disabled:opacity-40"
                          style={{ backgroundColor: 'var(--color-primary)' }}
                        >
                          {t('linkBtn', 'Link')}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Section 3: Danger Zone */}
          <div 
            className="p-6 rounded-3xl border shadow-sm space-y-3"
            style={{ backgroundColor: 'var(--color-card)', borderColor: 'rgba(239, 68, 68, 0.4)' }}
          >
            <h3 className="font-extrabold text-sm text-red-500">
              {t('dangerZoneHeading', 'Danger Zone')}
            </h3>
            <p className="text-xs opacity-75 leading-relaxed">
              {t('dangerZoneDesc', 'Once you delete your account, all your saved recipes, meal plans, and wallet credits will be permanently removed.')}
            </p>

            <div className="pt-2 flex justify-start">
              <button
                type="button"
                onClick={() => setShowDeleteModal(true)}
                className="px-4 py-2 rounded-xl border text-xs font-bold text-red-400 hover:bg-red-500/10 transition cursor-pointer flex items-center gap-1.5"
                style={{ borderColor: '#ef4444' }}
              >
                <Trash2 className="h-4 w-4" />
                <span>{t('deleteAccountBtn', 'Delete Account')}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2 & TAB 3: LEDGER RECORDS */}
      {activeTab !== 'overview' && (
        <div 
          role="region"
          data-lpignore="true"
          className="p-6 rounded-3xl border shadow-sm space-y-4 animate-in fade-in"
          style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-4" style={{ borderColor: 'var(--color-border)' }}>
            <h3 className="font-extrabold text-sm" style={{ color: 'var(--color-primary)' }}>
              {activeTab === 'tokens' ? t('tokenLedgerTab', 'Token Transactions') : t('walletLedgerTab', 'Wallet Transactions')}
            </h3>

            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="h-3.5 w-3.5 absolute left-3 top-2.5 pointer-events-none opacity-60" />
                <input
                  type="text"
                  autoComplete="off"
                  data-lpignore="true"
                  data-form-type="other"
                  spellCheck="false"
                  placeholder={t('searchLedgerPlaceholder', 'Search transactions...')}
                  value={tabSearch}
                  onChange={(e) => setTabSearch(e.target.value)}
                  className="pl-8 pr-3 py-1.5 rounded-xl border text-xs outline-none font-medium w-48 sm:w-64"
                  style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                />
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            {tabTransactions.length === 0 ? (
              <div className="py-12 text-center text-xs opacity-50">
                {t('noTransactionsFound', 'No transactions found matching your criteria.')}
              </div>
            ) : (
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b text-[10px] uppercase font-bold opacity-70" style={{ borderColor: 'var(--color-border)' }}>
                    <th className="py-2.5 px-3">{t('colDate', 'Date')}</th>
                    <th className="py-2.5 px-3">{t('colTxId', 'Transaction ID')}</th>
                    <th className="py-2.5 px-3">{t('colType', 'Type')}</th>
                    <th className="py-2.5 px-3">{t('colDescription', 'Description')}</th>
                    <th className="py-2.5 px-3 text-right">{t('colAmount', 'Amount')}</th>
                    <th className="py-2.5 px-3 text-right">{t('colBalanceAfter', 'Balance After')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
                  {tabTransactions.map(tx => {
                    const isCredit = Number(tx.amount) > 0;
                    return (
                      <tr key={tx.id} className="hover:bg-slate-800/20 transition">
                        <td className="py-3 px-3 font-mono text-[11px] opacity-75">
                          {tx.created_at ? new Date(tx.created_at).toLocaleDateString() : '—'}
                        </td>
                        <td className="py-3 px-3 font-mono text-[10px] opacity-60">
                          {tx.id.slice(0, 14)}...
                        </td>
                        <td className="py-3 px-3">
                          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border opacity-80" style={{ borderColor: 'var(--color-border)' }}>
                            {tx.type}
                          </span>
                        </td>
                        <td className="py-3 px-3 font-medium">
                          {tx.description}
                        </td>
                        <td className={`py-3 px-3 text-right font-bold font-mono ${isCredit ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {activeTab === 'wallet' 
                            ? (isCredit ? `+${currencySymbol}${Number(tx.amount).toFixed(2)}` : `-${currencySymbol}${Math.abs(Number(tx.amount)).toFixed(2)}`)
                            : (isCredit ? `+${tx.amount} 🪙` : `${tx.amount} 🪙`)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-bold opacity-80">
                          {activeTab === 'wallet' ? `${currencySymbol}${Number(tx.balance_after || 0).toFixed(2)}` : `${tx.balance_after} 🪙`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* MODAL 1: VERIFY & CONNECT SOCIAL ACCOUNT (With Font Awesome Logo) */}
      {linkModalProvider && (
        <div 
          onClick={() => setLinkModalProvider(null)}
          className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4 cursor-pointer"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            role="region"
            data-lpignore="true"
            className="border rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl relative text-xs cursor-default"
            style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
          >
            <div className="flex justify-between items-center border-b pb-3" style={{ borderColor: 'var(--color-border)' }}>
              <div className="flex items-center gap-2.5">
                <FontAwesomeIcon
                  unicode={linkModalProvider.unicode}
                  name={linkModalProvider.id}
                  size={18}
                  style={{
                    color: linkModalProvider.id === 'google' 
                      ? '#EA4335' 
                      : linkModalProvider.id === 'facebook' 
                      ? '#1877F2' 
                      : 'var(--color-text)'
                  }}
                />
                <h3 className="font-extrabold text-sm" style={{ color: 'var(--color-primary)' }}>
                  {t('verifyConnectModalTitle', 'Verify & Connect Account')}
                </h3>
              </div>
              <button type="button" onClick={() => setLinkModalProvider(null)} className="p-1 rounded-lg">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-3 p-3 rounded-2xl border" style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)' }}>
                <div className="w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 shadow-xs" style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }}>
                  <FontAwesomeIcon
                    unicode={linkModalProvider.unicode}
                    name={linkModalProvider.id}
                    size={22}
                    style={{
                      color: linkModalProvider.id === 'google' 
                        ? '#EA4335' 
                        : linkModalProvider.id === 'facebook' 
                        ? '#1877F2' 
                        : 'var(--color-text)'
                    }}
                  />
                </div>
                <div>
                  <span className="font-bold text-xs block">{linkModalProvider.name} Single Sign-On</span>
                  <span className="text-[11px] opacity-70 block font-mono">Font Awesome: {linkModalProvider.unicode}</span>
                </div>
              </div>

              <p className="text-xs opacity-80 leading-relaxed">
                {(t('verifyConnectDesc', 'You will be redirected to authenticate with {provider} to prove account ownership.'))
                  .replace('{provider}', linkModalProvider.name)}
              </p>

              <div className="flex justify-end gap-2.5 pt-3 border-t" style={{ borderColor: 'var(--color-border)' }}>
                <button
                  type="button"
                  onClick={() => setLinkModalProvider(null)}
                  className="px-4 py-2 border rounded-xl font-bold cursor-pointer hover:opacity-80"
                  style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)' }}
                >
                  {t('cancelBtn', 'Cancel')}
                </button>
                <button
                  type="button"
                  onClick={handleConfirmVerifyLink}
                  className="px-5 py-2 text-white font-bold rounded-xl shadow cursor-pointer hover:opacity-90 flex items-center gap-1.5"
                  style={{ backgroundColor: 'var(--color-primary)' }}
                >
                  <span>{t('verifyAndConnectBtn', 'Verify & Connect')}</span>
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: CONFIRM UNLINK SOCIAL ACCOUNT (With Font Awesome Logo) */}
      {unlinkModalProvider && (
        <div 
          onClick={() => setUnlinkModalProvider(null)}
          className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4 cursor-pointer"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            role="region"
            data-lpignore="true"
            className="border rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl relative text-xs cursor-default"
            style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
          >
            <div className="flex justify-between items-center border-b pb-3" style={{ borderColor: 'var(--color-border)' }}>
              <div className="flex items-center gap-2.5">
                <FontAwesomeIcon
                  unicode={unlinkModalProvider.unicode}
                  name={unlinkModalProvider.id}
                  size={18}
                  style={{
                    color: unlinkModalProvider.id === 'google' 
                      ? '#EA4335' 
                      : unlinkModalProvider.id === 'facebook' 
                      ? '#1877F2' 
                      : 'var(--color-text)'
                  }}
                />
                <h3 className="font-extrabold text-sm text-red-500">
                  {t('confirmUnlinkModalTitle', 'Disconnect Social Account')}
                </h3>
              </div>
              <button type="button" onClick={() => setUnlinkModalProvider(null)} className="p-1 rounded-lg">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-3 p-3 rounded-2xl border" style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)' }}>
                <div className="w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 shadow-xs" style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }}>
                  <FontAwesomeIcon
                    unicode={unlinkModalProvider.unicode}
                    name={unlinkModalProvider.id}
                    size={22}
                    style={{
                      color: unlinkModalProvider.id === 'google' 
                        ? '#EA4335' 
                        : unlinkModalProvider.id === 'facebook' 
                        ? '#1877F2' 
                        : 'var(--color-text)'
                    }}
                  />
                </div>
                <div>
                  <span className="font-bold text-xs block">{unlinkModalProvider.name} Single Sign-On</span>
                  <span className="text-[11px] opacity-70 block font-mono">Font Awesome: {unlinkModalProvider.unicode}</span>
                </div>
              </div>

              <p className="text-xs opacity-80 leading-relaxed">
                {(t('confirmUnlinkDesc', 'Are you sure you want to disconnect {provider} from your account?'))
                  .replace('{provider}', unlinkModalProvider.name)}
              </p>

              <div className="flex justify-end gap-2.5 pt-3 border-t" style={{ borderColor: 'var(--color-border)' }}>
                <button
                  type="button"
                  onClick={() => setUnlinkModalProvider(null)}
                  className="px-4 py-2 border rounded-xl font-bold cursor-pointer hover:opacity-80"
                  style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)' }}
                >
                  {t('cancelBtn', 'Cancel')}
                </button>
                <button
                  type="button"
                  onClick={handleConfirmUnlink}
                  className="px-5 py-2 text-white font-bold rounded-xl shadow cursor-pointer bg-red-600 hover:bg-red-700"
                >
                  {t('disconnectBtn', 'Disconnect')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: CONFIRM DELETE ACCOUNT */}
      {showDeleteModal && (
        <div 
          onClick={() => setShowDeleteModal(false)}
          className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4 cursor-pointer"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            role="region"
            data-lpignore="true"
            className="border rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl relative text-xs cursor-default"
            style={{ backgroundColor: 'var(--color-card)', borderColor: '#ef4444', color: 'var(--color-text)' }}
          >
            <div className="flex justify-between items-center border-b pb-3" style={{ borderColor: 'var(--color-border)' }}>
              <h3 className="font-extrabold text-sm text-red-500">
                {t('confirmDeleteModalTitle', 'Delete Your Account')}
              </h3>
              <button type="button" onClick={() => setShowDeleteModal(false)} className="p-1 rounded-lg">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3">
              <p className="text-xs opacity-80 leading-relaxed">
                {t('confirmDeleteDesc', 'This action cannot be undone. All your recipes, cookbooks, tokens, and wallet balances will be permanently erased.')}
              </p>

              <div className="flex justify-end gap-2.5 pt-3 border-t" style={{ borderColor: 'var(--color-border)' }}>
                <button
                  type="button"
                  onClick={() => setShowDeleteModal(false)}
                  className="px-4 py-2 border rounded-xl font-bold cursor-pointer hover:opacity-80"
                  style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)' }}
                >
                  {t('cancelBtn', 'Cancel')}
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDeleteAccount}
                  className="px-5 py-2 text-white font-bold rounded-xl shadow cursor-pointer bg-red-600 hover:bg-red-700"
                >
                  {t('confirmDeleteBtn', 'Permanently Delete Account')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ProfilePage() {
  return (
    <Suspense fallback={
      <div className="p-12 text-center text-xs opacity-50">
        Loading Profile...
      </div>
    }>
      <ProfileContent />
    </Suspense>
  );
}
