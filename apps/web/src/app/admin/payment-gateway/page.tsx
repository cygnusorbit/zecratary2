// @ts-nocheck
'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import { 
  CreditCard, Shield, CheckCircle2, AlertCircle, Save, RefreshCw, 
  Check, Eye, EyeOff, Globe, Zap, ShieldCheck, Terminal, 
  ExternalLink, Code2, AlertTriangle, Activity, Landmark, Clock, X, XCircle, Search, 
  Trash2, Edit3, Copy, ChevronDown, Coins, ArrowUpRight
} from 'lucide-react';
import { useTranslation } from '@/components/LanguageProvider';

function normalizeBool(val: any, fallback = false): boolean {
  if (val === undefined || val === null) return fallback;
  if (typeof val === 'boolean') return val;
  if (typeof val === 'number') return val === 1;
  if (typeof val === 'string') {
    const s = val.trim().toLowerCase();
    if (s === 'true' || s === '1' || s === 'yes' || s === 'on') return true;
    if (s === 'false' || s === '0' || s === 'no' || s === 'off') return false;
  }
  return fallback;
}

interface ManualSettlementConfig {
  enabled: boolean;
  bankName: string;
  accountHolder: string;
  accountNumber: string;
  routingNumber: string;
  swiftBic: string;
  branchName: string;
  instructions: string;
  requireReference: boolean;
  requireApproval: boolean;
}

interface GatewayConfig {
  currency: string;
  activeGateway?: string;
  stripeConnected?: boolean;
  stripeKeysVerified?: boolean;
  stripeWebhookVerified?: boolean;
  paypalKeysVerified?: boolean;
  paypalWebhookVerified?: boolean;
  stripe: {
    enabled: boolean;
    testMode: boolean;
    publishableKey: string;
    secretKey: string;
    webhookSecret: string;
  };
  paypal: {
    enabled: boolean;
    testMode: boolean;
    clientId: string;
    clientSecret: string;
    webhookId: string;
    environment: 'sandbox' | 'live';
  };
  manualSettlement: ManualSettlementConfig;
}

interface PaymentTransaction {
  id: string;
  customer_name?: string;
  customerName?: string;
  customer_email?: string;
  customerEmail?: string;
  plan_name?: string;
  planName?: string;
  amount?: number;
  currency?: string;
  gateway?: string;
  status: string;
  test_mode?: boolean;
  failure_reason?: string;
  failureReason?: string;
  transfer_reference?: string;
  transferReference?: string;
  confirmed_amount?: number;
  confirmedAmount?: number;
  confirmed_at?: string;
  confirmedAt?: string;
  notes?: string;
  created_at?: string;
  createdAt?: string;
}

const SUPPORTED_CURRENCIES = [
  { code: 'USD', label: 'USD - United States Dollar ($)', symbol: '$' },
  { code: 'EUR', label: 'EUR - Euro (€)', symbol: '€' },
  { code: 'GBP', label: 'GBP - British Pound (£)', symbol: '£' },
  { code: 'CAD', label: 'CAD - Canadian Dollar ($)', symbol: 'CA$' },
  { code: 'AUD', label: 'AUD - Australian Dollar ($)', symbol: 'A$' },
  { code: 'JPY', label: 'JPY - Japanese Yen (¥)', symbol: '¥' },
  { code: 'SGD', label: 'SGD - Singapore Dollar ($)', symbol: 'S$' },
  { code: 'CHF', label: 'CHF - Swiss Franc (Fr)', symbol: 'Fr' },
  { code: 'NZD', label: 'NZD - New Zealand Dollar ($)', symbol: 'NZ$' },
  { code: 'THB', label: 'THB - Thai Baht (฿)', symbol: '฿' },
];

