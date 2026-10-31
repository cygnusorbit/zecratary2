// @ts-nocheck
'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { 
  Sparkles, CheckCircle2, AlertCircle, Save, RefreshCw, 
  Plus, Trash2, Edit3, Shield, Activity, 
  CreditCard, History, Sliders, Layers,
  ChevronLeft, ChevronRight
} from 'lucide-react';
import { useTranslation } from '@/components/LanguageProvider';

export interface TokenPackage {
  id: string;
  name: string;
  tokenAmount: number;
  tokens?: number;
  priceDollars: number;
  price?: number;
  badge?: string;
  bonusTokens?: number;
  isPopular?: boolean;
}

export interface SubscriptionPlanItem {
  id: string;
  name: string;
  slug: string;
  price: number;
  interval?: string;
  token_limit?: number;
}

export interface TokenSettings {
  tokenName: string;
  tokenSymbol: string;
  startingBalance: number;
  isEnabled: boolean;
  importUrlCost: number;
  importTextCost: number;
  importPhotoCost: number;
  aiChefCost: number;
  chefCost?: number;
  mealPlannerCost: number;
  macroAnalysisCost: number;
  planAllocations: Record<string, number>;
  packages: TokenPackage[];
}

export interface TokenTransactionRecord {
  id: string;
  customer_email: string;
  amount: number;
  balance_after: number;
  type: string;
  description: string;
  created_at: string;
}

const DEFAULT_TOKEN_PACKAGES: TokenPackage[] = [
  { id: 'pkg_starter', name: 'Starter Spark', tokenAmount: 250, tokens: 250, priceDollars: 4.99, price: 4.99, badge: 'Popular', bonusTokens: 0, isPopular: true },
  { id: 'pkg_chef', name: 'Culinary Master', tokenAmount: 1000, tokens: 1000, priceDollars: 14.99, price: 14.99, badge: 'Best Value', bonusTokens: 150, isPopular: false },
  { id: 'pkg_executive', name: 'Kitchen Enterprise', tokenAmount: 5000, tokens: 5000, priceDollars: 49.99, price: 49.99, badge: 'VIP', bonusTokens: 1000, isPopular: false }
];

const DEFAULT_SETTINGS: TokenSettings = {
  tokenName: 'Foodie Token',
  tokenSymbol: '🪙',
  startingBalance: 100,
  isEnabled: true,
  importUrlCost: 5,
  importTextCost: 2,
  importPhotoCost: 10,
  aiChefCost: 2,
  chefCost: 2,
  mealPlannerCost: 5,
  macroAnalysisCost: 3,
  planAllocations: {
    'free': 50,
    'nutrition-pro': 750,
    'vip-chef': 3000
  },
  packages: DEFAULT_TOKEN_PACKAGES
};

function formatLedgerDescription(desc: string | undefined | null, symbol: string): string {
  if (!desc) return '—';
  const cleanSym = symbol && !symbol.startsWith('http') && !symbol.startsWith('/') ? symbol.trim() : '🪙';
  
  let formatted = desc.replace(/(\([+-]?[\d,]+(?:\.\d+)?\s*)([^\w\s\)]+)(\))/g, `$1${cleanSym}$3`);
  formatted = formatted.replace(/(\([+-]?[\d,]+(?:\.\d+)?\))(?!\s*[^\w\s\)])/g, (match) => {
    return match.slice(0, -1) + ` ${cleanSym})`;
  });
  formatted = formatted.replace(/🪙/g, cleanSym);
  return formatted;
}

