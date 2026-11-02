// @ts-nocheck
'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { 
  Sparkles, CheckCircle2, AlertCircle, Save, 
  Plus, Trash2, Edit3, Shield, Activity, 
  CreditCard, History, Sliders, Layers, ArrowUpDown,
  ChevronLeft, ChevronRight, Search, X, Check,
  UserCheck, ArrowDownLeft, ArrowUpRight, Scale, RefreshCw, RotateCcw
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
  bestValue?: boolean;
  description?: string;
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
  tokenIcon?: string;
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
  customer_email?: string;
  user_email?: string;
  amount: number;
  balance_after: number;
  type: string;
  description: string;
  created_at: string;
}

export interface CustomerUserRecord {
  id: string;
  email: string;
  name?: string;
  customer_name?: string;
  token_balance?: number;
  tokens?: number;
  wallet_balance?: number;
  role?: string;
}

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

// Module-level cache to eliminate shadow loader flashing on tab re-entry
let memoryCachedSettings: TokenSettings | null = null;
let memoryCachedPlans: SubscriptionPlanItem[] | null = null;
let memoryCachedTransactions: TokenTransactionRecord[] | null = null;
let memoryCachedUsers: CustomerUserRecord[] | null = null;
let memoryCachedCurrencySymbol = '$';
let memoryCachedCurrencyCode = 'USD';
let memoryLoaded = false;

