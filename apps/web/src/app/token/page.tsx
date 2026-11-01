// @ts-nocheck
'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  Coins, Wallet, Sparkles, TrendingUp, TrendingDown, Clock, 
  ArrowRight, CheckCircle2, AlertCircle, Search, RefreshCw, 
  X, Check, ShieldAlert, ChevronLeft, ChevronRight, Zap, Award, BookOpen
} from 'lucide-react';
import { getCurrentUser, User, initAuthStorage } from '@/lib/auth';
import { useTranslation } from '@/components/LanguageProvider';
import DynamicTokenIcon from '@/components/DynamicTokenIcon';

interface TokenPackage {
  id: string;
  name: string;
  tokens: number;
  tokenAmount?: number;
  price: number;
  priceDollars?: number;
  badge?: string;
  bonusTokens?: number;
  popular?: boolean;
  isPopular?: boolean;
  bestValue?: boolean;
  description?: string;
}

interface TokenTransaction {
  id: string;
  user_id?: string;
  user_email?: string;
  amount: number;
  balance_after: number;
  type: string;
  description: string;
  created_at: string;
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$', EUR: '€', GBP: '£', CAD: 'CA$', AUD: 'AU$', JPY: '¥', THB: '฿'
};

export default function TokenPortalPage() {
  const router = useRouter();
  const { t, locale } = useTranslation();
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  // Balances & Telemetry
  const [tokenBalance, setTokenBalance] = useState<number>(0);
  const [walletBalance, setWalletBalance] = useState<number>(0.00);
  const [currencySymbol, setCurrencySymbol] = useState<string>('$');
  const [tokenSymbol, setTokenSymbol] = useState<string>('🪙');
  const [tokenIcon, setTokenIcon] = useState<string>('');
  const [tokenName, setTokenName] = useState<string>('Foodie Token');
  const [isTokenEnabled, setIsTokenEnabled] = useState<boolean>(true);

  // Complete Feature Consumption Costs (Synced with settings)
  const [costs, setCosts] = useState({
    chef: 2,
    import_url: 5,
    import_text: 2,
    import_photo: 10,
    meal_planner: 5,
    macro_analysis: 3
  });

  // Dynamic Packages (No hardcoded fallbacks - initialized to empty array)
  const [packages, setPackages] = useState<TokenPackage[]>([]);

  // KPI Stats
  const [stats, setStats] = useState({ totalDeducted: 0, totalGranted: 0, totalEvents: 0 });

  // Ledger State
  const [transactions, setTransactions] = useState<TokenTransaction[]>([]);
  const [search, setSearch] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  
  // Loading States for Shadow Loaders
  const [loading, setLoading] = useState<boolean>(true);
  const [packagesLoading, setPackagesLoading] = useState<boolean>(true);
  const [purchasing, setPurchasing] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Confirmation Modal State (Autofill Safe Container)
  const [confirmModalPackage, setConfirmModalPackage] = useState<TokenPackage | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ type, text });
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Debounce search input to prevent network request spam & reset page
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 320);
    return () => clearTimeout(handler);
  }, [search]);

  // Reset page when filter type changes
  const handleTypeFilterChange = (newType: string) => {
    setSelectedType(newType);
    setPage(1);
  };

  // 1. Load Token Telemetry, Packages & User Transactions
  const fetchTokenData = useCallback(async (user: User | null, targetPage = 1, searchQuery = '', typeFilter = 'all') => {
    const targetUserId = user?.id || 'usr_admin_1';
    const targetEmail = user?.email || 'admin@zecratary.com';
    setLoading(true);

    try {
      // Dynamic currency detection
      if (typeof window !== 'undefined') {
        const storedSym = localStorage.getItem('zecratary_currency_symbol');
        const cur = localStorage.getItem('zecratary_currency') || 'USD';
        setCurrencySymbol(storedSym || CURRENCY_SYMBOLS[cur] || '$');
      }

      const qParams = new URLSearchParams({
        userId: targetUserId,
        email: targetEmail,
        page: String(targetPage),
        limit: '10',
        search: searchQuery,
        type: typeFilter,
        t: String(Date.now())
      });

      const res = await fetch(`/api/tokens?${qParams.toString()}`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          if (data.balance !== null && data.balance !== undefined) setTokenBalance(Number(data.balance));
          if (data.walletBalance !== null && data.walletBalance !== undefined) setWalletBalance(Number(data.walletBalance));
          if (data.tokenSymbol) setTokenSymbol(data.tokenSymbol);
          if (data.tokenIcon !== undefined) setTokenIcon(data.tokenIcon || '');
          if (data.tokenName) setTokenName(data.tokenName);
          if (data.isEnabled !== undefined) setIsTokenEnabled(Boolean(data.isEnabled));
          
          if (data.costs) {
            setCosts({
              chef: data.costs.chef ?? data.costs.aiChefCost ?? 2,
              import_url: data.costs.import_url ?? data.costs.importUrlCost ?? 5,
              import_text: data.costs.import_text ?? data.costs.importTextCost ?? 2,
              import_photo: data.costs.import_photo ?? data.costs.importPhotoCost ?? 10,
              meal_planner: data.costs.meal_planner ?? data.costs.mealPlannerCost ?? 5,
              macro_analysis: data.costs.macro_analysis ?? data.costs.macroAnalysisCost ?? 3
            });
          }

          if (Array.isArray(data.packages)) {
            const mapped = data.packages.map((pkg: any) => {
              const tokensVal = Number(pkg.tokens ?? pkg.tokenAmount ?? 0);
              const priceVal = Number(pkg.price ?? pkg.priceDollars ?? 0);
              const isPop = Boolean(pkg.popular ?? pkg.isPopular ?? (pkg.badge && String(pkg.badge).toLowerCase().includes('popular')));
              const isBest = Boolean(pkg.bestValue ?? (pkg.badge && String(pkg.badge).toLowerCase().includes('value')));
              return {
                id: pkg.id || `pkg_${Math.random()}`,
                name: pkg.name || 'Token Bundle',
                tokens: tokensVal,
                tokenAmount: tokensVal,
                price: priceVal,
                priceDollars: priceVal,
                badge: pkg.badge || '',
                bonusTokens: Number(pkg.bonusTokens || pkg.bonus_tokens || 0),
                popular: isPop,
                bestValue: isBest,
                description: pkg.description || ''
              };
            });
            setPackages(mapped);
          }

          if (Array.isArray(data.transactions)) {
            setTransactions(data.transactions);
          }

          if (data.totalPages) setTotalPages(data.totalPages);
          if (data.stats) setStats(data.stats);
        }
      }

      // Live Wallet Balance Sync with /api/wallet
      try {
        const wRes = await fetch(`/api/wallet?email=${encodeURIComponent(targetEmail)}&t=${Date.now()}`, { cache: 'no-store' });
        if (wRes.ok) {
          const wData = await wRes.json();
          if (wData.user && typeof wData.user.wallet_balance !== 'undefined') {
            setWalletBalance(parseFloat(wData.user.wallet_balance || 0));
          }
          if (wData.walletSymbol || wData.currencySymbol) {
            setCurrencySymbol(wData.walletSymbol || wData.currencySymbol);
          } else if (wData.settings?.currency) {
            setCurrencySymbol(CURRENCY_SYMBOLS[wData.settings.currency] || '$');
          }
        }
      } catch (_) {}

    } catch (err) {
      console.warn('[TokenPortal] Error loading telemetry:', err);
    } finally {
      setLoading(false);
      setPackagesLoading(false);
    }
  }, []);

  useEffect(() => {
    document.title = `${t('tokenPortalTitle', 'Token Portal')} - Zecratary`;
    initAuthStorage();
    const user = getCurrentUser();
    if (!user) {
      router.replace('/login');
      return;
    }
    setCurrentUser(user);
    fetchTokenData(user, page, debouncedSearch, selectedType);

    const handleSync = () => {
      const u = getCurrentUser();
      if (u) {
        setCurrentUser(u);
        fetchTokenData(u, page, debouncedSearch, selectedType);
      }
    };

    // Cross-tab BroadcastChannel Listeners for instantaneous synchronization
    let tokenBc: BroadcastChannel | null = null;
    let balanceBc: BroadcastChannel | null = null;
    let walletBc: BroadcastChannel | null = null;

    try {
      tokenBc = new BroadcastChannel('zecratary_token_channel');
      tokenBc.onmessage = () => handleSync();

      balanceBc = new BroadcastChannel('zecratary_balance_channel');
      balanceBc.onmessage = () => handleSync();

      walletBc = new BroadcastChannel('zecratary_wallet_channel');
      walletBc.onmessage = () => handleSync();
    } catch (_) {}

    window.addEventListener('storage', handleSync);
    window.addEventListener('zecratary_tokens_updated', handleSync);
    window.addEventListener('zecratary_wallet_updated', handleSync);
    window.addEventListener('zecratary_token_settings_updated', handleSync);
    window.addEventListener('zecratary_languages_updated', handleSync);
    window.addEventListener('zecratary_dictionary_updated', handleSync);
    window.addEventListener('zecratary_locale_changed', handleSync);

    return () => {
      if (tokenBc) tokenBc.close();
      if (balanceBc) balanceBc.close();
      if (walletBc) walletBc.close();
      window.removeEventListener('storage', handleSync);
      window.removeEventListener('zecratary_tokens_updated', handleSync);
      window.removeEventListener('zecratary_wallet_updated', handleSync);
      window.removeEventListener('zecratary_token_settings_updated', handleSync);
      window.removeEventListener('zecratary_languages_updated', handleSync);
      window.removeEventListener('zecratary_dictionary_updated', handleSync);
      window.removeEventListener('zecratary_locale_changed', handleSync);
    };
  }, [fetchTokenData, page, debouncedSearch, selectedType, router, t]);

  // Execute Atomic Purchase via Store Wallet with Bonus Tokens Included
  const handleConfirmPurchase = async () => {
    if (!confirmModalPackage || !currentUser) return;
    setPurchasing(true);

    const baseTokens = Number(confirmModalPackage.tokens ?? confirmModalPackage.tokenAmount ?? 0);
    const bonusTokens = Number(confirmModalPackage.bonusTokens || 0);
    const totalTokensToCredit = baseTokens + bonusTokens;
    const priceToPay = Number(confirmModalPackage.price ?? confirmModalPackage.priceDollars ?? 0);

    try {
      const res = await fetch('/api/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'purchase',
          packageId: confirmModalPackage.id,
          tokens: totalTokensToCredit,
          baseTokens: baseTokens,
          bonusTokens: bonusTokens,
          tokenAmount: totalTokensToCredit,
          price: priceToPay,
          priceDollars: priceToPay,
          packageName: confirmModalPackage.name,
          userId: currentUser.id || 'usr_admin_1',
          userEmail: currentUser.email || 'admin@zecratary.com'
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Token purchase failed.');
      }

      const newBal = Number(data.balance ?? (tokenBalance + totalTokensToCredit));
      setTokenBalance(newBal);

      const newWalletBal = Math.max(0, walletBalance - priceToPay);
      setWalletBalance(newWalletBal);

      // Local user cache sync
      if (typeof window !== 'undefined') {
        try {
          const raw = localStorage.getItem('zecratary_user');
          if (raw) {
            const u = JSON.parse(raw);
            u.token_balance = newBal;
            u.wallet_balance = newWalletBal;
            localStorage.setItem('zecratary_user', JSON.stringify(u));
          }
        } catch (_) {}
      }

      // Broadcast to other tabs & UI capsules
      window.dispatchEvent(new Event('zecratary_tokens_updated'));
      window.dispatchEvent(new Event('zecratary_wallet_updated'));
      window.dispatchEvent(new Event('storage'));

      try {
        const bc = new BroadcastChannel('zecratary_balance_channel');
        bc.postMessage({ type: 'TOKEN_PURCHASED', tokens: newBal, wallet: newWalletBal });
        bc.close();
      } catch (_) {}

      try {
        const tbc = new BroadcastChannel('zecratary_token_channel');
        tbc.postMessage({ type: 'TOKEN_UPDATED', tokens: newBal });
        tbc.close();
      } catch (_) {}

      showToast(
        (t('purchaseSuccessToast', 'Successfully purchased {tokens} {symbol}!'))
          .replace('{tokens}', totalTokensToCredit.toLocaleString())
          .replace('{symbol}', tokenSymbol),
        'success'
      );

      setConfirmModalPackage(null);
      fetchTokenData(currentUser, page, debouncedSearch, selectedType);
    } catch (err: any) {
      showToast(err.message || 'Error completing purchase.', 'error');
    } finally {
      setPurchasing(false);
    }
  };

  return (
    <div 
      className="w-full max-w-full px-4 sm:px-6 lg:px-8 xl:px-10 space-y-6 pb-24 font-sans transition-colors duration-200"
      style={{ color: 'var(--color-text)' }}
    >
      {/* Toast Alert Banner */}
      {toastMessage && (
        <div 
          className="fixed top-20 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 rounded-2xl text-xs font-bold shadow-2xl flex items-center gap-2 animate-in fade-in slide-in-from-top-3 border"
          style={{
            backgroundColor: 'var(--color-card)',
            borderColor: toastMessage.type === 'success' ? 'var(--color-emerald, #10b981)' : 'var(--color-danger, #ef4444)',
            color: 'var(--color-text)'
          }}
        >
          {toastMessage.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4" style={{ color: 'var(--color-emerald, #10b981)' }} />
          ) : (
            <AlertCircle className="h-4 w-4 text-red-500" />
          )}
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Top Header Bar */}
      <div 
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4" 
        style={{ borderColor: 'var(--color-border)' }}
      >
        <div>
          <h1 className="text-2xl font-black tracking-tight" style={{ color: 'var(--color-primary)' }}>
            {t('tokenPortalTitle', 'Token Portal')}
          </h1>
          <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
            {t('tokenPortalSubtitle', 'Purchase and manage tokens for AI Chef recipe generation and automated imports.')}
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => fetchTokenData(currentUser, page, debouncedSearch, selectedType)}
            disabled={loading}
            className="border font-bold text-xs px-3.5 py-2.5 rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50 hover:opacity-80"
            style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
            title={t('reloadBtn', 'Reload')}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} style={{ color: 'var(--color-primary)' }} />
            <span>{t('reloadBtn', 'Reload')}</span>
          </button>

          <Link
            href="/wallet"
            className="px-4 py-2.5 rounded-xl text-xs font-bold border transition shadow-xs flex items-center gap-1.5 hover:opacity-80"
            style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)', color: 'var(--color-emerald, #10b981)' }}
          >
            <Wallet className="h-4 w-4" />
            <span>{t('topUpWalletBtn', 'Top Up Wallet')}</span>
          </Link>
        </div>
      </div>

      {/* Free Token Mode Alert Banner */}
      {!isTokenEnabled && (
        <div 
          className="p-4 rounded-3xl border flex items-center gap-3 shadow-sm animate-in fade-in"
          style={{
            backgroundColor: 'var(--color-card)',
            borderColor: 'var(--color-emerald, #10b981)',
            color: 'var(--color-text)'
          }}
        >
          <div className="p-2.5 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h4 className="font-extrabold text-xs uppercase tracking-wider text-emerald-400">
              {t('freeTokenModeBanner', 'Free Token Mode Active')}
            </h4>
            <p className="text-xs opacity-80 mt-0.5">
              {t('freeTokenModeDesc', 'Token consumption is currently bypassed by the administrator. All AI Chef and import features are free to use!')}
            </p>
          </div>
        </div>
      )}

      {/* 1. KPI Telemetry Summary Cards (With Themed Shadow Loader) */}
      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((n) => (
            <div 
              key={n}
              className="p-5 rounded-3xl border shadow-xs flex flex-col justify-between space-y-3 animate-pulse"
              style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }}
            >
              <div className="flex items-center justify-between">
                <div className="h-3 w-24 rounded bg-[var(--color-inner-dark)]" />
                <div className="w-8 h-8 rounded-xl bg-[var(--color-inner-dark)]" />
              </div>
              <div className="h-8 w-28 rounded-xl bg-[var(--color-inner-dark)]" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Current Token Balance */}
          <div 
            className="p-5 rounded-3xl border shadow-xs flex flex-col justify-between space-y-3"
            style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold opacity-75">{t('currentTokenBalance', 'Current Token Balance')}</span>
              <div className="p-2 rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/20">
                <DynamicTokenIcon symbol={tokenSymbol} icon={tokenIcon} size={18} className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-black font-mono flex items-center gap-2">
              <span>{tokenBalance.toLocaleString()}</span>
              <span className="text-sm font-sans flex items-center gap-1 opacity-90">
                <DynamicTokenIcon symbol={tokenSymbol} icon={tokenIcon} size={16} className="w-4 h-4 inline-block" />
              </span>
            </div>
          </div>

          {/* Store Wallet Balance */}
          <div 
            className="p-5 rounded-3xl border shadow-xs flex flex-col justify-between space-y-3"
            style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold opacity-75">{t('storeWalletBalance', 'Store Wallet Balance')}</span>
              <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <Wallet className="h-4 w-4" />
              </div>
            </div>
            <div className="text-2xl font-black font-mono text-emerald-400">
              {currencySymbol}{walletBalance.toFixed(2)}
            </div>
          </div>

          {/* Lifetime Tokens Used */}
          <div 
            className="p-5 rounded-3xl border shadow-xs flex flex-col justify-between space-y-3"
            style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold opacity-75">{t('lifetimeDeducted', 'Lifetime Tokens Used')}</span>
              <div className="p-2 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20">
                <TrendingDown className="h-4 w-4" />
              </div>
            </div>
            <div className="text-2xl font-black font-mono">
              {stats.totalDeducted.toLocaleString()}
            </div>
          </div>

          {/* Lifetime Tokens Granted */}
          <div 
            className="p-5 rounded-3xl border shadow-xs flex flex-col justify-between space-y-3"
            style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold opacity-75">{t('lifetimeGranted', 'Lifetime Tokens Granted')}</span>
              <div className="p-2 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20">
                <TrendingUp className="h-4 w-4" />
              </div>
            </div>
            <div className="text-2xl font-black font-mono">
              {stats.totalGranted.toLocaleString()}
            </div>
          </div>
        </div>
      )}

      {/* 2. Token Bundles Showcase (With Themed Shadow Loader) */}
      <div 
        className="p-6 rounded-3xl border shadow-sm space-y-5"
        style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-4" style={{ borderColor: 'var(--color-border)' }}>
          <div>
            <h3 className="text-lg font-black tracking-tight" style={{ color: 'var(--color-primary)' }}>
              {t('tokenBundlesHeading', 'Available Token Bundles')}
            </h3>
            <p className="text-xs opacity-75">
              {t('tokenBundlesDesc', 'Select a package to instantly top up your AI token balance via your Store Wallet.')}
            </p>
          </div>
        </div>

        {packagesLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-4 gap-5">
            {[1, 2, 3].map((n) => (
              <div
                key={n}
                className="p-5 rounded-3xl border flex flex-col justify-between space-y-4 shadow-xs animate-pulse"
                style={{
                  backgroundColor: 'var(--color-inner-dark)',
                  borderColor: 'var(--color-border)'
                }}
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="h-4 w-28 rounded bg-[var(--color-card)]" />
                    <div className="h-4 w-16 rounded-full bg-[var(--color-card)]" />
                  </div>
                  <div className="h-8 w-32 rounded-xl bg-[var(--color-card)]" />
                  <div className="space-y-1.5 pt-1">
                    <div className="h-3 w-full rounded bg-[var(--color-card)]/70" />
                    <div className="h-3 w-4/5 rounded bg-[var(--color-card)]/70" />
                  </div>
                </div>
                <div className="pt-3 border-t flex items-center justify-between gap-2" style={{ borderColor: 'var(--color-border)' }}>
                  <div className="h-6 w-20 rounded-lg bg-[var(--color-card)]" />
                  <div className="h-8 w-20 rounded-xl bg-[var(--color-card)]" />
                </div>
              </div>
            ))}
          </div>
        ) : packages.length === 0 ? (
          <div className="p-12 text-center rounded-2xl border border-dashed text-xs opacity-60" style={{ borderColor: 'var(--color-border)' }}>
            {t('noPackagesAvailable', 'No token bundles are currently available. Please check back later or contact your administrator.')}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-4 gap-5">
            {packages.map((pkg) => {
              const displayTokens = Number(pkg.tokens ?? pkg.tokenAmount ?? 0);
              const displayPrice = Number(pkg.price ?? pkg.priceDollars ?? 0);
              const isPopular = Boolean(pkg.popular || (pkg.badge && pkg.badge.toLowerCase().includes('popular')));
              const isBestValue = Boolean(pkg.bestValue || (pkg.badge && pkg.badge.toLowerCase().includes('value')));

              return (
                <div
                  key={pkg.id}
                  className="p-5 rounded-3xl border flex flex-col justify-between space-y-4 shadow-xs hover:shadow-md transition relative group"
                  style={{
                    backgroundColor: 'var(--color-inner-dark)',
                    borderColor: isPopular ? 'var(--color-primary)' : 'var(--color-border)'
                  }}
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="font-black text-sm" style={{ color: 'var(--color-text)' }}>
                        {pkg.name}
                      </h4>
                      {isPopular && (
                        <span className="px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider text-white" style={{ backgroundColor: 'var(--color-primary)' }}>
                          {pkg.badge || t('popularBadge', 'Most Popular')}
                        </span>
                      )}
                      {isBestValue && !isPopular && (
                        <span className="px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider text-emerald-400 border border-emerald-500/30 bg-emerald-500/10">
                          {pkg.badge || t('bestValueBadge', 'Best Value')}
                        </span>
                      )}
                      {!isPopular && !isBestValue && pkg.badge && (
                        <span className="px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider text-[var(--color-primary)] border border-[var(--color-primary)]/30 bg-[var(--color-primary)]/10">
                          {pkg.badge}
                        </span>
                      )}
                    </div>

                    <div className="flex items-baseline gap-1.5 font-mono">
                      <span className="text-2xl font-black text-amber-500">
                        +{displayTokens.toLocaleString()}
                      </span>
                      <span className="text-xs opacity-80 flex items-center gap-1">
                        <DynamicTokenIcon symbol={tokenSymbol} icon={tokenIcon} size={14} className="w-3.5 h-3.5 inline-block" />
                      </span>
                      {pkg.bonusTokens && pkg.bonusTokens > 0 ? (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 ml-1">
                          +{(pkg.bonusTokens).toLocaleString()} Bonus
                        </span>
                      ) : null}
                    </div>

                    {pkg.description ? (
                      <p className="text-xs leading-relaxed opacity-75">
                        {pkg.description}
                      </p>
                    ) : (
                      <p className="text-xs leading-relaxed opacity-60">
                        Top up your culinary workspace with {displayTokens.toLocaleString()} tokens.
                      </p>
                    )}
                  </div>

                  <div className="pt-3 border-t flex items-center justify-between gap-2" style={{ borderColor: 'var(--color-border)' }}>
                    <div className="flex items-baseline gap-1">
                      <span className="text-base font-black font-mono">
                        {currencySymbol}{displayPrice.toFixed(2)}
                      </span>
                      <span className="text-[10px] opacity-60">{t('oneTimePayment', 'one-time')}</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => setConfirmModalPackage(pkg)}
                      className="px-4 py-2 rounded-xl text-xs font-bold text-white transition shadow cursor-pointer hover:opacity-90 active:scale-95"
                      style={{ backgroundColor: 'var(--color-primary)' }}
                    >
                      {t('buyNowBtn', 'Buy Now')}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 3. Feature Consumption Information Bar (All 6 Rates with Shadow Loader) */}
      <div 
        className="p-4 rounded-3xl border flex flex-col xl:flex-row items-center justify-between gap-4 text-xs font-medium"
        style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }}
      >
        <span className="font-bold text-[var(--color-primary)] uppercase tracking-wider text-[11px] shrink-0">
          {t('featureCostsHeading', 'Feature Consumption Rates')}:
        </span>

        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5 w-full">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div 
                key={i} 
                className="h-9 rounded-xl border bg-[var(--color-inner-dark)] animate-pulse" 
                style={{ borderColor: 'var(--color-border)' }} 
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5 w-full text-xs font-bold">
            <div className="flex items-center gap-1.5 opacity-90 p-2 rounded-xl border" style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)' }}>
              <Zap className="h-3.5 w-3.5 text-amber-400 shrink-0" />
              <span className="truncate">{t('chefCostLabel', 'AI Chef')}:</span>
              <strong className="font-mono text-amber-500 ml-auto">{costs.chef} {tokenSymbol}</strong>
            </div>
            <div className="flex items-center gap-1.5 opacity-90 p-2 rounded-xl border" style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)' }}>
              <Zap className="h-3.5 w-3.5 text-sky-400 shrink-0" />
              <span className="truncate">{t('importUrlCostLabel', 'URL Scraper')}:</span>
              <strong className="font-mono text-sky-400 ml-auto">{costs.import_url} {tokenSymbol}</strong>
            </div>
            <div className="flex items-center gap-1.5 opacity-90 p-2 rounded-xl border" style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)' }}>
              <Zap className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
              <span className="truncate">{t('importPhotoCostLabel', 'Photo OCR')}:</span>
              <strong className="font-mono text-emerald-400 ml-auto">{costs.import_photo} {tokenSymbol}</strong>
            </div>
            <div className="flex items-center gap-1.5 opacity-90 p-2 rounded-xl border" style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)' }}>
              <Zap className="h-3.5 w-3.5 text-purple-400 shrink-0" />
              <span className="truncate">{t('importTextCostLabel', 'Text Parsing')}:</span>
              <strong className="font-mono text-purple-400 ml-auto">{costs.import_text} {tokenSymbol}</strong>
            </div>
            <div className="flex items-center gap-1.5 opacity-90 p-2 rounded-xl border" style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)' }}>
              <Zap className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
              <span className="truncate">{t('mealPlannerCostLabel', 'Meal Plan')}:</span>
              <strong className="font-mono text-indigo-400 ml-auto">{costs.meal_planner} {tokenSymbol}</strong>
            </div>
            <div className="flex items-center gap-1.5 opacity-90 p-2 rounded-xl border" style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)' }}>
              <Zap className="h-3.5 w-3.5 text-teal-400 shrink-0" />
              <span className="truncate">{t('macroAnalysisCostLabel', 'Macro Analysis')}:</span>
              <strong className="font-mono text-teal-400 ml-auto">{costs.macro_analysis} {tokenSymbol}</strong>
            </div>
          </div>
        )}
      </div>

      {/* 4. Token Audit Ledger Table (Autofill Guardrail & Accessible Region) */}
      <div 
        role="region"
        aria-label="Token Transaction Audit Ledger"
        data-lpignore="true"
        className="p-6 rounded-3xl border shadow-sm space-y-4"
        style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-4" style={{ borderColor: 'var(--color-border)' }}>
          <h3 className="font-extrabold text-sm" style={{ color: 'var(--color-primary)' }}>
            {t('tokenLedgerHeading', 'Token Audit Ledger')}
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
                placeholder={t('searchLedgerPlaceholder', 'Search transactions by description or ID...')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 pr-3 py-1.5 rounded-xl border text-xs outline-none font-medium w-48 sm:w-64"
                style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
              />
            </div>

            <select
              value={selectedType}
              onChange={(e) => handleTypeFilterChange(e.target.value)}
              className="px-2.5 py-1.5 rounded-xl border text-xs font-bold outline-none cursor-pointer"
              style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
            >
              <option value="all">{t('allTypesFilter', 'All Types')}</option>
              <option value="chef">{t('filterTypeChef', 'AI Chef')}</option>
              <option value="import">{t('filterTypeImport', 'Recipe Import')}</option>
              <option value="purchase">{t('filterTypePurchase', 'Bundle Purchases')}</option>
              <option value="grant">{t('filterTypeGrant', 'Plan Grants')}</option>
              <option value="planner">{t('filterTypePlanner', 'Meal Planner')}</option>
              <option value="macro">{t('filterTypeMacro', 'Macro Analysis')}</option>
            </select>
          </div>
        </div>

        {/* Transactions Table with Shadow Loader */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b text-[10px] uppercase font-bold opacity-70" style={{ borderColor: 'var(--color-border)' }}>
                <th className="py-2.5 px-3">{t('colTxDate', 'Date')}</th>
                <th className="py-2.5 px-3">{t('colTxId', 'Transaction ID')}</th>
                <th className="py-2.5 px-3">{t('colTxType', 'Type')}</th>
                <th className="py-2.5 px-3">{t('colTxDesc', 'Description')}</th>
                <th className="py-2.5 px-3 text-right">{t('colTxAmount', 'Amount')}</th>
                <th className="py-2.5 px-3 text-right">{t('colTxBalanceAfter', 'Balance After')}</th>
              </tr>
            </thead>
            {loading ? (
              <tbody className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
                {[1, 2, 3, 4, 5].map((i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="py-3 px-3"><div className="h-3 w-16 rounded bg-[var(--color-inner-dark)]" /></td>
                    <td className="py-3 px-3"><div className="h-3 w-24 rounded bg-[var(--color-inner-dark)]" /></td>
                    <td className="py-3 px-3"><div className="h-4 w-14 rounded bg-[var(--color-inner-dark)]" /></td>
                    <td className="py-3 px-3"><div className="h-3 w-40 rounded bg-[var(--color-inner-dark)]" /></td>
                    <td className="py-3 px-3 text-right"><div className="h-3 w-12 rounded bg-[var(--color-inner-dark)] ml-auto" /></td>
                    <td className="py-3 px-3 text-right"><div className="h-3 w-10 rounded bg-[var(--color-inner-dark)] ml-auto" /></td>
                  </tr>
                ))}
              </tbody>
            ) : transactions.length === 0 ? (
              <tbody>
                <tr>
                  <td colSpan={6} className="py-12 text-center text-xs opacity-50">
                    {t('noTransactionsFound', 'No transactions found matching your criteria.')}
                  </td>
                </tr>
              </tbody>
            ) : (
              <tbody className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
                {transactions.map((tx) => {
                  const isCredit = Number(tx.amount) > 0;
                  return (
                    <tr key={tx.id} className="hover:opacity-80 transition">
                      <td className="py-3 px-3 font-mono text-[11px] opacity-75">
                        {tx.created_at ? new Date(tx.created_at).toLocaleDateString(locale === 'th' ? 'th-TH' : (locale || 'en-US')) : '—'}
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
                        {isCredit ? `+${tx.amount}` : tx.amount} {tokenSymbol}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold opacity-80">
                        {tx.balance_after}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            )}
          </table>
        </div>

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-4 border-t text-xs" style={{ borderColor: 'var(--color-border)' }}>
            <span className="opacity-75">
              {(t('pageIndicator', 'Page {page} of {total}'))
                .replace('{page}', String(page))
                .replace('{total}', String(totalPages))}
            </span>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
                className="p-2 rounded-xl border disabled:opacity-30 cursor-pointer shadow-xs hover:opacity-80"
                style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)' }}
                title={t('prevPage', 'Previous')}
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                disabled={page === totalPages}
                className="p-2 rounded-xl border disabled:opacity-30 cursor-pointer shadow-xs hover:opacity-80"
                style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)' }}
                title={t('nextPage', 'Next')}
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* CONFIRMATION PURCHASE MODAL (Autofill Safe Form-Free Container) */}
      {confirmModalPackage && (
        <div 
          onClick={() => setConfirmModalPackage(null)}
          className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4 cursor-pointer"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            role="region"
            aria-label="Confirm Token Purchase Modal"
            data-lpignore="true"
            className="border rounded-3xl max-w-md w-full p-6 space-y-5 shadow-2xl relative text-xs cursor-default transition-colors duration-200"
            style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
          >
            <div className="flex justify-between items-center border-b pb-3" style={{ borderColor: 'var(--color-border)' }}>
              <h3 className="font-extrabold text-sm" style={{ color: 'var(--color-primary)' }}>
                {t('confirmPurchaseModalTitle', 'Confirm Token Purchase')}
              </h3>
              <button type="button" onClick={() => setConfirmModalPackage(null)} className="p-1 rounded-lg">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3.5">
              <div className="p-4 rounded-2xl border space-y-2.5" style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)' }}>
                <div className="flex justify-between items-center">
                  <span className="opacity-75">{t('baseTokensLabel', 'Base Tokens')}:</span>
                  <span className="font-mono font-bold text-amber-500">
                    +{(Number(confirmModalPackage.tokens ?? confirmModalPackage.tokenAmount ?? 0)).toLocaleString()}
                  </span>
                </div>
                {confirmModalPackage.bonusTokens && confirmModalPackage.bonusTokens > 0 ? (
                  <div className="flex justify-between items-center">
                    <span className="opacity-75">{t('bonusTokensLabel', 'Bonus Tokens')}:</span>
                    <span className="font-mono font-bold text-emerald-400">
                      +{confirmModalPackage.bonusTokens.toLocaleString()}
                    </span>
                  </div>
                ) : null}
                <div className="flex justify-between items-center border-t pt-2" style={{ borderColor: 'var(--color-border)' }}>
                  <span className="font-bold">{t('totalTokensToCredit', 'Total Tokens to Credit')}:</span>
                  <span className="text-base font-black font-mono text-amber-500 flex items-center gap-1">
                    +{((Number(confirmModalPackage.tokens ?? confirmModalPackage.tokenAmount ?? 0)) + (Number(confirmModalPackage.bonusTokens || 0))).toLocaleString()}
                    <DynamicTokenIcon symbol={tokenSymbol} icon={tokenIcon} size={16} className="w-4 h-4 inline-block" />
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="opacity-75">{t('amountToDeduct', 'Cost to Deduct')}:</span>
                  <span className="text-base font-black font-mono text-rose-400">
                    -{currencySymbol}{(Number(confirmModalPackage.price ?? confirmModalPackage.priceDollars ?? 0)).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between items-center border-t pt-2" style={{ borderColor: 'var(--color-border)' }}>
                  <span className="opacity-75">{t('storeWalletBalance', 'Store Wallet Balance')}:</span>
                  <span className="font-mono font-bold">
                    {currencySymbol}{walletBalance.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="opacity-75">{t('walletBalanceAfter', 'Projected Wallet Balance')}:</span>
                  <span className={`font-mono font-black ${walletBalance >= Number(confirmModalPackage.price ?? confirmModalPackage.priceDollars ?? 0) ? 'text-emerald-400' : 'text-red-500'}`}>
                    {currencySymbol}{Math.max(0, walletBalance - Number(confirmModalPackage.price ?? confirmModalPackage.priceDollars ?? 0)).toFixed(2)}
                  </span>
                </div>
              </div>

              {walletBalance < Number(confirmModalPackage.price ?? confirmModalPackage.priceDollars ?? 0) && (
                <div className="p-3 rounded-2xl border flex items-center justify-between text-[11px] text-amber-500" style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-warning, #f59e0b)' }}>
                  <span>
                    {(t('insufficientWalletFunds', 'Insufficient wallet funds. Short by {amount}.'))
                      .replace('{amount}', `${currencySymbol}${(Number(confirmModalPackage.price ?? confirmModalPackage.priceDollars ?? 0) - walletBalance).toFixed(2)}`)}
                  </span>
                  <Link
                    href={`/wallet?amount=${(Number(confirmModalPackage.price ?? confirmModalPackage.priceDollars ?? 0) - walletBalance).toFixed(2)}`}
                    className="font-bold underline hover:opacity-80"
                  >
                    {t('topUpWalletBtn', 'Top Up Wallet')}
                  </Link>
                </div>
              )}

              <div className="flex justify-end gap-2.5 pt-3 border-t" style={{ borderColor: 'var(--color-border)' }}>
                <button
                  type="button"
                  onClick={() => setConfirmModalPackage(null)}
                  className="px-4 py-2 border rounded-xl font-bold cursor-pointer hover:opacity-80"
                  style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)' }}
                >
                  {t('cancelBtn', 'Cancel')}
                </button>
                <button
                  type="button"
                  onClick={handleConfirmPurchase}
                  disabled={purchasing || walletBalance < Number(confirmModalPackage.price ?? confirmModalPackage.priceDollars ?? 0)}
                  className="px-5 py-2 text-white font-bold rounded-xl shadow cursor-pointer hover:opacity-90 disabled:opacity-40"
                  style={{ backgroundColor: 'var(--color-primary)' }}
                >
                  {purchasing ? t('processingPurchase', 'Processing...') : t('confirmAndPayBtn', 'Confirm & Pay')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
