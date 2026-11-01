// @ts-nocheck
'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import { 
  Wallet, CreditCard, Shield, CheckCircle2, AlertCircle, Save, RefreshCw, 
  Check, Plus, Trash2, Edit3, Sliders, History, Activity, Database, 
  Coins, User as UserIcon, Columns3, ArrowUpDown, ArrowUp, ArrowDown, 
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, X, Sparkles, Gift, ArrowDownLeft, ArrowUpRight,
  ExternalLink, ArrowRight, Download
} from 'lucide-react';
import { useTranslation } from '@/components/LanguageProvider';

export interface BonusRule {
  threshold: number;
  bonus_percent: number;
}

export interface WalletSettingsConfig {
  currency: string;
  isEnabled: boolean;
  allowPurchases: boolean;
  minTopup: number;
  maxTopup: number;
  presetAmounts: number[];
  bonusRules: BonusRule[];
  ledgerColumns: Record<string, boolean>;
}

export interface WalletTransactionItem {
  id: string;
  customer_name?: string;
  customer_email?: string;
  email?: string;
  amount: number;
  balance_after?: number;
  type: string;
  gateway?: string;
  gateway_tx_id?: string;
  status: string;
  description?: string;
  created_at: string;
}

export interface AppUserOption {
  id: string;
  name: string;
  email: string;
  wallet_balance?: number;
}

const SUPPORTED_CURRENCIES = [
  { code: 'USD', symbol: '$', label: 'USD - United States Dollar ($)' },
  { code: 'EUR', symbol: '€', label: 'EUR - Euro (€)' },
  { code: 'GBP', symbol: '£', label: 'GBP - British Pound (£)' },
  { code: 'CAD', symbol: 'CA$', label: 'CAD - Canadian Dollar (CA$)' },
  { code: 'AUD', symbol: 'A$', label: 'AUD - Australian Dollar (A$)' },
  { code: 'JPY', symbol: '¥', label: 'JPY - Japanese Yen (¥)' },
  { code: 'SGD', symbol: 'S$', label: 'SGD - Singapore Dollar (S$)' },
  { code: 'CHF', symbol: 'Fr', label: 'CHF - Swiss Franc (Fr)' },
  { code: 'NZD', symbol: 'NZ$', label: 'NZD - New Zealand Dollar (NZ$)' },
  { code: 'THB', symbol: '฿', label: 'THB - Thai Baht (฿)' }
];

const DEFAULT_SETTINGS: WalletSettingsConfig = {
  currency: 'USD',
  isEnabled: true,
  allowPurchases: true,
  minTopup: 5,
  maxTopup: 1000,
  presetAmounts: [10, 25, 50, 100, 250],
  bonusRules: [
    { threshold: 50, bonus_percent: 5 },
    { threshold: 100, bonus_percent: 10 }
  ],
  ledgerColumns: {
    customer: true,
    type: true,
    amount: true,
    balanceAfter: true,
    gateway: true,
    date: true,
    actions: true
  }
};