export default function AdminTokenSettingPage() {
  const { t, locale } = useTranslation();

  const tr = useCallback((key: string, fallback: string): string => {
    if (typeof t === 'function') {
      const val = t(key);
      if (val && val !== key) return val;
    }
    return fallback;
  }, [t]);

  // Tab 1: 'ledger' (Token Audit Ledger) is default entry on load
  const [activeTab, setActiveTab] = useState<'ledger' | 'system' | 'packages' | 'plans' | 'adjustment'>('ledger');
  
  const [settings, setSettings] = useState<TokenSettings>(() => memoryCachedSettings || {
    tokenName: '',
    tokenSymbol: '🪙',
    tokenIcon: '',
    startingBalance: 0,
    isEnabled: true,
    importUrlCost: 5,
    importTextCost: 2,
    importPhotoCost: 10,
    aiChefCost: 2,
    chefCost: 2,
    mealPlannerCost: 5,
    macroAnalysisCost: 3,
    planAllocations: {},
    packages: []
  });

  const [plans, setPlans] = useState<SubscriptionPlanItem[]>(() => memoryCachedPlans || []);
  const [transactions, setTransactions] = useState<TokenTransactionRecord[]>(() => memoryCachedTransactions || []);
  const [users, setUsers] = useState<CustomerUserRecord[]>(() => memoryCachedUsers || []);
  const [currencySymbol, setCurrencySymbol] = useState<string>(() => memoryCachedCurrencySymbol);
  const [currencyCode, setCurrencyCode] = useState<string>(() => memoryCachedCurrencyCode);
  const [loading, setLoading] = useState<boolean>(() => !memoryLoaded);
  const [saving, setSaving] = useState<boolean>(false);
  const [syncingUsers, setSyncingUsers] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  // Package editor state (allows empty initial inputs without hardcoded mock values)
  const [editingPkgId, setEditingPkgId] = useState<string | null>(null);
  const [pkgName, setPkgName] = useState<string>('');
  const [pkgTokens, setPkgTokens] = useState<number | string>(500);
  const [pkgPrice, setPkgPrice] = useState<number | string>(7.99);
  const [pkgBadge, setPkgBadge] = useState<string>('');
  const [pkgBonus, setPkgBonus] = useState<number | string>(0);
  const [pkgIsPopular, setPkgIsPopular] = useState<boolean>(false);

  // Token Adjustment state
  const [adjustCustomerMode, setAdjustCustomerMode] = useState<'select' | 'manual'>('select');
  const [selectedUserEmail, setSelectedUserEmail] = useState<string>('');
  const [manualUserEmail, setManualUserEmail] = useState<string>('');
  const [userDropdownSearch, setUserDropdownSearch] = useState<string>('');
  const [adjustType, setAdjustType] = useState<'add' | 'deduct' | 'set'>('add');
  const [adjustAmount, setAdjustAmount] = useState<number | string>(100);
  const [adjustReason, setAdjustReason] = useState<string>('Customer Support Grant');
  const [adjustNotes, setAdjustNotes] = useState<string>('');
  const [adjusting, setAdjusting] = useState<boolean>(false);

  // Ledger filter & pagination state
  const [ledgerSearch, setLedgerSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [ledgerFilterType, setLedgerFilterType] = useState('all');
  const [ledgerPage, setLedgerPage] = useState<number>(1);
  const [ledgerPageSize, setLedgerPageSize] = useState<number>(10);

  const isFetchingRef = useRef<boolean>(false);
  const isSavingRef = useRef<boolean>(false);

  const showToast = (type: 'success' | 'error', msg: string) => {
    setFeedback({ type, msg });
    setTimeout(() => setFeedback(null), 4000);
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(ledgerSearch);
      setLedgerPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [ledgerSearch]);

  const loadTokenData = useCallback(async (force = false) => {
    if (!force && memoryLoaded && memoryCachedSettings) {
      setLoading(false);
      return;
    }

    if (isFetchingRef.current || isSavingRef.current) return;
    isFetchingRef.current = true;
    if (!memoryLoaded) setLoading(true);

    try {
      if (typeof window !== 'undefined') {
        const storedSym = localStorage.getItem('zecratary_currency_symbol');
        const storedCur = localStorage.getItem('zecratary_currency');
        if (storedSym) {
          setCurrencySymbol(storedSym);
          memoryCachedCurrencySymbol = storedSym;
        }
        if (storedCur) {
          setCurrencyCode(storedCur);
          memoryCachedCurrencyCode = storedCur;
        }
      }

      let res = await fetch('/api/admin/token-setting?t=' + Date.now(), { cache: 'no-store' });
      if (!res.ok) {
        res = await fetch('/api/admin/token-settings?t=' + Date.now(), { cache: 'no-store' });
      }
      if (res.ok) {
        const data = await res.json();
        if (data.currencySymbol) {
          setCurrencySymbol(data.currencySymbol);
          memoryCachedCurrencySymbol = data.currencySymbol;
        }
        if (data.currency) {
          setCurrencyCode(data.currency);
          memoryCachedCurrencyCode = data.currency;
        }

        if (Array.isArray(data.plans)) {
          setPlans(data.plans);
          memoryCachedPlans = data.plans;
        }

        if (Array.isArray(data.users)) {
          const sanitizedUsers: CustomerUserRecord[] = data.users.map((u: any) => {
            const rawBal = u.token_balance !== undefined ? u.token_balance : (u.tokens !== undefined ? u.tokens : 0);
            const numBal = !isNaN(Number(rawBal)) ? Number(rawBal) : 0;
            return {
              ...u,
              token_balance: numBal,
              tokens: numBal
            };
          });

          setUsers(sanitizedUsers);
          memoryCachedUsers = sanitizedUsers;

          setSelectedUserEmail(prev => {
            if (prev && sanitizedUsers.some(u => u.email.toLowerCase() === prev.toLowerCase())) {
              return prev;
            }
            return sanitizedUsers.length > 0 ? sanitizedUsers[0].email : '';
          });
        }

        const loaded = data.tokenSettings || data.settings || data;
        if (loaded) {
          const mergedPlanAllocations = { ...(loaded.planAllocations || {}) };
          if (Array.isArray(data.plans)) {
            data.plans.forEach((p: SubscriptionPlanItem) => {
              if (p.token_limit !== undefined && mergedPlanAllocations[p.slug] === undefined) {
                mergedPlanAllocations[p.slug] = p.token_limit;
              }
            });
          }

          const activeSymbol = loaded.tokenSymbol || '🪙';
          const resolvedChef = Number(loaded.aiChefCost ?? loaded.chefCost ?? 2);

          const loadedPkgs = Array.isArray(loaded.packages)
            ? loaded.packages.map((p: any) => ({
                id: p.id || 'pkg_' + Math.random().toString(36).substring(2, 7),
                name: p.name || tr('defaultBundleName', 'Token Bundle'),
                tokenAmount: Number(p.tokenAmount ?? p.tokens ?? 250),
                tokens: Number(p.tokens ?? p.tokenAmount ?? 250),
                priceDollars: Number(p.priceDollars ?? p.price ?? 4.99),
                price: Number(p.price ?? p.priceDollars ?? 4.99),
                badge: p.badge || undefined,
                bonusTokens: Number(p.bonusTokens || 0),
                isPopular: Boolean(p.isPopular || (p.badge && String(p.badge).toLowerCase().includes('popular'))),
                bestValue: Boolean(p.bestValue || (p.badge && String(p.badge).toLowerCase().includes('value'))),
                description: p.description || ''
              }))
            : [];

          const newSettings: TokenSettings = {
            tokenName: loaded.tokenName || 'Foodie Token',
            tokenSymbol: activeSymbol,
            tokenIcon: loaded.tokenIcon || '',
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
          };

          setSettings(newSettings);
          memoryCachedSettings = newSettings;
          memoryLoaded = true;

          if (typeof window !== 'undefined') {
            localStorage.setItem('zecratary_token_symbol', activeSymbol);
            localStorage.setItem('zecratary_token_name', loaded.tokenName || 'Foodie Token');
          }
        }
        if (Array.isArray(data.transactions)) {
          setTransactions(data.transactions);
          memoryCachedTransactions = data.transactions;
        }
      }
    } catch (err) {
      console.warn('[Token Setting] Error loading configuration:', err);
    } finally {
      setLoading(false);
      setSyncingUsers(false);
      isFetchingRef.current = false;
    }
  }, [tr]);

  useEffect(() => {
    document.title = `${tr('tokenSettingDocTitle', 'Token Settings - Admin Console')}`;
    loadTokenData(false);

    const handleSync = () => {
      loadTokenData(true);
    };

    let tokenBc: BroadcastChannel | null = null;
    let balanceBc: BroadcastChannel | null = null;
    let walletBc: BroadcastChannel | null = null;

    try {
      tokenBc = new BroadcastChannel('zecratary_token_channel');
      tokenBc.onmessage = (e) => {
        const t = e.data?.type;
        if (t === 'TOKEN_SETTINGS_UPDATED' || t === 'TOKEN_UPDATED' || t === 'TOKEN_PURCHASED' || t === 'TOKEN_ADJUSTMENT_SUCCESS' || t === 'TOKEN_BALANCE_UPDATED') {
          handleSync();
        }
      };

      balanceBc = new BroadcastChannel('zecratary_balance_channel');
      balanceBc.onmessage = (e) => {
        const t = e.data?.type;
        if (t === 'TOKEN_SETTINGS_UPDATED' || t === 'TOKEN_UPDATED' || t === 'TOKEN_BALANCE_UPDATED' || t === 'TOKEN_PURCHASED') {
          handleSync();
        }
      };

      // Bug Fix: Real-time listener for wallet settings updates
      walletBc = new BroadcastChannel('zecratary_wallet_channel');
      walletBc.onmessage = () => {
        handleSync();
      };
    } catch (_) {}

    window.addEventListener('zecratary_tokens_updated', handleSync);
    window.addEventListener('zecratary_wallet_updated', handleSync);
    window.addEventListener('zecratary_languages_updated', handleSync);
    window.addEventListener('zecratary_dictionary_updated', handleSync);
    window.addEventListener('zecratary_locale_changed', handleSync);

    return () => {
      if (tokenBc) tokenBc.close();
      if (balanceBc) balanceBc.close();
      if (walletBc) walletBc.close();
      window.removeEventListener('zecratary_tokens_updated', handleSync);
      window.removeEventListener('zecratary_wallet_updated', handleSync);
      window.removeEventListener('zecratary_languages_updated', handleSync);
      window.removeEventListener('zecratary_dictionary_updated', handleSync);
      window.removeEventListener('zecratary_locale_changed', handleSync);
    };
  }, [loadTokenData, tr]);

  // Save Settings to PostgreSQL & MySQL
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
      isPopular: Boolean(p.isPopular),
      bestValue: Boolean(p.bestValue),
      description: p.description || ''
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
        setSettings(payload);
        memoryCachedSettings = payload;
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

          try {
            const tbc = new BroadcastChannel('zecratary_token_channel');
            tbc.postMessage({ type: 'TOKEN_SETTINGS_UPDATED', tokenSymbol: activeSymbol, settings: payload });
            tbc.close();
          } catch (_) {}
        }
        showToast('success', tr('toastTokenSettingsSaved', 'Token settings saved and synchronized with PostgreSQL & MySQL!'));
      } else {
        throw new Error(data.error || tr('toastTokenSettingsError', 'Failed to save token settings.'));
      }
    } catch (err: any) {
      showToast('error', err.message || tr('toastTokenSettingsError', 'Failed to save token settings. Please try again.'));
    } finally {
      setSaving(false);
      setTimeout(() => { isSavingRef.current = false; }, 300);
    }
  };

  const handleResetDefaults = () => {
    if (!confirm(tr('confirmResetDefaults', 'Reset token settings to platform defaults?'))) return;
    const defaultPkgs: TokenPackage[] = [
      { id: 'pkg_starter', name: tr('defaultPkgStarter', 'Starter Spark'), tokenAmount: 250, tokens: 250, priceDollars: 4.99, price: 4.99, badge: 'Popular', bonusTokens: 0, isPopular: true, description: tr('defaultPkgStarterDesc', 'Perfect for light exploration.') },
      { id: 'pkg_chef', name: tr('defaultPkgChef', 'Culinary Master'), tokenAmount: 1000, tokens: 1000, priceDollars: 14.99, price: 14.99, badge: 'Best Value', bonusTokens: 150, isPopular: false, bestValue: true, description: tr('defaultPkgChefDesc', 'Generous bonus tokens for daily cooking.') },
      { id: 'pkg_executive', name: tr('defaultPkgExec', 'Kitchen Enterprise'), tokenAmount: 5000, tokens: 5000, priceDollars: 49.99, price: 49.99, badge: 'VIP', bonusTokens: 1000, isPopular: false, description: tr('defaultPkgExecDesc', 'High-volume throughput.') }
    ];

    const defSettings: TokenSettings = {
      tokenName: 'Foodie Token',
      tokenSymbol: '🪙',
      tokenIcon: '',
      startingBalance: 100,
      isEnabled: true,
      importUrlCost: 5,
      importTextCost: 2,
      importPhotoCost: 10,
      aiChefCost: 2,
      chefCost: 2,
      mealPlannerCost: 5,
      macroAnalysisCost: 3,
      planAllocations: { 'free': 50, 'nutrition-pro': 750, 'vip-chef': 3000 },
      packages: defaultPkgs
    };

    setSettings(defSettings);
    memoryCachedSettings = defSettings;
    showToast('success', tr('toastTokenSettingsReset', 'Token settings reset to platform defaults! Click Save to apply.'));
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
        memoryCachedTransactions = [];
        showToast('success', tr('toastLedgerCleared', 'Token transaction audit trail cleared successfully.'));
      }
    } catch (err: any) {
      showToast('error', err.message || tr('toastLedgerClearError', 'Failed to clear ledger.'));
    }
  };

  // Manual Token Customer Balance Adjustment
  const handleApplyAdjustment = async () => {
    const targetEmail = adjustCustomerMode === 'select' ? selectedUserEmail.trim() : manualUserEmail.trim();
    if (!targetEmail || !targetEmail.includes('@')) {
      showToast('error', tr('errValidEmail', 'Please select or provide a valid customer email address.'));
      return;
    }

    const numAmount = Number(adjustAmount);
    if (isNaN(numAmount) || numAmount < 0 || (adjustType !== 'set' && numAmount === 0)) {
      showToast('error', tr('errValidAmount', 'Please enter a valid positive token amount.'));
      return;
    }

    setAdjusting(true);
    try {
      const activeSymbol = settings.tokenSymbol || '🪙';
      const payload = {
        action: 'adjust_balance',
        customer_email: targetEmail,
        user_email: targetEmail,
        adjustment_type: adjustType,
        amount: numAmount,
        reason: adjustReason,
        notes: adjustNotes,
        token_symbol: activeSymbol
      };

      let res = await fetch('/api/admin/token-setting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        res = await fetch('/api/admin/token-settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }

      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        // Bug Fix: Guarantee reliable fallback to calculatedBalanceAfter if backend omits new_balance
        const resolvedNewBal = Number(data.new_balance ?? data.balance_after ?? calculatedBalanceAfter);

        setUsers(prev => {
          const exists = prev.some(u => u.email.toLowerCase() === targetEmail.toLowerCase());
          if (exists) {
            return prev.map(u => u.email.toLowerCase() === targetEmail.toLowerCase() 
              ? { ...u, token_balance: resolvedNewBal, tokens: resolvedNewBal } 
              : u
            );
          }
          return [{
            id: 'usr_' + Date.now().toString(36),
            email: targetEmail,
            customer_name: targetEmail.split('@')[0],
            token_balance: resolvedNewBal,
            tokens: resolvedNewBal
          }, ...prev];
        });

        if (memoryCachedUsers) {
          memoryCachedUsers = memoryCachedUsers.map(u => 
            u.email.toLowerCase() === targetEmail.toLowerCase() 
              ? { ...u, token_balance: resolvedNewBal, tokens: resolvedNewBal } 
              : u
          );
        }

        if (data.transaction) {
          setTransactions(prev => [data.transaction, ...prev]);
          if (memoryCachedTransactions) {
            memoryCachedTransactions = [data.transaction, ...memoryCachedTransactions];
          }
        }

        try {
          const bc = new BroadcastChannel('zecratary_token_channel');
          bc.postMessage({ type: 'TOKEN_ADJUSTMENT_SUCCESS', email: targetEmail, balance: resolvedNewBal });
          bc.close();
        } catch (_) {}
        try {
          const bcb = new BroadcastChannel('zecratary_balance_channel');
          bcb.postMessage({ type: 'TOKEN_BALANCE_UPDATED', email: targetEmail, balance: resolvedNewBal });
          bcb.close();
        } catch (_) {}

        window.dispatchEvent(new CustomEvent('zecratary_tokens_updated', { detail: { email: targetEmail, balance: resolvedNewBal } }));
        showToast('success', tr('toastAdjustmentSuccess', `Balance for ${targetEmail} updated to ${resolvedNewBal.toLocaleString()} ${activeSymbol}`));
        setAdjustNotes('');
      } else {
        throw new Error(data.error || tr('toastAdjustmentError', 'Failed to apply balance adjustment.'));
      }
    } catch (err: any) {
      showToast('error', err.message || tr('toastAdjustmentError', 'Error applying customer token adjustment.'));
    } finally {
      setAdjusting(false);
    }
  };

  const handleManualSyncUsers = async () => {
    setSyncingUsers(true);
    await loadTokenData(true);
    showToast('success', tr('toastUsersSynced', 'Customer balances synchronized with PostgreSQL & MySQL.'));
  };

  const handleAddPackage = () => {
    const amt = Math.max(1, parseInt(String(pkgTokens), 10) || 500);
    const prc = Math.max(0.01, parseFloat(String(pkgPrice)) || 5.99);
    const newPkg: TokenPackage = {
      id: 'pkg_' + Date.now().toString(36),
      name: pkgName.trim() || tr('newPackageDefaultName', 'Custom Bundle'),
      tokenAmount: amt,
      tokens: amt,
      priceDollars: prc,
      price: prc,
      badge: pkgBadge.trim() || undefined,
      bonusTokens: parseInt(String(pkgBonus), 10) || 0,
      isPopular: pkgIsPopular,
      description: tr('defaultPkgTierDesc', 'Generous culinary token tier.')
    };

    setSettings(prev => ({
      ...prev,
      packages: [...prev.packages, newPkg]
    }));

    setEditingPkgId(null);
    setPkgName('');
    setPkgTokens(500);
    setPkgPrice(7.99);
    setPkgBadge('');
    setPkgBonus(0);
    setPkgIsPopular(false);
    showToast('success', tr('addedPackageToast', `Added package "${newPkg.name}". Click Save to persist.`));
  };

  const handleUpdatePackage = (pkgId: string) => {
    const amt = Math.max(1, parseInt(String(pkgTokens), 10) || 500);
    const prc = Math.max(0.01, parseFloat(String(pkgPrice)) || 5.99);

    setSettings(prev => ({
      ...prev,
      packages: prev.packages.map(p => p.id === pkgId ? {
        ...p,
        name: pkgName.trim() || p.name,
        tokenAmount: amt,
        tokens: amt,
        priceDollars: prc,
        price: prc,
        badge: pkgBadge.trim() || undefined,
        bonusTokens: parseInt(String(pkgBonus), 10) || 0,
        isPopular: pkgIsPopular
      } : p)
    }));

    setEditingPkgId(null);
    setPkgName('');
    setPkgTokens(500);
    setPkgPrice(7.99);
    setPkgBadge('');
    setPkgBonus(0);
    setPkgIsPopular(false);
    showToast('success', tr('updatedPackageToast', `Updated package "${pkgName}". Click Save to persist.`));
  };

  const handleDeletePackage = (pkgId: string) => {
    if (settings.packages.length <= 1) {
      alert(tr('keepOnePackageWarning', 'You must keep at least one token package active.'));
      return;
    }
    setSettings(prev => ({
      ...prev,
      packages: prev.packages.filter(p => p.id !== pkgId)
    }));
    showToast('success', tr('removedPackageToast', 'Package removed. Click Save to persist.'));
  };

  const handleStartEdit = (pkg: TokenPackage) => {
    setEditingPkgId(pkg.id);
    setPkgName(pkg.name);
    setPkgTokens(pkg.tokenAmount ?? pkg.tokens ?? 500);
    setPkgPrice(pkg.priceDollars ?? pkg.price ?? 4.99);
    setPkgBadge(pkg.badge || '');
    setPkgBonus(pkg.bonusTokens || 0);
    setPkgIsPopular(Boolean(pkg.isPopular));
  };

  // Bug Fix: Distinct mutually-exclusive category matching
  const filteredTransactions = useMemo(() => {
    return transactions.filter(tx => {
      const email = (tx.customer_email || tx.user_email || '').toLowerCase();
      const desc = (tx.description || '').toLowerCase();
      const id = (tx.id || '').toLowerCase();
      const type = (tx.type || '').toLowerCase();

      const matchSearch = !debouncedSearch.trim() || 
        email.includes(debouncedSearch.toLowerCase()) ||
        desc.includes(debouncedSearch.toLowerCase()) ||
        id.includes(debouncedSearch.toLowerCase()) ||
        type.includes(debouncedSearch.toLowerCase());
      
      const matchType = ledgerFilterType === 'all' || 
        (ledgerFilterType === 'purchases' && (type.includes('purchase') || type.includes('topup'))) ||
        (ledgerFilterType === 'deductions' && (tx.amount < 0 || type.includes('deduct') || type.includes('consumption')) && !type.includes('adjust')) ||
        (ledgerFilterType === 'grants' && tx.amount > 0 && !type.includes('purchase') && !type.includes('adjust')) ||
        (ledgerFilterType === 'adjustments' && type.includes('adjust'));

      return matchSearch && matchType;
    });
  }, [transactions, debouncedSearch, ledgerFilterType]);

  const totalLedgerRecords = filteredTransactions.length;
  const totalLedgerPages = Math.max(1, Math.ceil(totalLedgerRecords / ledgerPageSize));
  const paginatedTransactions = useMemo(() => {
    const start = (ledgerPage - 1) * ledgerPageSize;
    return filteredTransactions.slice(start, start + ledgerPageSize);
  }, [filteredTransactions, ledgerPage, ledgerPageSize]);

  const filteredUsers = useMemo(() => {
    if (!userDropdownSearch.trim()) return users;
    const q = userDropdownSearch.toLowerCase();
    return users.filter(u => 
      u.email.toLowerCase().includes(q) || 
      (u.name && u.name.toLowerCase().includes(q)) ||
      (u.customer_name && u.customer_name.toLowerCase().includes(q))
    );
  }, [users, userDropdownSearch]);

  const activeCustomer = useMemo(() => {
    const target = adjustCustomerMode === 'select' ? selectedUserEmail : manualUserEmail;
    if (!target) return null;
    return users.find(u => u.email.toLowerCase() === target.toLowerCase()) || {
      id: 'custom_user',
      email: target,
      token_balance: 0,
      tokens: 0
    };
  }, [users, adjustCustomerMode, selectedUserEmail, manualUserEmail]);

  const currentCustomerBalance = Number(activeCustomer?.token_balance ?? activeCustomer?.tokens ?? 0);
  const calculatedBalanceAfter = useMemo(() => {
    const amt = Math.max(0, Number(adjustAmount) || 0);
    if (adjustType === 'add') return currentCustomerBalance + amt;
    if (adjustType === 'deduct') return Math.max(0, currentCustomerBalance - amt);
    if (adjustType === 'set') return amt;
    return currentCustomerBalance;
  }, [currentCustomerBalance, adjustType, adjustAmount]);

  const activeTokenSymbol = settings.tokenSymbol || '🪙';

  return (
    <div 
      className="w-full max-w-full px-4 sm:px-6 lg:px-8 xl:px-10 space-y-6 pb-24 pt-2 font-sans transition-colors duration-200"
      style={{ color: 'var(--color-text)' }}
    >
      {/* 1. Harmonized Header: Clean action bar matching /admin/wallet-settings */}
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
              {tr('tokenSettingSubtitle', 'Configure platform token economy, feature consumption costs, purchasable packages, and manual customer balance adjustments.')}
            </p>
          </div>
        </div>

        {/* Streamlined Save action only (Reset Defaults moved contextually inside Economy tab) */}
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleSaveSettings}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold text-white shadow-lg transition hover:opacity-90 cursor-pointer disabled:opacity-50"
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
            borderColor: feedback.type === 'success' ? 'var(--color-emerald, #10b981)' : 'var(--color-danger, #ef4444)',
            color: feedback.type === 'success' ? 'var(--color-emerald, #10b981)' : 'var(--color-danger, #ef4444)'
          }}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: 'var(--color-emerald, #10b981)' }} />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0" style={{ color: 'var(--color-danger, #ef4444)' }} />
          )}
          <span>{feedback.msg}</span>
        </div>
      )}

      {/* Workspace Sub-Tabs: Token Audit Ledger on the left */}
      <div 
        className="flex p-1.5 rounded-2xl border transition-colors duration-200 overflow-x-auto"
        style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)' }}
      >
        {[
          { id: 'ledger', label: tr('tabTokenLedger', 'Token Audit Ledger'), icon: History },
          { id: 'system', label: tr('tabTokenSystem', 'Economy & Feature Costs'), icon: Sliders },
          { id: 'packages', label: tr('tabTokenPackages', 'Purchasable Packages'), icon: CreditCard },
          { id: 'plans', label: tr('tabTokenPlans', 'Plan Monthly Grants'), icon: Layers },
          { id: 'adjustment', label: tr('tabTokenAdjustment', 'Token Adjustment'), icon: ArrowUpDown }
        ].map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as any)}
              className="flex-1 min-w-[130px] py-2.5 text-xs font-bold rounded-xl flex items-center justify-center gap-2 transition cursor-pointer"
              style={isActive ? {
                backgroundColor: 'var(--color-card)',
                color: 'var(--color-primary)',
                borderColor: 'var(--color-primary)',
                borderWidth: '1px',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
              } : { color: 'var(--color-text-secondary)' }}
            >
              <tab.icon className="h-4 w-4 shrink-0" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: TOKEN AUDIT LEDGER (Default Entry View) */}
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
              {tr('ledgerDesc', 'Audit ledger tracking user token consumption, bundle purchases, promotional grants, and manual adjustments.')}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="h-3.5 w-3.5 absolute left-3 top-2.5 pointer-events-none opacity-60" />
              <input
                type="text"
                autoComplete="off"
                data-lpignore="true"
                data-1p-ignore="true"
                data-bwignore="true"
                data-form-type="other"
                spellCheck="false"
                placeholder={tr('searchLedgerPlaceholder', 'Search by customer, description, ID...')}
                value={ledgerSearch}
                onChange={(e) => setLedgerSearch(e.target.value)}
                className="pl-8 pr-3 py-1.5 rounded-xl border text-xs outline-none font-medium w-48 sm:w-56"
                style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
              />
            </div>

            <select
              value={ledgerFilterType}
              onChange={(e) => {
                setLedgerFilterType(e.target.value);
                setLedgerPage(1);
              }}
              className="px-3 py-1.5 rounded-xl border text-xs font-bold outline-none cursor-pointer"
              style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
            >
              <option value="all">{tr('filterAllTypes', 'All Transaction Types')}</option>
              <option value="purchases">{tr('filterPurchases', 'Purchases')}</option>
              <option value="deductions">{tr('filterDeductions', 'Consumption / Deductions')}</option>
              <option value="grants">{tr('filterGrants', 'Grants & Signups')}</option>
              <option value="adjustments">{tr('filterAdjustments', 'Manual Adjustments')}</option>
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
                onChange={(e) => {
                  setLedgerPageSize(Number(e.target.value));
                  setLedgerPage(1);
                }}
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
              className="px-3 py-1.5 rounded-xl border text-xs font-bold transition cursor-pointer shadow-xs"
              style={{
                backgroundColor: 'var(--color-inner-dark)',
                borderColor: 'var(--color-danger, #ef4444)',
                color: 'var(--color-danger, #ef4444)'
              }}
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
              {loading && transactions.length === 0 ? (
                /* Tab 1 Shadow Loader Skeleton */
                <tbody className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
                  {[1, 2, 3, 4, 5].map((i) => (
                    <tr key={i} className="animate-pulse">
                      <td className="px-5 py-4"><div className="h-3 w-28 rounded bg-[var(--color-inner-dark)]" /></td>
                      <td className="px-5 py-4"><div className="h-4 w-16 rounded-full bg-[var(--color-inner-dark)]" /></td>
                      <td className="px-5 py-4"><div className="h-3 w-14 rounded bg-[var(--color-inner-dark)]" /></td>
                      <td className="px-5 py-4"><div className="h-3 w-10 rounded bg-[var(--color-inner-dark)]" /></td>
                      <td className="px-5 py-4"><div className="h-3 w-24 rounded bg-[var(--color-inner-dark)]" /></td>
                      <td className="px-5 py-4"><div className="h-3 w-44 rounded bg-[var(--color-inner-dark)]" /></td>
                    </tr>
                  ))}
                </tbody>
              ) : (
                <tbody className="divide-y" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}>
                  {paginatedTransactions.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-10" style={{ color: 'var(--color-text-secondary)' }}>
                        {tr('noLedgerRecords', 'No recent token transactions recorded.')}
                      </td>
                    </tr>
                  ) : (
                    paginatedTransactions.map((tx) => {
                      const isPositive = Number(tx.amount) > 0;
                      return (
                        <tr key={tx.id} className="transition" style={{ borderColor: 'var(--color-border)' }}>
                          <td className="px-5 py-4 font-mono font-bold text-xs" style={{ color: 'var(--color-text)' }}>
                            {tx.customer_email || tx.user_email || 'System User'}
                          </td>

                          <td className="px-5 py-4">
                            <span 
                              className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border"
                              style={{
                                backgroundColor: 'var(--color-inner-dark)',
                                borderColor: isPositive ? 'var(--color-emerald, #10b981)' : 'var(--color-warning, #f59e0b)',
                                color: isPositive ? 'var(--color-emerald, #10b981)' : 'var(--color-warning, #fbbf24)'
                              }}
                            >
                              {tx.type}
                            </span>
                          </td>

                          <td 
                            className="px-5 py-4 font-mono font-black" 
                            style={{ color: isPositive ? 'var(--color-emerald, #10b981)' : 'var(--color-danger, #ef4444)' }}
                          >
                            {isPositive ? `+${tx.amount}` : tx.amount} {activeTokenSymbol}
                          </td>

                          <td className="px-5 py-4 font-mono font-bold" style={{ color: 'var(--color-text)' }}>
                            {tx.balance_after !== undefined ? tx.balance_after : '—'}
                          </td>

                          <td className="px-5 py-4 text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
                            {tx.created_at ? new Date(tx.created_at).toLocaleDateString(locale === 'th' ? 'th-TH' : (locale || 'en-US'), { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                          </td>

                          <td className="px-5 py-4 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                            {formatLedgerDescription(tx.description, activeTokenSymbol)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              )}
            </table>
          </div>
        </div>

        {/* Ledger Pagination Bar with Shadow Loader */}
        <div 
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 px-1 text-xs"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          <div className="font-mono text-xs font-semibold">
            {loading && transactions.length === 0 ? (
              <div className="h-3.5 w-36 rounded bg-[var(--color-inner-dark)] animate-pulse" />
            ) : totalLedgerRecords > 0 ? (
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

      {/* TAB 2: SYSTEM IDENTITY & CONSUMPTION COSTS */}
      <div 
        role="region"
        aria-label="Economy and Consumption Costs"
        data-lpignore="true"
        className={activeTab === 'system' ? 'space-y-6 animate-in fade-in' : 'hidden'}
      >
        {loading ? (
          /* Tab 2 Shadow Loader Skeleton */
          <div className="space-y-6">
            <div className="p-6 rounded-3xl border animate-pulse space-y-3" style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }}>
              <div className="h-4 w-48 rounded bg-[var(--color-inner-dark)]" />
              <div className="h-3 w-80 rounded bg-[var(--color-inner-dark)]/70" />
            </div>
            <div className="p-6 rounded-3xl border animate-pulse space-y-4" style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }}>
              <div className="h-4 w-36 rounded bg-[var(--color-inner-dark)]" />
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="h-10 rounded-xl bg-[var(--color-inner-dark)]" />
                <div className="h-10 rounded-xl bg-[var(--color-inner-dark)]" />
                <div className="h-10 rounded-xl bg-[var(--color-inner-dark)]" />
              </div>
            </div>
            <div className="p-6 rounded-3xl border animate-pulse space-y-4" style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }}>
              <div className="h-4 w-44 rounded bg-[var(--color-inner-dark)]" />
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
                {[1, 2, 3, 4, 5, 6].map(i => (
                  <div key={i} className="h-16 rounded-2xl bg-[var(--color-inner-dark)]" />
                ))}
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Master Bypass Switch */}
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
                    borderColor: settings.isEnabled ? 'var(--color-emerald, #10b981)' : 'var(--color-warning, #f59e0b)',
                    color: settings.isEnabled ? 'var(--color-emerald, #10b981)' : 'var(--color-warning, #fbbf24)'
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

            {/* Token Identity Section with Contextual Reset Defaults Button */}
            <div 
              className="p-6 rounded-3xl border shadow-sm space-y-4 transition-colors duration-200"
              style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }}
            >
              <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: 'var(--color-border)' }}>
                <div>
                  <h2 className="text-sm font-bold flex items-center gap-2" style={{ color: 'var(--color-text)' }}>
                    <Sparkles className="h-4 w-4" style={{ color: 'var(--color-primary)' }} />
                    {tr('tokenIdentityHeading', 'Token Identity & Starting Quota')}
                  </h2>
                  <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                    {tr('tokenIdentityDesc', 'Customize public currency name, display symbol/emoji, and initial registration balance.')}
                  </p>
                </div>

                {/* Harmonized: Reset Defaults in configuration row matching /admin/wallet-settings */}
                <button
                  type="button"
                  onClick={handleResetDefaults}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border text-xs font-bold transition hover:opacity-80 cursor-pointer shadow-xs"
                  style={{ 
                    backgroundColor: 'var(--color-inner-dark)', 
                    borderColor: 'var(--color-border)',
                    color: 'var(--color-text-secondary)'
                  }}
                  title={tr('btnResetDefaultsTitle', 'Reset token economy values to platform defaults')}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>{tr('btnResetDefaults', 'Reset Defaults')}</span>
                </button>
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
                    data-lpignore="true"
                    data-1p-ignore="true"
                    data-bwignore="true"
                    data-form-type="other"
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
                      data-lpignore="true"
                      data-1p-ignore="true"
                      data-bwignore="true"
                      data-form-type="other"
                      value={settings.tokenSymbol}
                      onChange={(e) => setSettings({ ...settings, tokenSymbol: e.target.value })}
                      placeholder={tr('tokenSymbolPlaceholder', 'e.g. 🪙, 💎, ⚡')}
                      className="flex-1 px-3.5 py-2.5 rounded-xl border outline-none font-bold text-center"
                      style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                    />
                    <div 
                      className="w-10 h-10 shrink-0 rounded-xl border flex items-center justify-center text-xl shadow-inner select-none transition-all duration-200"
                      style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)' }}
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
          </>
        )}
      </div>

      {/* TAB 3: USER PURCHASABLE TOKEN PACKAGES */}
      <div 
        role="region"
        aria-label="User Purchasable Packages"
        data-lpignore="true"
        className={activeTab === 'packages' ? 'space-y-6 animate-in fade-in' : 'hidden'}
      >
        {loading ? (
          /* Tab 3 Shadow Loader Skeleton */
          <div className="space-y-6">
            <div className="p-6 rounded-3xl border animate-pulse space-y-4" style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }}>
              <div className="h-4 w-44 rounded bg-[var(--color-inner-dark)]" />
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                {[1, 2, 3, 4, 5].map(i => (
                  <div key={i} className="h-10 rounded-xl bg-[var(--color-inner-dark)]" />
                ))}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {[1, 2, 3].map(i => (
                <div key={i} className="p-6 rounded-3xl border animate-pulse space-y-4" style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }}>
                  <div className="h-5 w-32 rounded bg-[var(--color-inner-dark)]" />
                  <div className="h-8 w-24 rounded bg-[var(--color-inner-dark)]" />
                  <div className="h-12 rounded-2xl bg-[var(--color-inner-dark)]" />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <>
            <div 
              className="p-6 rounded-3xl border shadow-sm space-y-4 transition-colors duration-200"
              style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }}
            >
              <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: 'var(--color-border)' }}>
                <div>
                  <h2 className="text-sm font-bold flex items-center gap-2" style={{ color: 'var(--color-text)' }}>
                    <CreditCard className="h-4 w-4" style={{ color: 'var(--color-primary)' }} />
                    {editingPkgId ? tr('editTokenPackage', 'Edit Token Package') : tr('packagesHeading', 'User Purchasable Token Packages')}
                  </h2>
                  <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                    {tr('packagesDesc', 'Manage bundles available for on-demand top-up on /token.')}
                  </p>
                </div>

                {editingPkgId && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingPkgId(null);
                      setPkgName('');
                      setPkgTokens(500);
                      setPkgPrice(7.99);
                      setPkgBadge('');
                      setPkgBonus(0);
                      setPkgIsPopular(false);
                    }}
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
                    data-lpignore="true"
                    data-1p-ignore="true"
                    data-bwignore="true"
                    data-form-type="other"
                    value={pkgName}
                    onChange={(e) => setPkgName(e.target.value)}
                    placeholder={tr('packageNamePlaceholder', 'e.g. Starter Spark')}
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
                    data-lpignore="true"
                    data-1p-ignore="true"
                    data-bwignore="true"
                    data-form-type="other"
                    value={pkgTokens}
                    onChange={(e) => setPkgTokens(e.target.value)}
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
                    data-lpignore="true"
                    data-1p-ignore="true"
                    data-bwignore="true"
                    data-form-type="other"
                    value={pkgPrice}
                    onChange={(e) => setPkgPrice(e.target.value)}
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
                    data-lpignore="true"
                    data-1p-ignore="true"
                    data-bwignore="true"
                    data-form-type="other"
                    value={pkgBadge}
                    onChange={(e) => setPkgBadge(e.target.value)}
                    placeholder={tr('packageBadgePlaceholder', 'e.g. Popular, Best Value')}
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
                    data-lpignore="true"
                    data-1p-ignore="true"
                    data-bwignore="true"
                    data-form-type="other"
                    value={pkgBonus}
                    onChange={(e) => setPkgBonus(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border outline-none font-mono font-bold"
                    style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                  />
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
                <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={pkgIsPopular}
                    onChange={(e) => setPkgIsPopular(e.target.checked)}
                    className="rounded text-[var(--color-primary)]"
                  />
                  <span>{tr('markAsPopular', 'Mark as Most Popular package')}</span>
                </label>

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
              {settings.packages.length === 0 ? (
                <div className="col-span-full p-8 text-center text-xs opacity-60 border border-dashed rounded-3xl" style={{ borderColor: 'var(--color-border)' }}>
                  {tr('noPackagesConfigured', 'No token packages configured yet.')}
                </div>
              ) : (
                settings.packages.map((pkg) => (
                  <div
                    key={pkg.id}
                    className="p-6 rounded-3xl border shadow-sm flex flex-col justify-between space-y-4 relative overflow-hidden transition-colors duration-200"
                    style={{ 
                      backgroundColor: 'var(--color-card)', 
                      borderColor: pkg.isPopular ? 'var(--color-primary)' : 'var(--color-border)' 
                    }}
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
                          <span 
                            className="text-[10px] font-black px-2.5 py-0.5 rounded border"
                            style={{
                              backgroundColor: 'var(--color-inner-dark)',
                              borderColor: 'var(--color-emerald, #10b981)',
                              color: 'var(--color-emerald, #10b981)'
                            }}
                          >
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
                        <span>{tr('btnEdit', 'Edit')}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeletePackage(pkg.id)}
                        className="p-2 rounded-xl border transition cursor-pointer"
                        style={{
                          backgroundColor: 'var(--color-inner-dark)',
                          borderColor: 'var(--color-danger, #ef4444)',
                          color: 'var(--color-danger, #ef4444)'
                        }}
                        title={tr('btnDelete', 'Delete')}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>

      {/* TAB 4: SUBSCRIPTION PLAN MONTHLY INCLUDED TOKENS */}
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
                {loading && plans.length === 0 ? (
                  /* Tab 4 Table Shadow Loader Skeleton */
                  <tbody className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
                    {[1, 2, 3].map(i => (
                      <tr key={i} className="animate-pulse">
                        <td className="py-3.5 px-5"><div className="h-4 w-32 rounded bg-[var(--color-card)]" /></td>
                        <td className="py-3.5 px-5"><div className="h-4 w-20 rounded bg-[var(--color-card)]" /></td>
                        <td className="py-3.5 px-5"><div className="h-8 w-44 rounded-xl bg-[var(--color-card)]" /></td>
                      </tr>
                    ))}
                  </tbody>
                ) : (
                  <tbody className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
                    {plans.length === 0 ? (
                      Object.entries(settings.planAllocations).map(([planSlug, quota]) => (
                        <tr key={planSlug} className="transition" style={{ backgroundColor: 'transparent' }}>
                          <td className="py-3.5 px-5 font-bold capitalize" style={{ color: 'var(--color-text)' }}>
                            {planSlug.replace('-', ' ')}
                          </td>
                          <td className="py-3.5 px-5 font-mono text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                            {tr('tierStandard', 'Tier Standard')}
                          </td>
                          <td className="py-3.5 px-5">
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                min="0"
                                autoComplete="off"
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
                )}
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* TAB 5: TOKEN ADJUSTMENT - MANUAL CUSTOMER BALANCE ADJUSTMENT */}
      <div 
        role="region"
        aria-label="Manual Token Customer Balance Adjustment"
        data-lpignore="true"
        className={activeTab === 'adjustment' ? 'space-y-6 animate-in fade-in' : 'hidden'}
      >
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Main Adjustment Form Card */}
          <div 
            className="lg:col-span-8 p-6 rounded-3xl border shadow-sm space-y-6 transition-colors duration-200"
            style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }}
          >
            <div className="border-b pb-4" style={{ borderColor: 'var(--color-border)' }}>
              <h2 className="text-base font-extrabold flex items-center gap-2" style={{ color: 'var(--color-text)' }}>
                <ArrowUpDown className="h-5 w-5" style={{ color: 'var(--color-primary)' }} />
                {tr('tokenAdjustmentConsoleTitle', 'Manual Token Customer Balance Adjustment')}
              </h2>
              <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
                {tr('tokenAdjustmentConsoleSubtitle', 'Credit promotional bonus tokens, deduct manual consumption, or set absolute customer balance quotas.')}
              </p>
            </div>

            {loading ? (
              /* Tab 5 Form Shadow Loader Skeleton */
              <div className="space-y-6 animate-pulse">
                <div className="h-10 rounded-xl bg-[var(--color-inner-dark)]" />
                <div className="grid grid-cols-3 gap-3">
                  <div className="h-16 rounded-2xl bg-[var(--color-inner-dark)]" />
                  <div className="h-16 rounded-2xl bg-[var(--color-inner-dark)]" />
                  <div className="h-16 rounded-2xl bg-[var(--color-inner-dark)]" />
                </div>
                <div className="h-10 rounded-xl bg-[var(--color-inner-dark)]" />
                <div className="grid grid-cols-2 gap-4">
                  <div className="h-10 rounded-xl bg-[var(--color-inner-dark)]" />
                  <div className="h-10 rounded-xl bg-[var(--color-inner-dark)]" />
                </div>
              </div>
            ) : (
              <>
                {/* Step 1: Customer Account Selection with Live Sync button */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <label className="text-xs font-bold" style={{ color: 'var(--color-text)' }}>
                        1. {tr('targetCustomerAccount', 'Target Customer Account')}
                      </label>
                      <button
                        type="button"
                        onClick={handleManualSyncUsers}
                        disabled={syncingUsers}
                        className="p-1 rounded-lg border text-[10px] font-bold transition hover:opacity-80 flex items-center gap-1 cursor-pointer"
                        style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)', color: 'var(--color-primary)' }}
                        title={tr('btnSyncBalances', 'Sync live database customer balances')}
                      >
                        <RefreshCw className={`h-3 w-3 ${syncingUsers ? 'animate-spin' : ''}`} />
                        <span className="hidden sm:inline">{tr('syncBalances', 'Sync')}</span>
                      </button>
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold">
                      <button
                        type="button"
                        onClick={() => setAdjustCustomerMode('select')}
                        className={`px-2.5 py-1 rounded-lg border transition cursor-pointer ${adjustCustomerMode === 'select' ? 'font-bold' : 'opacity-70'}`}
                        style={adjustCustomerMode === 'select' ? {
                          backgroundColor: 'var(--color-inner-dark)',
                          borderColor: 'var(--color-primary)',
                          color: 'var(--color-primary)'
                        } : {
                          borderColor: 'var(--color-border)'
                        }}
                      >
                        {tr('modeSelectUser', 'From Directory')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setAdjustCustomerMode('manual')}
                        className={`px-2.5 py-1 rounded-lg border transition cursor-pointer ${adjustCustomerMode === 'manual' ? 'font-bold' : 'opacity-70'}`}
                        style={adjustCustomerMode === 'manual' ? {
                          backgroundColor: 'var(--color-inner-dark)',
                          borderColor: 'var(--color-primary)',
                          color: 'var(--color-primary)'
                        } : {
                          borderColor: 'var(--color-border)'
                        }}
                      >
                        {tr('modeManualEmail', 'Custom Email')}
                      </button>
                    </div>
                  </div>

                  {adjustCustomerMode === 'select' ? (
                    <div className="space-y-2">
                      <div className="relative">
                        <Search className="h-3.5 w-3.5 absolute left-3 top-3 pointer-events-none opacity-50" />
                        <input
                          type="text"
                          autoComplete="off"
                          data-lpignore="true"
                          data-1p-ignore="true"
                          data-bwignore="true"
                          data-form-type="other"
                          placeholder={tr('searchCustomerPlaceholder', 'Filter customer directory by email or name...')}
                          value={userDropdownSearch}
                          onChange={(e) => setUserDropdownSearch(e.target.value)}
                          className="w-full pl-8 pr-3 py-2 rounded-xl border text-xs outline-none"
                          style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                        />
                      </div>
                      <select
                        value={selectedUserEmail}
                        onChange={(e) => setSelectedUserEmail(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl border text-xs font-bold outline-none cursor-pointer"
                        style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                      >
                        {filteredUsers.length === 0 ? (
                          <option value="">{tr('noMatchingUsers', 'No users found in catalog')}</option>
                        ) : (
                          filteredUsers.map(u => {
                            const bal = Number(u.token_balance ?? u.tokens ?? 0);
                            return (
                              <option key={u.id || u.email} value={u.email}>
                                {u.email} ({u.customer_name || u.name || 'User'}) — Current: {bal.toLocaleString()} {activeTokenSymbol}
                              </option>
                            );
                          })
                        )}
                      </select>
                    </div>
                  ) : (
                    <input
                      type="email"
                      autoComplete="off"
                      data-lpignore="true"
                      data-1p-ignore="true"
                      data-bwignore="true"
                      data-form-type="other"
                      placeholder={tr('customerEmailPlaceholder', 'customer@example.com')}
                      value={manualUserEmail}
                      onChange={(e) => setManualUserEmail(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border text-xs font-bold outline-none"
                      style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                    />
                  )}
                </div>

                {/* Step 2: Adjustment Action Type */}
                <div className="space-y-2.5">
                  <label className="text-xs font-bold block" style={{ color: 'var(--color-text)' }}>
                    2. {tr('adjustmentTypeLabel', 'Adjustment Type & Mathematical Direction')}
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {[
                      { id: 'add', label: tr('actionAddTokens', 'Add Tokens (Credit)'), icon: ArrowDownLeft, desc: tr('actionAddTokensDesc', 'Add tokens to current quota'), color: 'var(--color-emerald, #10b981)' },
                      { id: 'deduct', label: tr('actionDeductTokens', 'Deduct (Debit)'), icon: ArrowUpRight, desc: tr('actionDeductTokensDesc', 'Deduct consumption tokens'), color: 'var(--color-danger, #ef4444)' },
                      { id: 'set', label: tr('actionSetBalance', 'Set Exact Balance'), icon: Scale, desc: tr('actionSetBalanceDesc', 'Force balance to exact quota'), color: 'var(--color-primary)' }
                    ].map((act) => {
                      const isSel = adjustType === act.id;
                      return (
                        <button
                          key={act.id}
                          type="button"
                          onClick={() => setAdjustType(act.id as any)}
                          className="p-3.5 rounded-2xl border text-left transition cursor-pointer flex flex-col justify-between"
                          style={{
                            backgroundColor: isSel ? 'var(--color-inner-dark)' : 'transparent',
                            borderColor: isSel ? act.color : 'var(--color-border)',
                            borderWidth: isSel ? '2px' : '1px'
                          }}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-black flex items-center gap-1.5" style={{ color: isSel ? act.color : 'var(--color-text)' }}>
                              <act.icon className="h-4 w-4" />
                              {act.label}
                            </span>
                            {isSel && <Check className="h-4 w-4" style={{ color: act.color }} />}
                          </div>
                          <span className="text-[10px]" style={{ color: 'var(--color-text-secondary)' }}>
                            {act.desc}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Step 3: Adjustment Amount & Preset Shortcuts */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold" style={{ color: 'var(--color-text)' }}>
                      3. {tr('adjustmentAmountLabel', 'Token Amount')}
                    </label>
                    <div className="flex items-center gap-1">
                      {[50, 100, 250, 500, 1000, 5000].map(val => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => setAdjustAmount(val)}
                          className="px-2 py-0.5 rounded-lg border text-[10px] font-mono font-bold transition hover:opacity-80 cursor-pointer"
                          style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                        >
                          +{val}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <input
                        type="number"
                        min="0"
                        autoComplete="off"
                        data-lpignore="true"
                        data-1p-ignore="true"
                        data-bwignore="true"
                        data-form-type="other"
                        value={adjustAmount}
                        onChange={(e) => setAdjustAmount(e.target.value)}
                        placeholder={tr('enterTokenAmountPlaceholder', 'Enter token amount...')}
                        className="w-full px-3.5 py-2.5 rounded-xl border text-sm font-mono font-black outline-none"
                        style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                      />
                    </div>
                    <div 
                      className="px-4 py-2.5 rounded-xl border font-bold text-sm flex items-center gap-1 select-none"
                      style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                    >
                      <span>{activeTokenSymbol}</span>
                      <span className="text-xs uppercase font-extrabold">{settings.tokenName || 'Tokens'}</span>
                    </div>
                  </div>
                </div>

                {/* Step 4: Adjustment Reason & Audit Note */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div>
                    <label className="block font-bold mb-1" style={{ color: 'var(--color-text)' }}>
                      4. {tr('adjustmentReasonLabel', 'Adjustment Category / Reason')}
                    </label>
                    <select
                      value={adjustReason}
                      onChange={(e) => setAdjustReason(e.target.value)}
                      className="w-full px-3.5 py-2 rounded-xl border text-xs font-bold outline-none cursor-pointer"
                      style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                    >
                      <option value="Customer Support Grant">{tr('reasonSupportGrant', 'Customer Support Grant')}</option>
                      <option value="VIP Promotional Bonus">{tr('reasonVipBonus', 'VIP Promotional Bonus')}</option>
                      <option value="Manual Dispute Resolution">{tr('reasonDispute', 'Manual Dispute Resolution')}</option>
                      <option value="Manual Refund Reconciliation">{tr('reasonRefund', 'Manual Refund Reconciliation')}</option>
                      <option value="Account Audit Correction">{tr('reasonAuditCorrection', 'Account Audit Correction')}</option>
                      <option value="Administrative Penalty / Deduction">{tr('reasonPenalty', 'Administrative Penalty / Deduction')}</option>
                      <option value="Custom Reason">{tr('reasonCustom', 'Custom Administrative Reason')}</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-bold mb-1" style={{ color: 'var(--color-text)' }}>
                      {tr('adjustmentNotesLabel', 'Audit Log Note / Ticket Reference')}
                    </label>
                    <input
                      type="text"
                      autoComplete="off"
                      data-lpignore="true"
                      data-1p-ignore="true"
                      data-bwignore="true"
                      data-form-type="other"
                      placeholder={tr('auditNotePlaceholder', 'e.g. Ticket #1042 or Loyalty award')}
                      value={adjustNotes}
                      onChange={(e) => setAdjustNotes(e.target.value)}
                      className="w-full px-3.5 py-2 rounded-xl border text-xs outline-none"
                      style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                    />
                  </div>
                </div>

                {/* Action Execution Button */}
                <div className="pt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={handleApplyAdjustment}
                    disabled={adjusting}
                    className="px-6 py-2.5 rounded-xl font-bold text-xs text-white shadow-lg flex items-center gap-2 cursor-pointer transition hover:opacity-90 disabled:opacity-50"
                    style={{ backgroundColor: 'var(--color-primary)' }}
                  >
                    <CheckCircle2 className={`h-4 w-4 ${adjusting ? 'animate-spin' : ''}`} />
                    <span>{adjusting ? tr('btnAdjusting', 'Applying Adjustment...') : tr('btnApplyAdjustment', 'Apply Token Adjustment')}</span>
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Right Summary & Live Impact Card */}
          <div className="lg:col-span-4 space-y-5">
            <div 
              className="p-6 rounded-3xl border shadow-sm space-y-4 transition-colors duration-200"
              style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }}
            >
              <div className="border-b pb-3" style={{ borderColor: 'var(--color-border)' }}>
                <h3 className="text-xs font-bold uppercase tracking-wider flex items-center gap-2" style={{ color: 'var(--color-primary)' }}>
                  <UserCheck className="h-4 w-4" />
                  {tr('balanceImpactPreviewTitle', 'Customer Balance Impact Preview')}
                </h3>
              </div>

              {loading ? (
                <div className="space-y-3 animate-pulse">
                  <div className="h-4 w-32 rounded bg-[var(--color-inner-dark)]" />
                  <div className="h-20 rounded-2xl bg-[var(--color-inner-dark)]" />
                </div>
              ) : (
                <div className="space-y-3.5 text-xs">
                  <div>
                    <span className="text-[11px] block" style={{ color: 'var(--color-text-secondary)' }}>
                      {tr('customerTarget', 'Customer Account')}
                    </span>
                    <div className="font-mono font-bold truncate mt-0.5" style={{ color: 'var(--color-text)' }}>
                      {activeCustomer?.email || tr('noCustomerSelected', 'No customer selected')}
                    </div>
                  </div>

                  <div className="p-3.5 rounded-2xl border space-y-2" style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)' }}>
                    <div className="flex justify-between items-center text-xs">
                      <span style={{ color: 'var(--color-text-secondary)' }}>{tr('currentBalance', 'Current Balance')}:</span>
                      <span className="font-mono font-bold" style={{ color: 'var(--color-text)' }}>
                        {currentCustomerBalance.toLocaleString()} {activeTokenSymbol}
                      </span>
                    </div>

                    <div className="flex justify-between items-center text-xs">
                      <span style={{ color: 'var(--color-text-secondary)' }}>{tr('deltaApplied', 'Adjustment Delta')}:</span>
                      <span 
                        className="font-mono font-black"
                        style={{
                          color: adjustType === 'add' 
                            ? 'var(--color-emerald, #10b981)' 
                            : adjustType === 'deduct' 
                            ? 'var(--color-danger, #ef4444)' 
                            : 'var(--color-warning, #f59e0b)'
                        }}
                      >
                        {adjustType === 'add' ? `+${Number(adjustAmount || 0).toLocaleString()}` : adjustType === 'deduct' ? `-${Number(adjustAmount || 0).toLocaleString()}` : `=${Number(adjustAmount || 0).toLocaleString()}`} {activeTokenSymbol}
                      </span>
                    </div>

                    <div className="border-t pt-2 mt-2 flex justify-between items-center text-sm font-extrabold" style={{ borderColor: 'var(--color-border)' }}>
                      <span>{tr('balanceAfterLabel', 'New Balance After')}:</span>
                      <span className="font-mono text-base font-black" style={{ color: 'var(--color-primary)' }}>
                        {calculatedBalanceAfter.toLocaleString()} {activeTokenSymbol}
                      </span>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl border text-[11px] space-y-1" style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}>
                    <div className="font-bold flex items-center gap-1.5" style={{ color: 'var(--color-primary)' }}>
                      <Shield className="h-3.5 w-3.5" />
                      <span>{tr('auditComplianceNotice', 'Immutable Audit Trail')}</span>
                    </div>
                    <p className="text-[10px]">
                      {tr('adjustmentAuditNoticeText', 'All manual adjustments are signed, time-stamped, synchronized with PostgreSQL & MySQL, and appended to the immutable Token Audit Ledger.')}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Recent Adjustments Mini Card */}
            <div 
              className="p-5 rounded-3xl border shadow-sm space-y-3 transition-colors duration-200"
              style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }}
            >
              <h4 className="text-xs font-bold" style={{ color: 'var(--color-text)' }}>
                {tr('recentManualAdjustments', 'Recent Manual Adjustments')}
              </h4>
              <div className="space-y-2">
                {loading && transactions.length === 0 ? (
                  <div className="space-y-2 animate-pulse">
                    {[1, 2, 3].map(i => (
                      <div key={i} className="h-10 rounded-xl bg-[var(--color-inner-dark)]" />
                    ))}
                  </div>
                ) : transactions.filter(t => (t.type || '').toLowerCase().includes('adjust')).slice(0, 4).length === 0 ? (
                  <div className="p-4 rounded-xl border border-dashed text-center text-[11px] opacity-60" style={{ borderColor: 'var(--color-border)' }}>
                    {tr('noRecentAdjustments', 'No recent manual adjustments logged.')}
                  </div>
                ) : (
                  transactions
                    .filter(t => (t.type || '').toLowerCase().includes('adjust'))
                    .slice(0, 4)
                    .map((tx) => (
                      <div 
                        key={tx.id} 
                        className="p-2.5 rounded-xl border text-[11px] flex items-center justify-between shadow-2xs"
                        style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)' }}
                      >
                        <div className="truncate pr-2">
                          <div className="font-mono font-bold truncate" style={{ color: 'var(--color-text)' }}>
                            {tx.customer_email || tx.user_email || 'Customer'}
                          </div>
                          <div className="text-[9px] opacity-60 truncate">
                            {formatLedgerDescription(tx.description, activeTokenSymbol)}
                          </div>
                        </div>
                        <div 
                          className="font-mono font-black shrink-0"
                          style={{ color: Number(tx.amount) >= 0 ? 'var(--color-emerald, #10b981)' : 'var(--color-danger, #ef4444)' }}
                        >
                          {Number(tx.amount) >= 0 ? `+${tx.amount}` : tx.amount} {activeTokenSymbol}
                        </div>
                      </div>
                    ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