export default function AdminPaymentGatewayPage() {
  const { t } = useTranslation();

  const tr = useCallback((key: string, fallback: string): string => {
    if (typeof t === 'function') {
      const val = t(key);
      if (val && val !== key) return String(val);
    }
    return fallback;
  }, [t]);

  const [activeTab, setActiveTab] = useState<'stripe' | 'paypal' | 'manual'>('stripe');

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [verifyingStripe, setVerifyingStripe] = useState(false);
  const [verifyingPayPal, setVerifyingPayPal] = useState(false);

  const [showStripeGuideModal, setShowStripeGuideModal] = useState(false);
  const [copiedCliKey, setCopiedCliKey] = useState<string | null>(null);
  const [copiedWhUrl, setCopiedWhUrl] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [visibleFields, setVisibleFields] = useState<Record<string, boolean>>({});

  const [transactions, setTransactions] = useState<PaymentTransaction[]>([]);
  const [settlementFilter, setSettlementFilter] = useState<'all' | 'pending' | 'succeeded' | 'rejected'>('all');
  const [settlementSearch, setSettlementSearch] = useState('');
  const [viewTx, setViewTx] = useState<PaymentTransaction | null>(null);
  const [editTx, setEditTx] = useState<PaymentTransaction | null>(null);
  const [editForm, setEditForm] = useState({
    customer_name: '',
    customer_email: '',
    plan_name: '',
    amount: 0,
    transfer_reference: '',
    status: 'pending',
    notes: '',
    failure_reason: '',
  });
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const [config, setConfig] = useState<GatewayConfig>({
    currency: 'USD',
    activeGateway: 'stripe',
    stripeConnected: true,
    stripeKeysVerified: false,
    stripeWebhookVerified: false,
    paypalKeysVerified: false,
    paypalWebhookVerified: false,
    stripe: {
      enabled: true,
      testMode: true,
      publishableKey: '',
      secretKey: '',
      webhookSecret: '',
    },
    paypal: {
      enabled: false,
      testMode: true,
      clientId: '',
      clientSecret: '',
      webhookId: '',
      environment: 'sandbox',
    },
    manualSettlement: {
      enabled: true,
      bankName: 'Bangkok Bank',
      accountHolder: 'Zecratary Culinary Ltd',
      accountNumber: '123-4-56789-0',
      routingNumber: '002',
      swiftBic: 'BKKBTHBK',
      branchName: 'Siam Paragon Branch',
      instructions: 'Please transfer the exact subscription or wallet balance amount and upload your transfer slip.',
      requireReference: true,
      requireApproval: true,
    }
  });

  const configRef = useRef<GatewayConfig>(config);
  const isSelfUpdatingRef = useRef<boolean>(false);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    configRef.current = config;
  }, [config]);

  const [webhookEndpointUrl, setWebhookEndpointUrl] = useState('https://zecratary.com/api/webhooks/stripe');

  useEffect(() => {
    if (typeof window !== 'undefined' && window.location?.origin) {
      setWebhookEndpointUrl(`${window.location.origin}/api/webhooks/stripe`);
    }
  }, []);

  const toggleVisibility = (field: string) => {
    setVisibleFields(prev => ({ ...prev, [field]: !prev[field] }));
  };

  const handleCopy = (text: string, key: string) => {
    if (typeof navigator !== 'undefined') {
      navigator.clipboard.writeText(text);
      if (key === 'stripe_url') {
        setCopiedWhUrl(true);
        setTimeout(() => setCopiedWhUrl(false), 2000);
      } else {
        setCopiedCliKey(key);
        setTimeout(() => setCopiedCliKey(null), 2500);
      }
    }
  };

  const loadConfig = useCallback(async (force = false) => {
    if (!force && isSelfUpdatingRef.current) return;
    setLoading(true);
    try {
      const res = await fetch('/api/admin/payment-gateway?t=' + Date.now(), { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        const s = data.paymentSettings || data.settings;
        if (s) {
          const loadedStripeEnabled = normalizeBool(s.stripe?.enabled, true);
          const loadedPaypalEnabled = normalizeBool(s.paypal?.enabled, false);
          const loadedManualEnabled = normalizeBool(s.manualSettlement?.enabled ?? s.manual?.enabled, true);

          const activeGw = (loadedStripeEnabled && loadedPaypalEnabled)
            ? 'both'
            : loadedStripeEnabled
            ? 'stripe'
            : loadedPaypalEnabled
            ? 'paypal'
            : 'none';

          const mSet = s.manualSettlement || s.manual || {};

          setConfig(prev => {
            const current = configRef.current;
            const nextConfig: GatewayConfig = {
              ...current,
              ...s,
              currency: s.currency || data.currency || current.currency || 'USD',
              activeGateway: isSelfUpdatingRef.current ? current.activeGateway : (s.activeGateway || activeGw),
              stripeConnected: s.stripeConnected ?? current.stripeConnected ?? true,
              stripeKeysVerified: s.stripeKeysVerified ?? current.stripeKeysVerified ?? false,
              stripeWebhookVerified: s.stripeWebhookVerified ?? current.stripeWebhookVerified ?? false,
              paypalKeysVerified: s.paypalKeysVerified ?? current.paypalKeysVerified ?? false,
              paypalWebhookVerified: s.paypalWebhookVerified ?? current.paypalWebhookVerified ?? false,
              stripe: {
                ...current.stripe,
                ...(s.stripe || {}),
                enabled: isSelfUpdatingRef.current ? current.stripe.enabled : loadedStripeEnabled,
                testMode: normalizeBool(s.stripe?.testMode, true)
              },
              paypal: {
                ...current.paypal,
                ...(s.paypal || {}),
                enabled: isSelfUpdatingRef.current ? current.paypal.enabled : loadedPaypalEnabled,
                testMode: normalizeBool(s.paypal?.testMode, s.paypal?.environment === 'sandbox' || true),
                environment: (s.paypal?.environment || (normalizeBool(s.paypal?.testMode, true) ? 'sandbox' : 'live'))
              },
              manualSettlement: {
                ...current.manualSettlement,
                ...mSet,
                enabled: isSelfUpdatingRef.current ? current.manualSettlement.enabled : loadedManualEnabled,
                requireReference: normalizeBool(mSet.requireReference, true),
                requireApproval: normalizeBool(mSet.requireApproval, true),
              },
            };
            configRef.current = nextConfig;
            return nextConfig;
          });
        }
        if (Array.isArray(data.transactions)) {
          setTransactions(data.transactions);
        }
      }
    } catch (_) {}
    finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConfig(true);

    const handleSync = () => {
      if (isSelfUpdatingRef.current) return;
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(() => {
        loadConfig(false);
      }, 350);
    };

    window.addEventListener('zecratary_payment_updated', handleSync);
    window.addEventListener('zecratary_payment_gateway_updated', handleSync);
    window.addEventListener('zecratary_admin_settings_updated', handleSync);
    window.addEventListener('zecratary_locale_changed', handleSync);
    window.addEventListener('zecratary_wallet_updated', handleSync);

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      window.removeEventListener('zecratary_payment_updated', handleSync);
      window.removeEventListener('zecratary_payment_gateway_updated', handleSync);
      window.removeEventListener('zecratary_admin_settings_updated', handleSync);
      window.removeEventListener('zecratary_locale_changed', handleSync);
      window.removeEventListener('zecratary_wallet_updated', handleSync);
    };
  }, [loadConfig]);

  const handleToggleGateway = async (gateway: 'stripe' | 'paypal' | 'manual') => {
    isSelfUpdatingRef.current = true;

    const isStripe = gateway === 'stripe';
    const isPaypal = gateway === 'paypal';
    const isManual = gateway === 'manual';

    const currentConfig = configRef.current;
    const nextStripeEnabled = isStripe ? !normalizeBool(currentConfig.stripe.enabled, true) : normalizeBool(currentConfig.stripe.enabled, true);
    const nextPaypalEnabled = isPaypal ? !normalizeBool(currentConfig.paypal.enabled, false) : normalizeBool(currentConfig.paypal.enabled, false);
    const nextManualEnabled = isManual ? !normalizeBool(currentConfig.manualSettlement.enabled, true) : normalizeBool(currentConfig.manualSettlement.enabled, true);

    const nextActiveGateway = (nextStripeEnabled && nextPaypalEnabled)
      ? 'both'
      : nextStripeEnabled
      ? 'stripe'
      : nextPaypalEnabled
      ? 'paypal'
      : 'none';

    const updatedConfig: GatewayConfig = {
      ...currentConfig,
      activeGateway: nextActiveGateway,
      stripe: { ...currentConfig.stripe, enabled: nextStripeEnabled },
      paypal: { ...currentConfig.paypal, enabled: nextPaypalEnabled },
      manualSettlement: { ...currentConfig.manualSettlement, enabled: nextManualEnabled }
    };

    setConfig(updatedConfig);
    configRef.current = updatedConfig;

    try {
      const res = await fetch('/api/admin/payment-gateway', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'toggle_gateway',
          gateway: gateway,
          enabled: isStripe ? nextStripeEnabled : (isPaypal ? nextPaypalEnabled : nextManualEnabled),
          activeGateway: nextActiveGateway,
          paymentSettings: updatedConfig
        })
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok && data.success) {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('zecratary_payment_updated'));
          window.dispatchEvent(new Event('zecratary_payment_gateway_updated'));
          window.dispatchEvent(new Event('zecratary_wallet_updated'));
          try {
            const gwBc = new BroadcastChannel('zecratary_gateway_channel');
            gwBc.postMessage({ 
              type: 'GATEWAY_UPDATED', 
              paymentSettings: updatedConfig, 
              settings: updatedConfig, 
              allowed_gateways: [
                ...(nextStripeEnabled ? ['stripe'] : []),
                ...(nextPaypalEnabled ? ['paypal'] : []),
                ...(nextManualEnabled ? ['manual'] : [])
              ]
            });
            gwBc.close();
          } catch (_) {}
        }

        const gwName = isStripe ? 'Stripe' : (isPaypal ? 'PayPal' : tr('tabManual', 'Bank Wire / Manual Settlement'));
        const isEnabled = isStripe ? nextStripeEnabled : (isPaypal ? nextPaypalEnabled : nextManualEnabled);
        setFeedback({
          type: 'success',
          msg: `${gwName} ${isEnabled ? tr('enabled', 'Enabled') : tr('disabled', 'Disabled')} ${tr('andSavedToDatabase', 'and saved to PostgreSQL & MySQL!')}`
        });
      } else {
        setConfig(currentConfig);
        configRef.current = currentConfig;
        setFeedback({ type: 'error', msg: data.error || `Failed to save ${gateway} status.` });
      }
    } catch (err: any) {
      setConfig(currentConfig);
      configRef.current = currentConfig;
      setFeedback({ type: 'error', msg: err.message || `Error saving ${gateway} status.` });
    } finally {
      setTimeout(() => { isSelfUpdatingRef.current = false; }, 1200);
    }
  };

  const handleSaveSettings = async () => {
    isSelfUpdatingRef.current = true;
    setSaving(true);
    setFeedback(null);
    try {
      const currentConfig = configRef.current;
      const stripeEn = normalizeBool(currentConfig.stripe.enabled, true);
      const paypalEn = normalizeBool(currentConfig.paypal.enabled, false);
      const calculatedActiveGateway = (stripeEn && paypalEn)
        ? 'both'
        : stripeEn
        ? 'stripe'
        : paypalEn
        ? 'paypal'
        : 'none';

      const payloadConfig: GatewayConfig = {
        ...currentConfig,
        activeGateway: calculatedActiveGateway,
      };

      const res = await fetch('/api/admin/payment-gateway', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save_settings', paymentSettings: payloadConfig })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setFeedback({ type: 'success', msg: tr('settingsSavedSuccess', 'Payment gateway configuration saved successfully in PostgreSQL & MySQL!') });
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('zecratary_payment_updated'));
          window.dispatchEvent(new Event('zecratary_payment_gateway_updated'));
          window.dispatchEvent(new Event('zecratary_wallet_updated'));
          try {
            const gwBc = new BroadcastChannel('zecratary_gateway_channel');
            gwBc.postMessage({ 
              type: 'GATEWAY_UPDATED', 
              paymentSettings: payloadConfig, 
              settings: payloadConfig,
              allowed_gateways: [
                ...(stripeEn ? ['stripe'] : []),
                ...(paypalEn ? ['paypal'] : []),
                ...(normalizeBool(currentConfig.manualSettlement.enabled, true) ? ['manual'] : [])
              ]
            });
            gwBc.close();
          } catch (_) {}
        }
      } else {
        setFeedback({ type: 'error', msg: data.error || 'Failed to save configuration.' });
      }
    } catch (e: any) {
      setFeedback({ type: 'error', msg: e.message || 'Error communicating with server.' });
    } finally {
      setSaving(false);
      setTimeout(() => { isSelfUpdatingRef.current = false; }, 1200);
    }
  };

  const handleVerifyStripe = async () => {
    const pubKey = (config.stripe.publishableKey || '').trim();
    const secKey = (config.stripe.secretKey || '').trim();
    if (!pubKey && !secKey) {
      setFeedback({ 
        type: 'error', 
        msg: tr('stripeKeysRequiredToVerify', 'Please enter your Stripe Publishable Key and Secret Key before verifying.') 
      });
      return;
    }
    setVerifyingStripe(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/admin/payment-gateway', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'verify_stripe_keys',
          publishableKey: pubKey,
          secretKey: secKey,
          webhookSecret: (config.stripe.webhookSecret || '').trim(),
          testMode: normalizeBool(config.stripe.testMode, true)
        })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        const nextCfg: GatewayConfig = {
          ...configRef.current,
          stripeKeysVerified: true,
          stripeWebhookVerified: Boolean(data.webhookVerified ?? true),
          stripe: {
            ...configRef.current.stripe,
            publishableKey: pubKey || configRef.current.stripe.publishableKey,
            secretKey: secKey || configRef.current.stripe.secretKey,
            webhookSecret: (config.stripe.webhookSecret || '').trim()
          }
        };
        setConfig(nextCfg);
        configRef.current = nextCfg;
        setFeedback({ type: 'success', msg: data.message || tr('stripeKeysVerifiedSuccess', 'Stripe API keys verified and saved to PostgreSQL & MySQL!') });

        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('zecratary_payment_updated'));
          window.dispatchEvent(new Event('zecratary_payment_gateway_updated'));
          window.dispatchEvent(new Event('zecratary_wallet_updated'));
        }
      } else {
        setConfig(prev => ({ ...prev, stripeKeysVerified: false }));
        setFeedback({ type: 'error', msg: data.error || data.message || tr('stripeKeyVerificationFailed', 'Stripe key verification failed.') });
      }
    } catch (e: any) {
      setFeedback({ type: 'error', msg: e.message || 'Error communicating with server during verification.' });
    } finally {
      setVerifyingStripe(false);
    }
  };

  const handleVerifyPayPal = async () => {
    if (!config.paypal.clientId || !config.paypal.clientSecret) {
      setFeedback({ type: 'error', msg: 'Please provide both PayPal Client ID and Client Secret.' });
      return;
    }
    setVerifyingPayPal(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/admin/payment-gateway', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'verify_paypal_keys',
          clientId: config.paypal.clientId,
          clientSecret: config.paypal.clientSecret,
          webhookId: config.paypal.webhookId,
          environment: config.paypal.environment,
          testMode: config.paypal.testMode
        })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setConfig(prev => ({ ...prev, paypalKeysVerified: true, paypalWebhookVerified: true }));
        setFeedback({ type: 'success', msg: data.message || 'PayPal credentials verified successfully!' });
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('zecratary_payment_updated'));
          window.dispatchEvent(new Event('zecratary_payment_gateway_updated'));
          window.dispatchEvent(new Event('zecratary_wallet_updated'));
        }
      } else {
        setConfig(prev => ({ ...prev, paypalKeysVerified: false, paypalWebhookVerified: false }));
        setFeedback({ type: 'error', msg: data.error || 'Failed to authenticate with PayPal API.' });
      }
    } catch (e: any) {
      setFeedback({ type: 'error', msg: e.message || 'Error communicating with PayPal.' });
    } finally {
      setVerifyingPayPal(false);
    }
  };

  // Filter bank wire transactions
  const manualTransactions = useMemo(() => {
    return transactions.filter(tx => {
      const gw = (tx.gateway || '').toLowerCase();
      return gw === 'manual' || gw === 'bank_wire' || gw === 'wire' || gw === 'bank_transfer' || gw === 'manual_settlement' || Boolean(tx.transfer_reference || tx.transferReference);
    });
  }, [transactions]);

  const pendingCount = useMemo(() => {
    return manualTransactions.filter(tx => {
      const s = (tx.status || '').toLowerCase();
      return s === 'pending' || s === 'pending_approval' || s === 'review';
    }).length;
  }, [manualTransactions]);

  const approvedCount = useMemo(() => {
    return manualTransactions.filter(tx => {
      const s = (tx.status || '').toLowerCase();
      return s === 'succeeded' || s === 'approved' || s === 'completed';
    }).length;
  }, [manualTransactions]);

  const rejectedCount = useMemo(() => {
    return manualTransactions.filter(tx => {
      const s = (tx.status || '').toLowerCase();
      return s === 'rejected' || s === 'cancelled' || s === 'failed';
    }).length;
  }, [manualTransactions]);

  const totalWireVolume = useMemo(() => {
    return manualTransactions.reduce((acc, tx) => acc + Math.abs(Number(tx.amount || 0)), 0);
  }, [manualTransactions]);

  const filteredManualTransactions = useMemo(() => {
    return manualTransactions.filter(tx => {
      const s = (tx.status || '').toLowerCase();
      if (settlementFilter === 'pending' && !(s === 'pending' || s === 'pending_approval' || s === 'review')) return false;
      if (settlementFilter === 'succeeded' && !(s === 'succeeded' || s === 'approved' || s === 'completed')) return false;
      if (settlementFilter === 'rejected' && !(s === 'rejected' || s === 'cancelled' || s === 'failed')) return false;

      if (settlementSearch.trim()) {
        const q = settlementSearch.toLowerCase().trim();
        const matchId = tx.id?.toLowerCase().includes(q);
        const matchName = (tx.customer_name || tx.customerName)?.toLowerCase().includes(q);
        const matchEmail = (tx.customer_email || tx.customerEmail)?.toLowerCase().includes(q);
        const matchRef = (tx.transfer_reference || tx.transferReference)?.toLowerCase().includes(q);
        const matchPlan = (tx.plan_name || tx.planName)?.toLowerCase().includes(q);
        return matchId || matchName || matchEmail || matchRef || matchPlan;
      }
      return true;
    });
  }, [manualTransactions, settlementFilter, settlementSearch]);

  const handleApprovePayment = async (tx: PaymentTransaction) => {
    if (!confirm(tr('confirmApproveWire', "Are you sure you want to approve this bank wire transfer? This will immediately credit the customer's wallet balance in PostgreSQL & MySQL."))) {
      return;
    }
    setActionLoadingId(tx.id);
    try {
      const res = await fetch('/api/admin/payment-gateway', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve_manual_settlement', id: tx.id })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setFeedback({ type: 'success', msg: data.message || 'Wire transfer approved! Customer wallet credited.' });
        loadConfig(true);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('zecratary_payment_updated'));
          window.dispatchEvent(new Event('zecratary_wallet_updated'));
        }
        if (viewTx?.id === tx.id) setViewTx(null);
      } else {
        setFeedback({ type: 'error', msg: data.error || 'Failed to approve manual settlement.' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', msg: err.message || 'Error communicating with server.' });
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleRejectPayment = async (tx: PaymentTransaction) => {
    const reason = prompt(tr('enterRejectionReasonPrompt', 'Please provide a reason for rejecting this wire transfer (optional):'), 'Bank wire payment not received or reference mismatched');
    if (reason === null) return;
    setActionLoadingId(tx.id);
    try {
      const res = await fetch('/api/admin/payment-gateway', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject_manual_settlement', id: tx.id, failureReason: reason })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setFeedback({ type: 'success', msg: data.message || 'Wire transfer has been rejected.' });
        loadConfig(true);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('zecratary_payment_updated'));
          window.dispatchEvent(new Event('zecratary_wallet_updated'));
        }
        if (viewTx?.id === tx.id) setViewTx(null);
      } else {
        setFeedback({ type: 'error', msg: data.error || 'Failed to reject manual settlement.' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', msg: err.message || 'Error communicating with server.' });
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleDeleteTransaction = async (txId: string) => {
    if (!confirm(tr('confirmDeleteWire', `Are you sure you want to delete transaction record ${txId}? This cannot be undone.`))) {
      return;
    }
    setActionLoadingId(txId);
    try {
      const res = await fetch(`/api/admin/payment-gateway?id=${encodeURIComponent(txId)}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: txId })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setFeedback({ type: 'success', msg: data.message || 'Transaction record deleted successfully.' });
        setTransactions(prev => prev.filter(t => t.id !== txId));
        if (viewTx?.id === txId) setViewTx(null);
        if (editTx?.id === txId) setEditTx(null);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('zecratary_payment_updated'));
          window.dispatchEvent(new Event('zecratary_wallet_updated'));
        }
      } else {
        setFeedback({ type: 'error', msg: data.error || 'Failed to delete transaction.' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', msg: err.message || 'Error communicating with server.' });
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleOpenEdit = (tx: PaymentTransaction) => {
    setEditTx(tx);
    setEditForm({
      customer_name: tx.customer_name || tx.customerName || '',
      customer_email: tx.customer_email || tx.customerEmail || '',
      plan_name: tx.plan_name || tx.planName || 'Bank Wire Deposit',
      amount: Number(tx.amount || 0),
      transfer_reference: tx.transfer_reference || tx.transferReference || '',
      status: tx.status || 'pending',
      notes: tx.notes || '',
      failure_reason: tx.failure_reason || tx.failureReason || '',
    });
  };

  const handleSaveEdit = async () => {
    if (!editTx) return;
    setIsSavingEdit(true);
    try {
      const res = await fetch('/api/admin/payment-gateway', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'edit_transaction',
          id: editTx.id,
          ...editForm
        })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setFeedback({ type: 'success', msg: data.message || 'Transaction record updated successfully in PostgreSQL & MySQL!' });
        setEditTx(null);
        loadConfig(true);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('zecratary_payment_updated'));
          window.dispatchEvent(new Event('zecratary_wallet_updated'));
        }
      } else {
        setFeedback({ type: 'error', msg: data.error || 'Failed to update transaction.' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', msg: err.message || 'Error communicating with server.' });
    } finally {
      setIsSavingEdit(false);
    }
  };

  const activeCurrencySymbol = useMemo(() => {
    return SUPPORTED_CURRENCIES.find(c => c.code === config.currency)?.symbol || '$';
  }, [config.currency]);

  return (
    <div 
      className="w-full max-w-full px-4 sm:px-6 lg:px-8 xl:px-10 pb-24 font-sans transition-colors duration-200 box-border"
      style={{ color: 'var(--color-text)' }}
    >
      {/* Top Header */}
      <div 
        className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b pb-5 pt-2"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <div>
          <h1 className="text-2xl font-black tracking-tight flex items-center gap-2" style={{ color: 'var(--color-primary)' }}>
            <CreditCard className="h-6 w-6" /> {tr('paymentGatewayTitle', 'Payment Gateway Engine')}
          </h1>
          <p className="text-xs mt-1" style={{ color: 'var(--color-text-secondary)' }}>
            {tr('paymentGatewaySubtitle', 'Configure real-time payment processors, verify API credentials, and manage manual bank settlements.')}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/admin/plans"
            className="px-3.5 py-2 rounded-xl border text-xs font-bold transition flex items-center gap-1.5 shadow-xs"
            style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
          >
            <Zap className="h-3.5 w-3.5 text-amber-500" />
            <span>Manage Plans</span>
          </Link>
          <button
            type="button"
            onClick={() => loadConfig(true)}
            className="px-3.5 py-2 rounded-xl border text-xs font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer"
            style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Reload</span>
          </button>
          <button
            type="button"
            onClick={handleSaveSettings}
            disabled={saving}
            className="px-5 py-2 rounded-xl text-xs font-bold text-white transition flex items-center gap-1.5 shadow-md cursor-pointer disabled:opacity-50"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            <Save className={`h-3.5 w-3.5 ${saving ? 'animate-spin' : ''}`} />
            <span>{saving ? 'Saving...' : 'Save Gateway Settings'}</span>
          </button>
        </div>
      </div>

      {/* Gateway Engine Monitor Summary Bar */}
      <div 
        className="p-3.5 px-5 my-5 rounded-2xl border flex flex-wrap items-center justify-between gap-3 text-xs shadow-xs"
        style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)' }}
      >
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 font-bold">
            <Activity className="h-4 w-4 text-emerald-500 animate-pulse" />
            <span>Gateway Engine:</span>
          </span>
          <div className="flex items-center gap-1.5">
            {normalizeBool(config.stripe.enabled) && (
              <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-blue-500/10 text-blue-400 border border-blue-500/30">
                STRIPE ({normalizeBool(config.stripe.testMode) ? 'SANDBOX' : 'LIVE'})
              </span>
            )}
            {normalizeBool(config.paypal.enabled) && (
              <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-amber-500/10 text-amber-400 border border-amber-500/30">
                PAYPAL ({normalizeBool(config.paypal.testMode) ? 'SANDBOX' : 'LIVE'})
              </span>
            )}
            {normalizeBool(config.manualSettlement.enabled) && (
              <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-purple-500/10 text-purple-400 border border-purple-500/30">
                BANK WIRE {pendingCount > 0 && `(${pendingCount} PENDING)`}
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 font-semibold text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
          <div>
            <span>Store Currency: </span>
            <span className="font-bold font-mono" style={{ color: 'var(--color-text)' }}>
              {config.currency}
            </span>
          </div>

          <div>
            <span>Stripe Keys: </span>
            <span 
              className="font-bold font-mono" 
              style={{ color: config.stripeKeysVerified ? 'var(--color-emerald, #10b981)' : '#f59e0b' }}
            >
              {config.stripeKeysVerified ? 'Verified' : 'Unverified'}
            </span>
          </div>

          <div>
            <span>PayPal: </span>
            <span 
              className="font-bold font-mono" 
              style={{ color: config.paypalKeysVerified ? 'var(--color-emerald, #10b981)' : '#f59e0b' }}
            >
              {config.paypalKeysVerified ? 'Verified' : 'Unverified'}
            </span>
          </div>

          <div className="flex items-center gap-2 pl-2 border-l" style={{ borderColor: 'var(--color-border)' }}>
            <Link
              href="/wallet"
              className="flex items-center gap-1 text-[11px] font-bold hover:underline"
              style={{ color: 'var(--color-primary)' }}
            >
              <Coins className="h-3.5 w-3.5" />
              <span>Store Wallet</span>
              <ExternalLink className="h-2.5 w-2.5" />
            </Link>
          </div>
        </div>
      </div>

      {/* Global Currency Selection Card */}
      <div 
        role="region"
        aria-label="Processing Currency Configuration"
        className="p-5 rounded-3xl border mb-6 shadow-sm"
        style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }}
      >
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-sm font-bold uppercase tracking-wider flex items-center gap-2" style={{ color: 'var(--color-primary)' }}>
              <Globe className="h-4 w-4" /> {tr('currencySelectLabel', 'Default Processing Currency')}
            </h2>
            <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
              Select the primary transactional currency applied during billing checkouts and manual bank orders.
            </p>
          </div>

          <div className="relative w-full sm:w-72">
            <select
              value={config.currency}
              onChange={(e) => setConfig({ ...config, currency: e.target.value })}
              className="w-full appearance-none px-4 py-2.5 rounded-xl border text-xs font-bold outline-none cursor-pointer transition shadow-xs pr-10"
              style={{
                backgroundColor: 'var(--color-inner-dark)',
                borderColor: 'var(--color-border)',
                color: 'var(--color-text)'
              }}
            >
              {SUPPORTED_CURRENCIES.map(curr => (
                <option 
                  key={curr.code} 
                  value={curr.code}
                  style={{ backgroundColor: 'var(--color-card)', color: 'var(--color-text)' }}
                >
                  {curr.label}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none opacity-60" />
          </div>
        </div>
      </div>

      {/* Tab Navigation Selector with Restored Number Notice Badge */}
      <div 
        className="flex items-center gap-1.5 p-1 rounded-2xl border w-fit mb-6 shadow-xs"
        style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)' }}
      >
        <button
          type="button"
          onClick={() => setActiveTab('stripe')}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer"
          style={activeTab === 'stripe' ? {
            backgroundColor: 'var(--color-card)',
            color: 'var(--color-primary)',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
          } : { color: 'var(--color-text-secondary)' }}
        >
          <CreditCard className="h-4 w-4" />
          <span>{tr('tabStripe', 'Stripe Gateway')}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('paypal')}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer"
          style={activeTab === 'paypal' ? {
            backgroundColor: 'var(--color-card)',
            color: 'var(--color-primary)',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
          } : { color: 'var(--color-text-secondary)' }}
        >
          <Zap className="h-4 w-4" />
          <span>{tr('tabPayPal', 'PayPal Gateway')}</span>
        </button>

        {/* Tab 3 with Number Notice on Pending Settlements */}
        <button
          type="button"
          onClick={() => setActiveTab('manual')}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer relative"
          style={activeTab === 'manual' ? {
            backgroundColor: 'var(--color-card)',
            color: 'var(--color-primary)',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
          } : { color: 'var(--color-text-secondary)' }}
        >
          <Landmark className="h-4 w-4" />
          <span>{tr('tabManual', 'Bank Wire / Manual Settlement')}</span>
          {pendingCount > 0 && (
            <span className="ml-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-500 text-black shadow-xs animate-pulse">
              {pendingCount}
            </span>
          )}
        </button>
      </div>

      {/* TAB 1: STRIPE GATEWAY */}
      {activeTab === 'stripe' && (
        <div 
          role="region"
          aria-label="Stripe API Configuration"
          className="p-6 rounded-3xl border shadow-xl space-y-6"
          style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4" style={{ borderColor: 'var(--color-border)' }}>
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-blue-500 shrink-0"></div>
              <div>
                <h2 className="text-base font-black flex items-center gap-2">
                  {tr('stripeApiConfig', 'Stripe API Configuration')}
                </h2>
                <span className="text-[11px] opacity-70">Direct credit card billing with automated webhook reconciliation.</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  role="switch"
                  aria-checked={normalizeBool(config.stripe.enabled)}
                  onClick={() => handleToggleGateway('stripe')}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none shadow-md ${
                    normalizeBool(config.stripe.enabled) ? 'bg-[var(--color-emerald,#10b981)]' : 'bg-slate-300 dark:bg-slate-700'
                  }`}
                  title={normalizeBool(config.stripe.enabled) ? tr('disableStripeGateway', 'Disable Stripe Gateway') : tr('enableStripeGateway', 'Enable Stripe Gateway')}
                >
                  <span
                    aria-hidden="true"
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                      normalizeBool(config.stripe.enabled) ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
                <span className="text-[11px] font-black uppercase tracking-wider" style={{ color: normalizeBool(config.stripe.enabled) ? 'var(--color-emerald, #10b981)' : 'var(--color-text-secondary)' }}>
                  {normalizeBool(config.stripe.enabled) ? tr('enabled', 'Enabled') : tr('disabled', 'Disabled')}
                </span>
              </div>

              <button
                type="button"
                onClick={handleVerifyStripe}
                disabled={verifyingStripe}
                className="px-4 py-2 rounded-xl text-xs font-bold border transition flex items-center gap-1.5 shadow-xs cursor-pointer hover:opacity-90"
                style={{
                  backgroundColor: 'var(--color-inner-dark)',
                  borderColor: config.stripeKeysVerified ? 'var(--color-emerald, #10b981)' : 'var(--color-border)',
                  color: config.stripeKeysVerified ? 'var(--color-emerald, #10b981)' : 'var(--color-text)'
                }}
              >
                <ShieldCheck className={`h-4 w-4 ${verifyingStripe ? 'animate-spin' : ''}`} />
                <span>{verifyingStripe ? tr('verifying', 'Verifying...') : tr('verifyStripeKey', 'Verify Stripe Key')}</span>
              </button>

              <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase border ${config.stripeKeysVerified ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-amber-500/10 text-amber-400 border-amber-500/30'}`}>
                {config.stripeKeysVerified ? tr('keysVerified', 'Keys Verified') : tr('keysUnverified', 'Keys Unverified')}
              </span>
            </div>
          </div>

          {/* Credential Inputs */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="font-bold">Publishable Key *</label>
                {config.stripeKeysVerified && (
                  <span className="text-[10px] font-bold text-emerald-400 flex items-center gap-1">
                    <Check className="h-3 w-3" /> Verified
                  </span>
                )}
              </div>
              <div className="relative">
                <input
                  type={visibleFields['stripePublishable'] ? 'text' : 'password'}
                  autoComplete="off"
                  data-lpignore="true"
                  data-form-type="other"
                  spellCheck="false"
                  value={config.stripe.publishableKey}
                  onChange={(e) => setConfig({ ...config, stripe: { ...config.stripe, publishableKey: e.target.value } })}
                  placeholder="pk_test_... or pk_live_..."
                  className="w-full px-3 py-2.5 pr-10 rounded-xl border font-mono outline-none"
                  style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                />
                <button
                  type="button"
                  onClick={() => toggleVisibility('stripePublishable')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 opacity-60 hover:opacity-100 cursor-pointer"
                >
                  {visibleFields['stripePublishable'] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="font-bold">Secret Key *</label>
                {config.stripeKeysVerified && (
                  <span className="text-[10px] font-bold text-emerald-400 flex items-center gap-1">
                    <Check className="h-3 w-3" /> Verified
                  </span>
                )}
              </div>
              <div className="relative">
                <input
                  type={visibleFields['stripeSecret'] ? 'text' : 'password'}
                  autoComplete="off"
                  data-lpignore="true"
                  data-form-type="other"
                  spellCheck="false"
                  value={config.stripe.secretKey}
                  onChange={(e) => setConfig({ ...config, stripe: { ...config.stripe, secretKey: e.target.value } })}
                  placeholder="sk_test_... or sk_live_..."
                  className="w-full px-3 py-2.5 pr-10 rounded-xl border font-mono outline-none"
                  style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                />
                <button
                  type="button"
                  onClick={() => toggleVisibility('stripeSecret')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 opacity-60 hover:opacity-100 cursor-pointer"
                >
                  {visibleFields['stripeSecret'] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: PAYPAL GATEWAY */}
      {activeTab === 'paypal' && (
        <div 
          role="region"
          aria-label="PayPal API Configuration"
          className="p-6 rounded-3xl border shadow-xl space-y-6"
          style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4" style={{ borderColor: 'var(--color-border)' }}>
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-yellow-500 shrink-0"></div>
              <div>
                <h2 className="text-base font-black flex items-center gap-2">
                  {tr('paypalApiConfig', 'PayPal API Configuration')}
                </h2>
                <span className="text-[11px] opacity-70">Direct digital wallet, PayPal balance, and international debit settlement.</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  role="switch"
                  aria-checked={normalizeBool(config.paypal.enabled)}
                  onClick={() => handleToggleGateway('paypal')}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none shadow-md ${
                    normalizeBool(config.paypal.enabled) ? 'bg-[var(--color-emerald,#10b981)]' : 'bg-slate-300 dark:bg-slate-700'
                  }`}
                  title={normalizeBool(config.paypal.enabled) ? tr('disablePaypalGateway', 'Disable PayPal Gateway') : tr('enablePaypalGateway', 'Enable PayPal Gateway')}
                >
                  <span
                    aria-hidden="true"
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                      normalizeBool(config.paypal.enabled) ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
                <span className="text-[11px] font-black uppercase tracking-wider" style={{ color: normalizeBool(config.paypal.enabled) ? 'var(--color-emerald, #10b981)' : 'var(--color-text-secondary)' }}>
                  {normalizeBool(config.paypal.enabled) ? tr('enabled', 'Enabled') : tr('disabled', 'Disabled')}
                </span>
              </div>

              <button
                type="button"
                onClick={handleVerifyPayPal}
                disabled={verifyingPayPal}
                className="px-4 py-2 rounded-xl text-xs font-bold border transition flex items-center gap-1.5 shadow-xs cursor-pointer hover:opacity-90"
                style={{
                  backgroundColor: 'var(--color-inner-dark)',
                  borderColor: config.paypalKeysVerified ? 'var(--color-emerald, #10b981)' : 'var(--color-border)',
                  color: config.paypalKeysVerified ? 'var(--color-emerald, #10b981)' : 'var(--color-text)'
                }}
              >
                <ShieldCheck className={`h-4 w-4 ${verifyingPayPal ? 'animate-spin' : ''}`} />
                <span>{verifyingPayPal ? tr('verifying', 'Verifying...') : tr('verifyPayPalKey', 'Verify PayPal Credentials')}</span>
              </button>

              <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase border ${config.paypalKeysVerified ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-amber-500/10 text-amber-400 border-amber-500/30'}`}>
                {config.paypalKeysVerified ? tr('keysVerified', 'Keys Verified') : tr('keysUnverified', 'Keys Unverified')}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="font-bold block mb-1">PayPal Client ID *</label>
              <input
                type={visibleFields['paypalClientId'] ? 'text' : 'password'}
                value={config.paypal.clientId}
                onChange={(e) => setConfig({ ...config, paypal: { ...config.paypal, clientId: e.target.value } })}
                placeholder="PayPal Client ID"
                className="w-full px-3 py-2.5 rounded-xl border font-mono outline-none"
                style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
              />
            </div>
            <div>
              <label className="font-bold block mb-1">PayPal Client Secret *</label>
              <input
                type={visibleFields['paypalSecret'] ? 'text' : 'password'}
                value={config.paypal.clientSecret}
                onChange={(e) => setConfig({ ...config, paypal: { ...config.paypal, clientSecret: e.target.value } })}
                placeholder="PayPal Secret Key"
                className="w-full px-3 py-2.5 rounded-xl border font-mono outline-none"
                style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
              />
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: BANK WIRE / MANUAL SETTLEMENT (Restored with Controls & Number Notice) */}
      {activeTab === 'manual' && (
        <div className="space-y-6 animate-in fade-in">
          <div 
            role="region"
            aria-label="Bank Wire Settlement Configuration"
            className="p-6 rounded-3xl border shadow-xl space-y-6"
            style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4" style={{ borderColor: 'var(--color-border)' }}>
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-purple-500 shrink-0"></div>
                <div>
                  <h2 className="text-base font-black flex items-center gap-2">
                    {tr('manualSettlementConfig', 'Bank Wire / Manual Settlement')}
                  </h2>
                  <span className="text-[11px] opacity-70">Direct bank transfer instructions, routing numbers, and approval workflows.</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  role="switch"
                  aria-checked={normalizeBool(config.manualSettlement.enabled)}
                  onClick={() => handleToggleGateway('manual')}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none shadow-md ${
                    normalizeBool(config.manualSettlement.enabled) ? 'bg-[var(--color-emerald,#10b981)]' : 'bg-slate-300 dark:bg-slate-700'
                  }`}
                  title={normalizeBool(config.manualSettlement.enabled) ? tr('disableManualGateway', 'Disable Bank Wire Settlement') : tr('enableManualGateway', 'Enable Bank Wire Settlement')}
                >
                  <span
                    aria-hidden="true"
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                      normalizeBool(config.manualSettlement.enabled) ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
                <span className="text-[11px] font-black uppercase tracking-wider" style={{ color: normalizeBool(config.manualSettlement.enabled) ? 'var(--color-emerald, #10b981)' : 'var(--color-text-secondary)' }}>
                  {normalizeBool(config.manualSettlement.enabled) ? tr('enabled', 'Enabled') : tr('disabled', 'Disabled')}
                </span>
              </div>
            </div>

            {/* Task 1 & Task 2: Admin Controls for Transfer Reference & Manual Verification */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div 
                className="p-4 rounded-2xl border flex items-center justify-between shadow-xs transition"
                style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)' }}
              >
                <div className="pr-3">
                  <span className="font-bold text-xs block" style={{ color: 'var(--color-text)' }}>
                    {tr('requireTransferReferenceLabel', 'Require Transfer Reference / Receipt ID')}
                  </span>
                  <span className="text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
                    {tr('requireTransferReferenceDesc', 'Enforce customers to provide bank transfer reference or slip ID before submitting.')}
                  </span>
                </div>

                <button
                  type="button"
                  role="switch"
                  aria-checked={normalizeBool(config.manualSettlement.requireReference, true)}
                  onClick={() => setConfig({
                    ...config,
                    manualSettlement: {
                      ...config.manualSettlement,
                      requireReference: !normalizeBool(config.manualSettlement.requireReference, true)
                    }
                  })}
                  className="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-300 ease-in-out focus:outline-none shadow-sm"
                  style={{ backgroundColor: normalizeBool(config.manualSettlement.requireReference, true) ? 'var(--color-primary)' : 'var(--color-border)' }}
                >
                  <span
                    aria-hidden="true"
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition duration-300 ease-in-out ${
                      normalizeBool(config.manualSettlement.requireReference, true) ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              <div 
                className="p-4 rounded-2xl border flex items-center justify-between shadow-xs transition"
                style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)' }}
              >
                <div className="pr-3">
                  <span className="font-bold text-xs block" style={{ color: 'var(--color-text)' }}>
                    {tr('requireAdminApprovalLabel', 'Require Admin Verification & Approval')}
                  </span>
                  <span className="text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
                    {tr('requireAdminApprovalDesc', 'All new wire transfers start as Pending. Funds are credited only after manual review.')}
                  </span>
                </div>

                <button
                  type="button"
                  role="switch"
                  aria-checked={normalizeBool(config.manualSettlement.requireApproval, true)}
                  onClick={() => setConfig({
                    ...config,
                    manualSettlement: {
                      ...config.manualSettlement,
                      requireApproval: !normalizeBool(config.manualSettlement.requireApproval, true)
                    }
                  })}
                  className="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-300 ease-in-out focus:outline-none shadow-sm"
                  style={{ backgroundColor: normalizeBool(config.manualSettlement.requireApproval, true) ? 'var(--color-primary)' : 'var(--color-border)' }}
                >
                  <span
                    aria-hidden="true"
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition duration-300 ease-in-out ${
                      normalizeBool(config.manualSettlement.requireApproval, true) ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Bank Wire Details Form */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
              <div>
                <label className="font-bold block mb-1">Bank Name</label>
                <input
                  type="text"
                  value={config.manualSettlement.bankName}
                  onChange={(e) => setConfig({ ...config, manualSettlement: { ...config.manualSettlement, bankName: e.target.value } })}
                  className="w-full px-3 py-2 rounded-xl border font-medium outline-none"
                  style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                />
              </div>

              <div>
                <label className="font-bold block mb-1">Account Holder / Beneficiary</label>
                <input
                  type="text"
                  value={config.manualSettlement.accountHolder}
                  onChange={(e) => setConfig({ ...config, manualSettlement: { ...config.manualSettlement, accountHolder: e.target.value } })}
                  className="w-full px-3 py-2 rounded-xl border font-medium outline-none"
                  style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                />
              </div>

              <div>
                <label className="font-bold block mb-1">Account Number / IBAN</label>
                <input
                  type="text"
                  value={config.manualSettlement.accountNumber}
                  onChange={(e) => setConfig({ ...config, manualSettlement: { ...config.manualSettlement, accountNumber: e.target.value } })}
                  className="w-full px-3 py-2 rounded-xl border font-mono font-bold outline-none"
                  style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                />
              </div>

              <div>
                <label className="font-bold block mb-1">Routing Number / Sort Code</label>
                <input
                  type="text"
                  value={config.manualSettlement.routingNumber}
                  onChange={(e) => setConfig({ ...config, manualSettlement: { ...config.manualSettlement, routingNumber: e.target.value } })}
                  className="w-full px-3 py-2 rounded-xl border font-mono outline-none"
                  style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                />
              </div>

              <div>
                <label className="font-bold block mb-1">SWIFT / BIC Code</label>
                <input
                  type="text"
                  value={config.manualSettlement.swiftBic}
                  onChange={(e) => setConfig({ ...config, manualSettlement: { ...config.manualSettlement, swiftBic: e.target.value } })}
                  className="w-full px-3 py-2 rounded-xl border font-mono outline-none"
                  style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                />
              </div>

              <div>
                <label className="font-bold block mb-1">Branch Name</label>
                <input
                  type="text"
                  value={config.manualSettlement.branchName}
                  onChange={(e) => setConfig({ ...config, manualSettlement: { ...config.manualSettlement, branchName: e.target.value } })}
                  className="w-full px-3 py-2 rounded-xl border font-medium outline-none"
                  style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                />
              </div>
            </div>

            <div className="text-xs">
              <label className="font-bold block mb-1">Wire Transfer Instructions</label>
              <textarea
                rows={3}
                value={config.manualSettlement.instructions}
                onChange={(e) => setConfig({ ...config, manualSettlement: { ...config.manualSettlement, instructions: e.target.value } })}
                className="w-full p-3 rounded-xl border outline-none font-medium leading-relaxed"
                style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
              />
            </div>
          </div>

          {/* Section 2: Manual Settlement Approval Queue with Metrics */}
          <div 
            role="region"
            aria-label="Manual Settlement Approval Queue"
            className="p-6 rounded-3xl border shadow-xl space-y-5"
            style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }}
          >
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b pb-4" style={{ borderColor: 'var(--color-border)' }}>
              <div>
                <h3 className="text-base font-black flex items-center gap-2" style={{ color: 'var(--color-text)' }}>
                  <Landmark className="h-5 w-5 text-purple-400" />
                  <span>{tr('manualQueueTitle', 'Manual Settlement Approval Queue')}</span>
                  {pendingCount > 0 && (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-amber-500/20 text-amber-400 border border-amber-500/30 animate-pulse">
                      {pendingCount} Pending Review
                    </span>
                  )}
                </h3>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 opacity-50" />
                  <input
                    type="text"
                    autoComplete="off"
                    data-lpignore="true"
                    data-form-type="other"
                    spellCheck="false"
                    value={settlementSearch}
                    onChange={(e) => setSettlementSearch(e.target.value)}
                    placeholder={tr('searchSettlementsPlaceholder', 'Search by customer, email, ref...')}
                    className="w-full pl-8 pr-3 py-1.5 rounded-xl border text-xs outline-none"
                    style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                  />
                </div>

                <div className="relative">
                  <select
                    value={settlementFilter}
                    onChange={(e) => setSettlementFilter(e.target.value as any)}
                    className="appearance-none px-3.5 py-1.5 pr-8 rounded-xl border text-xs font-bold outline-none cursor-pointer"
                    style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                  >
                    <option value="all">All Statuses ({manualTransactions.length})</option>
                    <option value="pending">Pending Review ({pendingCount})</option>
                    <option value="succeeded">Approved ({approvedCount})</option>
                    <option value="rejected">Rejected ({rejectedCount})</option>
                  </select>
                  <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 pointer-events-none opacity-60" />
                </div>
              </div>
            </div>

            {/* Restored Quick Stat Metric Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div 
                className="p-3.5 rounded-2xl border space-y-1 shadow-xs"
                style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)' }}
              >
                <span className="text-[10px] font-bold uppercase tracking-wider block opacity-70">Pending Review</span>
                <div className="text-xl font-black font-mono text-amber-400 flex items-center gap-2">
                  <span>{pendingCount}</span>
                  {pendingCount > 0 && <span className="h-2 w-2 rounded-full bg-amber-400 animate-ping" />}
                </div>
              </div>

              <div 
                className="p-3.5 rounded-2xl border space-y-1 shadow-xs"
                style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)' }}
              >
                <span className="text-[10px] font-bold uppercase tracking-wider block opacity-70">Approved Settlements</span>
                <div className="text-xl font-black font-mono text-emerald-400">{approvedCount}</div>
              </div>

              <div 
                className="p-3.5 rounded-2xl border space-y-1 shadow-xs"
                style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)' }}
              >
                <span className="text-[10px] font-bold uppercase tracking-wider block opacity-70">Rejected Settlements</span>
                <div className="text-xl font-black font-mono text-rose-400">{rejectedCount}</div>
              </div>

              <div 
                className="p-3.5 rounded-2xl border space-y-1 shadow-xs"
                style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)' }}
              >
                <span className="text-[10px] font-bold uppercase tracking-wider block opacity-70">Total Wire Volume</span>
                <div className="text-xl font-black font-mono" style={{ color: 'var(--color-text)' }}>
                  {activeCurrencySymbol}{totalWireVolume.toFixed(2)}
                </div>
              </div>
            </div>

            {/* Approval Queue Table */}
            <div className="border rounded-2xl overflow-hidden shadow-sm" style={{ borderColor: 'var(--color-border)' }}>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead 
                    className="border-b uppercase font-bold text-[10px] tracking-wider"
                    style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
                  >
                    <tr>
                      <th className="px-4 py-3">{tr('colDateId', 'Date & Tx ID')}</th>
                      <th className="px-4 py-3">{tr('colCustomer', 'Customer')}</th>
                      <th className="px-4 py-3">{tr('colPurpose', 'Purpose')}</th>
                      <th className="px-4 py-3">{tr('colAmount', 'Amount')}</th>
                      <th className="px-4 py-3">{tr('colReference', 'Reference')}</th>
                      <th className="px-4 py-3">{tr('colStatus', 'Status')}</th>
                      <th className="px-4 py-3 text-right">{tr('colActions', 'Actions')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}>
                    {filteredManualTransactions.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-xs opacity-60">
                          {tr('noSettlementsFound', 'No bank wire settlement records found matching your filter criteria.')}
                        </td>
                      </tr>
                    ) : (
                      filteredManualTransactions.map(tx => {
                        const s = (tx.status || '').toLowerCase();
                        const isPending = s === 'pending' || s === 'pending_approval' || s === 'review';
                        const isApproved = s === 'succeeded' || s === 'approved' || s === 'completed';
                        const ref = tx.transfer_reference || tx.transferReference || '—';

                        return (
                          <tr key={tx.id} className="transition hover:opacity-90">
                            <td className="px-4 py-3.5 font-mono text-[11px] font-bold">
                              <div>{tx.id}</div>
                              <span className="text-[10px] opacity-60 font-normal">
                                {tx.created_at ? new Date(tx.created_at).toLocaleDateString() : '—'}
                              </span>
                            </td>
                            <td className="px-4 py-3.5">
                              <span className="font-extrabold block text-xs">{tx.customer_name || tx.customerName || 'Customer'}</span>
                              <span className="text-[11px] font-mono opacity-70">{tx.customer_email || tx.customerEmail || '—'}</span>
                            </td>
                            <td className="px-4 py-3.5">
                              <span className="px-2 py-0.5 rounded-lg border text-[11px] font-bold font-mono inline-block" style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)' }}>
                                {tx.plan_name || tx.planName || 'Wallet Deposit'}
                              </span>
                            </td>
                            <td className="px-4 py-3.5 font-mono font-bold text-xs">
                              {SUPPORTED_CURRENCIES.find(c => c.code === (tx.currency || config.currency))?.symbol || '$'}{Number(tx.amount || 0).toFixed(2)}
                            </td>
                            <td className="px-4 py-3.5 font-mono text-[11px]">
                              {ref}
                            </td>
                            <td className="px-4 py-3.5">
                              {isPending ? (
                                <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-amber-500/10 text-amber-400 border border-amber-500/30 flex items-center gap-1 w-fit">
                                  <Clock className="h-3 w-3 animate-spin" />
                                  <span>Pending</span>
                                </span>
                              ) : isApproved ? (
                                <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1 w-fit">
                                  <Check className="h-3 w-3" />
                                  <span>Approved</span>
                                </span>
                              ) : (
                                <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-rose-500/10 text-rose-400 border border-rose-500/30 flex items-center gap-1 w-fit">
                                  <X className="h-3 w-3" />
                                  <span>Rejected</span>
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3.5 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => setViewTx(tx)}
                                  className="p-1.5 rounded-lg border transition shadow-xs cursor-pointer hover:opacity-80"
                                  style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                                  title={tr('btnView', 'View Details')}
                                >
                                  <Eye className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleOpenEdit(tx)}
                                  className="p-1.5 rounded-lg border transition shadow-xs cursor-pointer hover:opacity-80"
                                  style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                                  title={tr('btnEdit', 'Edit Transaction')}
                                >
                                  <Edit3 className="h-3.5 w-3.5 text-blue-400" />
                                </button>
                                {isPending && (
                                  <>
                                    <button
                                      type="button"
                                      disabled={actionLoadingId === tx.id}
                                      onClick={() => handleApprovePayment(tx)}
                                      className="p-1.5 rounded-lg border transition shadow-xs cursor-pointer hover:opacity-80 bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                                      title={tr('btnApprove', 'Approve & Credit')}
                                    >
                                      <Check className={`h-3.5 w-3.5 ${actionLoadingId === tx.id ? 'animate-spin' : ''}`} />
                                    </button>
                                    <button
                                      type="button"
                                      disabled={actionLoadingId === tx.id}
                                      onClick={() => handleRejectPayment(tx)}
                                      className="p-1.5 rounded-lg border transition shadow-xs cursor-pointer hover:opacity-80 bg-rose-500/10 border-rose-500/30 text-rose-400"
                                      title={tr('btnReject', 'Reject')}
                                    >
                                      <XCircle className="h-3.5 w-3.5" />
                                    </button>
                                  </>
                                )}
                                <button
                                  type="button"
                                  disabled={actionLoadingId === tx.id}
                                  onClick={() => handleDeleteTransaction(tx.id)}
                                  className="p-1.5 rounded-lg border transition shadow-xs cursor-pointer hover:opacity-80 text-rose-400 border-rose-500/30 bg-rose-500/10"
                                  title={tr('btnDelete', 'Delete Record')}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
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
      )}

      {/* VIEW MANUAL SETTLEMENT TRANSACTION MODAL */}
      {viewTx && (
        <div 
          role="dialog" 
          aria-modal="true" 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in"
        >
          <div 
            className="w-full max-w-lg rounded-3xl border p-6 space-y-4 shadow-2xl"
            style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
          >
            <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: 'var(--color-border)' }}>
              <div className="flex items-center gap-2">
                <Landmark className="h-5 w-5 text-purple-400" />
                <h3 className="font-extrabold text-sm">{tr('txDetailsTitle', 'Bank Wire Settlement Details')}</h3>
              </div>
              <button 
                type="button" 
                onClick={() => setViewTx(null)}
                className="opacity-60 hover:opacity-100 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="opacity-60 block text-[10px] font-bold">TRANSACTION ID</span>
                <span className="font-mono font-bold">{viewTx.id}</span>
              </div>
              <div>
                <span className="opacity-60 block text-[10px] font-bold">STATUS</span>
                <span className="font-bold uppercase text-[11px]">{viewTx.status}</span>
              </div>
              <div>
                <span className="opacity-60 block text-[10px] font-bold">CUSTOMER</span>
                <span className="font-extrabold">{viewTx.customer_name || viewTx.customerName || 'Customer'}</span>
                <span className="block font-mono text-[10px] opacity-70">{viewTx.customer_email || viewTx.customerEmail || '—'}</span>
              </div>
              <div>
                <span className="opacity-60 block text-[10px] font-bold">AMOUNT</span>
                <span className="font-mono font-black text-sm">
                  {SUPPORTED_CURRENCIES.find(c => c.code === (viewTx.currency || config.currency))?.symbol || '$'}{Number(viewTx.amount || 0).toFixed(2)}
                </span>
              </div>
              <div className="col-span-2">
                <span className="opacity-60 block text-[10px] font-bold">TRANSFER REFERENCE</span>
                <span className="font-mono font-bold bg-black/20 p-2 rounded-lg block border" style={{ borderColor: 'var(--color-border)' }}>
                  {viewTx.transfer_reference || viewTx.transferReference || 'None provided'}
                </span>
              </div>
              {viewTx.notes && (
                <div className="col-span-2">
                  <span className="opacity-60 block text-[10px] font-bold">NOTES</span>
                  <p className="p-2 rounded-lg bg-black/10 border text-[11px]" style={{ borderColor: 'var(--color-border)' }}>
                    {viewTx.notes}
                  </p>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t" style={{ borderColor: 'var(--color-border)' }}>
              {((viewTx.status || '').toLowerCase() === 'pending' || (viewTx.status || '').toLowerCase() === 'pending_approval') && (
                <>
                  <button
                    type="button"
                    onClick={() => handleApprovePayment(viewTx)}
                    className="px-3.5 py-1.5 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 cursor-pointer"
                  >
                    Approve & Credit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRejectPayment(viewTx)}
                    className="px-3.5 py-1.5 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 cursor-pointer"
                  >
                    Reject
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => setViewTx(null)}
                className="px-4 py-1.5 rounded-xl text-xs font-bold border cursor-pointer"
                style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT MANUAL SETTLEMENT TRANSACTION MODAL */}
      {editTx && (
        <div 
          role="dialog" 
          aria-modal="true" 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in"
        >
          <div 
            className="w-full max-w-lg rounded-3xl border p-6 space-y-4 shadow-2xl"
            style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
          >
            <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: 'var(--color-border)' }}>
              <div className="flex items-center gap-2">
                <Edit3 className="h-5 w-5 text-blue-400" />
                <h3 className="font-extrabold text-sm">{tr('editTxTitle', 'Edit Settlement Record')}</h3>
              </div>
              <button 
                type="button" 
                onClick={() => setEditTx(null)}
                className="opacity-60 hover:opacity-100 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold block mb-1">Customer Name</label>
                  <input
                    type="text"
                    value={editForm.customer_name}
                    onChange={(e) => setEditForm({ ...editForm, customer_name: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border outline-none"
                    style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)' }}
                  />
                </div>
                <div>
                  <label className="font-bold block mb-1">Customer Email</label>
                  <input
                    type="email"
                    value={editForm.customer_email}
                    onChange={(e) => setEditForm({ ...editForm, customer_email: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border outline-none font-mono"
                    style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)' }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold block mb-1">Amount</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editForm.amount}
                    onChange={(e) => setEditForm({ ...editForm, amount: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 rounded-xl border outline-none font-mono font-bold"
                    style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)' }}
                  />
                </div>
                <div>
                  <label className="font-bold block mb-1">Status</label>
                  <select
                    value={editForm.status}
                    onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border outline-none font-bold cursor-pointer"
                    style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)' }}
                  >
                    <option value="pending">Pending</option>
                    <option value="succeeded">Succeeded / Approved</option>
                    <option value="rejected">Rejected</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-bold block mb-1">Transfer Reference</label>
                <input
                  type="text"
                  value={editForm.transfer_reference}
                  onChange={(e) => setEditForm({ ...editForm, transfer_reference: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border outline-none font-mono"
                  style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)' }}
                />
              </div>

              <div>
                <label className="font-bold block mb-1">Admin Notes</label>
                <textarea
                  rows={2}
                  value={editForm.notes}
                  onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                  className="w-full p-2.5 rounded-xl border outline-none"
                  style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)' }}
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t" style={{ borderColor: 'var(--color-border)' }}>
              <button
                type="button"
                onClick={() => setEditTx(null)}
                className="px-4 py-1.5 rounded-xl text-xs font-bold border cursor-pointer"
                style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)' }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSavingEdit}
                onClick={handleSaveEdit}
                className="px-4 py-1.5 rounded-xl text-xs font-bold text-white cursor-pointer disabled:opacity-50"
                style={{ backgroundColor: 'var(--color-primary)' }}
              >
                {isSavingEdit ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Status Feedback Toast */}
      {feedback && (
        <div 
          className="fixed bottom-6 right-6 p-4 rounded-2xl border text-xs font-semibold flex items-center gap-2.5 shadow-2xl z-50 animate-in slide-in-from-bottom-5"
          style={{
            backgroundColor: 'var(--color-card)',
            borderColor: feedback.type === 'success' ? 'var(--color-emerald, #10b981)' : 'rgba(239, 68, 68, 0.4)',
            color: feedback.type === 'success' ? 'var(--color-emerald, #10b981)' : '#ef4444'
          }}
        >
          {feedback.type === 'success' ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
          <span>{feedback.msg}</span>
          <button 
            type="button" 
            onClick={() => setFeedback(null)} 
            className="ml-2 opacity-60 hover:opacity-100 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
