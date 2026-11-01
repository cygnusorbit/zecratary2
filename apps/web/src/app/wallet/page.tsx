// @ts-nocheck
'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { 
  Wallet, CreditCard, Plus, RefreshCw, CheckCircle2, AlertCircle, 
  Gift, ShieldCheck, ArrowRight, History, Search, Filter, 
  ArrowUpRight, ArrowDownLeft, ChevronLeft, ChevronRight, 
  Layers, Coins, Shield, ExternalLink, Info, Sparkles, RotateCw, Check,
  AlertTriangle, ShieldAlert
} from 'lucide-react';
import { getCurrentUser, initAuthStorage, User } from '@/lib/auth';
import { useTranslation } from '@/components/LanguageProvider';

interface ManualDetails {
  enabled?: boolean;
  bankName?: string;
  accountHolder?: string;
  accountNumber?: string;
  routingNumber?: string;
  swiftBic?: string;
  branchName?: string;
  instructions?: string;
  requireReference?: boolean;
}

interface WalletSettings {
  is_enabled: boolean;
  currency: string;
  min_topup: number;
  max_topup: number;
  preset_amounts: number[];
  bonus_rules: Array<{ threshold: number; bonus_percent: number }>;
  allowed_gateways: string[];
  verified_gateways: string[];
  stripeKeysVerified?: boolean;
  paypalKeysVerified?: boolean;
  allow_site_purchases: boolean;
  test_mode?: boolean;
  active_gateway?: string;
  stripe_configured?: boolean;
  paypal_configured?: boolean;
  manual_details?: ManualDetails;
}

interface WalletTx {
  id: string;
  amount: number;
  balance_after: number;
  type: string;
  gateway: string;
  gateway_tx_id?: string;
  status: string;
  description: string;
  plan_name?: string;
  planName?: string;
  created_at: string;
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$', EUR: '€', GBP: '£', CAD: 'CA$', AUD: 'AU$', JPY: '¥', SGD: 'S$', CHF: 'Fr', NZD: 'NZ$', THB: '฿', CNY: '¥', MYR: 'RM'
};

const isFalseVal = (v: any): boolean =>
  v === false || v === 0 || v === 'false' || v === '0' || v === 'disabled' || v === 'inactive';

const isTrueVal = (v: any): boolean =>
  v === true || v === 1 || v === 'true' || v === '1' || v === 'active' || v === 'enabled';

function WalletContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useTranslation();

  const [loading, setLoading] = useState(false);
  const [gatewaysLoaded, setGatewaysLoaded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  const [user, setUser] = useState<User | null>(null);
  const [balance, setBalance] = useState<number>(0);

  const [settings, setSettings] = useState<WalletSettings>({
    is_enabled: true,
    currency: 'USD',
    min_topup: 5,
    max_topup: 1000,
    preset_amounts: [10, 25, 50, 100, 250],
    bonus_rules: [{ threshold: 50, bonus_percent: 5 }, { threshold: 100, bonus_percent: 10 }],
    allowed_gateways: [],
    verified_gateways: ['manual'],
    stripeKeysVerified: false,
    paypalKeysVerified: false,
    allow_site_purchases: true,
  });

  const [selectedAmount, setSelectedAmount] = useState<number>(50);
  const [customAmount, setCustomAmount] = useState<string>('');
  const [selectedGateway, setSelectedGateway] = useState<string>('');
  const [manualReference, setManualReference] = useState<string>('');

  const [transactions, setTransactions] = useState<WalletTx[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [stats, setStats] = useState({ totalDeposited: 0, totalSpent: 0, totalEvents: 0 });

  const isFetchingRef = useRef(false);
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const verifyingIdRef = useRef<string | null>(null);

  const activeCurrencySymbol = useMemo(() => {
    return CURRENCY_SYMBOLS[settings.currency?.toUpperCase()] || '$';
  }, [settings.currency]);

  const showToast = (text: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToastMessage({ type, text });
    setTimeout(() => setToastMessage(null), 4000);
  };

  const syncLocalBalanceQuietly = useCallback((newBal: number) => {
    setBalance(newBal);
    if (typeof window !== 'undefined') {
      try {
        const keys = ['zecratary_user', 'currentUser', 'zecratary_current_user', 'user'];
        for (const k of keys) {
          const raw = localStorage.getItem(k);
          if (raw) {
            const u = JSON.parse(raw);
            u.wallet_balance = newBal;
            localStorage.setItem(k, JSON.stringify(u));
          }
        }
      } catch (_) {}
    }
  }, []);

  const broadcastBalanceUpdate = useCallback((newBal: number) => {
    syncLocalBalanceQuietly(newBal);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('zecratary_wallet_updated'));
      window.dispatchEvent(new Event('zecratary_payment_updated'));
      window.dispatchEvent(new Event('storage'));
      try {
        const bc = new BroadcastChannel('zecratary_balance_channel');
        bc.postMessage({ type: 'WALLET_UPDATED', wallet: newBal });
        bc.close();
      } catch (_) {}
    }
  }, [syncLocalBalanceQuietly]);

  // Evaluates if the Gateway API Key is Verified by Administrator
  const isGatewayKeyVerified = useCallback((gwKey: string): boolean => {
    if (!gwKey) return false;
    const lower = gwKey.toLowerCase().trim();
    if (['manual', 'bank_wire', 'wire', 'manualsettlement'].includes(lower)) {
      return true;
    }
    if (lower === 'stripe') {
      return Boolean(settings.stripeKeysVerified);
    }
    if (lower === 'paypal') {
      return Boolean(settings.paypalKeysVerified);
    }
    return false;
  }, [settings.stripeKeysVerified, settings.paypalKeysVerified]);

  const isGatewayActive = useCallback((key: 'stripe' | 'paypal' | 'manual', data: any): boolean => {
    if (!data) return false;

    const gwObj = 
      data?.gateways?.[key === 'manual' ? 'manualSettlement' : key] ||
      data?.settings?.gateways?.[key === 'manual' ? 'manualSettlement' : key] ||
      data?.gatewaySettings?.[key === 'manual' ? 'manualSettlement' : key] ||
      data?.gateways?.[key] ||
      data?.settings?.gateways?.[key] ||
      data?.gatewaySettings?.[key] ||
      (key === 'manual' ? (data?.settings?.manual_details || data?.manual_details || data?.manualSettlement) : null);

    if (gwObj) {
      if (isFalseVal(gwObj.enabled) || isFalseVal(gwObj.is_enabled) || isFalseVal(gwObj.active) || gwObj.status === 'disabled' || gwObj.status === 'inactive') {
        return false;
      }
    }

    if (key === 'paypal') {
      if (isFalseVal(data?.paypal_enabled) || isFalseVal(data?.settings?.paypal_enabled) || isFalseVal(data?.paypalEnabled)) {
        return false;
      }
    } else if (key === 'stripe') {
      if (isFalseVal(data?.stripe_enabled) || isFalseVal(data?.settings?.stripe_enabled) || isFalseVal(data?.stripeEnabled)) {
        return false;
      }
    } else if (key === 'manual') {
      if (isFalseVal(data?.manual_enabled) || isFalseVal(data?.settings?.manual_enabled) || isFalseVal(data?.manualEnabled)) {
        return false;
      }
    }

    const allowedList = data?.allowed_gateways || data?.settings?.allowed_gateways || data?.allowedGateways;
    if (Array.isArray(allowedList)) {
      const normalizedList = allowedList.map(item => {
        const lower = String(item).toLowerCase().trim();
        if (['manualsettlement', 'manual_settlement', 'bank_wire', 'wire'].includes(lower)) return 'manual';
        return lower;
      });
      if (!normalizedList.includes(key)) {
        return false;
      }
    }

    if (gwObj && (isTrueVal(gwObj.enabled) || isTrueVal(gwObj.is_enabled) || isTrueVal(gwObj.active))) {
      return true;
    }

    if (key === 'paypal' && (isTrueVal(data?.paypal_enabled) || isTrueVal(data?.settings?.paypal_enabled) || isTrueVal(data?.paypalEnabled))) {
      return true;
    }
    if (key === 'stripe' && (isTrueVal(data?.stripe_enabled) || isTrueVal(data?.settings?.stripe_enabled) || isTrueVal(data?.stripeEnabled))) {
      return true;
    }
    if (key === 'manual' && (isTrueVal(data?.manual_enabled) || isTrueVal(data?.settings?.manual_enabled) || isTrueVal(data?.manualEnabled))) {
      return true;
    }

    if (Array.isArray(allowedList)) {
      const normalizedList = allowedList.map(item => {
        const lower = String(item).toLowerCase().trim();
        if (['manualsettlement', 'manual_settlement', 'bank_wire', 'wire'].includes(lower)) return 'manual';
        return lower;
      });
      return normalizedList.includes(key);
    }

    return false;
  }, []);

  const resolveAllowedChannels = useCallback((data: any): string[] => {
    const list: string[] = [];
    if (isGatewayActive('stripe', data)) list.push('stripe');
    if (isGatewayActive('paypal', data)) list.push('paypal');
    if (isGatewayActive('manual', data)) list.push('manual');
    return list;
  }, [isGatewayActive]);

  const fetchWalletData = useCallback(async (
    activeUser: User | null, 
    targetPage = 1, 
    search = '', 
    filter = 'all',
    force = false
  ) => {
    if (!force && isFetchingRef.current) return;
    isFetchingRef.current = true;

    const userEmail = activeUser?.email || 'admin@zecratary.com';
    const userId = activeUser?.id || 'usr_admin_1';
    setLoading(true);

    try {
      const qParams = new URLSearchParams({
        email: userEmail,
        userId: String(userId),
        page: String(targetPage),
        limit: '10',
        search: search,
        type: filter,
        t: String(Date.now())
      });

      const [walletRes, gwRes] = await Promise.all([
        fetch(`/api/wallet?${qParams.toString()}`, { cache: 'no-store' }).catch(() => null),
        fetch(`/api/payment-gateways?t=${Date.now()}`, { cache: 'no-store' }).catch(() => null)
      ]);

      let walletData: any = {};
      let gwData: any = {};

      if (walletRes && walletRes.ok) {
        try { walletData = await walletRes.json(); } catch (_) {}
      }
      if (gwRes && gwRes.ok) {
        try { gwData = await gwRes.json(); } catch (_) {}
      }

      const activePayload = gwData?.success ? gwData : walletData;

      if (walletData.success || gwData.success) {
        const wBal = typeof walletData.wallet_balance === 'number' 
          ? walletData.wallet_balance 
          : (typeof walletData.balance === 'number' ? walletData.balance : Number(walletData.user?.wallet_balance || 0));
        
        syncLocalBalanceQuietly(wBal);

        const loadedAllowed = resolveAllowedChannels(activePayload);

        const stripeVerified = Boolean(
          activePayload.stripeKeysVerified ??
          activePayload.settings?.stripeKeysVerified ??
          activePayload.gateways?.stripe?.keysVerified ??
          walletData.stripeKeysVerified ??
          walletData.settings?.stripeKeysVerified
        );

        const paypalVerified = Boolean(
          activePayload.paypalKeysVerified ??
          activePayload.settings?.paypalKeysVerified ??
          activePayload.gateways?.paypal?.keysVerified ??
          walletData.paypalKeysVerified ??
          walletData.settings?.paypalKeysVerified
        );

        const resolvedManualDetails = 
          activePayload.settings?.manual_details || 
          activePayload.manual_details || 
          activePayload.gatewaySettings?.manualSettlement || 
          walletData.settings?.manual_details || {};

        setSettings({
          is_enabled: activePayload.settings?.is_enabled !== false,
          currency: activePayload.settings?.currency || activePayload.currency || walletData.currency || 'USD',
          min_topup: Number(walletData.settings?.min_topup || 5),
          max_topup: Number(walletData.settings?.max_topup || 1000),
          preset_amounts: Array.isArray(walletData.settings?.preset_amounts) && walletData.settings.preset_amounts.length > 0 
            ? walletData.settings.preset_amounts.map(Number) 
            : [10, 25, 50, 100, 250],
          bonus_rules: Array.isArray(walletData.settings?.bonus_rules) ? walletData.settings.bonus_rules : [],
          allowed_gateways: loadedAllowed,
          verified_gateways: activePayload.verified_gateways || ['manual'],
          stripeKeysVerified: stripeVerified,
          paypalKeysVerified: paypalVerified,
          allow_site_purchases: walletData.settings?.allow_site_purchases !== false,
          test_mode: Boolean(activePayload.settings?.test_mode),
          active_gateway: loadedAllowed[0] || '',
          stripe_configured: Boolean(activePayload.settings?.stripe_configured),
          paypal_configured: Boolean(activePayload.settings?.paypal_configured),
          manual_details: resolvedManualDetails
        });

        setGatewaysLoaded(true);

        setSelectedGateway((prev) => {
          if (prev && loadedAllowed.includes(prev)) return prev;
          return loadedAllowed[0] || '';
        });

        if (Array.isArray(walletData.transactions)) {
          setTransactions(walletData.transactions);
        }
        if (walletData.totalPages) setTotalPages(walletData.totalPages);
        if (walletData.stats) setStats(walletData.stats);
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.warn('[WalletPage] Notice:', err.message);
      }
    } finally {
      isFetchingRef.current = false;
      setLoading(false);
    }
  }, [syncLocalBalanceQuietly, resolveAllowedChannels]);

  // Debounce search query changes
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setPage(1);
    }, 250);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  const handleReconcile = async () => {
    if (!user) return;
    setReconciling(true);
    try {
      const res = await fetch('/api/wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reconcile_wallet',
          email: user.email,
          userId: user.id || 'usr_admin_1'
        })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        if (typeof data.wallet_balance === 'number') {
          broadcastBalanceUpdate(data.wallet_balance);
        }
        if (Array.isArray(data.transactions) && data.transactions.length > 0) {
          setTransactions(data.transactions);
        }
        showToast(data.message || t('paymentReconciledToast', 'Payment verified! Your wallet has been credited.'), 'success');
        fetchWalletData(user, page, debouncedSearch, typeFilter, true);
      } else {
        showToast(data.error || 'Reconciliation completed. No missing payments found.', 'info');
      }
    } catch (e: any) {
      showToast(e.message || 'Failed to reconcile payments.', 'error');
    } finally {
      setReconciling(false);
    }
  };

  useEffect(() => {
    initAuthStorage();
    const u = getCurrentUser();
    if (!u) {
      router.replace('/login');
      return;
    }
    setUser(u);

    const paramAmount = searchParams?.get('amount');
    if (paramAmount) {
      const parsedAmount = parseFloat(paramAmount);
      if (!isNaN(parsedAmount) && parsedAmount > 0) {
        setCustomAmount(parsedAmount.toFixed(2));
        setSelectedAmount(0);
      }
    }

    // Check for Stripe session or PayPal redirect return params
    const sessionId = searchParams?.get('session_id');
    const paypalToken = searchParams?.get('token') || searchParams?.get('paymentId') || searchParams?.get('order_id');
    const isSuccess = searchParams?.get('status') === 'success' || searchParams?.get('success') === 'true';
    const isPayPal = searchParams?.get('gateway') === 'paypal' || Boolean(paypalToken);

    const activeVerificationToken = sessionId || (isPayPal && (paypalToken || 'paypal_success'));

    if (activeVerificationToken && isSuccess && verifyingIdRef.current !== activeVerificationToken) {
      verifyingIdRef.current = activeVerificationToken;

      const verifyPaymentReturn = async () => {
        showToast(t('verifyingSessionNotice', 'Confirming payment session and crediting wallet...'), 'info');
        try {
          const verifyPayload = sessionId ? {
            action: 'verify_stripe_session',
            sessionId: sessionId,
            email: u.email,
            userId: String(u.id || '')
          } : {
            action: 'verify_paypal_session',
            orderId: activeVerificationToken,
            amount: paramAmount ? parseFloat(paramAmount) : 50.00,
            email: u.email,
            userId: String(u.id || '')
          };

          const res = await fetch('/api/wallet', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(verifyPayload)
          });

          const data = await res.json().catch(() => ({}));
          if (data.success) {
            if (typeof data.wallet_balance === 'number') {
              broadcastBalanceUpdate(data.wallet_balance);
            }
            if (Array.isArray(data.transactions) && data.transactions.length > 0) {
              setTransactions(data.transactions);
            }
            showToast(data.message || t('paymentReconciledToast', 'Payment verified! Your wallet has been credited.'), 'success');
            fetchWalletData(u, 1, '', 'all', true);
            if (typeof window !== 'undefined') {
              window.history.replaceState({}, '', '/wallet');
            }
          } else {
            showToast(data.error || 'Failed to verify session.', 'error');
            if (typeof window !== 'undefined') {
              window.history.replaceState({}, '', '/wallet');
            }
          }
        } catch (e: any) {
          showToast(e.message || 'Payment verification failed.', 'error');
        }
      };

      verifyPaymentReturn();
    } else {
      fetchWalletData(u, 1, '', 'all', true);
    }

    const debouncedSync = () => {
      if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
      syncTimeoutRef.current = setTimeout(() => {
        const active = getCurrentUser();
        if (active) {
          setUser(active);
          fetchWalletData(active, page, debouncedSearch, typeFilter, true);
        }
      }, 150);
    };

    window.addEventListener('storage', debouncedSync);
    window.addEventListener('focus', debouncedSync);
    window.addEventListener('zecratary_languages_updated', debouncedSync);
    window.addEventListener('zecratary_dictionary_updated', debouncedSync);
    window.addEventListener('zecratary_locale_changed', debouncedSync);
    window.addEventListener('zecratary_payment_updated', debouncedSync);
    window.addEventListener('zecratary_payment_gateway_updated', debouncedSync);
    window.addEventListener('zecratary_admin_settings_updated', debouncedSync);
    window.addEventListener('zecratary_wallet_settings_updated', debouncedSync);
    window.addEventListener('zecratary_wallet_updated', debouncedSync);

    let bc: BroadcastChannel | null = null;
    let gwBc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel('zecratary_balance_channel');
      bc.onmessage = (ev) => {
        if (ev.data?.type === 'WALLET_UPDATED' && typeof ev.data.wallet === 'number') {
          setBalance(ev.data.wallet);
        }
      };
      gwBc = new BroadcastChannel('zecratary_gateway_channel');
      gwBc.onmessage = (ev) => {
        const payload = ev.data?.settings || ev.data?.paymentSettings || ev.data?.gateways;
        if (payload) {
          const fresh = resolveAllowedChannels(payload);
          const sVerified = ev.data?.stripeKeysVerified !== undefined 
            ? Boolean(ev.data.stripeKeysVerified) 
            : (payload.stripeKeysVerified !== undefined ? Boolean(payload.stripeKeysVerified) : undefined);
          const pVerified = ev.data?.paypalKeysVerified !== undefined 
            ? Boolean(ev.data.paypalKeysVerified) 
            : (payload.paypalKeysVerified !== undefined ? Boolean(payload.paypalKeysVerified) : undefined);

          setSettings(prev => ({ 
            ...prev, 
            allowed_gateways: fresh,
            stripeKeysVerified: sVerified !== undefined ? sVerified : prev.stripeKeysVerified,
            paypalKeysVerified: pVerified !== undefined ? pVerified : prev.paypalKeysVerified
          }));
          setSelectedGateway(prev => (fresh.includes(prev) ? prev : fresh[0] || ''));
        }
        debouncedSync();
      };
    } catch (_) {}

    return () => {
      if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
      window.removeEventListener('storage', debouncedSync);
      window.removeEventListener('focus', debouncedSync);
      window.removeEventListener('zecratary_languages_updated', debouncedSync);
      window.removeEventListener('zecratary_dictionary_updated', debouncedSync);
      window.removeEventListener('zecratary_locale_changed', debouncedSync);
      window.removeEventListener('zecratary_payment_updated', debouncedSync);
      window.removeEventListener('zecratary_payment_gateway_updated', debouncedSync);
      window.removeEventListener('zecratary_admin_settings_updated', debouncedSync);
      window.removeEventListener('zecratary_wallet_settings_updated', debouncedSync);
      window.removeEventListener('zecratary_wallet_updated', debouncedSync);
      if (bc) bc.close();
      if (gwBc) gwBc.close();
    };
  }, [resolveAllowedChannels]);

  useEffect(() => {
    if (user) {
      fetchWalletData(user, page, debouncedSearch, typeFilter, true);
    }
  }, [page, debouncedSearch, typeFilter]);

  const finalDepositAmount = useMemo(() => {
    if (customAmount.trim()) {
      const val = parseFloat(customAmount);
      return isNaN(val) ? 0 : val;
    }
    return selectedAmount || 0;
  }, [customAmount, selectedAmount]);

  const activeBonusPercent = useMemo(() => {
    if (!settings.bonus_rules || settings.bonus_rules.length === 0) return 0;
    const sorted = [...settings.bonus_rules].sort((a, b) => b.threshold - a.threshold);
    const rule = sorted.find(r => finalDepositAmount >= r.threshold);
    return rule ? rule.bonus_percent : 0;
  }, [finalDepositAmount, settings.bonus_rules]);

  const bonusAmount = useMemo(() => {
    if (activeBonusPercent <= 0) return 0;
    return (finalDepositAmount * activeBonusPercent) / 100;
  }, [finalDepositAmount, activeBonusPercent]);

  // STAGE 1 VERIFICATION ENFORCEMENT: Client-Side Deposit Guard
  const handleDeposit = async () => {
    if (settings.allowed_gateways.length === 0) {
      showToast(t('noGatewaysEnabledNotice', 'No payment gateways are currently enabled in Payment Gateway settings.'), 'error');
      return;
    }
    if (!selectedGateway || !settings.allowed_gateways.includes(selectedGateway)) {
      showToast(t('pleaseSelectValidGateway', 'Please select an available payment gateway.'), 'error');
      return;
    }

    if (!isGatewayKeyVerified(selectedGateway)) {
      showToast(
        (t('gatewayNotVerifiedError', 'Payment blocked: {gateway} keys are not verified by admin. Please contact support.'))
          .replace('{gateway}', selectedGateway === 'stripe' ? 'Stripe' : selectedGateway === 'paypal' ? 'PayPal' : selectedGateway.toUpperCase()),
        'error'
      );
      return;
    }

    if (finalDepositAmount < settings.min_topup) {
      showToast((t('minTopupWarning', 'Minimum deposit is {min}')).replace('{min}', `${activeCurrencySymbol}${settings.min_topup}`), 'error');
      return;
    }
    if (finalDepositAmount > settings.max_topup) {
      showToast((t('maxTopupWarning', 'Maximum deposit is {max}')).replace('{max}', `${activeCurrencySymbol}${settings.max_topup}`), 'error');
      return;
    }
    if (!user) return;
    setSubmitting(true);

    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const res = await fetch('/api/wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'topup',
          amount: finalDepositAmount,
          bonus: bonusAmount,
          gateway: selectedGateway,
          email: user.email,
          userId: user.id || 'usr_admin_1',
          origin: origin,
          transferReference: manualReference,
          gatewayTxId: manualReference || `gw_manual_${Date.now()}`
        })
      });

      const text = await res.text();
      let data: any = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch (_) {
        data = {};
      }

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to deposit funds');
      }

      if (data.checkoutUrl) {
        showToast(
          selectedGateway === 'paypal' 
            ? t('redirectingToPaypal', 'Redirecting to PayPal...') 
            : t('checkoutRedirectNotice', 'Redirecting to secure payment checkout...'), 
          'info'
        );
        try {
          window.location.assign(data.checkoutUrl);
        } catch (_) {
          window.location.href = data.checkoutUrl;
        }
        return;
      }

      const newBal = typeof data.wallet_balance === 'number' 
        ? data.wallet_balance 
        : (balance + finalDepositAmount + bonusAmount);
      
      broadcastBalanceUpdate(newBal);

      if (Array.isArray(data.transactions) && data.transactions.length > 0) {
        setTransactions(data.transactions);
      }

      showToast(
        data.message || (t('depositSuccessToast', 'Successfully deposited {amount} into your wallet!'))
          .replace('{amount}', `${activeCurrencySymbol}${finalDepositAmount.toFixed(2)}`),
        'success'
      );

      setCustomAmount('');
      setManualReference('');
      setSelectedAmount(settings.preset_amounts[0] || 50);
      fetchWalletData(user, page, debouncedSearch, typeFilter, true);
    } catch (err: any) {
      showToast(err.message || 'Deposit failed.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const isSelectedVerified = isGatewayKeyVerified(selectedGateway);

  return (
    <div 
      className="w-full max-w-full px-4 sm:px-6 lg:px-8 xl:px-10 space-y-6 pb-24 font-sans transition-colors duration-200"
      style={{ color: 'var(--color-text)' }}
    >
      {/* Toast Notification Alert */}
      {toastMessage && (
        <div 
          className="fixed top-20 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 rounded-2xl text-xs font-bold shadow-2xl flex items-center gap-2 animate-in fade-in slide-in-from-top-3 border"
          style={{
            backgroundColor: 'var(--color-card)',
            borderColor: toastMessage.type === 'success' ? 'var(--color-emerald)' : toastMessage.type === 'info' ? 'var(--color-primary)' : '#ef4444',
            color: 'var(--color-text)'
          }}
        >
          {toastMessage.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          ) : toastMessage.type === 'info' ? (
            <Info className="h-4 w-4" style={{ color: 'var(--color-primary)' }} />
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
            {t('storeWalletTitle', 'Store Wallet')}
          </h1>
          <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
            {t('storeWalletSubtitle', 'Deposit funds to purchase AI tokens and subscriptions.')}
          </p>
        </div>

        <div className="flex items-center flex-wrap gap-2.5">
          <button
            type="button"
            onClick={handleReconcile}
            disabled={reconciling}
            className="border font-bold text-xs px-3.5 py-2.5 rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50 hover:opacity-80"
            style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
            title={t('reconcilePaymentsBtn', 'Reconcile Payments')}
          >
            <RotateCw className={`h-4 w-4 ${reconciling ? 'animate-spin' : ''}`} style={{ color: 'var(--color-primary)' }} />
            <span>{reconciling ? t('reconciling', 'Reconciling...') : t('reconcilePaymentsBtn', 'Reconcile Payments')}</span>
          </button>

          <button
            type="button"
            onClick={() => fetchWalletData(user, page, debouncedSearch, typeFilter, true)}
            disabled={loading}
            className="border font-bold text-xs px-3.5 py-2.5 rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50 hover:opacity-80"
            style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
            title={t('reloadBtn', 'Reload')}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} style={{ color: 'var(--color-primary)' }} />
            <span>{t('reloadBtn', 'Reload')}</span>
          </button>

          <Link
            href="/token"
            className="px-4 py-2.5 rounded-xl text-xs font-bold text-white transition shadow flex items-center gap-1.5 hover:opacity-90"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            <Coins className="h-4 w-4" />
            <span>{t('topUpTokens', 'Token Portal')}</span>
          </Link>
        </div>
      </div>

      {/* Main Deposit Section & Available Balance Box */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Available Balance Box */}
        <div 
          className="lg:col-span-4 p-6 rounded-3xl border shadow-sm space-y-5 transition-colors duration-200"
          style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold opacity-75">{t('currentWalletBalance', 'Available Balance')}</span>
            <div className="p-2.5 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Wallet className="h-6 w-6" />
            </div>
          </div>

          <div className="text-3xl font-black font-mono text-emerald-400">
            {activeCurrencySymbol}{balance.toFixed(2)}
          </div>

          <div className="pt-3 border-t space-y-2 text-xs" style={{ borderColor: 'var(--color-border)' }}>
            <div className="flex justify-between items-center opacity-80">
              <span>{t('totalDeposited', 'Total Deposited')}:</span>
              <span className="font-bold font-mono text-emerald-400">+{activeCurrencySymbol}{stats.totalDeposited.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center opacity-80">
              <span>{t('totalSpent', 'Total Spent')}:</span>
              <span className="font-bold font-mono text-rose-400">-{activeCurrencySymbol}{stats.totalSpent.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center opacity-80">
              <span>{t('totalEvents', 'Total Events')}:</span>
              <span className="font-bold font-mono">{stats.totalEvents}</span>
            </div>
          </div>
        </div>

        {/* Deposit Funds Form */}
        <div 
          role="region"
          aria-label={t('depositFunds', 'Deposit Funds')}
          data-lpignore="true"
          className="lg:col-span-8 p-6 rounded-3xl border shadow-sm space-y-5 transition-colors duration-200"
          style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }}
        >
          <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: 'var(--color-border)' }}>
            <h3 className="font-extrabold text-sm" style={{ color: 'var(--color-primary)' }}>
              {t('depositFunds', 'Deposit Funds')}
            </h3>
            {activeBonusPercent > 0 && (
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase text-emerald-400 border border-emerald-500/30 bg-emerald-500/10 flex items-center gap-1">
                <Gift className="h-3 w-3" />
                {(t('depositBonusBadge', '{percent}% Bonus Active')).replace('{percent}', String(activeBonusPercent))}
              </span>
            )}
          </div>

          {/* Preset Amounts */}
          <div className="space-y-2">
            <label className="block text-xs font-bold opacity-80">{t('selectPresetAmount', 'Select Preset Amount')}</label>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2.5">
              {settings.preset_amounts.map(amt => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => {
                    setSelectedAmount(amt);
                    setCustomAmount('');
                  }}
                  className={`py-2.5 rounded-xl border text-xs font-mono font-bold transition cursor-pointer shadow-xs ${
                    selectedAmount === amt && !customAmount ? 'text-white' : 'hover:border-[var(--color-primary)]'
                  }`}
                  style={selectedAmount === amt && !customAmount ? {
                    backgroundColor: 'var(--color-primary)',
                    borderColor: 'var(--color-primary)'
                  } : {
                    backgroundColor: 'var(--color-inner-dark)',
                    borderColor: 'var(--color-border)',
                    color: 'var(--color-text)'
                  }}
                >
                  {activeCurrencySymbol}{amt}
                </button>
              ))}
            </div>
          </div>

          {/* Custom Amount */}
          <div>
            <label className="block text-xs font-bold mb-1 opacity-80">{t('orCustomAmount', 'Or enter custom amount')}</label>
            <div className="relative">
              <span className="absolute left-3.5 top-2.5 font-bold font-mono text-sm opacity-60">{activeCurrencySymbol}</span>
              <input
                type="number"
                min={settings.min_topup}
                max={settings.max_topup}
                step="0.01"
                autoComplete="off"
                data-lpignore="true"
                data-form-type="other"
                spellCheck="false"
                placeholder="50.00"
                value={customAmount}
                onChange={(e) => {
                  const val = e.target.value;
                  setCustomAmount(val);
                  if (val.trim() !== '') {
                    setSelectedAmount(0);
                  }
                }}
                className="w-full pl-8 pr-4 py-2.5 rounded-xl border text-sm font-mono font-bold outline-none"
                style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
              />
            </div>
          </div>

          {/* Payment Gateway Options with Verification Badges */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold opacity-80">{t('paymentGateway', 'Payment Gateway')}</label>
              {gatewaysLoaded && settings.allowed_gateways.length > 0 && (
                <span className="text-[10px] opacity-60 font-medium">
                  {settings.allowed_gateways.length} {t('gatewaysAvailable', 'channel(s) active')}
                </span>
              )}
            </div>

            {!gatewaysLoaded ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="p-3.5 rounded-xl border animate-pulse opacity-40 h-12" style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)' }} />
                <div className="p-3.5 rounded-xl border animate-pulse opacity-40 h-12" style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)' }} />
              </div>
            ) : settings.allowed_gateways.length === 0 ? (
              <div 
                className="p-3.5 rounded-xl border text-xs flex items-center gap-2.5 opacity-90 transition animate-in fade-in"
                style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
              >
                <AlertCircle className="h-4 w-4 text-amber-400 shrink-0" />
                <span>{t('noGatewaysEnabledNotice', 'No payment gateways are currently enabled in Payment Gateway settings. Please contact the administrator.')}</span>
              </div>
            ) : (
              <div className={`grid gap-2.5 ${settings.allowed_gateways.length === 1 ? 'grid-cols-1' : settings.allowed_gateways.length === 2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 sm:grid-cols-3'}`}>
                {settings.allowed_gateways.includes('stripe') && (
                  <button
                    type="button"
                    onClick={() => setSelectedGateway('stripe')}
                    className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-between transition cursor-pointer ${
                      selectedGateway === 'stripe' ? 'border-[var(--color-primary)] bg-[var(--color-inner-dark)]' : 'hover:border-[var(--color-primary)]'
                    }`}
                    style={{ borderColor: selectedGateway === 'stripe' ? 'var(--color-primary)' : 'var(--color-border)' }}
                  >
                    <div className="flex items-center gap-2">
                      <CreditCard className="h-4 w-4 text-sky-400" />
                      <span>{t('stripeGateway', 'Stripe')}</span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {settings.stripeKeysVerified ? (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                          Verified
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-amber-500/10 text-amber-400 border border-amber-500/30">
                          Unverified
                        </span>
                      )}
                      {selectedGateway === 'stripe' && <Check className="h-3.5 w-3.5 text-[var(--color-primary)]" />}
                    </div>
                  </button>
                )}

                {settings.allowed_gateways.includes('paypal') && (
                  <button
                    type="button"
                    onClick={() => setSelectedGateway('paypal')}
                    className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-between transition cursor-pointer ${
                      selectedGateway === 'paypal' ? 'border-[var(--color-primary)] bg-[var(--color-inner-dark)]' : 'hover:border-[var(--color-primary)]'
                    }`}
                    style={{ borderColor: selectedGateway === 'paypal' ? 'var(--color-primary)' : 'var(--color-border)' }}
                  >
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-amber-400" />
                      <span>{t('paypalGateway', 'PayPal')}</span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {settings.paypalKeysVerified ? (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                          Verified
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-amber-500/10 text-amber-400 border border-amber-500/30">
                          Unverified
                        </span>
                      )}
                      {selectedGateway === 'paypal' && <Check className="h-3.5 w-3.5 text-[var(--color-primary)]" />}
                    </div>
                  </button>
                )}

                {settings.allowed_gateways.includes('manual') && (
                  <button
                    type="button"
                    onClick={() => setSelectedGateway('manual')}
                    className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-between transition cursor-pointer ${
                      selectedGateway === 'manual' ? 'border-[var(--color-primary)] bg-[var(--color-inner-dark)]' : 'hover:border-[var(--color-primary)]'
                    }`}
                    style={{ borderColor: selectedGateway === 'manual' ? 'var(--color-primary)' : 'var(--color-border)' }}
                  >
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-purple-400" />
                      <span>{t('manualGateway', 'Bank Wire / Settlement')}</span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                        Active
                      </span>
                      {selectedGateway === 'manual' && <Check className="h-3.5 w-3.5 text-[var(--color-primary)]" />}
                    </div>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* UNVERIFIED KEY SUBMISSION BLOCK WARNING BANNER */}
          {selectedGateway && !isSelectedVerified && (
            <div 
              role="region"
              aria-label="Payment Gateway Key Verification Alert"
              data-lpignore="true"
              className="p-4 rounded-2xl border text-xs flex items-start gap-3 animate-in fade-in transition shadow-xs"
              style={{
                backgroundColor: 'rgba(245, 158, 11, 0.08)',
                borderColor: '#f59e0b',
                color: '#fbbf24'
              }}
            >
              <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5 text-amber-500" />
              <div className="space-y-0.5">
                <span className="font-extrabold block text-xs">
                  {t('gatewayUnverifiedTitle', 'Payment Gateway Key Not Verified')}
                </span>
                <p className="text-[11px] font-normal opacity-90 leading-relaxed">
                  {t('gatewayUnverifiedDesc', 'Payment submissions via this gateway are disabled because its API keys have not been verified in Payment Gateway Settings. Please choose another payment method or contact the administrator to verify the API credentials.')}
                </p>
              </div>
            </div>
          )}

          {/* Bank Wire Details Form */}
          {selectedGateway === 'manual' && settings.allowed_gateways.includes('manual') && (
            <div 
              className="p-3.5 rounded-xl border text-xs space-y-2 transition animate-in fade-in"
              style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)' }}
            >
              <div className="flex items-center justify-between font-bold">
                <span className="flex items-center gap-1.5 text-purple-400">
                  <ShieldCheck className="h-4 w-4" />
                  <span>{t('bankTransferInstructions', 'Bank Wire / Manual Settlement Details')}</span>
                </span>
              </div>
              {settings.manual_details?.bankName && (
                <div className="grid grid-cols-2 gap-2 text-[11px] opacity-80 pt-1 border-t" style={{ borderColor: 'var(--color-border)' }}>
                  <div><span className="font-semibold">{t('bankName', 'Bank')}:</span> {settings.manual_details.bankName}</div>
                  <div><span className="font-semibold">{t('accountHolder', 'Account')}:</span> {settings.manual_details.accountHolder}</div>
                  <div><span className="font-semibold">{t('accountNumber', 'Number')}:</span> {settings.manual_details.accountNumber}</div>
                  {settings.manual_details.swiftBic && <div><span className="font-semibold">SWIFT/BIC:</span> {settings.manual_details.swiftBic}</div>}
                </div>
              )}
              {settings.manual_details?.instructions && (
                <p className="text-[11px] opacity-70 italic">{settings.manual_details.instructions}</p>
              )}
              <div className="pt-1">
                <label className="block text-[11px] font-bold opacity-80 mb-1">{t('transferReference', 'Transfer Reference / Receipt ID')}</label>
                <input
                  type="text"
                  autoComplete="off"
                  data-lpignore="true"
                  data-form-type="other"
                  spellCheck="false"
                  placeholder={t('transferReferencePlaceholder', 'e.g. WIRE-94821 or Transaction Ref')}
                  value={manualReference}
                  onChange={(e) => setManualReference(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg border text-xs outline-none font-mono"
                  style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                />
              </div>
            </div>
          )}

          {/* Deposit Submit Button with Verification Enforcement Guard */}
          <button
            type="button"
            onClick={handleDeposit}
            disabled={
              submitting || 
              finalDepositAmount < settings.min_topup || 
              settings.allowed_gateways.length === 0 || 
              !selectedGateway ||
              !isSelectedVerified
            }
            className={`w-full py-3 rounded-xl font-bold text-xs transition shadow-lg flex items-center justify-center gap-2 ${
              !isSelectedVerified ? 'opacity-50 cursor-not-allowed text-white' : 'text-white cursor-pointer hover:opacity-90'
            }`}
            style={{
              backgroundColor: isSelectedVerified ? 'var(--color-primary)' : 'var(--color-border)'
            }}
          >
            {submitting ? t('processingDeposit', 'Processing Deposit...') : !isSelectedVerified ? (
              <>
                <ShieldAlert className="h-4 w-4 text-amber-300" />
                <span>{t('gatewayUnverifiedSubmitBlocked', 'Key Not Verified — Payment Blocked')}</span>
              </>
            ) : (
              <>
                <Plus className="h-4 w-4" />
                <span>
                  {settings.allowed_gateways.length === 0 ? (
                    t('topupsUnavailable', 'Top-Ups Temporarily Unavailable')
                  ) : (
                    `${t('addFundsBtn', 'Add Funds to Wallet')} (${activeCurrencySymbol}${finalDepositAmount.toFixed(2)}${bonusAmount > 0 ? ` + ${activeCurrencySymbol}${bonusAmount.toFixed(2)} Bonus` : ''})`
                  )}
                </span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Transaction Audit Ledger */}
      <div 
        role="region"
        aria-label={t('walletLedgerTitle', 'Wallet Transaction Ledger')}
        data-lpignore="true"
        className="p-6 rounded-3xl border shadow-sm space-y-4 transition-colors duration-200"
        style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-4" style={{ borderColor: 'var(--color-border)' }}>
          <h3 className="font-extrabold text-sm" style={{ color: 'var(--color-primary)' }}>
            {t('walletLedgerTitle', 'Wallet Transaction Ledger')}
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
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1.5 rounded-xl border text-xs outline-none font-medium w-48 sm:w-64"
                style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
              />
            </div>

            <select
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value);
                setPage(1);
              }}
              className="px-2.5 py-1.5 rounded-xl border text-xs font-bold outline-none cursor-pointer"
              style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
            >
              <option value="all">{t('allTypes', 'All Types')}</option>
              <option value="topup">{t('filterTopup', 'Deposits')}</option>
              <option value="purchase">{t('filterPurchase', 'Purchases')}</option>
              <option value="refund">{t('filterRefund', 'Refunds')}</option>
              <option value="adjustment">{t('filterAdjustment', 'Adjustments')}</option>
            </select>
          </div>
        </div>

        {/* Ledger Table */}
        <div className="overflow-x-auto">
          {transactions.length === 0 ? (
            <div className="py-12 text-center text-xs opacity-50">
              {t('noTransactionsFound', 'No transactions found matching your criteria.')}
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b text-[10px] uppercase font-bold opacity-70" style={{ borderColor: 'var(--color-border)' }}>
                  <th className="py-2.5 px-3">{t('colDate', 'Date')}</th>
                  <th className="py-2.5 px-3">{t('colTxId', 'Transaction ID')}</th>
                  <th className="py-2.5 px-3">{t('colGateway', 'Gateway')}</th>
                  <th className="py-2.5 px-3">{t('colType', 'Type')}</th>
                  <th className="py-2.5 px-3">{t('colDescription', 'Description')}</th>
                  <th className="py-2.5 px-3 text-right">{t('colAmount', 'Amount')}</th>
                  <th className="py-2.5 px-3 text-right">{t('colBalanceAfter', 'Balance After')}</th>
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
                {transactions.map((tx) => {
                  const amt = Number(tx.amount || 0);
                  const isDebit = amt < 0;
                  return (
                    <tr 
                      key={tx.id} 
                      className="transition duration-150 hover:bg-[var(--color-inner-dark)]"
                    >
                      <td className="py-3 px-3 font-mono text-[11px] opacity-75">
                        {tx.created_at ? new Date(tx.created_at).toLocaleDateString() : '—'}
                      </td>
                      <td className="py-3 px-3 font-mono text-[10px] opacity-60">
                        {(tx.id || '').slice(0, 14)}...
                      </td>
                      <td className="py-3 px-3 uppercase text-[10px] font-bold opacity-75">
                        {tx.gateway || 'Stripe'}
                      </td>
                      <td className="py-3 px-3">
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border opacity-80" style={{ borderColor: 'var(--color-border)' }}>
                          {t(`txType_${tx.type}`, tx.type || 'topup')}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-medium">
                        {tx.description || tx.plan_name || tx.planName || t('walletDeposit', 'Wallet Deposit')}
                      </td>
                      <td className={`py-3 px-3 text-right font-bold font-mono ${isDebit ? 'text-rose-400' : 'text-emerald-400'}`}>
                        {isDebit ? `-${activeCurrencySymbol}${Math.abs(amt).toFixed(2)}` : `+${activeCurrencySymbol}${amt.toFixed(2)}`}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold opacity-80">
                        {activeCurrencySymbol}{Number(tx.balance_after || 0).toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
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
    </div>
  );
}

export default function WalletPage() {
  return (
    <Suspense fallback={
      <div className="p-12 text-center text-xs opacity-50">
        Loading Wallet Portal...
      </div>
    }>
      <WalletContent />
    </Suspense>
  );
}