export default function AdminWalletSettingsPage() {
  const { t, locale } = useTranslation();

  const tr = useCallback((key: string, fallback: string): string => {
    if (typeof t === 'function') {
      const val = t(key);
      if (val && val !== key) return val;
    }
    return fallback;
  }, [t]);

  // Set Wallet Transactions Ledger as default active tab on first load
  const [activeTab, setActiveTab] = useState<'config' | 'ledger'>('ledger');
  const [settings, setSettings] = useState<WalletSettingsConfig>(DEFAULT_SETTINGS);
  const [transactions, setTransactions] = useState<WalletTransactionItem[]>([]);
  const [users, setUsers] = useState<AppUserOption[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [deleting, setDeleting] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  // Quick Preset Add State
  const [newPresetValue, setNewPresetValue] = useState<string>('');

  // Bonus Tier Add State
  const [newTierThreshold, setNewTierThreshold] = useState<string>('150');
  const [newTierBonus, setNewTierBonus] = useState<string>('15');

  // Manual Adjustment Form State
  const [adjustEmail, setAdjustEmail] = useState<string>('');
  const [adjustAmount, setAdjustAmount] = useState<string>('25');
  const [adjustType, setAdjustType] = useState<'credit' | 'debit'>('credit');
  const [adjustReason, setAdjustReason] = useState<string>('');
  const [applyingAdjustment, setApplyingAdjustment] = useState<boolean>(false);

  // Ledger Table State: Search, Filter, Pagination, Selection, Sorting, Column Popover
  const [search, setSearch] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [rowsPerPage, setRowsPerPage] = useState<number>(10);
  const [selectedTxIds, setSelectedTxIds] = useState<string[]>([]);
  const [isSelectAllLedger, setIsSelectAllLedger] = useState<boolean>(false);
  const [sortField, setSortField] = useState<string>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [showColumnsPopover, setShowColumnsPopover] = useState<boolean>(false);

  const isFetchingRef = useRef<boolean>(false);
  const isSavingRef = useRef<boolean>(false);
  const columnsPopoverRef = useRef<HTMLDivElement>(null);
  const selectAllCheckboxRef = useRef<HTMLInputElement>(null);

  const showToast = (type: 'success' | 'error', msg: string) => {
    setFeedback({ type, msg });
    setTimeout(() => setFeedback(null), 4500);
  };

  const activeCurrencySymbol = useMemo(() => {
    const found = SUPPORTED_CURRENCIES.find(c => c.code.toUpperCase() === (settings.currency || 'USD').toUpperCase());
    return found ? found.symbol : '$';
  }, [settings.currency]);

  // Load Settings, Ledger & Users from Backend API
  const loadWalletData = useCallback(async () => {
    if (isFetchingRef.current || isSavingRef.current) return;
    isFetchingRef.current = true;
    setLoading(true);

    try {
      const res = await fetch('/api/admin/wallet-settings?t=' + Date.now(), { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (data.walletSettings || data.settings) {
          const loaded = data.walletSettings || data.settings;
          
          let savedColumns = DEFAULT_SETTINGS.ledgerColumns;
          try {
            const cachedCols = localStorage.getItem('zecratary_wallet_ledger_columns');
            if (cachedCols) savedColumns = JSON.parse(cachedCols);
          } catch (_) {}

          setSettings({
            currency: loaded.currency || 'USD',
            isEnabled: loaded.isEnabled !== undefined ? Boolean(loaded.isEnabled) : true,
            allowPurchases: loaded.allowPurchases !== undefined ? Boolean(loaded.allowPurchases) : true,
            minTopup: Number(loaded.minTopup ?? loaded.min_topup ?? 5),
            maxTopup: Number(loaded.maxTopup ?? loaded.max_topup ?? 1000),
            presetAmounts: Array.isArray(loaded.presetAmounts) ? loaded.presetAmounts : DEFAULT_SETTINGS.presetAmounts,
            bonusRules: Array.isArray(loaded.bonusRules) ? loaded.bonusRules : DEFAULT_SETTINGS.bonusRules,
            ledgerColumns: loaded.ledgerColumns || savedColumns
          });
        }
        if (Array.isArray(data.users)) setUsers(data.users);
        if (Array.isArray(data.transactions)) setTransactions(data.transactions);
      }
    } catch (err) {
      console.warn('[Wallet Settings] Using local configuration defaults:', err);
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  }, []);

  // Theme & Data Synchronization Listeners
  useEffect(() => {
    document.title = `${tr('walletSettingsDocTitle', 'Wallet Settings - Admin Console')}`;
    loadWalletData();

    const handleSync = () => loadWalletData();
    window.addEventListener('zecratary_wallet_updated', handleSync);
    window.addEventListener('zecratary_payment_updated', handleSync);
    window.addEventListener('zecratary_languages_updated', handleSync);
    window.addEventListener('zecratary_dictionary_updated', handleSync);
    window.addEventListener('zecratary_locale_changed', handleSync);
    window.addEventListener('zecratary_theme_mode_changed', handleSync);
    window.addEventListener('zecratary_theme_changed', handleSync);
    window.addEventListener('zecratary_theme_updated', handleSync);
    window.addEventListener('storage', handleSync);
    window.addEventListener('zecratary_wallet_settings_updated', handleSync);

    let walletBc: BroadcastChannel | null = null;
    try {
      walletBc = new BroadcastChannel('zecratary_wallet_channel');
      walletBc.onmessage = () => {
        loadWalletData();
      };
    } catch (_) {}

    return () => {
      window.removeEventListener('zecratary_wallet_updated', handleSync);
      window.removeEventListener('zecratary_payment_updated', handleSync);
      window.removeEventListener('zecratary_wallet_settings_updated', handleSync);
      if (walletBc) walletBc.close();
      window.removeEventListener('zecratary_languages_updated', handleSync);
      window.removeEventListener('zecratary_dictionary_updated', handleSync);
      window.removeEventListener('zecratary_locale_changed', handleSync);
      window.removeEventListener('zecratary_theme_mode_changed', handleSync);
      window.removeEventListener('zecratary_theme_changed', handleSync);
      window.removeEventListener('zecratary_theme_updated', handleSync);
      window.removeEventListener('storage', handleSync);
    };
  }, [loadWalletData, tr]);

  // Click-Outside & Escape Dismissal for Column Popover
  useEffect(() => {
    if (!showColumnsPopover) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (columnsPopoverRef.current && !columnsPopoverRef.current.contains(e.target as Node)) {
        setShowColumnsPopover(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowColumnsPopover(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [showColumnsPopover]);

  // Save Settings to Database
  const handleSaveSettings = async () => {
    if (saving || isSavingRef.current) return;
    setSaving(true);
    isSavingRef.current = true;
    setFeedback(null);

    try {
      const res = await fetch('/api/admin/wallet-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save_settings',
          walletSettings: settings
        })
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('zecratary_wallet_updated'));
          window.dispatchEvent(new Event('zecratary_wallet_settings_updated'));
          window.dispatchEvent(new Event('zecratary_payment_updated'));
          localStorage.setItem('zecratary_wallet_updated_at', Date.now().toString());
        }
        showToast('success', tr('toastWalletSaved', 'Wallet configurations saved successfully!'));
      } else {
        throw new Error(data.error || 'Failed to save configurations.');
      }
    } catch (err: any) {
      showToast('error', err.message || 'Error saving wallet settings.');
    } finally {
      setSaving(false);
      setTimeout(() => { isSavingRef.current = false; }, 300);
    }
  };

  const handleResetDefaults = () => {
    if (!confirm(tr('confirmResetDefaults', 'Reset wallet settings and bonus rules to default values?'))) return;
    setSettings(DEFAULT_SETTINGS);
    try {
      localStorage.removeItem('zecratary_wallet_ledger_columns');
    } catch (_) {}
    showToast('success', tr('toastWalletReset', 'Wallet settings reset to defaults successfully!'));
  };

  // Add Preset Amount
  const handleAddPreset = () => {
    const val = parseInt(newPresetValue, 10);
    if (isNaN(val) || val <= 0) return;
    if (settings.presetAmounts.includes(val)) {
      setNewPresetValue('');
      return;
    }
    const updated = [...settings.presetAmounts, val].sort((a, b) => a - b);
    setSettings({ ...settings, presetAmounts: updated });
    setNewPresetValue('');
  };

  const handleRemovePreset = (val: number) => {
    if (settings.presetAmounts.length <= 1) {
      showToast('error', tr('errMinOnePreset', 'You must retain at least one quick deposit preset.'));
      return;
    }
    setSettings({
      ...settings,
      presetAmounts: settings.presetAmounts.filter(p => p !== val)
    });
  };

  // Add Bonus Rule
  const handleAddBonusRule = () => {
    const thresh = parseFloat(newTierThreshold);
    const pct = parseFloat(newTierBonus);
    if (isNaN(thresh) || thresh <= 0 || isNaN(pct) || pct <= 0) {
      showToast('error', tr('errInvalidBonusTier', 'Please enter valid numbers for deposit threshold and bonus percentage.'));
      return;
    }

    const newRule: BonusRule = { threshold: thresh, bonus_percent: pct };
    const updated = [...settings.bonusRules.filter(r => r.threshold !== thresh), newRule].sort((a, b) => a.threshold - b.threshold);
    setSettings({ ...settings, bonusRules: updated });
    setNewTierThreshold('');
    setNewTierBonus('');
  };

  const handleRemoveBonusRule = (thresh: number) => {
    setSettings({
      ...settings,
      bonusRules: settings.bonusRules.filter(r => r.threshold !== thresh)
    });
  };

  // Apply Manual Balance Adjustment
  const handleApplyAdjustment = async () => {
    if (!adjustEmail) {
      showToast('error', tr('errSelectCustomer', 'Please choose a customer from the dropdown list.'));
      return;
    }
    const amt = parseFloat(adjustAmount);
    if (isNaN(amt) || amt <= 0) {
      showToast('error', tr('errValidAmount', 'Please enter a valid positive adjustment amount.'));
      return;
    }
    if (!adjustReason.trim()) {
      showToast('error', tr('errReasonRequired', 'Please enter an administrative reason or note for this adjustment.'));
      return;
    }

    setApplyingAdjustment(true);
    try {
      const res = await fetch('/api/admin/wallet-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'manual_adjustment',
          email: adjustEmail,
          amount: amt,
          isDebit: adjustType === 'debit',
          reason: adjustReason.trim()
        })
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        showToast('success', tr('toastAdjustmentSuccess', 'Balance adjustment applied successfully!')
          .replace('{amount}', `${adjustType === 'debit' ? '-' : '+'}${activeCurrencySymbol}${amt.toFixed(2)}`)
          .replace('{email}', adjustEmail));
        setAdjustReason('');
        loadWalletData();
        window.dispatchEvent(new Event('zecratary_wallet_updated'));
      } else {
        throw new Error(data.error || 'Failed to apply balance adjustment.');
      }
    } catch (err: any) {
      showToast('error', err.message || 'Error executing balance adjustment.');
    } finally {
      setApplyingAdjustment(false);
    }
  };

  // Filtered & Sorted Ledger Transactions
  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => {
      // Harmonized type filtering (e.g., 'deposit' matches 'topup' or 'deposit')
      if (typeFilter !== 'all') {
        const txType = (t.type || '').toLowerCase();
        const f = typeFilter.toLowerCase();
        if (f === 'deposit' && txType !== 'deposit' && txType !== 'topup') return false;
        if (f === 'purchase' && txType !== 'purchase' && txType !== 'debit') return false;
        if (f !== 'deposit' && f !== 'purchase' && txType !== f) return false;
      }
      if (search.trim()) {
        const q = search.toLowerCase().trim();
        const mEmail = (t.customer_email || t.email || '').toLowerCase().includes(q);
        const mName = (t.customer_name || '').toLowerCase().includes(q);
        const mDesc = (t.description || '').toLowerCase().includes(q);
        const mId = (t.id || '').toLowerCase().includes(q);
        const mGw = (t.gateway || '').toLowerCase().includes(q);
        const mAmt = String(t.amount || '').includes(q);
        if (!mEmail && !mName && !mDesc && !mId && !mGw && !mAmt) return false;
      }
      return true;
    }).sort((a, b) => {
      let comparison = 0;
      if (sortField === 'date') {
        comparison = new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
      } else if (sortField === 'amount') {
        comparison = Number(a.amount || 0) - Number(b.amount || 0);
      } else if (sortField === 'customer') {
        comparison = (a.customer_name || a.customer_email || '').localeCompare(b.customer_name || b.customer_email || '');
      } else if (sortField === 'type') {
        comparison = (a.type || '').localeCompare(b.type || '');
      } else if (sortField === 'balanceAfter') {
        comparison = Number(a.balance_after || 0) - Number(b.balance_after || 0);
      } else if (sortField === 'gateway') {
        comparison = (a.gateway || '').localeCompare(b.gateway || '');
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }, [transactions, search, typeFilter, sortField, sortOrder]);

  const totalPages = Math.max(1, Math.ceil(filteredTransactions.length / rowsPerPage));
  const startIndex = (currentPage - 1) * rowsPerPage;
  const paginatedTxs = filteredTransactions.slice(startIndex, startIndex + rowsPerPage);

  // Auto-clamp page boundary if rows shrink
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  // Robust Delete Transactions (Single, Batch, or All) with DELETE + POST fallback
  const handleDeleteTransactions = async (idsToDelete: string[], isAll: boolean = false) => {
    if (!isAll && idsToDelete.length === 0) return;
    const promptMsg = isAll
      ? tr('confirmDeleteAllLedger', 'Are you sure you want to delete ALL {count} transaction records in the ledger? This permanent action cannot be undone.').replace('{count}', String(filteredTransactions.length))
      : idsToDelete.length > 1
      ? tr('confirmDeleteSelected', 'Are you sure you want to delete {count} selected transaction record(s)? This cannot be undone.').replace('{count}', String(idsToDelete.length))
      : tr('confirmDeleteSingle', 'Are you sure you want to delete this transaction record? This cannot be undone.');

    if (!confirm(promptMsg)) return;

    setDeleting(true);
    try {
      let res = await fetch('/api/admin/wallet-settings', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: idsToDelete, all: isAll })
      });

      // Seamless fallback to POST action if proxy strips DELETE body
      if (!res.ok) {
        res = await fetch('/api/admin/wallet-settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: isAll ? 'delete_all_transactions' : 'delete_transactions',
            ids: idsToDelete,
            all: isAll
          })
        });
      }

      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        if (isAll) {
          setTransactions([]);
          setSelectedTxIds([]);
          setIsSelectAllLedger(false);
        } else {
          setTransactions(prev => prev.filter(t => !idsToDelete.includes(t.id)));
          setSelectedTxIds(prev => prev.filter(id => !idsToDelete.includes(id)));
        }
        showToast('success', tr('toastDeleteSuccess', 'Transaction record(s) deleted successfully.'));
        window.dispatchEvent(new Event('zecratary_wallet_updated'));
        loadWalletData();
      } else {
        throw new Error(data.error || 'Failed to delete transactions.');
      }
    } catch (err: any) {
      showToast('error', err.message || 'Error deleting transactions.');
    } finally {
      setDeleting(false);
    }
  };

  // Checkbox Selection Helpers
  const pageIds = useMemo(() => paginatedTxs.map(t => t.id), [paginatedTxs]);
  const isAllOnPageSelected = pageIds.length > 0 && pageIds.every(id => selectedTxIds.includes(id));
  const isIndeterminate = pageIds.some(id => selectedTxIds.includes(id)) && !isAllOnPageSelected;

  useEffect(() => {
    if (selectAllCheckboxRef.current) {
      selectAllCheckboxRef.current.indeterminate = isIndeterminate;
    }
  }, [isIndeterminate]);

  const handleToggleSelectAllPage = () => {
    if (isAllOnPageSelected) {
      setSelectedTxIds(prev => prev.filter(id => !pageIds.includes(id)));
      setIsSelectAllLedger(false);
    } else {
      setSelectedTxIds(prev => Array.from(new Set([...prev, ...pageIds])));
    }
  };

  const handleSelectAllAcrossLedger = () => {
    const allFilteredIds = filteredTransactions.map(t => t.id);
    setSelectedTxIds(allFilteredIds);
    setIsSelectAllLedger(true);
  };

  const toggleSelectTx = (id: string) => {
    setSelectedTxIds(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
      if (next.length < filteredTransactions.length) {
        setIsSelectAllLedger(false);
      }
      return next;
    });
  };

  // Sort toggle handler
  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  // Column Visibility Handlers with Persistent Caching
  const toggleColumn = (colKey: string) => {
    const currentCols = settings.ledgerColumns || DEFAULT_SETTINGS.ledgerColumns;
    const activeCols = Object.values(currentCols).filter(Boolean).length;
    if (currentCols[colKey] && activeCols <= 1) return;

    const updatedCols = {
      ...currentCols,
      [colKey]: !currentCols[colKey]
    };
    setSettings({ ...settings, ledgerColumns: updatedCols });
    try {
      localStorage.setItem('zecratary_wallet_ledger_columns', JSON.stringify(updatedCols));
    } catch (_) {}
  };

  // Export Transactions as CSV
  const handleExportCSV = () => {
    if (filteredTransactions.length === 0) return;
    const headers = ['Transaction ID', 'Customer Name', 'Customer Email', 'Type', 'Amount', 'Currency', 'Balance After', 'Gateway', 'Date'];
    const rows = filteredTransactions.map(t => [
      t.id,
      `"${(t.customer_name || 'Customer').replace(/"/g, '""')}"`,
      t.customer_email || t.email || '',
      t.type,
      t.amount,
      settings.currency,
      t.balance_after ?? '',
      t.gateway || 'System',
      t.created_at
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `wallet_transactions_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const activeColumnsCount = 1 + Object.values(settings.ledgerColumns || DEFAULT_SETTINGS.ledgerColumns).filter(Boolean).length;

  return (
    <div 
      className="w-full max-w-full px-4 sm:px-6 lg:px-8 xl:px-10 space-y-6 pb-24 pt-2 font-sans transition-colors duration-200"
      style={{ color: 'var(--color-text)' }}
    >
      {/* Scoped Autofill Guardrail Style */}
      <style jsx global>{`
        .wallet-input:-webkit-autofill,
        .wallet-input:-webkit-autofill:hover,
        .wallet-input:-webkit-autofill:focus {
          -webkit-text-fill-color: var(--color-text) !important;
          -webkit-box-shadow: 0 0 0px 1000px var(--color-inner-dark) inset !important;
          box-shadow: 0 0 0px 1000px var(--color-inner-dark) inset !important;
          transition: background-color 5000s ease-in-out 0s;
        }
      `}</style>

      {/* 1. Header & Save Action */}
      <div 
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4" 
        style={{ borderColor: 'var(--color-border)' }}
      >
        <div>
          <h1 className="text-2xl font-black tracking-tight flex items-center gap-2" style={{ color: 'var(--color-primary)' }}>
            <Wallet className="h-6 w-6" style={{ color: 'var(--color-primary)' }} />
            {tr('walletSettingsTitle', 'Store Wallet & Financial Configurations')}
          </h1>
          <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
            {tr('walletSettingsSubtitle', 'Configure store credit top-up boundaries, bonus incentives, customer balance adjustments, and audit transaction ledgers.')}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
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

      {/* 2. Wallet Engine Monitor & Cross-Module Shortcuts */}
      <div 
        className="p-3.5 px-4 rounded-2xl border flex flex-wrap items-center justify-between gap-3 text-xs shadow-xs transition-colors duration-200"
        style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }}
      >
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 font-bold" style={{ color: 'var(--color-text)' }}>
            <Activity className="h-4 w-4 text-emerald-500 animate-pulse" />
            {tr('walletMonitorHeading', 'Wallet Engine Monitor')}
          </span>
          <span 
            className="font-bold px-2.5 py-0.5 rounded text-[10px] border shadow-xs"
            style={{
              backgroundColor: 'var(--color-inner-dark)',
              borderColor: settings.isEnabled ? 'var(--color-emerald, #10b981)' : '#ef4444',
              color: settings.isEnabled ? 'var(--color-emerald, #10b981)' : '#ef4444'
            }}
          >
            {settings.isEnabled ? tr('walletStatusEnabled', 'System Active') : tr('walletStatusDisabled', 'System Disabled')}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-4 font-semibold text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
          <div>
            {tr('walletActiveCurrency', 'Store Currency:')}{' '}
            <span className="font-bold" style={{ color: 'var(--color-text)' }}>
              {settings.currency} ({activeCurrencySymbol})
            </span>
          </div>
          <div>
            {tr('walletActiveBonusTiers', 'Bonus Tiers:')}{' '}
            <span className="font-bold font-mono" style={{ color: 'var(--color-primary)' }}>
              {settings.bonusRules.length} Tiers Active
            </span>
          </div>

          <div className="flex items-center gap-2 pl-2 border-l" style={{ borderColor: 'var(--color-border)' }}>
            <Link
              href="/admin/payment-gateway"
              className="flex items-center gap-1 text-[11px] font-bold hover:underline"
              style={{ color: 'var(--color-primary)' }}
            >
              <CreditCard className="h-3 w-3" />
              <span>{tr('navPaymentGateways', 'Payment Gateways')}</span>
              <ExternalLink className="h-2.5 w-2.5" />
            </Link>

            <span className="opacity-40">•</span>

            <Link
              href="/wallet"
              className="flex items-center gap-1 text-[11px] font-bold hover:underline"
              style={{ color: 'var(--color-primary)' }}
            >
              <Wallet className="h-3 w-3" />
              <span>{tr('navViewStoreWallet', 'Store Wallet Portal')}</span>
              <ExternalLink className="h-2.5 w-2.5" />
            </Link>
          </div>
        </div>
      </div>

      {/* 3. Workspace Sub-Tabs (Ledger placed first) */}
      <div 
        className="flex p-1.5 rounded-2xl border transition-colors duration-200"
        style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)' }}
      >
        <button
          type="button"
          onClick={() => setActiveTab('ledger')}
          className="flex-1 py-2.5 text-xs font-bold rounded-xl flex items-center justify-center gap-2 transition cursor-pointer"
          style={activeTab === 'ledger' ? {
            backgroundColor: 'var(--color-card)',
            color: 'var(--color-primary)',
            borderColor: 'var(--color-primary)',
            borderWidth: '1px',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
          } : { color: 'var(--color-text-secondary)' }}
        >
          <History className="h-4 w-4" />
          <span>{tr('tabWalletLedger', 'Wallet Transactions Ledger')}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('config')}
          className="flex-1 py-2.5 text-xs font-bold rounded-xl flex items-center justify-center gap-2 transition cursor-pointer"
          style={activeTab === 'config' ? {
            backgroundColor: 'var(--color-card)',
            color: 'var(--color-primary)',
            borderColor: 'var(--color-primary)',
            borderWidth: '1px',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
          } : { color: 'var(--color-text-secondary)' }}
        >
          <Sliders className="h-4 w-4" />
          <span>{tr('tabWalletConfig', 'Configuration & Rules')}</span>
        </button>
      </div>

      {/* TAB 1: WALLET TRANSACTIONS LEDGER (Default First View) */}
      {activeTab === 'ledger' && (
        <div 
          role="region"
          aria-label={tr('walletRegionLedger', 'Wallet Transactions Ledger')}
          className="space-y-4"
        >
          {/* Search, Filter, Export & Columns Popover Bar */}
          <div 
            className="p-4 rounded-3xl border flex flex-col md:flex-row items-center justify-between gap-3 shadow-sm transition-colors"
            style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }}
          >
            <div className="relative w-full md:w-96">
              <input
                type="text"
                autoComplete="off"
                data-lpignore="true"
                data-1p-ignore="true"
                data-form-type="other"
                spellCheck={false}
                value={search}
                onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
                placeholder={tr('ledgerSearchPlaceholder', 'Search by customer email, name, description, ID, gateway...')}
                className="wallet-input w-full px-3.5 py-2 rounded-xl border text-xs outline-none"
                style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto relative">
              <select
                value={typeFilter}
                onChange={(e) => { setTypeFilter(e.target.value); setCurrentPage(1); }}
                className="wallet-input px-3 py-2 rounded-xl border text-xs font-bold outline-none cursor-pointer"
                style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
              >
                <option value="all">{tr('ledgerFilterAll', 'All Types')}</option>
                <option value="deposit">{tr('ledgerFilterDeposit', 'Top-Up Deposits')}</option>
                <option value="purchase">{tr('ledgerFilterPurchase', 'Purchases & Debits')}</option>
                <option value="bonus">{tr('ledgerFilterBonus', 'Bonus Credits')}</option>
                <option value="adjustment">{tr('ledgerFilterAdjustment', 'Admin Adjustments')}</option>
                <option value="refund">{tr('ledgerFilterRefund', 'Refunds')}</option>
              </select>

              {/* Export CSV Button */}
              <button
                type="button"
                onClick={handleExportCSV}
                disabled={filteredTransactions.length === 0}
                className="px-3 py-2 rounded-xl border text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-40"
                style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                title="Export transactions as CSV"
              >
                <Download className="h-3.5 w-3.5" />
                <span>{tr('exportBtn', 'Export CSV')}</span>
              </button>

              {/* Columns Popover Toggle */}
              <div className="relative" ref={columnsPopoverRef}>
                <button
                  type="button"
                  onClick={() => setShowColumnsPopover(!showColumnsPopover)}
                  className="px-3 py-2 rounded-xl border text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                  style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                >
                  <Columns3 className="h-3.5 w-3.5" />
                  <span>{tr('columnsBtn', 'Columns')}</span>
                </button>

                {showColumnsPopover && (
                  <div 
                    className="absolute right-0 top-11 z-30 w-56 rounded-2xl border p-3 shadow-2xl space-y-2 text-xs animate-in fade-in"
                    style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }}
                  >
                    <div className="flex items-center justify-between border-b pb-1.5">
                      <span className="font-bold text-[11px]" style={{ color: 'var(--color-text)' }}>{tr('columnsPopoverTitle', 'Toggle Visible Columns')}</span>
                      <button
                        type="button"
                        onClick={() => {
                          setSettings({ ...settings, ledgerColumns: DEFAULT_SETTINGS.ledgerColumns });
                          try { localStorage.removeItem('zecratary_wallet_ledger_columns'); } catch (_) {}
                        }}
                        className="text-[10px] text-[var(--color-primary)] font-bold hover:underline cursor-pointer"
                      >
                        {tr('resetColumnsBtn', 'Reset All')}
                      </button>
                    </div>

                    <div className="space-y-1.5">
                      {[
                        { key: 'customer', label: tr('colCustomer', 'Customer') },
                        { key: 'type', label: tr('colType', 'Type') },
                        { key: 'amount', label: tr('colAmount', 'Amount') },
                        { key: 'balanceAfter', label: tr('colBalanceAfter', 'Balance After') },
                        { key: 'gateway', label: tr('colGateway', 'Gateway / Ref') },
                        { key: 'date', label: tr('colDate', 'Timestamp') },
                        { key: 'actions', label: tr('colActions', 'Actions') }
                      ].map(col => (
                        <label key={col.key} className="flex items-center justify-between cursor-pointer py-0.5">
                          <span style={{ color: 'var(--color-text)' }}>{col.label}</span>
                          <input
                            type="checkbox"
                            checked={settings.ledgerColumns?.[col.key] ?? true}
                            onChange={() => toggleColumn(col.key)}
                            className="rounded cursor-pointer"
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Global Delete All Ledger Records Button */}
              <button
                type="button"
                onClick={() => handleDeleteTransactions([], true)}
                disabled={deleting || transactions.length === 0}
                className="px-3.5 py-2 rounded-xl border border-red-500/40 text-red-400 bg-red-500/10 hover:bg-red-500/20 font-bold transition flex items-center gap-1.5 cursor-pointer text-xs disabled:opacity-40"
                title={tr('deleteAllLedgerTitle', 'Delete all records in ledger')}
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>{tr('btnDeleteAll', 'Delete All')}</span>
              </button>
            </div>
          </div>

          {/* Floating Selected Action Bar */}
          {selectedTxIds.length > 0 && (
            <div 
              className="p-3.5 px-5 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-3 text-xs border shadow-lg animate-in fade-in"
              style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-primary)', color: 'var(--color-text)' }}
            >
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-bold">
                  {tr('itemsSelectedBanner', '{count} transaction(s) selected').replace('{count}', String(selectedTxIds.length))}
                </span>

                {/* Select All in Ledger Scope Helper */}
                {!isSelectAllLedger && filteredTransactions.length > selectedTxIds.length && (
                  <button
                    type="button"
                    onClick={handleSelectAllAcrossLedger}
                    className="text-[11px] font-bold text-[var(--color-primary)] hover:underline cursor-pointer"
                  >
                    {tr('selectAllLedgerCount', 'Select all {count} transactions across all pages').replace('{count}', String(filteredTransactions.length))}
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => { setSelectedTxIds([]); setIsSelectAllLedger(false); }}
                  className="text-[11px] underline cursor-pointer hover:opacity-80"
                  style={{ color: 'var(--color-text-secondary)' }}
                >
                  {tr('btnClearSelection', 'Clear selection')}
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={deleting}
                  onClick={() => handleDeleteTransactions(selectedTxIds, isSelectAllLedger)}
                  className="px-4 py-2 rounded-xl border border-red-500/40 text-red-400 bg-red-500/10 hover:bg-red-500/20 font-bold transition flex items-center gap-1.5 cursor-pointer text-xs disabled:opacity-40"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>
                    {isSelectAllLedger
                      ? tr('btnDeleteAllSelectedLedger', 'Delete All ({count})').replace('{count}', String(filteredTransactions.length))
                      : tr('btnDeleteSelected', 'Delete Selected ({count})').replace('{count}', String(selectedTxIds.length))}
                  </span>
                </button>
              </div>
            </div>
          )}

          {/* Transactions Table with Sort Headers */}
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
                    <th className="w-10 px-4 py-4 text-center">
                      <input
                        type="checkbox"
                        checked={isAllOnPageSelected}
                        ref={selectAllCheckboxRef}
                        onChange={handleToggleSelectAllPage}
                        className="rounded cursor-pointer"
                        title={isAllOnPageSelected ? tr('unselectAllPage', 'Unselect page') : tr('selectAllPage', 'Select all on page')}
                      />
                    </th>

                    {settings.ledgerColumns?.customer && (
                      <th className="px-5 py-4 cursor-pointer select-none" onClick={() => handleSort('customer')}>
                        <div className="flex items-center gap-1 hover:text-[var(--color-primary)] transition">
                          <span>{tr('colCustomer', 'Customer')}</span>
                          {sortField === 'customer' ? (sortOrder === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-40" />}
                        </div>
                      </th>
                    )}

                    {settings.ledgerColumns?.type && (
                      <th className="px-5 py-4 cursor-pointer select-none" onClick={() => handleSort('type')}>
                        <div className="flex items-center gap-1 hover:text-[var(--color-primary)] transition">
                          <span>{tr('colType', 'Type')}</span>
                          {sortField === 'type' ? (sortOrder === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-40" />}
                        </div>
                      </th>
                    )}

                    {settings.ledgerColumns?.amount && (
                      <th className="px-5 py-4 cursor-pointer select-none" onClick={() => handleSort('amount')}>
                        <div className="flex items-center gap-1 hover:text-[var(--color-primary)] transition">
                          <span>{tr('colAmount', 'Amount')}</span>
                          {sortField === 'amount' ? (sortOrder === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-40" />}
                        </div>
                      </th>
                    )}

                    {settings.ledgerColumns?.balanceAfter && (
                      <th className="px-5 py-4 cursor-pointer select-none" onClick={() => handleSort('balanceAfter')}>
                        <div className="flex items-center gap-1 hover:text-[var(--color-primary)] transition">
                          <span>{tr('colBalanceAfter', 'Balance After')}</span>
                          {sortField === 'balanceAfter' ? (sortOrder === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-40" />}
                        </div>
                      </th>
                    )}

                    {settings.ledgerColumns?.gateway && (
                      <th className="px-5 py-4 cursor-pointer select-none" onClick={() => handleSort('gateway')}>
                        <div className="flex items-center gap-1 hover:text-[var(--color-primary)] transition">
                          <span>{tr('colGateway', 'Gateway / Ref')}</span>
                          {sortField === 'gateway' ? (sortOrder === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-40" />}
                        </div>
                      </th>
                    )}

                    {settings.ledgerColumns?.date && (
                      <th className="px-5 py-4 cursor-pointer select-none" onClick={() => handleSort('date')}>
                        <div className="flex items-center gap-1 hover:text-[var(--color-primary)] transition">
                          <span>{tr('colDate', 'Timestamp')}</span>
                          {sortField === 'date' ? (sortOrder === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-40" />}
                        </div>
                      </th>
                    )}

                    {settings.ledgerColumns?.actions && <th className="px-5 py-4 text-right">{tr('colActions', 'Actions')}</th>}
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}>
                  {paginatedTxs.length === 0 ? (
                    <tr>
                      <td colSpan={activeColumnsCount} className="text-center py-10" style={{ color: 'var(--color-text-secondary)' }}>
                        {tr('noLedgerTransactions', 'No wallet transactions found matching your criteria.')}
                      </td>
                    </tr>
                  ) : (
                    paginatedTxs.map((tx) => {
                      const isSelected = selectedTxIds.includes(tx.id);
                      const rawAmt = Number(tx.amount || 0);
                      const isTypeDebit = ['debit', 'purchase', 'withdrawal', 'fee'].includes((tx.type || '').toLowerCase());
                      const isNegative = rawAmt < 0 || (isTypeDebit && rawAmt > 0);
                      const displayAmt = Math.abs(rawAmt);

                      let formattedDate = '—';
                      if (tx.created_at) {
                        try {
                          const d = new Date(tx.created_at);
                          if (!isNaN(d.getTime())) {
                            formattedDate = d.toLocaleDateString(locale === 'th' ? 'th-TH' : (locale || 'en-US'), {
                              year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                            });
                          }
                        } catch (_) {}
                      }

                      return (
                        <tr 
                          key={tx.id}
                          className="transition"
                          style={{
                            borderColor: 'var(--color-border)',
                            backgroundColor: isSelected ? 'var(--color-inner-dark)' : undefined
                          }}
                        >
                          <td className="w-10 px-4 py-4 text-center">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelectTx(tx.id)}
                              className="rounded cursor-pointer"
                            />
                          </td>

                          {settings.ledgerColumns?.customer && (
                            <td className="px-5 py-4">
                              <div className="font-bold text-xs" style={{ color: 'var(--color-text)' }}>
                                {tx.customer_name || 'Customer'}
                              </div>
                              <div className="font-mono text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
                                {tx.customer_email || tx.email || '—'}
                              </div>
                            </td>
                          )}

                          {settings.ledgerColumns?.type && (
                            <td className="px-5 py-4">
                              <span 
                                className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border"
                                style={{
                                  backgroundColor: 'var(--color-inner-dark)',
                                  borderColor: isNegative ? 'rgba(239, 68, 68, 0.3)' : 'rgba(16, 185, 129, 0.3)',
                                  color: isNegative ? '#ef4444' : 'var(--color-emerald, #10b981)'
                                }}
                              >
                                {tx.type}
                              </span>
                            </td>
                          )}

                          {settings.ledgerColumns?.amount && (
                            <td className="px-5 py-4 font-mono font-black text-sm" style={{ color: isNegative ? '#ef4444' : 'var(--color-emerald, #10b981)' }}>
                              {isNegative ? `-${activeCurrencySymbol}${displayAmt.toFixed(2)}` : `+${activeCurrencySymbol}${displayAmt.toFixed(2)}`}
                            </td>
                          )}

                          {settings.ledgerColumns?.balanceAfter && (
                            <td className="px-5 py-4 font-mono font-bold" style={{ color: 'var(--color-text)' }}>
                              {tx.balance_after !== undefined ? `${activeCurrencySymbol}${Number(tx.balance_after).toFixed(2)}` : '—'}
                            </td>
                          )}

                          {settings.ledgerColumns?.gateway && (
                            <td className="px-5 py-4">
                              <span className="px-2 py-0.5 rounded border text-[10px] font-mono font-bold uppercase" style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}>
                                {tx.gateway || 'System'}
                              </span>
                            </td>
                          )}

                          {settings.ledgerColumns?.date && (
                            <td className="px-5 py-4 text-[11px] font-mono" style={{ color: 'var(--color-text-secondary)' }}>
                              {formattedDate}
                            </td>
                          )}

                          {settings.ledgerColumns?.actions && (
                            <td className="px-5 py-4 text-right">
                              <button
                                type="button"
                                disabled={deleting}
                                onClick={() => handleDeleteTransactions([tx.id])}
                                className="p-1.5 rounded-xl border text-red-400 border-red-500/30 hover:bg-red-500/10 transition cursor-pointer disabled:opacity-40"
                                title={tr('btnDeleteTransaction', 'Delete Transaction')}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls Bar */}
            <div 
              className="px-5 py-3.5 border-t flex flex-col sm:flex-row items-center justify-between gap-3 text-xs transition-colors"
              style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
            >
              <div className="flex items-center gap-3">
                <span>
                  {tr('showingTransactions', 'Showing {start} to {end} of {total} transactions')
                    .replace('{start}', String(filteredTransactions.length === 0 ? 0 : startIndex + 1))
                    .replace('{end}', String(Math.min(startIndex + rowsPerPage, filteredTransactions.length)))
                    .replace('{total}', String(filteredTransactions.length))}
                </span>

                <div className="flex items-center gap-1.5 pl-2 border-l" style={{ borderColor: 'var(--color-border)' }}>
                  <span className="text-[11px]">{tr('rowsPerPageLabel', 'Rows per page:')}</span>
                  <select
                    value={rowsPerPage}
                    onChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setCurrentPage(1); }}
                    className="wallet-input px-2 py-1 rounded-lg border text-xs font-bold outline-none cursor-pointer"
                    style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                  >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </div>
              </div>

              {/* Page Number Pills */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage(1)}
                  className="p-1.5 rounded-lg border disabled:opacity-40 cursor-pointer"
                  style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                >
                  <ChevronsLeft className="h-3.5 w-3.5" />
                </button>

                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  className="p-1.5 rounded-lg border disabled:opacity-40 cursor-pointer"
                  style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>

                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                  .map((pageNum, idx, arr) => (
                    <React.Fragment key={pageNum}>
                      {idx > 0 && arr[idx - 1] !== pageNum - 1 && <span className="px-1 opacity-50">...</span>}
                      <button
                        type="button"
                        onClick={() => setCurrentPage(pageNum)}
                        className="min-w-[28px] h-7 px-2 rounded-lg text-xs font-bold border transition cursor-pointer"
                        style={currentPage === pageNum ? {
                          backgroundColor: 'var(--color-primary)',
                          borderColor: 'var(--color-primary)',
                          color: '#ffffff'
                        } : {
                          backgroundColor: 'var(--color-card)',
                          borderColor: 'var(--color-border)',
                          color: 'var(--color-text)'
                        }}
                      >
                        {pageNum}
                      </button>
                    </React.Fragment>
                  ))}

                <button
                  type="button"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  className="p-1.5 rounded-lg border disabled:opacity-40 cursor-pointer"
                  style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>

                <button
                  type="button"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage(totalPages)}
                  className="p-1.5 rounded-lg border disabled:opacity-40 cursor-pointer"
                  style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                >
                  <ChevronsRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: CONFIGURATION & RULES */}
      {activeTab === 'config' && (
        <div 
          role="region"
          aria-label={tr('walletRegionConfig', 'Wallet Configuration and Rules')}
          className="space-y-6"
        >
          {/* Section 1: General Wallet Controls */}
          <div 
            className="p-6 rounded-3xl border shadow-sm space-y-5 transition-colors duration-200"
            style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }}
          >
            <div className="border-b pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3" style={{ borderColor: 'var(--color-border)' }}>
              <div>
                <h2 className="text-sm font-bold flex items-center gap-2" style={{ color: 'var(--color-text)' }}>
                  <Wallet className="h-4 w-4" style={{ color: 'var(--color-primary)' }} />
                  {tr('generalControlsHeading', 'General Wallet Controls')}
                </h2>
                <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                  {tr('generalControlsDesc', 'Toggle store credit operations, spending permissions, and currency parameters.')}
                </p>
              </div>

              <button
                type="button"
                onClick={handleResetDefaults}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border text-xs font-bold transition hover:opacity-80 cursor-pointer shadow-sm shrink-0 self-start sm:self-center"
                style={{ 
                  backgroundColor: 'var(--color-inner-dark)', 
                  borderColor: 'var(--color-border)',
                  color: 'var(--color-text-secondary)'
                }}
              >
                <span>{tr('btnResetDefaults', 'Reset Defaults')}</span>
              </button>
            </div>

            {/* Slide Button Switch Controls */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div 
                className="p-4 rounded-2xl border flex items-center justify-between"
                style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)' }}
              >
                <div className="pr-3">
                  <span className="font-bold text-xs block" style={{ color: 'var(--color-text)' }}>
                    {tr('enableWalletLabel', 'Enable Wallet System')}
                  </span>
                  <span className="text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
                    {tr('enableWalletDesc', 'Allow customers to hold store credit and top up balances.')}
                  </span>
                </div>

                <button
                  type="button"
                  role="switch"
                  aria-checked={settings.isEnabled}
                  onClick={() => setSettings({ ...settings, isEnabled: !settings.isEnabled })}
                  className="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-300 ease-in-out"
                  style={{ backgroundColor: settings.isEnabled ? 'var(--color-primary)' : 'var(--color-border)' }}
                >
                  <span
                    aria-hidden="true"
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition duration-300 ease-in-out ${
                      settings.isEnabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              <div 
                className="p-4 rounded-2xl border flex items-center justify-between"
                style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)' }}
              >
                <div className="pr-3">
                  <span className="font-bold text-xs block" style={{ color: 'var(--color-text)' }}>
                    {tr('allowPurchasesLabel', 'Allow Balance for Purchases')}
                  </span>
                  <span className="text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
                    {tr('allowPurchasesDesc', 'Permit spending store wallet credits on recipe plans, tokens, and store items.')}
                  </span>
                </div>

                <button
                  type="button"
                  role="switch"
                  aria-checked={settings.allowPurchases}
                  onClick={() => setSettings({ ...settings, allowPurchases: !settings.allowPurchases })}
                  className="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-300 ease-in-out"
                  style={{ backgroundColor: settings.allowPurchases ? 'var(--color-primary)' : 'var(--color-border)' }}
                >
                  <span
                    aria-hidden="true"
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition duration-300 ease-in-out ${
                      settings.allowPurchases ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Currency & Min/Max Deposit Caps */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs font-mono pt-1">
              <div>
                <label className="block font-bold mb-1.5 font-sans" style={{ color: 'var(--color-text)' }}>
                  {tr('processingCurrencyLabel', 'Processing Currency')}
                </label>
                <select
                  value={settings.currency}
                  onChange={(e) => setSettings({ ...settings, currency: e.target.value })}
                  className="wallet-input w-full px-3.5 py-2.5 rounded-xl border font-bold outline-none cursor-pointer"
                  style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                >
                  {SUPPORTED_CURRENCIES.map(c => (
                    <option key={c.code} value={c.code}>{c.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold mb-1.5 font-sans" style={{ color: 'var(--color-text)' }}>
                  {tr('minTopupLabel', 'Minimum Top-Up Amount ({currency})').replace('{currency}', activeCurrencySymbol)}
                </label>
                <input
                  type="number"
                  min="1"
                  step="0.01"
                  autoComplete="off"
                  data-lpignore="true"
                  data-1p-ignore="true"
                  data-form-type="other"
                  spellCheck={false}
                  value={settings.minTopup}
                  onChange={(e) => setSettings({ ...settings, minTopup: parseFloat(e.target.value) || 0 })}
                  className="wallet-input w-full px-3.5 py-2.5 rounded-xl border font-bold outline-none"
                  style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                />
              </div>

              <div>
                <label className="block font-bold mb-1.5 font-sans" style={{ color: 'var(--color-text)' }}>
                  {tr('maxTopupLabel', 'Maximum Top-Up Amount ({currency})').replace('{currency}', activeCurrencySymbol)}
                </label>
                <input
                  type="number"
                  min="1"
                  step="0.01"
                  autoComplete="off"
                  data-lpignore="true"
                  data-1p-ignore="true"
                  data-form-type="other"
                  spellCheck={false}
                  value={settings.maxTopup}
                  onChange={(e) => setSettings({ ...settings, maxTopup: parseFloat(e.target.value) || 0 })}
                  className="wallet-input w-full px-3.5 py-2.5 rounded-xl border font-bold outline-none"
                  style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                />
              </div>
            </div>

            {/* Quick Preset Deposit Amounts */}
            <div className="space-y-2 pt-2 border-t" style={{ borderColor: 'var(--color-border)' }}>
              <label className="block text-xs font-bold" style={{ color: 'var(--color-text)' }}>
                {tr('presetAmountsHeading', 'Quick Preset Deposit Amounts')}
              </label>
              <p className="text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
                {tr('presetAmountsDesc', 'Define selectable one-click top-up preset values displayed to customers.')}
              </p>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                {(settings.presetAmounts || []).map((preset) => (
                  <div
                    key={preset}
                    className="px-3 py-1.5 rounded-xl border text-xs font-bold font-mono flex items-center gap-2 shadow-xs"
                    style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)' }}
                  >
                    <span>{activeCurrencySymbol}{preset}</span>
                    <button
                      type="button"
                      onClick={() => handleRemovePreset(preset)}
                      className="text-red-400 hover:text-red-300 transition cursor-pointer p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}

                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min="1"
                    autoComplete="off"
                    data-lpignore="true"
                    data-1p-ignore="true"
                    data-form-type="other"
                    spellCheck={false}
                    value={newPresetValue}
                    onChange={(e) => setNewPresetValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleAddPreset(); }}
                    placeholder={tr('placeholderNewPreset', 'e.g. 75')}
                    className="wallet-input w-24 px-3 py-1.5 rounded-xl border text-xs font-mono font-bold outline-none"
                    style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                  />
                  <button
                    type="button"
                    onClick={handleAddPreset}
                    className="px-3 py-1.5 rounded-xl border text-xs font-bold transition hover:opacity-80 cursor-pointer"
                    style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-primary)', color: 'var(--color-primary)' }}
                  >
                    {tr('btnAddPreset', '+ Add Preset')}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Top-Up Bonus Incentives */}
          <div 
            className="p-6 rounded-3xl border shadow-sm space-y-5 transition-colors duration-200"
            style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }}
          >
            <div className="border-b pb-3" style={{ borderColor: 'var(--color-border)' }}>
              <h2 className="text-sm font-bold flex items-center gap-2" style={{ color: 'var(--color-text)' }}>
                <Gift className="h-4 w-4" style={{ color: 'var(--color-primary)' }} />
                {tr('bonusTiersHeading', 'Top-Up Bonus Incentives (Tiered Credit Rewards)')}
              </h2>
              <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                {tr('bonusTiersDesc', 'Reward customers with bonus credit percentages based on deposit thresholds.')}
              </p>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {(settings.bonusRules || []).map((rule) => (
                  <div
                    key={rule.threshold}
                    className="p-4 rounded-2xl border flex items-center justify-between shadow-xs transition-colors"
                    style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)' }}
                  >
                    <div>
                      <div className="font-bold text-xs" style={{ color: 'var(--color-text)' }}>
                        Deposit ≥ {activeCurrencySymbol}{rule.threshold}
                      </div>
                      <div className="text-[11px] font-mono mt-0.5 text-emerald-400 font-bold">
                        +{rule.bonus_percent}% Store Bonus Credit
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveBonusRule(rule.threshold)}
                      className="p-1.5 rounded-lg border text-red-400 border-red-500/30 hover:bg-red-500/10 transition cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Add New Bonus Tier Inputs */}
              <div 
                className="p-4 rounded-2xl border grid grid-cols-1 sm:grid-cols-3 gap-3 items-end pt-3"
                style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)' }}
              >
                <div>
                  <label className="block text-[11px] font-bold mb-1" style={{ color: 'var(--color-text)' }}>
                    {tr('tierMinThresholdLabel', 'Min Deposit Threshold ({currency})').replace('{currency}', activeCurrencySymbol)}
                  </label>
                  <input
                    type="number"
                    min="1"
                    autoComplete="off"
                    data-lpignore="true"
                    data-1p-ignore="true"
                    data-form-type="other"
                    spellCheck={false}
                    value={newTierThreshold}
                    onChange={(e) => setNewTierThreshold(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleAddBonusRule(); }}
                    placeholder="150"
                    className="wallet-input w-full px-3 py-1.5 rounded-xl border text-xs font-mono font-bold outline-none"
                    style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold mb-1" style={{ color: 'var(--color-text)' }}>
                    {tr('tierBonusPercentLabel', 'Bonus Reward (%)')}
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    autoComplete="off"
                    data-lpignore="true"
                    data-1p-ignore="true"
                    data-form-type="other"
                    spellCheck={false}
                    value={newTierBonus}
                    onChange={(e) => setNewTierBonus(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleAddBonusRule(); }}
                    placeholder="15"
                    className="wallet-input w-full px-3 py-1.5 rounded-xl border text-xs font-mono font-bold outline-none"
                    style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                  />
                </div>

                <button
                  type="button"
                  onClick={handleAddBonusRule}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-white shadow transition hover:opacity-90 flex items-center justify-center gap-1.5 cursor-pointer"
                  style={{ backgroundColor: 'var(--color-primary)' }}
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>{tr('btnAddBonusTier', '+ Add Bonus Tier')}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Section 3: Manual Customer Balance Adjustment */}
          <div 
            className="p-6 rounded-3xl border shadow-sm space-y-4 transition-colors duration-200"
            style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }}
          >
            <div className="border-b pb-3" style={{ borderColor: 'var(--color-border)' }}>
              <h2 className="text-sm font-bold flex items-center gap-2" style={{ color: 'var(--color-text)' }}>
                <Coins className="h-4 w-4" style={{ color: 'var(--color-primary)' }} />
                {tr('manualAdjustmentHeading', 'Manual Customer Balance Adjustment')}
              </h2>
              <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                {tr('manualAdjustmentDesc', "Directly credit or debit a user's store wallet balance with an audit record.")}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              <div>
                <label className="block font-bold mb-1" style={{ color: 'var(--color-text)' }}>
                  {tr('selectCustomerLabel', 'Select Customer *')}
                </label>
                <select
                  value={adjustEmail}
                  onChange={(e) => setAdjustEmail(e.target.value)}
                  className="wallet-input w-full px-3 py-2 rounded-xl border font-bold outline-none cursor-pointer"
                  style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                >
                  <option value="">{tr('selectCustomerPlaceholder', '-- Choose Customer --')}</option>
                  {users.map(u => (
                    <option key={u.id} value={u.email}>{u.name} ({u.email}) - {activeCurrencySymbol}{Number(u.wallet_balance || 0).toFixed(2)}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold mb-1" style={{ color: 'var(--color-text)' }}>
                  {tr('adjustmentTypeLabel', 'Adjustment Action')}
                </label>
                <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl border" style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)' }}>
                  <button
                    type="button"
                    onClick={() => setAdjustType('credit')}
                    className="py-1 rounded-lg text-xs font-bold transition cursor-pointer"
                    style={adjustType === 'credit' ? { backgroundColor: 'var(--color-card)', color: 'var(--color-emerald, #10b981)', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' } : { color: 'var(--color-text-secondary)' }}
                  >
                    + Credit
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdjustType('debit')}
                    className="py-1 rounded-lg text-xs font-bold transition cursor-pointer"
                    style={adjustType === 'debit' ? { backgroundColor: 'var(--color-card)', color: '#ef4444', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' } : { color: 'var(--color-text-secondary)' }}
                  >
                    - Debit
                  </button>
                </div>
              </div>

              <div>
                <label className="block font-bold mb-1" style={{ color: 'var(--color-text)' }}>
                  {tr('adjustmentAmountLabel', 'Amount ({currency}) *').replace('{currency}', activeCurrencySymbol)}
                </label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  autoComplete="off"
                  data-lpignore="true"
                  data-1p-ignore="true"
                  data-form-type="other"
                  spellCheck={false}
                  value={adjustAmount}
                  onChange={(e) => setAdjustAmount(e.target.value)}
                  className="wallet-input w-full px-3 py-2 rounded-xl border font-mono font-bold outline-none"
                  style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                />
              </div>

              <div>
                <label className="block font-bold mb-1" style={{ color: 'var(--color-text)' }}>
                  {tr('adjustmentReasonLabel', 'Administrative Reason / Note *')}
                </label>
                <input
                  type="text"
                  autoComplete="off"
                  data-lpignore="true"
                  data-1p-ignore="true"
                  data-form-type="other"
                  spellCheck={false}
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  placeholder={tr('adjustmentReasonPlaceholder', 'e.g. Customer loyalty gift or refund settlement')}
                  className="wallet-input w-full px-3 py-2 rounded-xl border outline-none font-medium"
                  style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                />
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={handleApplyAdjustment}
                disabled={applyingAdjustment || !adjustEmail}
                className="px-5 py-2 text-white font-bold rounded-xl text-xs shadow-md transition hover:opacity-90 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                style={{ backgroundColor: 'var(--color-primary)' }}
              >
                <Check className={`h-3.5 w-3.5 ${applyingAdjustment ? 'animate-spin' : ''}`} />
                <span>{applyingAdjustment ? tr('applyingAdjustment', 'Applying Adjustment...') : tr('btnApplyAdjustment', 'Apply Balance Adjustment')}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