export default function AdminTokenSettingPage() {
  const { t, locale } = useTranslation();

  const tr = useCallback((key: string, fallback: string): string => {
    if (typeof t === 'function') {
      const val = t(key);
      if (val && val !== key) return val;
    }
    return fallback;
  }, [t]);

  const [activeTab, setActiveTab] = useState<'system' | 'packages' | 'plans' | 'ledger'>('system');
  const [settings, setSettings] = useState<TokenSettings>(DEFAULT_SETTINGS);
  const [plans, setPlans] = useState<SubscriptionPlanItem[]>([]);
  const [transactions, setTransactions] = useState<TokenTransactionRecord[]>([]);
  const [currencySymbol, setCurrencySymbol] = useState('$');
  const [currencyCode, setCurrencyCode] = useState('USD');
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  // Package editor state
  const [editingPkgId, setEditingPkgId] = useState<string | null>(null);
  const [pkgName, setPkgName] = useState('New Chef Bundle');
  const [pkgTokens, setPkgTokens] = useState<number>(500);
  const [pkgPrice, setPkgPrice] = useState<number>(7.99);
  const [pkgBadge, setPkgBadge] = useState('Hot');
  const [pkgBonus, setPkgBonus] = useState<number>(50);

  // Ledger filter & pagination state
  const [ledgerSearch, setLedgerSearch] = useState('');
  const [ledgerFilterType, setLedgerFilterType] = useState('all');
  const [ledgerPage, setLedgerPage] = useState<number>(1);
  const [ledgerPageSize, setLedgerPageSize] = useState<number>(10);

  const isFetchingRef = useRef<boolean>(false);
  const isSavingRef = useRef<boolean>(false);

  const showToast = (type: 'success' | 'error', msg: string) => {
    setFeedback({ type, msg });
    setTimeout(() => setFeedback(null), 4000);
  };

  const loadTokenData = useCallback(async () => {
    if (isFetchingRef.current || isSavingRef.current) return;
    isFetchingRef.current = true;
    setLoading(true);

    try {
      let res = await fetch('/api/admin/token-setting?t=' + Date.now(), { cache: 'no-store' });
      if (!res.ok) {
        res = await fetch('/api/admin/token-settings?t=' + Date.now(), { cache: 'no-store' });
      }
      if (res.ok) {
        const data = await res.json();
        if (data.currencySymbol) setCurrencySymbol(data.currencySymbol);
        if (data.currency) setCurrencyCode(data.currency);

        if (Array.isArray(data.plans)) {
          setPlans(data.plans);
        }

        if (data.tokenSettings || data.settings) {
          const loaded = data.tokenSettings || data.settings;
          const mergedPlanAllocations = { ...DEFAULT_SETTINGS.planAllocations, ...(loaded.planAllocations || {}) };
          if (Array.isArray(data.plans)) {
            data.plans.forEach((p: SubscriptionPlanItem) => {
              if (p.token_limit !== undefined && mergedPlanAllocations[p.slug] === undefined) {
                mergedPlanAllocations[p.slug] = p.token_limit;
              }
            });
          }

          const activeSymbol = loaded.tokenSymbol || '🪙';
          const resolvedChef = Number(loaded.aiChefCost ?? loaded.chefCost ?? DEFAULT_SETTINGS.aiChefCost);

          const loadedPkgs = Array.isArray(loaded.packages) && loaded.packages.length > 0 
            ? loaded.packages.map((p: any) => ({
                id: p.id || 'pkg_' + Math.random().toString(36).substring(2, 7),
                name: p.name || 'Bundle',
                tokenAmount: Number(p.tokenAmount ?? p.tokens ?? 250),
                tokens: Number(p.tokens ?? p.tokenAmount ?? 250),
                priceDollars: Number(p.priceDollars ?? p.price ?? 4.99),
                price: Number(p.price ?? p.priceDollars ?? 4.99),
                badge: p.badge || undefined,
                bonusTokens: Number(p.bonusTokens || 0),
                isPopular: Boolean(p.isPopular)
              }))
            : DEFAULT_TOKEN_PACKAGES;

          setSettings({
            tokenName: loaded.tokenName || 'Foodie Token',
            tokenSymbol: activeSymbol,
            startingBalance: loaded.startingBalance !== undefined ? Number(loaded.startingBalance) : 100,
            isEnabled: loaded.isEnabled !== undefined ? Boolean(loaded.isEnabled) : true,
            importUrlCost: loaded.importUrlCost !== undefined ? Number(loaded.importUrlCost) : 5,
            importTextCost: loaded.importTextCost !== undefined ? Number(loaded.importTextCost) : 2,
            importPhotoCost: loaded.importPhotoCost !== undefined ? Number(loaded.importPhotoCost) : 10,
            aiChefCost: resolvedChef,
            chefCost: resolvedChef,
            mealPlannerCost: loaded.mealPlannerCost !== undefined ? Number(loaded.mealPlannerCost) : 5,
            macroAnalysisCost: loaded.macroAnalysisCost !== undefined ? Number(loaded.macroAnalysisCost) : 3,
            planAllocations: mergedPlanAllocations,
            packages: loadedPkgs
          });

          if (typeof window !== 'undefined') {
            localStorage.setItem('zecratary_token_symbol', activeSymbol);
          }
        }
        if (Array.isArray(data.transactions)) {
          setTransactions(data.transactions);
        }
      }
    } catch (err) {
      console.warn('[Token Setting] Using fallback defaults:', err);
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  }, []);

  useEffect(() => {
    document.title = `${tr('tokenSettingDocTitle', 'Token Settings - Admin Console')}`;
    loadTokenData();

    const handleSync = () => loadTokenData();
    window.addEventListener('zecratary_tokens_updated', handleSync);
    window.addEventListener('zecratary_token_settings_updated', handleSync);
    window.addEventListener('zecratary_languages_updated', handleSync);
    window.addEventListener('zecratary_dictionary_updated', handleSync);
    window.addEventListener('zecratary_locale_changed', handleSync);

    return () => {
      window.removeEventListener('zecratary_tokens_updated', handleSync);
      window.removeEventListener('zecratary_token_settings_updated', handleSync);
      window.removeEventListener('zecratary_languages_updated', handleSync);
      window.removeEventListener('zecratary_dictionary_updated', handleSync);
      window.removeEventListener('zecratary_locale_changed', handleSync);
    };
  }, [loadTokenData, tr]);

  useEffect(() => {
    setLedgerPage(1);
  }, [ledgerSearch, ledgerFilterType, ledgerPageSize]);

  // Robust Save: Handles schema adaptation and dual-endpoint resilience
  const handleSaveSettings = async () => {
    if (saving || isSavingRef.current) return;
    setSaving(true);
    isSavingRef.current = true;
    setFeedback(null);

    const activeSymbol = settings.tokenSymbol.trim() || '🪙';
    const resolvedChef = Number(settings.aiChefCost ?? settings.chefCost ?? 2);

    const normalizedPkgs = (settings.packages || []).map(p => ({
      id: p.id,
      name: p.name,
      tokens: Number(p.tokens ?? p.tokenAmount ?? 250),
      tokenAmount: Number(p.tokenAmount ?? p.tokens ?? 250),
      price: Number(p.price ?? p.priceDollars ?? 4.99),
      priceDollars: Number(p.priceDollars ?? p.price ?? 4.99),
      badge: p.badge || undefined,
      bonusTokens: Number(p.bonusTokens || 0),
      isPopular: Boolean(p.isPopular)
    }));

    const payload = {
      ...settings,
      tokenSymbol: activeSymbol,
      aiChefCost: resolvedChef,
      chefCost: resolvedChef,
      packages: normalizedPkgs
    };

    const requestBody = {
      ...payload,
      tokenSettings: payload,
      settings: payload
    };

    try {
      let res = await fetch('/api/admin/token-setting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      if (!res.ok) {
        res = await fetch('/api/admin/token-settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody)
        });
      }

      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        if (typeof window !== 'undefined') {
          localStorage.setItem('zecratary_token_symbol', activeSymbol);
          localStorage.setItem('zecratary_token_name', payload.tokenName || 'Foodie Token');
          localStorage.setItem('zecratary_token_settings', JSON.stringify(payload));
          localStorage.setItem('zecratary_tokens_updated_at', Date.now().toString());

          window.dispatchEvent(new CustomEvent('zecratary_tokens_updated', { detail: payload }));
          window.dispatchEvent(new CustomEvent('zecratary_token_settings_updated', { detail: payload }));
          window.dispatchEvent(new Event('zecratary_admin_settings_updated'));

          try {
            const bc = new BroadcastChannel('zecratary_balance_channel');
            bc.postMessage({ type: 'TOKEN_SETTINGS_UPDATED', tokenSymbol: activeSymbol, settings: payload });
            bc.close();
          } catch (_) {}
        }
        showToast('success', tr('toastTokenSettingsSaved', 'Token settings saved and synchronized with PostgreSQL & MySQL!'));
      } else {
        throw new Error(data.error || 'Failed to save token settings.');
      }
    } catch (err: any) {
      showToast('error', err.message || tr('toastTokenSettingsError', 'Failed to save token settings. Please try again.'));
    } finally {
      setSaving(false);
      setTimeout(() => { isSavingRef.current = false; }, 300);
    }
  };

  const handleResetDefaults = () => {
    if (!confirm('Reset token settings to platform defaults?')) return;
    setSettings(DEFAULT_SETTINGS);
    showToast('success', tr('toastTokenSettingsReset', 'Token settings reset to defaults successfully!'));
  };

  const handleClearLedger = async () => {
    if (!confirm(tr('confirmClearLedger', 'Are you sure you want to clear recent token transactions? This cannot be undone.'))) return;
    try {
      let res = await fetch('/api/admin/token-setting', { method: 'DELETE' });
      if (!res.ok) {
        res = await fetch('/api/admin/token-settings', { method: 'DELETE' });
      }
      if (res.ok) {
        setTransactions([]);
        showToast('success', tr('toastLedgerCleared', 'Token transaction audit trail cleared successfully.'));
      }
    } catch (err: any) {
      showToast('error', err.message || 'Failed to clear ledger.');
    }
  };

  const handleAddPackage = () => {
    const amt = Math.max(1, parseInt(pkgTokens, 10) || 500);
    const prc = Math.max(0.01, parseFloat(pkgPrice) || 5.99);
    const newPkg: TokenPackage = {
      id: 'pkg_' + Date.now().toString(36),
      name: pkgName.trim() || 'Custom Bundle',
      tokenAmount: amt,
      tokens: amt,
      priceDollars: prc,
      price: prc,
      badge: pkgBadge.trim() || undefined,
      bonusTokens: parseInt(pkgBonus, 10) || 0,
      isPopular: false
    };

    setSettings(prev => ({
      ...prev,
      packages: [...prev.packages, newPkg]
    }));

    setEditingPkgId(null);
    showToast('success', `Added package "${newPkg.name}".`);
  };

  const handleUpdatePackage = (pkgId: string) => {
    const amt = Math.max(1, parseInt(pkgTokens, 10) || 500);
    const prc = Math.max(0.01, parseFloat(pkgPrice) || 5.99);

    setSettings(prev => ({
      ...prev,
      packages: prev.packages.map(p => p.id === pkgId ? {
        ...p,
        name: pkgName.trim(),
        tokenAmount: amt,
        tokens: amt,
        priceDollars: prc,
        price: prc,
        badge: pkgBadge.trim() || undefined,
        bonusTokens: parseInt(pkgBonus, 10) || 0
      } : p)
    }));

    setEditingPkgId(null);
    showToast('success', `Updated package "${pkgName}".`);
  };

  const handleDeletePackage = (pkgId: string) => {
    if (settings.packages.length <= 1) {
      alert('You must keep at least one token package active.');
      return;
    }
    setSettings(prev => ({
      ...prev,
      packages: prev.packages.filter(p => p.id !== pkgId)
    }));
  };

  const handleStartEdit = (pkg: TokenPackage) => {
    setEditingPkgId(pkg.id);
    setPkgName(pkg.name);
    setPkgTokens(pkg.tokenAmount ?? pkg.tokens ?? 500);
    setPkgPrice(pkg.priceDollars ?? pkg.price ?? 4.99);
    setPkgBadge(pkg.badge || '');
    setPkgBonus(pkg.bonusTokens || 0);
  };

  const filteredTransactions = useMemo(() => {
    return transactions.filter(tx => {
      const matchSearch = !ledgerSearch.trim() || 
        (tx.customer_email && tx.customer_email.toLowerCase().includes(ledgerSearch.toLowerCase())) ||
        (tx.description && tx.description.toLowerCase().includes(ledgerSearch.toLowerCase())) ||
        (tx.type && tx.type.toLowerCase().includes(ledgerSearch.toLowerCase()));
      
      const matchType = ledgerFilterType === 'all' || 
        (ledgerFilterType === 'purchases' && (tx.type.toLowerCase().includes('purchase') || tx.type.toLowerCase().includes('topup'))) ||
        (ledgerFilterType === 'deductions' && (tx.amount < 0 || tx.type.toLowerCase().includes('deduct') || tx.type.toLowerCase().includes('consumption'))) ||
        (ledgerFilterType === 'grants' && (tx.amount > 0 && !tx.type.toLowerCase().includes('purchase')));

      return matchSearch && matchType;
    });
  }, [transactions, ledgerSearch, ledgerFilterType]);

  const totalLedgerRecords = filteredTransactions.length;
  const totalLedgerPages = Math.max(1, Math.ceil(totalLedgerRecords / ledgerPageSize));
  const paginatedTransactions = useMemo(() => {
    const start = (ledgerPage - 1) * ledgerPageSize;
    return filteredTransactions.slice(start, start + ledgerPageSize);
  }, [filteredTransactions, ledgerPage, ledgerPageSize]);

  const activeTokenSymbol = settings.tokenSymbol || '🪙';

  return (
    <div 
      className="w-full max-w-full px-4 sm:px-6 lg:px-8 xl:px-10 space-y-6 pb-24 pt-2 font-sans transition-colors duration-200"
      style={{ color: 'var(--color-text)' }}
    >
      {/* 1. Top Header & Primary Action Bar (Task 1: Save Button with text "Configurations" removed) */}
      <div 
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4" 
        style={{ borderColor: 'var(--color-border)' }}
      >
        <div className="flex items-center gap-3">
          <div 
            className="w-10 h-10 rounded-2xl border flex items-center justify-center text-2xl shadow-xs select-none transition-transform duration-200 shrink-0"
            style={{ 
              backgroundColor: 'var(--color-inner-dark)', 
              borderColor: 'var(--color-border)' 
            }}
            title={`Active Token Symbol: ${activeTokenSymbol}`}
          >
            {activeTokenSymbol}
          </div>

          <div>
            <h1 className="text-2xl font-black tracking-tight flex items-center gap-2" style={{ color: 'var(--color-primary)' }}>
              {tr('tokenSettingTitle', 'Token System & Economy Configuration')}
            </h1>
            <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
              {tr('tokenSettingSubtitle', 'Configure platform token economy, feature consumption costs, purchasable packages, and recurring plan allocations.')}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={loadTokenData}
            disabled={loading}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border text-xs font-bold transition hover:opacity-80 cursor-pointer shadow-sm disabled:opacity-50"
            style={{ 
              backgroundColor: 'var(--color-inner-dark)', 
              borderColor: 'var(--color-border)',
              color: 'var(--color-text)'
            }}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>{tr('btnReload', 'Reload')}</span>
          </button>

          <button
            type="button"
            onClick={handleResetDefaults}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border text-xs font-bold transition hover:opacity-80 cursor-pointer shadow-sm"
            style={{ 
              backgroundColor: 'var(--color-inner-dark)', 
              borderColor: 'var(--color-border)',
              color: 'var(--color-text-secondary)'
            }}
          >
            <span>{tr('btnResetDefaults', 'Reset Defaults')}</span>
          </button>

          <button
            type="button"
            onClick={handleSaveSettings}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-1.5 rounded-xl text-xs font-bold text-white shadow-lg transition hover:opacity-90 cursor-pointer disabled:opacity-50"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            <Save className={`h-4 w-4 ${saving ? 'animate-spin' : ''}`} />
            <span>{saving ? tr('btnSaving', 'Saving...') : tr('btnSave', 'Save')}</span>
          </button>
        </div>
      </div>

      {/* Feedback Toast Banner */}
      {feedback && (
        <div
          className="p-3.5 rounded-2xl text-xs font-semibold flex items-center gap-2 border shadow-sm animate-in fade-in"
          style={{
            backgroundColor: 'var(--color-inner-dark)',
            borderColor: feedback.type === 'success' ? 'var(--color-emerald, #10b981)' : '#ef4444',
            color: feedback.type === 'success' ? 'var(--color-emerald, #10b981)' : '#ef4444'
          }}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: 'var(--color-emerald, #10b981)' }} />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
          )}
          <span>{feedback.msg}</span>
        </div>
      )}

      {/* Workspace Sub-Tabs */}
      <div 
        className="flex p-1.5 rounded-2xl border transition-colors duration-200"
        style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)' }}
      >
        {[
          { id: 'system', label: tr('tabTokenSystem', 'Economy & Feature Costs'), icon: Sliders },
          { id: 'packages', label: tr('tabTokenPackages', 'Purchasable Packages'), icon: CreditCard },
          { id: 'plans', label: tr('tabTokenPlans', 'Plan Monthly Grants'), icon: Layers },
          { id: 'ledger', label: tr('tabTokenLedger', 'Token Audit Ledger'), icon: History }
        ].map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as any)}
              className="flex-1 py-2.5 text-xs font-bold rounded-xl flex items-center justify-center gap-2 transition cursor-pointer"
              style={isActive ? {
                backgroundColor: 'var(--color-card)',
                color: 'var(--color-primary)',
                borderColor: 'var(--color-primary)',
                borderWidth: '1px',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
              } : { color: 'var(--color-text-secondary)' }}
            >
              <tab.icon className="h-4 w-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: SYSTEM IDENTITY & CONSUMPTION COSTS */}
      <div 
        role="region"
        aria-label="Economy and Consumption Costs"
        data-lpignore="true"
        className={activeTab === 'system' ? 'space-y-6 animate-in fade-in' : 'hidden'}
      >
        {/* Master Bypass Slide Switch */}
        <div 
          className="p-6 rounded-3xl border shadow-sm transition-colors duration-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
          style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }}
        >
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider flex items-center gap-2" style={{ color: 'var(--color-text)' }}>
              <Shield className="h-4 w-4" style={{ color: 'var(--color-primary)' }} />
              {tr('tokenMasterSwitchTitle', 'Token Consumption Master Switch')}
            </h2>
            <p className="text-xs mt-1" style={{ color: 'var(--color-text-secondary)' }}>
              {tr('tokenMasterSwitchDesc', 'When Free Mode is active, all recipe generation, imports, and meal planners operate without deducting user tokens.')}
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <span 
              className="text-xs font-bold px-3 py-1 rounded-lg border transition"
              style={{
                backgroundColor: 'var(--color-inner-dark)',
                borderColor: settings.isEnabled ? 'var(--color-emerald, #10b981)' : '#f59e0b',
                color: settings.isEnabled ? 'var(--color-emerald, #10b981)' : '#fbbf24'
              }}
            >
              {settings.isEnabled 
                ? tr('tokenMasterSwitchActive', 'System Active (Enforce Consumption)') 
                : tr('tokenMasterSwitchFree', 'Free Token Mode (Bypass Consumption)')}
            </span>

            <button
              type="button"
              role="switch"
              aria-checked={settings.isEnabled}
              onClick={() => setSettings({ ...settings, isEnabled: !settings.isEnabled })}
              className="relative inline-flex h-7 w-14 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none"
              style={{
                backgroundColor: settings.isEnabled ? 'var(--color-emerald, #10b981)' : 'var(--color-inner-dark)'
              }}
            >
              <span
                aria-hidden="true"
                className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                  settings.isEnabled ? 'translate-x-7' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Token Identity Section */}
        <div 
          className="p-6 rounded-3xl border shadow-sm space-y-4 transition-colors duration-200"
          style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }}
        >
          <div className="border-b pb-3" style={{ borderColor: 'var(--color-border)' }}>
            <h2 className="text-sm font-bold flex items-center gap-2" style={{ color: 'var(--color-text)' }}>
              <Sparkles className="h-4 w-4" style={{ color: 'var(--color-primary)' }} />
              {tr('tokenIdentityHeading', 'Token Identity & Starting Quota')}
            </h2>
            <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
              {tr('tokenIdentityDesc', 'Customize the public currency name, display symbol/emoji, and initial registration balance.')}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div>
              <label className="block font-bold mb-1" style={{ color: 'var(--color-text)' }}>
                {tr('tokenNameLabel', 'Token Name')}
              </label>
              <input
                id="cfg_token_name"
                name="cfg_token_name"
                type="text"
                autoComplete="off"
                autoCorrect="off"
                data-lpignore="true"
                data-1p-ignore="true"
                data-bwignore="true"
                data-form-type="other"
                spellCheck="false"
                value={settings.tokenName}
                onChange={(e) => setSettings({ ...settings, tokenName: e.target.value })}
                placeholder={tr('tokenNamePlaceholder', 'e.g. Foodie Token')}
                className="w-full px-3.5 py-2.5 rounded-xl border outline-none font-bold"
                style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
              />
            </div>

            <div>
              <label className="block font-bold mb-1" style={{ color: 'var(--color-text)' }}>
                {tr('tokenSymbolLabel', 'Token Symbol / Emoji')}
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="cfg_token_symbol"
                  name="cfg_token_symbol"
                  type="text"
                  autoComplete="off"
                  autoCorrect="off"
                  data-lpignore="true"
                  data-1p-ignore="true"
                  data-bwignore="true"
                  data-form-type="other"
                  spellCheck="false"
                  value={settings.tokenSymbol}
                  onChange={(e) => setSettings({ ...settings, tokenSymbol: e.target.value })}
                  placeholder={tr('tokenSymbolPlaceholder', 'e.g. 🪙, 💎, ⚡, ⭐')}
                  className="flex-1 px-3.5 py-2.5 rounded-xl border outline-none font-bold text-center"
                  style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                />
                <div 
                  className="w-10 h-10 shrink-0 rounded-xl border flex items-center justify-center text-xl shadow-inner select-none transition-all duration-200"
                  style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)' }}
                  title="Dynamic Live Preview"
                >
                  {activeTokenSymbol}
                </div>
              </div>
            </div>

            <div>
              <label className="block font-bold mb-1" style={{ color: 'var(--color-text)' }}>
                {tr('startingBalanceLabel', 'New User Starting Balance')}
              </label>
              <input
                id="cfg_starting_balance"
                name="cfg_starting_balance"
                type="number"
                min="0"
                autoComplete="off"
                autoCorrect="off"
                data-lpignore="true"
                data-1p-ignore="true"
                data-bwignore="true"
                data-form-type="other"
                value={settings.startingBalance}
                onChange={(e) => setSettings({ ...settings, startingBalance: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                className="w-full px-3.5 py-2.5 rounded-xl border outline-none font-mono font-bold"
                style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
              />
              <span className="text-[10px] mt-0.5 block" style={{ color: 'var(--color-text-secondary)' }}>
                {tr('startingBalanceHelp', 'Initial spendable tokens granted immediately upon new account registration.')}
              </span>
            </div>
          </div>
        </div>

        {/* Feature Consumption Costs Section */}
        <div 
          className="p-6 rounded-3xl border shadow-sm space-y-4 transition-colors duration-200"
          style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }}
        >
          <div className="border-b pb-3" style={{ borderColor: 'var(--color-border)' }}>
            <h2 className="text-sm font-bold flex items-center gap-2" style={{ color: 'var(--color-text)' }}>
              <Activity className="h-4 w-4" style={{ color: 'var(--color-primary)' }} />
              {tr('featureCostsHeading', 'Feature Action Token Costs')}
            </h2>
            <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
              {tr('featureCostsDesc', 'Define token consumption amounts for AI assistance, recipe parsers, and nutritional telemetry.')}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs font-mono">
            {[
              { key: 'aiChefCost', label: tr('costAiChefLabel', 'AI Chef Recipe Generation'), val: settings.aiChefCost },
              { key: 'importUrlCost', label: tr('costImportUrlLabel', 'URL Recipe Scraper Import'), val: settings.importUrlCost },
              { key: 'importTextCost', label: tr('costImportTextLabel', 'Raw Text Recipe Import'), val: settings.importTextCost },
              { key: 'importPhotoCost', label: tr('costImportPhotoLabel', 'Photo / OCR Recipe Import'), val: settings.importPhotoCost },
              { key: 'mealPlannerCost', label: tr('costMealPlannerLabel', 'Weekly Meal Plan Generation'), val: settings.mealPlannerCost },
              { key: 'macroAnalysisCost', label: tr('costMacroAnalysisLabel', 'Nutritional Macro Analysis'), val: settings.macroAnalysisCost }
            ].map(action => (
              <div 
                key={action.key}
                className="p-3.5 rounded-2xl border flex items-center justify-between gap-3 shadow-xs"
                style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)' }}
              >
                <div className="font-sans font-bold" style={{ color: 'var(--color-text)' }}>
                  {action.label}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <input
                    type="number"
                    min="0"
                    autoComplete="off"
                    autoCorrect="off"
                    data-lpignore="true"
                    data-1p-ignore="true"
                    data-bwignore="true"
                    data-form-type="other"
                    value={action.val}
                    onChange={(e) => {
                      const v = Math.max(0, parseInt(e.target.value, 10) || 0);
                      setSettings(prev => ({
                        ...prev,
                        [action.key]: v,
                        ...(action.key === 'aiChefCost' ? { chefCost: v } : {})
                      }));
                    }}
                    className="w-16 px-2.5 py-1.5 rounded-lg border font-mono font-bold text-center outline-none"
                    style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                  />
                  <span className="font-bold text-sm">{activeTokenSymbol}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* TAB 2: USER PURCHASABLE TOKEN PACKAGES */}
      <div 
        role="region"
        aria-label="User Purchasable Packages"
        data-lpignore="true"
        className={activeTab === 'packages' ? 'space-y-6 animate-in fade-in' : 'hidden'}
      >
        <div 
          className="p-6 rounded-3xl border shadow-sm space-y-4 transition-colors duration-200"
          style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }}
        >
          <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: 'var(--color-border)' }}>
            <div>
              <h2 className="text-sm font-bold flex items-center gap-2" style={{ color: 'var(--color-text)' }}>
                <CreditCard className="h-4 w-4" style={{ color: 'var(--color-primary)' }} />
                {editingPkgId ? 'Edit Token Package' : tr('packagesHeading', 'User Purchasable Token Packages')}
              </h2>
              <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                {tr('packagesDesc', 'Manage bundles available for on-demand top-up on /token and the navigation top bar.')}
              </p>
            </div>

            {editingPkgId && (
              <button
                type="button"
                onClick={() => setEditingPkgId(null)}
                className="text-xs font-bold underline cursor-pointer"
                style={{ color: 'var(--color-primary)' }}
              >
                {tr('btnCancelEdit', 'Cancel Edit')}
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
            <div>
              <label className="block font-bold mb-1" style={{ color: 'var(--color-text)' }}>
                {tr('packageNameLabel', 'Package Name')}
              </label>
              <input
                type="text"
                autoComplete="off"
                autoCorrect="off"
                data-lpignore="true"
                data-1p-ignore="true"
                data-bwignore="true"
                data-form-type="other"
                value={pkgName}
                onChange={(e) => setPkgName(e.target.value)}
                placeholder="e.g. Starter Spark"
                className="w-full px-3 py-2 rounded-xl border outline-none font-bold"
                style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
              />
            </div>

            <div>
              <label className="block font-bold mb-1" style={{ color: 'var(--color-text)' }}>
                {tr('packageTokensLabel', 'Token Amount')}
              </label>
              <input
                type="number"
                min="1"
                autoComplete="off"
                autoCorrect="off"
                data-lpignore="true"
                data-1p-ignore="true"
                data-bwignore="true"
                data-form-type="other"
                value={pkgTokens}
                onChange={(e) => setPkgTokens(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className="w-full px-3 py-2 rounded-xl border outline-none font-mono font-bold"
                style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
              />
            </div>

            <div>
              <label className="block font-bold mb-1" style={{ color: 'var(--color-text)' }}>
                {tr('packagePriceLabel', `Price (${currencySymbol} ${currencyCode})`).replace('{currency}', `${currencySymbol} ${currencyCode}`)}
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                autoComplete="off"
                autoCorrect="off"
                data-lpignore="true"
                data-1p-ignore="true"
                data-bwignore="true"
                data-form-type="other"
                value={pkgPrice}
                onChange={(e) => setPkgPrice(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 rounded-xl border outline-none font-mono font-bold"
                style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
              />
            </div>

            <div>
              <label className="block font-bold mb-1" style={{ color: 'var(--color-text)' }}>
                {tr('packageBadgeLabel', 'Ribbon / Badge')}
              </label>
              <input
                type="text"
                autoComplete="off"
                autoCorrect="off"
                data-lpignore="true"
                data-1p-ignore="true"
                data-bwignore="true"
                data-form-type="other"
                value={pkgBadge}
                onChange={(e) => setPkgBadge(e.target.value)}
                placeholder="e.g. Popular, Best Value"
                className="w-full px-3 py-2 rounded-xl border outline-none font-bold"
                style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
              />
            </div>

            <div>
              <label className="block font-bold mb-1" style={{ color: 'var(--color-text)' }}>
                {tr('packageBonusLabel', 'Bonus Tokens')}
              </label>
              <input
                type="number"
                min="0"
                autoComplete="off"
                autoCorrect="off"
                data-lpignore="true"
                data-1p-ignore="true"
                data-bwignore="true"
                data-form-type="other"
                value={pkgBonus}
                onChange={(e) => setPkgBonus(Math.max(0, parseInt(e.target.value, 10) || 0))}
                className="w-full px-3 py-2 rounded-xl border outline-none font-mono font-bold"
                style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
              />
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="button"
              onClick={editingPkgId ? () => handleUpdatePackage(editingPkgId) : handleAddPackage}
              className="px-5 py-2 text-white font-bold rounded-xl text-xs shadow transition hover:opacity-90 flex items-center gap-1.5 cursor-pointer"
              style={{ backgroundColor: 'var(--color-primary)' }}
            >
              <Plus className="h-4 w-4" />
              <span>{editingPkgId ? tr('btnUpdatePackage', 'Update Package') : tr('btnAddPackage', '+ Add New Package')}</span>
            </button>
          </div>
        </div>

        {/* Active Bundles Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {settings.packages.map((pkg) => (
            <div
              key={pkg.id}
              className="p-6 rounded-3xl border shadow-sm flex flex-col justify-between space-y-4 relative overflow-hidden transition-colors duration-200"
              style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }}
            >
              {pkg.badge && (
                <span 
                  className="absolute top-4 right-4 px-3 py-0.5 rounded-full text-[9px] font-black uppercase text-white shadow-xs"
                  style={{ backgroundColor: 'var(--color-primary)' }}
                >
                  {pkg.badge}
                </span>
              )}

              <div>
                <h3 className="text-base font-extrabold" style={{ color: 'var(--color-text)' }}>{pkg.name}</h3>
                <div className="flex items-baseline gap-1 mt-2">
                  <span className="text-2xl font-black" style={{ color: 'var(--color-primary)' }}>
                    {currencySymbol}{Number(pkg.priceDollars ?? pkg.price ?? 0).toFixed(2)}
                  </span>
                  <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                    {tr('oneTimePayment', '/ one-time')}
                  </span>
                </div>

                <div 
                  className="mt-3 p-3.5 rounded-2xl border flex items-center justify-between" 
                  style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)' }}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{activeTokenSymbol}</span>
                    <span className="text-base font-black font-mono" style={{ color: 'var(--color-text)' }}>
                      +{Number(pkg.tokenAmount ?? pkg.tokens ?? 0).toLocaleString()}
                    </span>
                  </div>
                  {pkg.bonusTokens > 0 && (
                    <span className="text-[10px] font-black px-2.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                      +{pkg.bonusTokens} Bonus
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between pt-3 border-t" style={{ borderColor: 'var(--color-border)' }}>
                <button
                  type="button"
                  onClick={() => handleStartEdit(pkg)}
                  className="px-3 py-1.5 rounded-xl border text-xs font-bold transition hover:opacity-80 flex items-center gap-1 cursor-pointer"
                  style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                >
                  <Edit3 className="h-3.5 w-3.5" />
                  <span>Edit</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleDeletePackage(pkg.id)}
                  className="p-2 rounded-xl border text-red-400 border-red-500/30 hover:bg-red-500/10 transition cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* TAB 3: SUBSCRIPTION PLAN MONTHLY INCLUDED TOKENS */}
      <div 
        role="region"
        aria-label="Subscription Plan Monthly Included Tokens"
        data-lpignore="true"
        className={activeTab === 'plans' ? 'space-y-6 animate-in fade-in' : 'hidden'}
      >
        <div 
          className="p-6 rounded-3xl border shadow-sm space-y-4 transition-colors duration-200"
          style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }}
        >
          <div className="border-b pb-3" style={{ borderColor: 'var(--color-border)' }}>
            <h2 className="text-sm font-bold flex items-center gap-2" style={{ color: 'var(--color-text)' }}>
              <Layers className="h-4 w-4" style={{ color: 'var(--color-primary)' }} />
              {tr('planAllocationsHeading', 'Subscription Plan Monthly Included Tokens')}
            </h2>
            <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
              {tr('planAllocationsDesc', 'Define recurring token quotas automatically refreshed for active subscription tiers.')}
            </p>
          </div>

          <div 
            className="rounded-2xl border overflow-hidden shadow-xs transition-colors duration-200"
            style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)' }}
          >
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-card)' }}>
                    <th className="py-3.5 px-5 font-bold" style={{ color: 'var(--color-text)' }}>
                      {tr('colPlan', 'Subscription Plan')}
                    </th>
                    <th className="py-3.5 px-5 font-bold" style={{ color: 'var(--color-text)' }}>
                      {tr('colPlanPrice', 'Plan Price')}
                    </th>
                    <th className="py-3.5 px-5 font-bold" style={{ color: 'var(--color-text)' }}>
                      {tr('colMonthlyTokens', 'Monthly Token Allowance')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
                  {plans.length === 0 ? (
                    Object.entries(settings.planAllocations).map(([planSlug, quota]) => (
                      <tr key={planSlug} className="transition" style={{ backgroundColor: 'transparent' }}>
                        <td className="py-3.5 px-5 font-bold capitalize" style={{ color: 'var(--color-text)' }}>
                          {planSlug.replace('-', ' ')}
                        </td>
                        <td className="py-3.5 px-5 font-mono text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                          Tier Standard
                        </td>
                        <td className="py-3.5 px-5">
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min="0"
                              autoComplete="off"
                              autoCorrect="off"
                              data-lpignore="true"
                              data-1p-ignore="true"
                              data-bwignore="true"
                              data-form-type="other"
                              value={quota}
                              onChange={(e) => {
                                const val = Math.max(0, parseInt(e.target.value, 10) || 0);
                                setSettings(prev => ({
                                  ...prev,
                                  planAllocations: { ...prev.planAllocations, [planSlug]: val }
                                }));
                              }}
                              className="w-28 px-3 py-1.5 rounded-xl border outline-none font-mono font-bold"
                              style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                            />
                            <span className="font-bold">{activeTokenSymbol} {tr('tokensPerMonth', 'tokens/mo')}</span>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    plans.map((p) => {
                      const currentVal = settings.planAllocations[p.slug] !== undefined 
                        ? settings.planAllocations[p.slug] 
                        : (p.token_limit || 0);
                      return (
                        <tr key={p.id || p.slug} className="transition" style={{ backgroundColor: 'transparent' }}>
                          <td className="py-3.5 px-5 font-bold" style={{ color: 'var(--color-text)' }}>
                            <div className="font-extrabold">{p.name}</div>
                            <span className="font-mono text-[10px] opacity-60">slug: {p.slug}</span>
                          </td>
                          <td className="py-3.5 px-5 font-mono font-bold" style={{ color: 'var(--color-primary)' }}>
                            {currencySymbol}{parseFloat(p.price || 0).toFixed(2)} / {p.interval || 'month'}
                          </td>
                          <td className="py-3.5 px-5">
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                min="0"
                                autoComplete="off"
                                autoCorrect="off"
                                data-lpignore="true"
                                data-1p-ignore="true"
                                data-bwignore="true"
                                data-form-type="other"
                                value={currentVal}
                                onChange={(e) => {
                                  const val = Math.max(0, parseInt(e.target.value, 10) || 0);
                                  setSettings(prev => ({
                                    ...prev,
                                    planAllocations: { ...prev.planAllocations, [p.slug]: val }
                                  }));
                                }}
                                className="w-28 px-3 py-1.5 rounded-xl border outline-none font-mono font-bold"
                                style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                              />
                              <span className="font-bold">{activeTokenSymbol} {tr('tokensPerMonth', 'tokens/mo')}</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* TAB 4: TOKEN AUDIT LEDGER */}
      <div 
        role="region"
        aria-label="Token Transaction Audit Ledger"
        data-lpignore="true"
        className={activeTab === 'ledger' ? 'space-y-4 animate-in fade-in' : 'hidden'}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-1">
          <div>
            <h2 className="text-base font-black flex items-center gap-2" style={{ color: 'var(--color-text)' }}>
              <History className="h-4 w-4" style={{ color: 'var(--color-primary)' }} />
              {tr('ledgerHeading', 'Recent Token Transaction Activity')}
            </h2>
            <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
              {tr('ledgerDesc', 'Audit ledger tracking user token consumption, bundle purchases, and promotional grants.')}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={ledgerFilterType}
              onChange={(e) => setLedgerFilterType(e.target.value)}
              className="px-3 py-1.5 rounded-xl border text-xs font-bold outline-none cursor-pointer"
              style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
            >
              <option value="all">{tr('filterAllTypes', 'All Transaction Types')}</option>
              <option value="purchases">{tr('filterPurchases', 'Purchases')}</option>
              <option value="deductions">{tr('filterDeductions', 'Consumption / Deductions')}</option>
              <option value="grants">{tr('filterGrants', 'Grants & Signups')}</option>
            </select>

            <div 
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs"
              style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)' }}
            >
              <span className="text-[11px] font-bold" style={{ color: 'var(--color-text-secondary)' }}>
                {tr('perPage', 'Rows:')}
              </span>
              <select
                value={ledgerPageSize}
                onChange={(e) => setLedgerPageSize(Number(e.target.value))}
                className="bg-transparent text-xs font-bold outline-none cursor-pointer"
                style={{ color: 'var(--color-text)' }}
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>

            <button
              type="button"
              onClick={handleClearLedger}
              className="px-3 py-1.5 rounded-xl border text-xs font-bold transition hover:bg-red-500/10 text-red-400 border-red-500/30 cursor-pointer"
            >
              {tr('btnClearLedger', 'Clear Audit Trail')}
            </button>
          </div>
        </div>

        <div 
          className="border rounded-3xl overflow-hidden shadow-xl transition-colors duration-200"
          style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead 
                className="border-b uppercase font-bold text-[10px] tracking-wider"
                style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
              >
                <tr>
                  <th className="px-5 py-4">{tr('colUser', 'Customer')}</th>
                  <th className="px-5 py-4">{tr('colType', 'Transaction Type')}</th>
                  <th className="px-5 py-4">{tr('colAmount', 'Amount')}</th>
                  <th className="px-5 py-4">{tr('colBalanceAfter', 'Balance After')}</th>
                  <th className="px-5 py-4">{tr('colDate', 'Timestamp')}</th>
                  <th className="px-5 py-4">{tr('colDescription', 'Description')}</th>
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}>
                {paginatedTransactions.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-10" style={{ color: 'var(--color-text-secondary)' }}>
                      {tr('noLedgerRecords', 'No recent token transactions recorded.')}
                    </td>
                  </tr>
                ) : (
                  paginatedTransactions.map((tx) => {
                    const isPositive = tx.amount > 0;
                    return (
                      <tr key={tx.id} className="transition" style={{ borderColor: 'var(--color-border)' }}>
                        <td className="px-5 py-4 font-mono font-bold text-xs" style={{ color: 'var(--color-text)' }}>
                          {tx.customer_email || 'System User'}
                        </td>

                        <td className="px-5 py-4">
                          <span 
                            className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border"
                            style={{
                              backgroundColor: 'var(--color-inner-dark)',
                              borderColor: isPositive ? 'var(--color-emerald, #10b981)' : '#f59e0b',
                              color: isPositive ? 'var(--color-emerald, #10b981)' : '#fbbf24'
                            }}
                          >
                            {tx.type}
                          </span>
                        </td>

                        <td className="px-5 py-4 font-mono font-black" style={{ color: isPositive ? 'var(--color-emerald, #10b981)' : '#ef4444' }}>
                          {isPositive ? `+${tx.amount}` : tx.amount} {activeTokenSymbol}
                        </td>

                        <td className="px-5 py-4 font-mono font-bold" style={{ color: 'var(--color-text)' }}>
                          {tx.balance_after !== undefined ? tx.balance_after : '—'}
                        </td>

                        <td className="px-5 py-4 text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
                          {new Date(tx.created_at).toLocaleDateString(locale === 'th' ? 'th-TH' : (locale || 'en-US'), { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </td>

                        <td className="px-5 py-4 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                          {formatLedgerDescription(tx.description, activeTokenSymbol)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Ledger Pagination Bar */}
        <div 
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 px-1 text-xs"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          <div className="font-mono text-xs font-semibold">
            {totalLedgerRecords > 0 ? (
              <>
                {tr('showingRecords', 'Showing')}{' '}
                <strong style={{ color: 'var(--color-text)' }}>
                  {(ledgerPage - 1) * ledgerPageSize + 1}
                </strong>
                {' - '}
                <strong style={{ color: 'var(--color-text)' }}>
                  {Math.min(ledgerPage * ledgerPageSize, totalLedgerRecords)}
                </strong>
                {' '}{tr('ofTotal', 'of')}{' '}
                <strong style={{ color: 'var(--color-text)' }}>
                  {totalLedgerRecords}
                </strong>
                {' '}{tr('records', 'transactions')}
              </>
            ) : (
              <span>0 {tr('records', 'transactions')}</span>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={ledgerPage <= 1}
              onClick={() => setLedgerPage(1)}
              className="px-2.5 py-1.5 rounded-xl border font-bold text-xs transition disabled:opacity-30 cursor-pointer shadow-xs hover:border-[var(--color-primary)]"
              style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
              title={tr('firstPage', 'First Page')}
            >
              «
            </button>

            <button
              type="button"
              disabled={ledgerPage <= 1}
              onClick={() => setLedgerPage(prev => Math.max(1, prev - 1))}
              className="p-1.5 rounded-xl border transition disabled:opacity-30 cursor-pointer shadow-xs hover:border-[var(--color-primary)]"
              style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
              title={tr('prevPage', 'Previous Page')}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            <span 
              className="px-3.5 py-1.5 rounded-xl font-mono font-bold border shadow-xs text-xs"
              style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
            >
              {tr('page', 'Page')} {ledgerPage} / {totalLedgerPages}
            </span>

            <button
              type="button"
              disabled={ledgerPage >= totalLedgerPages}
              onClick={() => setLedgerPage(prev => Math.min(totalLedgerPages, prev + 1))}
              className="p-1.5 rounded-xl border transition disabled:opacity-30 cursor-pointer shadow-xs hover:border-[var(--color-primary)]"
              style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
              title={tr('nextPage', 'Next Page')}
            >
              <ChevronRight className="h-4 w-4" />
            </button>

            <button
              type="button"
              disabled={ledgerPage >= totalLedgerPages}
              onClick={() => setLedgerPage(totalLedgerPages)}
              className="px-2.5 py-1.5 rounded-xl border font-bold text-xs transition disabled:opacity-30 cursor-pointer shadow-xs hover:border-[var(--color-primary)]"
              style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
              title={tr('lastPage', 'Last Page')}
            >
              »
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
