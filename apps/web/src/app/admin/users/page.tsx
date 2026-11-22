// Generated / Updated by AI Collaborator - Production Build Ready
'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import Link from 'next/link';
import { 
  Shield, UserPlus, Trash2, Edit3, Mail, User as UserIcon, Lock, 
  Search, CheckCircle, AlertCircle, X, ShieldAlert, Check,
  ArrowUpDown, ArrowUp, ArrowDown, ChevronLeft, ChevronRight,
  Users, CreditCard, Zap, Sparkles, Download, RefreshCw
} from 'lucide-react';
import { getCurrentUser, initAuthStorage } from '@/lib/auth';
import { useTranslation } from '@/components/LanguageProvider';
import { applyThemeToDocument } from '@/lib/themeConfig';
import { 
  purgeLegacyBrowserAdminStorage, 
  fetchServerAdminSettings 
} from '@/lib/adminSync';

interface AppUser {
  id: string;
  name: string;
  email: string;
  password?: string;
  role: 'admin' | 'user';
  subscriptionPlan?: string;
  createdAt: string;
}

interface PlanOption {
  id: string;
  name: string;
  slug: string;
  priceFormatted: string;
  interval?: string;
  isFree?: boolean;
  priceDollars?: number;
}

type SortField = 'name' | 'createdAt' | 'subscriptionPlan';
type SortOrder = 'asc' | 'desc';

const ITEMS_PER_PAGE = 10;

const sanitizeSinglePlan = (planInput?: string): string => {
  if (!planInput) return 'taster';
  const raw = String(planInput).trim().toLowerCase();
  return raw.replace(/[^a-z0-9-]/g, '');
};

const calculateRenewalExpiry = (startDate: Date = new Date(), interval?: string): string => {
  const d = new Date(startDate);
  const isYear = interval && (interval.toUpperCase().includes('YEAR') || interval.toUpperCase() === 'YEAR');
  if (isYear) {
    d.setFullYear(d.getFullYear() + 1);
  } else {
    d.setMonth(d.getMonth() + 1);
  }
  return d.toISOString();
};

export default function AdminUserManagementPage() {
  const langContext = useTranslation();
  const t = langContext?.t;
  const locale = langContext?.locale;

  const tr = useCallback((key: string, fallback: string): string => {
    if (typeof t === 'function') {
      const val = t(key);
      if (val && val !== key) return val;
    }
    return fallback;
  }, [t]);

  const [currentUser, setCurrentUser] = useState<any | null>(null);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [availablePlans, setAvailablePlans] = useState<PlanOption[]>([]);
  const [search, setSearch] = useState('');
  const [feedbackMsg, setFeedbackMsg] = useState('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const isFetchingUsersRef = useRef(false);
  const isFetchingPlansRef = useRef(false);

  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [adminSortField, setAdminSortField] = useState<SortField>('createdAt');
  const [adminSortOrder, setAdminSortOrder] = useState<SortOrder>('desc');
  const [adminCurrentPage, setAdminCurrentPage] = useState(1);

  const [userSortField, setUserSortField] = useState<SortField>('createdAt');
  const [userSortOrder, setUserSortOrder] = useState<SortOrder>('desc');
  const [userCurrentPage, setUserCurrentPage] = useState(1);

  // Modals state
  const [showAddModal, setShowAddModal] = useState(false);
  const [addName, setAddName] = useState('');
  const [addEmail, setAddEmail] = useState('');
  const [addPassword, setAddPassword] = useState('');
  const [addRole, setAddRole] = useState<'admin' | 'user'>('user');
  const [addSubscriptionPlan, setAddSubscriptionPlan] = useState<string>('taster');
  const [addError, setAddError] = useState('');

  const [showEditModal, setShowEditModal] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editRole, setEditRole] = useState<'admin' | 'user'>('user');
  const [editSubscriptionPlan, setEditSubscriptionPlan] = useState<string>('taster');
  const [editError, setEditError] = useState('');

  const isFirstAdminUser = useCallback((targetUser: AppUser | null | undefined): boolean => {
    if (!targetUser) return false;
    return targetUser.id === 'usr_admin_1' || targetUser.email?.toLowerCase() === 'admin@zecratary.com';
  }, []);

  const isEditingFirstAdmin = useMemo(() => {
    const target = users.find((u) => u.id === editingUserId);
    return isFirstAdminUser(target);
  }, [editingUserId, users, isFirstAdminUser]);

  const syncTheme = useCallback(() => {
    try {
      const stored = typeof window !== 'undefined'
        ? (localStorage.getItem('zecratary_theme_colors') || localStorage.getItem('zecratary_theme_config'))
        : null;
      if (stored) {
        applyThemeToDocument(JSON.parse(stored));
      } else {
        applyThemeToDocument(null);
      }
    } catch (_) {}
  }, []);

  useEffect(() => {
    syncTheme();
    window.addEventListener('zecratary_theme_mode_changed', syncTheme);
    window.addEventListener('zecratary_theme_changed', syncTheme);
    window.addEventListener('zecratary_theme_updated', syncTheme);
    return () => {
      window.removeEventListener('zecratary_theme_mode_changed', syncTheme);
      window.removeEventListener('zecratary_theme_changed', syncTheme);
      window.removeEventListener('zecratary_theme_updated', syncTheme);
    };
  }, [syncTheme]);

  // Dynamically sync plans from /admin/plans and server settings
  const loadPlans = useCallback(async () => {
    if (isFetchingPlansRef.current) return;
    isFetchingPlansRef.current = true;
    let parsedPlans: PlanOption[] = [];
    try {
      const serverSettings = await fetchServerAdminSettings();
      const rawPlans = serverSettings?.subscriptionPlans || [];
      if (Array.isArray(rawPlans) && rawPlans.length > 0) {
        rawPlans.forEach((cfg: any) => {
          const isFree = cfg.isFree || (Number(cfg.monthlyPriceDollars) === 0 && Number(cfg.annualPriceDollars) === 0) || cfg.price === 0;
          const cleanBase = (cfg.slug || cfg.id || cfg.name || 'plan').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-(monthly|annual|free)$/i, '');

          if (isFree) {
            parsedPlans.push({
              id: cfg.id || cleanBase,
              name: `${cfg.name || 'Taster'} (Free)`,
              slug: cleanBase,
              priceFormatted: 'Free',
              isFree: true,
              priceDollars: 0
            });
          } else {
            if (cfg.monthlyPriceDollars !== undefined && Number(cfg.monthlyPriceDollars) > 0) {
              const mPrice = Number(cfg.monthlyPriceDollars);
              parsedPlans.push({
                id: `${cleanBase}-monthly`,
                name: `${cfg.name || 'Plan'} (Monthly)`,
                slug: `${cleanBase}-monthly`,
                priceFormatted: `$${mPrice.toFixed(2)}/mo`,
                interval: 'MONTH',
                isFree: false,
                priceDollars: mPrice
              });
            }
            if (cfg.annualPriceDollars !== undefined && Number(cfg.annualPriceDollars) > 0) {
              const aPrice = Number(cfg.annualPriceDollars);
              parsedPlans.push({
                id: `${cleanBase}-annual`,
                name: `${cfg.name || 'Plan'} (Annual)`,
                slug: `${cleanBase}-annual`,
                priceFormatted: `$${aPrice.toFixed(2)}/yr`,
                interval: 'YEAR',
                isFree: false,
                priceDollars: aPrice
              });
            }
          }
        });
      }
    } catch (_) {}

    if (parsedPlans.length === 0) {
      try {
        const res = await fetch('/api/admin/plans', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          const list = Array.isArray(data) ? data : (data?.plans || data?.packages || data?.configs);
          if (Array.isArray(list) && list.length > 0) {
            list.forEach((p: any) => {
              const isFree = p.isFree || (Number(p.monthlyPriceDollars) === 0 && Number(p.annualPriceDollars) === 0);
              const cleanBase = (p.slug || p.id || p.name || 'plan').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-(monthly|annual|free)$/i, '');
              if (isFree) {
                parsedPlans.push({ id: p.id || cleanBase, name: `${p.name} (Free)`, slug: cleanBase, priceFormatted: 'Free', isFree: true, priceDollars: 0 });
              } else {
                if (p.monthlyPriceDollars) {
                  parsedPlans.push({ id: `${cleanBase}-monthly`, name: `${p.name} (Monthly)`, slug: `${cleanBase}-monthly`, priceFormatted: `$${Number(p.monthlyPriceDollars).toFixed(2)}/mo`, interval: 'MONTH', isFree: false, priceDollars: Number(p.monthlyPriceDollars) });
                }
                if (p.annualPriceDollars) {
                  parsedPlans.push({ id: `${cleanBase}-annual`, name: `${p.name} (Annual)`, slug: `${cleanBase}-annual`, priceFormatted: `$${Number(p.annualPriceDollars).toFixed(2)}/yr`, interval: 'YEAR', isFree: false, priceDollars: Number(p.annualPriceDollars) });
                }
              }
            });
          }
        }
      } catch (_) {}
    }

    if (parsedPlans.length === 0) {
      parsedPlans = [
        { id: 'taster', name: 'Taster (Free)', slug: 'taster', priceFormatted: 'Free', isFree: true, priceDollars: 0 },
        { id: 'nutrition-pro-monthly', name: 'Nutrition Pro (Monthly)', slug: 'nutrition-pro-monthly', priceFormatted: '$8.99/mo', interval: 'MONTH', isFree: false, priceDollars: 8.99 },
        { id: 'nutrition-pro-annual', name: 'Nutrition Pro (Annual)', slug: 'nutrition-pro-annual', priceFormatted: '$59.99/yr', interval: 'YEAR', isFree: false, priceDollars: 59.99 },
      ];
    }

    const freshPlans = parsedPlans;
    setAvailablePlans(prev => JSON.stringify(prev) === JSON.stringify(freshPlans) ? prev : freshPlans);
    isFetchingPlansRef.current = false;
  }, []);

  const loadUsers = useCallback(async () => {
    if (isFetchingUsersRef.current) return;
    isFetchingUsersRef.current = true;
    setIsLoading(true);
    purgeLegacyBrowserAdminStorage();
    try {
      const res = await fetch('/api/admin/users?t=' + Date.now(), { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.users)) {
          let list: AppUser[] = [...data.users];
          const hasRootAdmin = list.some(u => u.id === 'usr_admin_1' || u.email?.toLowerCase() === 'admin@zecratary.com');
          if (!hasRootAdmin) {
            const rootAdmin: AppUser = {
              id: 'usr_admin_1',
              name: 'System Administrator',
              email: 'admin@zecratary.com',
              role: 'admin',
              subscriptionPlan: 'nutrition-pro-annual',
              createdAt: '2026-01-01T00:00:00.000Z'
            };
            list.unshift(rootAdmin);
            await fetch('/api/admin/users?t=' + Date.now(), { 
              method: 'POST', 
              headers: { 'Content-Type': 'application/json' }, 
              body: JSON.stringify(rootAdmin) 
            }).catch(() => {});
          }
          const freshList = list;
          setUsers(prev => JSON.stringify(prev) === JSON.stringify(freshList) ? prev : freshList);
          return;
        }
      }
    } catch (err) {
      console.error('Failed to load users:', err);
    } finally {
      setIsLoading(false);
      isFetchingUsersRef.current = false;
    }
  }, []);

  useEffect(() => {
    document.title = tr('admin.users.docTitle', 'User Management - Admin Console');
  }, [tr]);

  useEffect(() => {
    initAuthStorage();
    const u = getCurrentUser();
    setCurrentUser(u);
    loadUsers();
    loadPlans();

    let debounceTimer: NodeJS.Timeout | null = null;
    const handleSync = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        loadUsers();
        loadPlans();
      }, 300);
    };

    window.addEventListener('zecratary_users_updated', handleSync);
    window.addEventListener('zecratary_plans_updated', handleSync);
    window.addEventListener('zecratary_payment_updated', handleSync);
    window.addEventListener('zecratary_admin_settings_updated', handleSync);

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      window.removeEventListener('zecratary_users_updated', handleSync);
      window.removeEventListener('zecratary_plans_updated', handleSync);
      window.removeEventListener('zecratary_payment_updated', handleSync);
      window.removeEventListener('zecratary_admin_settings_updated', handleSync);
    };
  }, [loadUsers, loadPlans]);

  const showToast = (msg: string) => {
    setFeedbackMsg(msg);
    setTimeout(() => setFeedbackMsg(''), 3500);
  };

  const toggleSelectUser = (id: string) => {
    setSelectedUserIds(prev => prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]);
  };

  const handleExportSelected = (format: 'csv' | 'json' = 'csv') => {
    const selectedUsers = users.filter(u => selectedUserIds.includes(u.id));
    if (selectedUsers.length === 0) {
      showToast(tr('admin.users.selectUsersPrompt', 'Please select at least one user to export.'));
      return;
    }
    const timestamp = new Date().toISOString().split('T')[0];
    if (format === 'json') {
      const exportData = selectedUsers.map(({ password, ...rest }) => rest);
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `users_export_${timestamp}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showToast(`${tr('admin.users.exportedJson', 'Exported')} ${selectedUsers.length} ${tr('admin.users.usersCountJson', 'selected user(s) to JSON!')}`);
    } else {
      const headers = [
        tr('admin.users.colEmail', 'ID'), 
        tr('admin.users.labelFullName', 'Name'), 
        tr('admin.users.colEmail', 'Email Address'), 
        tr('admin.users.colRole', 'Role'), 
        tr('admin.users.colSubscriptionType', 'Subscription Plan'), 
        tr('admin.users.colCreatedDate', 'Created At')
      ];
      const rows = selectedUsers.map(u => [
        `"${(u.id || '').replace(/"/g, '""')}"`,
        `"${(u.name || '').replace(/"/g, '""')}"`,
        `"${(u.email || '').replace(/"/g, '""')}"`,
        `"${(u.role || '').replace(/"/g, '""')}"`,
        `"${(u.subscriptionPlan || '').replace(/"/g, '""')}"`,
        `"${(u.createdAt || '').replace(/"/g, '""')}"`
      ]);
      const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `users_export_${timestamp}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showToast(`${tr('admin.users.exportedCsv', 'Exported')} ${selectedUsers.length} ${tr('admin.users.usersCountCsv', 'selected user(s) to CSV!')}`);
    }
  };

  const handleAdminSort = (field: SortField) => {
    if (adminSortField === field) setAdminSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    else { setAdminSortField(field); setAdminSortOrder('asc'); }
  };

  const handleUserSort = (field: SortField) => {
    if (userSortField === field) setUserSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    else { setUserSortField(field); setUserSortOrder('asc'); }
  };

  const processedAdmins = useMemo(() => {
    const admins = users.filter(u => (u.role || '').toLowerCase() === 'admin');
    const filtered = admins.filter(u =>
      !search.trim() ||
      (u.name || '').toLowerCase().includes(search.toLowerCase().trim()) ||
      (u.email || '').toLowerCase().includes(search.toLowerCase().trim()) ||
      (u.subscriptionPlan && u.subscriptionPlan.toLowerCase().includes(search.toLowerCase().trim()))
    );
    return filtered.sort((a, b) => {
      let comparison = 0;
      if (adminSortField === 'name') comparison = (a.name || '').localeCompare(b.name || '');
      else if (adminSortField === 'subscriptionPlan') comparison = (a.subscriptionPlan || '').localeCompare(b.subscriptionPlan || '');
      else if (adminSortField === 'createdAt') comparison = (a.createdAt ? new Date(a.createdAt).getTime() : 0) - (b.createdAt ? new Date(b.createdAt).getTime() : 0);
      return adminSortOrder === 'asc' ? comparison : -comparison;
    });
  }, [users, search, adminSortField, adminSortOrder]);

  const processedStandardUsers = useMemo(() => {
    const standardUsers = users.filter(u => (u.role || '').toLowerCase() !== 'admin');
    const filtered = standardUsers.filter(u =>
      !search.trim() ||
      (u.name || '').toLowerCase().includes(search.toLowerCase().trim()) ||
      (u.email || '').toLowerCase().includes(search.toLowerCase().trim()) ||
      (u.subscriptionPlan && u.subscriptionPlan.toLowerCase().includes(search.toLowerCase().trim()))
    );
    return filtered.sort((a, b) => {
      let comparison = 0;
      if (userSortField === 'name') comparison = (a.name || '').localeCompare(b.name || '');
      else if (userSortField === 'subscriptionPlan') comparison = (a.subscriptionPlan || '').localeCompare(b.subscriptionPlan || '');
      else if (userSortField === 'createdAt') comparison = (a.createdAt ? new Date(a.createdAt).getTime() : 0) - (b.createdAt ? new Date(b.createdAt).getTime() : 0);
      return userSortOrder === 'asc' ? comparison : -comparison;
    });
  }, [users, search, userSortField, userSortOrder]);

  const adminTotalPages = Math.max(1, Math.ceil(processedAdmins.length / ITEMS_PER_PAGE));
  const adminStartIndex = (adminCurrentPage - 1) * ITEMS_PER_PAGE;
  const adminEndIndex = Math.min(adminStartIndex + ITEMS_PER_PAGE, processedAdmins.length);
  const paginatedAdmins = processedAdmins.slice(adminStartIndex, adminEndIndex);

  const userTotalPages = Math.max(1, Math.ceil(processedStandardUsers.length / ITEMS_PER_PAGE));
  const userStartIndex = (userCurrentPage - 1) * ITEMS_PER_PAGE;
  const userEndIndex = Math.min(userStartIndex + ITEMS_PER_PAGE, processedStandardUsers.length);
  const paginatedStandardUsers = processedStandardUsers.slice(userStartIndex, userEndIndex);

  const isAllAdminsOnPageSelected = paginatedAdmins.length > 0 && paginatedAdmins.every(u => selectedUserIds.includes(u.id));
  const handleToggleSelectAllAdmins = () => {
    const pageAdminIds = paginatedAdmins.map(u => u.id);
    if (isAllAdminsOnPageSelected) setSelectedUserIds(prev => prev.filter(id => !pageAdminIds.includes(id)));
    else setSelectedUserIds(prev => Array.from(new Set([...prev, ...pageAdminIds])));
  };

  const isAllStandardOnPageSelected = paginatedStandardUsers.length > 0 && paginatedStandardUsers.every(u => selectedUserIds.includes(u.id));
  const handleToggleSelectAllStandardUsers = () => {
    const pageUserIds = paginatedStandardUsers.map(u => u.id);
    if (isAllStandardOnPageSelected) setSelectedUserIds(prev => prev.filter(id => !pageUserIds.includes(id)));
    else setSelectedUserIds(prev => Array.from(new Set([...prev, ...pageUserIds])));
  };

  const syncUserPlanWithPaymentLedger = async (email: string, planSlug: string, planName: string, priceDollars: number, interval?: string) => {
    const cleanEmail = email.toLowerCase().trim();
    const isFree = !planSlug || planSlug === 'taster' || planSlug === 'free' || priceDollars === 0;
    const targetSlug = isFree ? 'taster' : sanitizeSinglePlan(planSlug);

    try {
      const txRes = await fetch('/api/admin/payment', { cache: 'no-store' });
      if (txRes.ok) {
        const txData = await txRes.json();
        const existingList: any[] = Array.isArray(txData.transactions) ? txData.transactions : [];
        const userActiveTxs = existingList.filter((tx: any) => {
          const em = (tx.customerEmail || tx.customer_email || '').toLowerCase().trim();
          const st = (tx.status || '').toLowerCase();
          return em === cleanEmail && (st === 'succeeded' || st === 'paid' || st === 'active');
        });

        for (const oldTx of userActiveTxs) {
          const cancelledTx = {
            ...oldTx,
            status: 'refunded',
            expiryDate: new Date().toISOString()
          };
          await fetch('/api/admin/payment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'update_transaction', transaction: cancelledTx })
          }).catch(() => {});
        }
      }

      if (!isFree) {
        const newExpiryDate = calculateRenewalExpiry(new Date(), interval);
        const newTx = {
          id: 'tx_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 5),
          customerName: email.split('@')[0],
          customerEmail: cleanEmail,
          planName: `${planName} (${interval === 'YEAR' ? 'Annual' : 'Monthly'})`,
          planSlug: targetSlug,
          amount: priceDollars || 0,
          currency: 'USD',
          gateway: 'stripe',
          status: 'succeeded',
          testMode: true,
          createdAt: new Date().toISOString(),
          expiryDate: newExpiryDate
        };

        await fetch('/api/admin/payment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'add_transaction', transaction: newTx })
        }).catch(() => {});
      }
    } catch (_) {}
  };

  const handleOpenAddModal = (presetRole: 'admin' | 'user' = 'user') => {
    setAddName('');
    setAddEmail('');
    setAddPassword('');
    setAddRole(presetRole);
    const defaultPlan = availablePlans[0]?.slug || 'taster';
    setAddSubscriptionPlan(defaultPlan);
    setAddError('');
    setShowAddModal(true);
  };

  const handleAddUserSubmit = async () => {
    setAddError('');
    const cleanEmail = addEmail.trim().toLowerCase();
    const cleanName = addName.trim();

    if (!cleanName || !cleanEmail) {
      setAddError(tr('admin.users.fillRequired', 'Please fill in all required fields.'));
      return;
    }

    if (users.some(u => u && u.email && u.email.toLowerCase() === cleanEmail)) {
      setAddError(tr('admin.users.emailExists', 'A user with this email address already exists.'));
      return;
    }

    if (addPassword.length < 8) {
      setAddError(tr('admin.users.passwordLength', 'Password must be at least 8 characters long.'));
      return;
    }

    const assignedPlan = addSubscriptionPlan || 'taster';
    const matchedPlanObj = availablePlans.find(p => p.slug === assignedPlan || p.id === assignedPlan);
    const planName = matchedPlanObj?.name || assignedPlan;
    const priceDollars = matchedPlanObj?.priceDollars || 0;
    const interval = matchedPlanObj?.interval || 'MONTH';

    const newUser: AppUser = {
      id: 'usr_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6),
      name: cleanName,
      email: cleanEmail,
      password: addPassword,
      role: addRole,
      subscriptionPlan: assignedPlan,
      createdAt: new Date().toISOString()
    };

    try {
      await syncUserPlanWithPaymentLedger(cleanEmail, assignedPlan, planName, priceDollars, interval);

      const res = await fetch('/api/admin/users?t=' + Date.now(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newUser),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Server error creating user');
      }

      const data = await res.json();
      if (data.users && Array.isArray(data.users)) {
        const freshList = data.users;
        setUsers(prev => JSON.stringify(prev) === JSON.stringify(freshList) ? prev : freshList);
      } else {
        setUsers(prev => [newUser, ...prev.filter(u => u.email.toLowerCase() !== cleanEmail)]);
      }

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('zecratary_users_updated'));
        window.dispatchEvent(new Event('zecratary_payment_updated'));
      }

      setShowAddModal(false);
      showToast(`${tr('admin.users.userDeletedPrefix', 'User')} "${newUser.name}" ${tr('admin.users.userCreatedSuccess', 'created successfully with plan')} "${planName}"!`);
    } catch (err: any) {
      setAddError(err.message || 'Failed to persist new user');
    }
  };

  const handleOpenEditModal = (user: AppUser) => {
    setEditingUserId(user.id);
    setEditName(user.name);
    setEditEmail(user.email);
    setEditPassword(user.password || '');
    setEditRole(user.role);
    setEditSubscriptionPlan(user.subscriptionPlan || 'taster');
    setEditError('');
    setShowEditModal(true);
  };

  const handleEditUserSubmit = async () => {
    if (!editingUserId) return;
    setEditError('');

    const cleanEmail = editEmail.trim().toLowerCase();
    const cleanName = editName.trim();

    if (!cleanName || !cleanEmail) {
      setEditError(tr('admin.users.nameEmailEmpty', 'Name and Email cannot be empty.'));
      return;
    }

    const emailTaken = users.some(u => u.id !== editingUserId && u.email && u.email.toLowerCase() === cleanEmail);
    if (emailTaken) {
      setEditError(tr('admin.users.emailTaken', 'Another user is already registered with this email.'));
      return;
    }

    const targetUser = users.find(u => u.id === editingUserId);
    const isFirstAdmin = isFirstAdminUser(targetUser);
    const finalRole: 'admin' | 'user' = isFirstAdmin ? 'admin' : editRole;
    const assignedPlan = editSubscriptionPlan || 'taster';

    const matchedPlanObj = availablePlans.find(p => p.slug === assignedPlan || p.id === assignedPlan);
    const planName = matchedPlanObj?.name || assignedPlan;
    const priceDollars = matchedPlanObj?.priceDollars || 0;
    const interval = matchedPlanObj?.interval || 'MONTH';

    const updatedUser: AppUser = {
      id: editingUserId,
      name: cleanName,
      email: cleanEmail,
      password: editPassword ? editPassword : targetUser?.password,
      role: finalRole,
      subscriptionPlan: assignedPlan,
      createdAt: targetUser?.createdAt || new Date().toISOString()
    };

    try {
      await syncUserPlanWithPaymentLedger(cleanEmail, assignedPlan, planName, priceDollars, interval);

      const res = await fetch('/api/admin/users?t=' + Date.now(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedUser),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Server error updating user');
      }

      const data = await res.json();
      if (data.users && Array.isArray(data.users)) {
        const freshList = data.users;
        setUsers(prev => JSON.stringify(prev) === JSON.stringify(freshList) ? prev : freshList);
      } else {
        setUsers(prev => prev.map(u => u.id === editingUserId ? updatedUser : u));
      }

      if (currentUser?.id === editingUserId) {
        setCurrentUser({ ...currentUser, name: cleanName, email: cleanEmail, role: finalRole, subscriptionPlan: assignedPlan });
      }

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('zecratary_users_updated'));
        window.dispatchEvent(new Event('zecratary_payment_updated'));
      }

      setShowEditModal(false);
      showToast(`${tr('admin.users.userDeletedPrefix', 'User')} "${cleanName}" ${tr('admin.users.userUpdatedSuccess', 'updated successfully with plan')} "${planName}"!`);
    } catch (err: any) {
      setEditError(err.message || 'Failed to update user');
    }
  };

  const handleDeleteUser = async (id: string, userEmail: string, userName?: string) => {
    const targetUser = users.find((u) => u.id === id || (u.email && u.email.toLowerCase() === userEmail.toLowerCase()));
    if (currentUser?.email?.toLowerCase() === userEmail.toLowerCase() || currentUser?.id === id) {
      alert(tr('admin.users.cannotDeleteSelf', 'You cannot delete your own active admin account.'));
      return;
    }
    if (isFirstAdminUser(targetUser)) {
      alert(tr('admin.users.cannotDeletePrimary', 'The primary system administrator account cannot be deleted.'));
      return;
    }

    const displayName = userName || targetUser?.name || userEmail;
    const confirmPrompt = `${tr('admin.users.deleteConfirmPrompt', 'Are you sure you want to delete')} "${displayName}" (${userEmail})? ${tr('admin.users.actionUndone', 'This action cannot be undone.')}`;
    if (!confirm(confirmPrompt)) return;

    try {
      const cleanEmail = userEmail.toLowerCase().trim();
      const queryParams = new URLSearchParams();
      if (id) queryParams.set('id', id);
      if (cleanEmail) queryParams.set('email', cleanEmail);

      const res = await fetch(`/api/admin/users?${queryParams.toString()}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, email: cleanEmail }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Server error deleting user');
      }

      const resData = await res.json().catch(() => null);
      if (resData?.users && Array.isArray(resData.users)) {
        setUsers(resData.users);
      } else {
        setUsers((prev) => prev.filter((u) => u.id !== id && (!u.email || u.email.toLowerCase() !== cleanEmail)));
      }

      setSelectedUserIds((prev) => prev.filter((uid) => uid !== id));

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('zecratary_users_updated'));
      }

      showToast(`${tr('admin.users.userDeletedPrefix', 'User')} "${displayName}" ${tr('admin.users.userDeletedSuffix', 'has been deleted.')}`);
    } catch (err: any) {
      console.error('Failed to delete user:', err);
      showToast(tr('admin.users.deleteFail', 'Failed to delete user: ') + (err?.message || 'Server error'));
    }
  };

  const renderSortIcon = (currentField: SortField, targetField: SortField, order: SortOrder) => {
    if (currentField !== targetField) return <ArrowUpDown className="h-3.5 w-3.5 opacity-60" style={{ color: 'var(--color-text-secondary)' }} />;
    return order === 'asc' ? <ArrowUp className="h-3.5 w-3.5 stroke-[2.5]" style={{ color: 'var(--color-primary)' }} /> : <ArrowDown className="h-3.5 w-3.5 stroke-[2.5]" style={{ color: 'var(--color-primary)' }} />;
  };

  const getPlanBadge = (planKey?: string) => {
    const isFreePlan = !planKey || planKey === 'taster' || planKey.includes('free');
    if (isFreePlan) {
      return { label: 'Taster (Free)', bg: 'var(--color-inner-dark)', border: 'var(--color-emerald)', color: 'var(--color-emerald)', icon: Sparkles };
    }
    const matched = availablePlans.find(p => p.slug === planKey || p.id === planKey || p.slug.toLowerCase() === planKey?.toLowerCase());
    if (matched) {
      if (matched.isFree || planKey === 'taster') {
        return { label: matched.name, bg: 'var(--color-inner-dark)', border: 'var(--color-emerald)', color: 'var(--color-emerald)', icon: Sparkles };
      }
      if (matched.interval === 'YEAR' || planKey.includes('annual')) {
        return { label: matched.name, bg: 'var(--color-inner-dark)', border: '#3b82f6', color: '#60a5fa', icon: Zap };
      }
      return { label: matched.name, bg: 'var(--color-inner-dark)', border: 'var(--color-primary)', color: 'var(--color-primary)', icon: Zap };
    }
    const formatted = (planKey || '').split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    return { label: formatted, bg: 'var(--color-inner-dark)', border: '#a855f7', color: '#c084fc', icon: CreditCard };
  };

  return (
    <div 
      className="w-full max-w-full space-y-6 pb-24 px-4 sm:px-6 lg:px-8 xl:px-10 pt-2 font-sans transition-colors duration-200" 
      style={{ color: 'var(--color-text)' }}
    >
      {/* ACCESS WARNING FOR NON-ADMINS */}
      {currentUser && currentUser.role !== 'admin' && (
        <div 
          className="rounded-2xl p-4 flex items-center justify-between text-xs border shadow-xs" 
          style={{ 
            backgroundColor: 'var(--color-inner-dark)', 
            borderColor: 'rgba(217, 119, 6, 0.4)', 
            color: '#fde68a' 
          }}
        >
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-amber-500 shrink-0" />
            <span>
              {tr('admin.users.signedInAs', 'Signed in as')} <strong>{currentUser.email}</strong>. {tr('admin.users.switchNotice', 'Switch to an admin account to manage user subscription permissions.')}
            </span>
          </div>
          <button 
            type="button"
            onClick={() => window.location.href = '/login'} 
            className="px-3.5 py-1.5 text-white font-bold rounded-xl shrink-0 ml-3 cursor-pointer shadow-xs hover:opacity-90 transition" 
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            {tr('admin.users.switchToAdmin', 'Switch to Admin')}
          </button>
        </div>
      )}

      {/* FEEDBACK TOAST */}
      {feedbackMsg && (
        <div 
          className="p-3.5 rounded-2xl text-xs font-semibold flex items-center gap-2 shadow-lg animate-in fade-in border" 
          style={{ 
            backgroundColor: 'var(--color-inner-dark)', 
            borderColor: 'var(--color-emerald)', 
            color: 'var(--color-emerald)' 
          }}
        >
          <CheckCircle className="h-4 w-4 shrink-0" style={{ color: 'var(--color-emerald)' }} />
          <span>{feedbackMsg}</span>
        </div>
      )}

      {/* PAGE HEADER */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-black tracking-tight text-[var(--color-primary)]">
            {tr('admin.users.title', 'User & Subscription Management')}
          </h1>
          <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
            {tr('admin.users.subtitle', 'Active System Packages synced:')} {availablePlans.length} {tr('admin.users.plansAvailable', 'plans available from /admin/plans and synchronized with /admin/payment')}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button 
            type="button" 
            onClick={loadUsers} 
            disabled={isLoading} 
            className="border font-bold text-xs px-3.5 py-2.5 rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50" 
            style={{ 
              backgroundColor: 'var(--color-card)', 
              borderColor: 'var(--color-border)', 
              color: 'var(--color-text)' 
            }}
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} style={{ color: 'var(--color-primary)' }} />
            <span>{tr('admin.users.reload', 'Reload')}</span>
          </button>

          <button 
            type="button" 
            onClick={() => handleExportSelected('csv')} 
            disabled={selectedUserIds.length === 0} 
            className="border font-bold text-xs px-3.5 py-2.5 rounded-xl transition flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-xs" 
            style={{ 
              backgroundColor: 'var(--color-card)', 
              borderColor: selectedUserIds.length > 0 ? 'var(--color-primary)' : 'var(--color-border)', 
              color: selectedUserIds.length > 0 ? 'var(--color-primary)' : 'var(--color-text-secondary)' 
            }}
          >
            <Download className="h-4 w-4" />
            <span>{tr('admin.users.exportCsv', 'Export CSV')} {selectedUserIds.length > 0 ? `(${selectedUserIds.length})` : ''}</span>
          </button>

          <button 
            type="button" 
            onClick={() => handleExportSelected('json')} 
            disabled={selectedUserIds.length === 0} 
            className="border font-bold text-xs px-3.5 py-2.5 rounded-xl transition flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-xs" 
            style={{ 
              backgroundColor: 'var(--color-card)', 
              borderColor: 'var(--color-border)', 
              color: 'var(--color-text-secondary)' 
            }}
          >
            <Download className="h-4 w-4" />
            <span>{tr('admin.users.exportJson', 'Export JSON')}</span>
          </button>

          <button 
            type="button"
            onClick={() => handleOpenAddModal('user')} 
            className="text-white font-bold text-xs px-4 py-2.5 rounded-xl transition flex items-center gap-2 shadow-lg cursor-pointer hover:opacity-90" 
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            <UserPlus className="h-4 w-4" /> {tr('admin.users.addNewUser', 'Add New User')}
          </button>
        </div>
      </div>

      {/* SELECTION BAR */}
      {selectedUserIds.length > 0 && (
        <div 
          className="p-3.5 px-5 rounded-2xl flex items-center justify-between text-xs border shadow-lg animate-in fade-in"
          style={{
            backgroundColor: 'var(--color-inner-dark)',
            borderColor: 'var(--color-primary)',
            color: 'var(--color-text)'
          }}
        >
          <div className="flex items-center gap-3">
            <span className="font-bold">
              {selectedUserIds.length} {tr('admin.users.of', 'of')} {users.length} {tr('admin.users.usersSelected', 'user(s) selected')}
            </span>
            <button 
              type="button"
              onClick={() => setSelectedUserIds([])}
              className="text-[11px] underline cursor-pointer hover:opacity-80"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              {tr('admin.users.clearSelection', 'Clear selection')}
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleExportSelected('csv')}
              className="px-3.5 py-1.5 rounded-xl text-white font-bold flex items-center gap-1.5 cursor-pointer transition shadow-xs text-xs hover:opacity-90"
              style={{ backgroundColor: 'var(--color-primary)' }}
            >
              <Download className="h-3.5 w-3.5" /> {tr('admin.users.exportSelectedCsv', 'Export Selected (CSV)')}
            </button>
            <button
              type="button"
              onClick={() => handleExportSelected('json')}
              className="px-3.5 py-1.5 rounded-xl font-bold border transition shadow-xs text-xs cursor-pointer hover:opacity-85"
              style={{
                backgroundColor: 'var(--color-card)',
                borderColor: 'var(--color-border)',
                color: 'var(--color-text)'
              }}
            >
              <Download className="h-3.5 w-3.5" /> JSON
            </button>
          </div>
        </div>
      )}

      {/* SEARCH BAR */}
      <div className="relative">
        <Search className="h-4 w-4 absolute left-4 top-3.5 pointer-events-none" style={{ color: 'var(--color-text-secondary)' }} />
        <input
          type="text"
          data-lpignore="true"
          data-form-type="other"
          autoComplete="off"
          spellCheck={false}
          placeholder={tr('admin.users.searchPlaceholder', 'Search by name, email, or subscription plan across all tables...')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full border rounded-2xl pl-11 pr-4 py-3 text-sm outline-none transition shadow-inner font-medium"
          style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
          onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--color-primary)')}
          onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--color-border)')}
        />
      </div>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* 1. ADMINISTRATORS TABLE */}
      {/* ───────────────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <div 
              className="w-8 h-8 rounded-xl border flex items-center justify-center" 
              style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-emerald)', color: 'var(--color-emerald)' }}
            >
              <Shield className="h-4 w-4" />
            </div>
            <h2 className="text-lg font-black flex items-center gap-2" style={{ color: 'var(--color-text)' }}>
              {tr('admin.users.administrators', 'Administrators')}
              <span 
                className="text-xs border font-bold px-2 py-0.5 rounded-full" 
                style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-emerald)', color: 'var(--color-emerald)' }}
              >
                {processedAdmins.length}
              </span>
            </h2>
          </div>
          <button 
            type="button"
            onClick={() => handleOpenAddModal('admin')} 
            className="text-xs font-bold transition flex items-center gap-1 cursor-pointer hover:underline" 
            style={{ color: 'var(--color-emerald)' }}
          >
            <UserPlus className="h-3.5 w-3.5" /> {tr('admin.users.addAdmin', 'Add Admin')}
          </button>
        </div>

        <div className="border rounded-3xl overflow-hidden shadow-xl transition-colors" style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }}>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b uppercase font-bold text-[10px] tracking-wider" style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}>
                <tr>
                  <th className="w-10 px-4 py-4 text-center">
                    <input 
                      type="checkbox" 
                      checked={isAllAdminsOnPageSelected} 
                      onChange={handleToggleSelectAllAdmins} 
                      className="rounded cursor-pointer accent-[#E05638]" 
                      title={tr('admin.users.selectAllAdmins', 'Select all administrators on this page')}
                    />
                  </th>
                  <th className="px-5 py-4">
                    <button type="button" onClick={() => handleAdminSort('name')} className="flex items-center gap-1.5 hover:opacity-80 transition cursor-pointer select-none font-bold uppercase tracking-wider" style={{ color: 'var(--color-text)' }}>
                      <span>{tr('admin.users.colAdminUser', 'Admin User')}</span>
                      {renderSortIcon(adminSortField, 'name', adminSortOrder)}
                    </button>
                  </th>
                  <th className="px-5 py-4">{tr('admin.users.colEmail', 'Email Address')}</th>
                  <th className="px-5 py-4">{tr('admin.users.colRole', 'Role')}</th>
                  <th className="px-5 py-4">
                    <button type="button" onClick={() => handleAdminSort('subscriptionPlan')} className="flex items-center gap-1.5 hover:opacity-80 transition cursor-pointer select-none font-bold uppercase tracking-wider" style={{ color: 'var(--color-text)' }}>
                      <span>{tr('admin.users.colSubscriptionType', 'Subscription Type')}</span>
                      {renderSortIcon(adminSortField, 'subscriptionPlan', adminSortOrder)}
                    </button>
                  </th>
                  <th className="px-5 py-4">
                    <button type="button" onClick={() => handleAdminSort('createdAt')} className="flex items-center gap-1.5 hover:opacity-80 transition cursor-pointer select-none font-bold uppercase tracking-wider" style={{ color: 'var(--color-text)' }}>
                      <span>{tr('admin.users.colCreatedDate', 'Created Date')}</span>
                      {renderSortIcon(adminSortField, 'createdAt', adminSortOrder)}
                    </button>
                  </th>
                  <th className="px-5 py-4 text-right">{tr('admin.users.colActions', 'Actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}>
                {paginatedAdmins.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-10" style={{ color: 'var(--color-text-secondary)' }}>
                      {tr('admin.users.noAdminsFound', 'No administrators found')} {search ? `${tr('admin.users.matching', 'matching')} "${search}"` : ''}.
                    </td>
                  </tr>
                ) : (
                  paginatedAdmins.map((user) => {
                    const isCurrent = currentUser?.id === user.id || currentUser?.email?.toLowerCase() === user.email?.toLowerCase();
                    const isPrimary = isFirstAdminUser(user);
                    const isSelected = selectedUserIds.includes(user.id);
                    const planBadge = getPlanBadge(user.subscriptionPlan);
                    const PlanIcon = planBadge.icon;
                    return (
                      <tr 
                        key={user.id} 
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
                            onChange={() => toggleSelectUser(user.id)} 
                            className="rounded cursor-pointer accent-[#E05638]" 
                          />
                        </td>
                        <td className="px-5 py-4 font-bold flex items-center gap-3">
                          <div className="w-8 h-8 rounded-xl border flex items-center justify-center text-xs font-black shrink-0" style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-emerald)', color: 'var(--color-emerald)' }}>
                            {(user.name || 'A').charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm font-bold" style={{ color: 'var(--color-text)' }}>{user.name}</span>
                              {isPrimary && (
                                <span className="border text-[9px] font-extrabold px-1.5 py-0.2 rounded" style={{ backgroundColor: 'rgba(245, 158, 11, 0.15)', borderColor: '#f59e0b', color: '#fbbf24' }}>
                                  {tr('admin.users.badgePrimary', 'PRIMARY')}
                                </span>
                              )}
                              {isCurrent && !isPrimary && (
                                <span className="border text-[9px] font-extrabold px-1.5 py-0.2 rounded" style={{ backgroundColor: 'rgba(16, 185, 129, 0.15)', borderColor: 'var(--color-emerald)', color: 'var(--color-emerald)' }}>
                                  {tr('admin.users.badgeYou', 'YOU')}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4 font-mono text-xs" style={{ color: 'var(--color-text-secondary)' }}>{user.email}</td>
                        <td className="px-5 py-4">
                          <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wide border flex items-center gap-1 w-fit" style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-emerald)', color: 'var(--color-emerald)' }}>
                            <Shield className="h-3 w-3" /> {tr('admin.users.roleAdmin', 'Admin')}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold border flex items-center gap-1.5 w-fit shadow-xs" style={{ backgroundColor: planBadge.bg, borderColor: planBadge.border, color: planBadge.color }}>
                            <PlanIcon className="h-3 w-3 shrink-0" />
                            {planBadge.label}
                          </span>
                        </td>
                        <td className="px-5 py-4" style={{ color: 'var(--color-text-secondary)' }}>
                          {user.createdAt ? new Date(user.createdAt).toLocaleDateString(locale === 'th' ? 'th-TH' : (locale || 'en-US')) : tr('admin.users.activeStatus', 'Active')}
                        </td>
                        <td className="px-5 py-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button 
                              type="button" 
                              onClick={() => handleOpenEditModal(user)} 
                              className="p-2 rounded-xl border transition shadow-xs cursor-pointer hover:opacity-85" 
                              style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }} 
                              title={tr('admin.users.editAdminAccount', 'Edit Admin Account & Plan')}
                            >
                              <Edit3 className="h-4 w-4" style={{ color: 'var(--color-primary)' }} />
                            </button>
                            <button 
                              type="button" 
                              disabled={isCurrent || isPrimary} 
                              onClick={() => handleDeleteUser(user.id, user.email, user.name)} 
                              className={`p-2 rounded-xl border transition shadow-xs ${isCurrent || isPrimary ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}`} 
                              style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }} 
                              title={
                                isPrimary 
                                  ? tr('admin.users.cannotDeletePrimaryTooltip', 'Cannot delete primary system admin (usr_admin_1)')
                                  : isCurrent 
                                    ? tr('admin.users.cannotDeleteActiveSession', 'Cannot delete active session account')
                                    : tr('admin.users.deleteAdmin', 'Delete Admin')
                              }
                            >
                              <Trash2 className="h-4 w-4" />
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

          {/* Admin Pagination */}
          {processedAdmins.length > ITEMS_PER_PAGE && (
            <div className="px-5 py-3.5 border-t flex items-center justify-between text-xs transition-colors" style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}>
              <span>
                {tr('admin.users.showing', 'Showing')} {adminStartIndex + 1} {tr('admin.users.to', 'to')} {adminEndIndex} {tr('admin.users.of', 'of')} {processedAdmins.length} {tr('admin.users.adminsCount', 'admins')}
              </span>
              <div className="flex items-center gap-1.5">
                <button type="button" disabled={adminCurrentPage <= 1} onClick={() => setAdminCurrentPage(p => Math.max(1, p - 1))} className="p-1.5 rounded-lg border disabled:opacity-40 transition cursor-pointer" style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}>
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="font-bold px-2" style={{ color: 'var(--color-text)' }}>
                  {tr('admin.users.page', 'Page')} {adminCurrentPage} {tr('admin.users.of', 'of')} {adminTotalPages}
                </span>
                <button type="button" disabled={adminCurrentPage >= adminTotalPages} onClick={() => setAdminCurrentPage(p => Math.min(adminTotalPages, p + 1))} className="p-1.5 rounded-lg border disabled:opacity-40 transition cursor-pointer" style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}>
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* 2. STANDARD USERS TABLE */}
      {/* ───────────────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl border flex items-center justify-center" style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: '#3b82f6', color: '#60a5fa' }}>
              <Users className="h-4 w-4" />
            </div>
            <h2 className="text-lg font-black flex items-center gap-2" style={{ color: 'var(--color-text)' }}>
              {tr('admin.users.standardUsers', 'Standard Users')}
              <span className="text-xs border font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: '#3b82f6', color: '#93c5fd' }}>
                {processedStandardUsers.length}
              </span>
            </h2>
          </div>
          <button 
            type="button"
            onClick={() => handleOpenAddModal('user')} 
            className="text-xs font-bold transition flex items-center gap-1 cursor-pointer hover:underline" 
            style={{ color: 'var(--color-primary)' }}
          >
            <UserPlus className="h-3.5 w-3.5" /> {tr('admin.users.addStandardUser', 'Add Standard User')}
          </button>
        </div>

        <div className="border rounded-3xl overflow-hidden shadow-xl transition-colors" style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }}>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b uppercase font-bold text-[10px] tracking-wider" style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}>
                <tr>
                  <th className="w-10 px-4 py-4 text-center">
                    <input 
                      type="checkbox" 
                      checked={isAllStandardOnPageSelected} 
                      onChange={handleToggleSelectAllStandardUsers} 
                      className="rounded cursor-pointer accent-[#E05638]" 
                      title={tr('admin.users.selectAllStandard', 'Select all standard users on this page')}
                    />
                  </th>
                  <th className="px-5 py-4">
                    <button type="button" onClick={() => handleUserSort('name')} className="flex items-center gap-1.5 hover:opacity-80 transition cursor-pointer select-none font-bold uppercase tracking-wider" style={{ color: 'var(--color-text)' }}>
                      <span>{tr('admin.users.colStandardUser', 'Standard User')}</span>
                      {renderSortIcon(userSortField, 'name', userSortOrder)}
                    </button>
                  </th>
                  <th className="px-5 py-4">{tr('admin.users.colEmail', 'Email Address')}</th>
                  <th className="px-5 py-4">{tr('admin.users.colRole', 'Role')}</th>
                  <th className="px-5 py-4">
                    <button type="button" onClick={() => handleUserSort('subscriptionPlan')} className="flex items-center gap-1.5 hover:opacity-80 transition cursor-pointer select-none font-bold uppercase tracking-wider" style={{ color: 'var(--color-text)' }}>
                      <span>{tr('admin.users.colSubscriptionType', 'Subscription Type')}</span>
                      {renderSortIcon(userSortField, 'subscriptionPlan', userSortOrder)}
                    </button>
                  </th>
                  <th className="px-5 py-4">
                    <button type="button" onClick={() => handleUserSort('createdAt')} className="flex items-center gap-1.5 hover:opacity-80 transition cursor-pointer select-none font-bold uppercase tracking-wider" style={{ color: 'var(--color-text)' }}>
                      <span>{tr('admin.users.colCreatedDate', 'Created Date')}</span>
                      {renderSortIcon(userSortField, 'createdAt', userSortOrder)}
                    </button>
                  </th>
                  <th className="px-5 py-4 text-right">{tr('admin.users.colActions', 'Actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}>
                {paginatedStandardUsers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-10" style={{ color: 'var(--color-text-secondary)' }}>
                      {tr('admin.users.noStandardFound', 'No standard users found')} {search ? `${tr('admin.users.matching', 'matching')} "${search}"` : ''}.
                    </td>
                  </tr>
                ) : (
                  paginatedStandardUsers.map((user) => {
                    const isCurrent = currentUser?.id === user.id || currentUser?.email?.toLowerCase() === user.email?.toLowerCase();
                    const isSelected = selectedUserIds.includes(user.id);
                    const planBadge = getPlanBadge(user.subscriptionPlan);
                    const PlanIcon = planBadge.icon;
                    return (
                      <tr 
                        key={user.id} 
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
                            onChange={() => toggleSelectUser(user.id)} 
                            className="rounded cursor-pointer accent-[#E05638]" 
                          />
                        </td>
                        <td className="px-5 py-4 font-bold flex items-center gap-3">
                          <div className="w-8 h-8 rounded-xl border flex items-center justify-center text-xs font-black shrink-0" style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)', color: 'var(--color-primary)' }}>
                            {(user.name || 'U').charAt(0).toUpperCase()}
                          </div>
                          <span className="text-sm font-bold" style={{ color: 'var(--color-text)' }}>{user.name}</span>
                        </td>
                        <td className="px-5 py-4 font-mono text-xs" style={{ color: 'var(--color-text-secondary)' }}>{user.email}</td>
                        <td className="px-5 py-4">
                          <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wide border flex items-center gap-1 w-fit" style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}>
                            <UserIcon className="h-3 w-3" /> {tr('admin.users.roleStandard', 'Standard User')}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold border flex items-center gap-1.5 w-fit shadow-xs" style={{ backgroundColor: planBadge.bg, borderColor: planBadge.border, color: planBadge.color }}>
                            <PlanIcon className="h-3 w-3 shrink-0" />
                            {planBadge.label}
                          </span>
                        </td>
                        <td className="px-5 py-4" style={{ color: 'var(--color-text-secondary)' }}>
                          {user.createdAt ? new Date(user.createdAt).toLocaleDateString(locale === 'th' ? 'th-TH' : (locale || 'en-US')) : tr('admin.users.activeStatus', 'Active')}
                        </td>
                        <td className="px-5 py-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button 
                              type="button" 
                              onClick={() => handleOpenEditModal(user)} 
                              className="p-2 rounded-xl border transition shadow-xs cursor-pointer hover:opacity-85" 
                              style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }} 
                              title={tr('admin.users.editUserAndPlan', 'Edit User & Plan Assignment')}
                            >
                              <Edit3 className="h-4 w-4" style={{ color: 'var(--color-primary)' }} />
                            </button>
                            <button 
                              type="button" 
                              disabled={isCurrent} 
                              onClick={() => handleDeleteUser(user.id, user.email, user.name)} 
                              className={`p-2 rounded-xl border transition shadow-xs ${isCurrent ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}`} 
                              style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }} 
                              title={isCurrent ? tr('admin.users.cannotDeleteActiveAccount', 'Cannot delete active account') : tr('admin.users.deleteUser', 'Delete User')}
                            >
                              <Trash2 className="h-4 w-4" />
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

          {/* Standard User Pagination */}
          <div className="px-5 py-4 border-t flex flex-col sm:flex-row items-center justify-between gap-3 text-xs transition-colors" style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}>
            <div>
              {processedStandardUsers.length === 0 ? (
                tr('admin.users.showingZeroStandard', 'Showing 0 standard users')
              ) : (
                <>
                  {tr('admin.users.showing', 'Showing')}{' '}
                  <span className="font-bold" style={{ color: 'var(--color-text)' }}>{userStartIndex + 1}</span>{' '}
                  {tr('admin.users.to', 'to')}{' '}
                  <span className="font-bold" style={{ color: 'var(--color-text)' }}>{userEndIndex}</span>{' '}
                  {tr('admin.users.of', 'of')}{' '}
                  <span className="font-bold" style={{ color: 'var(--color-text)' }}>{processedStandardUsers.length}</span>{' '}
                  {tr('admin.users.standardUsersCount', 'standard users')}
                </>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <button 
                type="button" 
                disabled={userCurrentPage <= 1} 
                onClick={() => setUserCurrentPage(p => Math.max(1, p - 1))} 
                className={`p-2 rounded-xl border flex items-center justify-center transition ${userCurrentPage <= 1 ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer hover:opacity-80'}`} 
                style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                title={tr('admin.users.prevPage', 'Previous Page')}
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              {Array.from({ length: userTotalPages }, (_, i) => i + 1).map(pageNum => (
                <button 
                  key={pageNum} 
                  type="button" 
                  onClick={() => setUserCurrentPage(pageNum)} 
                  className="min-w-[34px] h-[34px] rounded-xl text-xs font-bold transition flex items-center justify-center border cursor-pointer" 
                  style={userCurrentPage === pageNum ? { backgroundColor: 'var(--color-primary)', borderColor: 'var(--color-primary)', color: '#ffffff' } : { backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
                >
                  {pageNum}
                </button>
              ))}
              <button 
                type="button" 
                disabled={userCurrentPage >= userTotalPages} 
                onClick={() => setUserCurrentPage(p => Math.min(userTotalPages, p + 1))} 
                className={`p-2 rounded-xl border flex items-center justify-center transition ${userCurrentPage >= userTotalPages ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer hover:opacity-80'}`} 
                style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                title={tr('admin.users.nextPage', 'Next Page')}
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* 3. ADD USER MODAL (Accessible Container with Autofill Guard) */}
      {/* ───────────────────────────────────────────────────────────── */}
      {showAddModal && (
        <div 
          onClick={() => setShowAddModal(false)} 
          className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4 cursor-pointer animate-in fade-in"
          role="dialog"
          aria-modal="true"
        >
          <div 
            onClick={(e) => e.stopPropagation()} 
            className="border rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl relative text-xs cursor-default" 
            style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
          >
            <button 
              type="button" 
              onClick={() => setShowAddModal(false)} 
              className="absolute top-4 right-4 p-1.5 rounded-md transition cursor-pointer hover:opacity-80" 
              style={{ backgroundColor: 'var(--color-inner-dark)', color: 'var(--color-text-secondary)' }}
            >
              <X className="h-4 w-4" />
            </button>
            
            <div className="space-y-1 pr-6">
              <h2 className="text-xl font-black flex items-center gap-2" style={{ color: 'var(--color-primary)' }}>
                <UserPlus className="h-5 w-5" /> {tr('admin.users.modalAddTitle', 'Add New User')}
              </h2>
              <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                {tr('admin.users.modalAddSubtitle', 'Create a new user account with role & active package tier.')}
              </p>
            </div>

            {addError && (
              <div className="p-3 border rounded-xl font-semibold flex items-center gap-2 bg-red-500/10 border-red-500 text-red-500">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{addError}</span>
              </div>
            )}

            <div className="space-y-3.5">
              <div>
                <label className="block font-bold mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>
                  {tr('admin.users.labelFullName', 'Full Name')} *
                </label>
                <div className="relative">
                  <UserIcon className="h-4 w-4 absolute left-3.5 top-3" style={{ color: 'var(--color-text-secondary)' }} />
                  <input 
                    type="text" 
                    required 
                    data-lpignore="true"
                    data-form-type="other"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder={tr('admin.users.placeholderName', 'e.g. Jordan Smith')} 
                    value={addName} 
                    onChange={e => setAddName(e.target.value)} 
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddUserSubmit(); } }}
                    className="w-full border rounded-xl pl-10 pr-3.5 py-2.5 text-xs outline-none shadow-inner" 
                    style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }} 
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>
                  {tr('admin.users.labelEmail', 'Email Address')} *
                </label>
                <div className="relative">
                  <Mail className="h-4 w-4 absolute left-3.5 top-3" style={{ color: 'var(--color-text-secondary)' }} />
                  <input 
                    type="email" 
                    required 
                    data-lpignore="true"
                    data-form-type="other"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder={tr('admin.users.placeholderEmail', 'jordan@example.com')} 
                    value={addEmail} 
                    onChange={e => setAddEmail(e.target.value)} 
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddUserSubmit(); } }}
                    className="w-full border rounded-xl pl-10 pr-3.5 py-2.5 text-xs outline-none font-mono shadow-inner" 
                    style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }} 
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>
                  {tr('admin.users.labelPassword', 'Password')} *
                </label>
                <div className="relative">
                  <Lock className="h-4 w-4 absolute left-3.5 top-3" style={{ color: 'var(--color-text-secondary)' }} />
                  <input 
                    type="password" 
                    required 
                    data-lpignore="true"
                    data-form-type="other"
                    autoComplete="new-password"
                    spellCheck={false}
                    placeholder={tr('admin.users.placeholderPassword', 'Minimum 8 characters')} 
                    value={addPassword} 
                    onChange={e => setAddPassword(e.target.value)} 
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddUserSubmit(); } }}
                    className="w-full border rounded-xl pl-10 pr-3.5 py-2.5 text-xs outline-none font-mono shadow-inner" 
                    style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }} 
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold mb-1.5 flex items-center justify-between" style={{ color: 'var(--color-text-secondary)' }}>
                  <span>{tr('admin.users.labelActivePlan', 'Active Subscription Plan')} *</span>
                  <Link href="/admin/plans" className="text-[10px] underline hover:opacity-80" style={{ color: 'var(--color-text-secondary)' }}>
                    {tr('admin.users.managePlans', 'Manage Plans')} ({availablePlans.length})
                  </Link>
                </label>
                <select 
                  value={addSubscriptionPlan} 
                  onChange={e => setAddSubscriptionPlan(e.target.value)} 
                  className="w-full border rounded-xl p-2.5 text-xs outline-none font-bold cursor-pointer" 
                  style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                >
                  {availablePlans.map(plan => (
                    <option key={plan.id || plan.slug} value={plan.slug} style={{ backgroundColor: 'var(--color-card)', color: 'var(--color-text)' }}>
                      {plan.name} ({plan.priceFormatted})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>
                  {tr('admin.users.labelAssignedRole', 'Assigned Role')}
                </label>
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div 
                    onClick={() => setAddRole('user')}
                    className="p-3 rounded-2xl border cursor-pointer transition flex items-center justify-between shadow-xs"
                    style={addRole === 'user' ? {
                      backgroundColor: 'rgba(224, 86, 56, 0.12)',
                      borderColor: 'var(--color-primary)'
                    } : {
                      backgroundColor: 'var(--color-inner-dark)',
                      borderColor: 'var(--color-border)'
                    }}
                  >
                    <div>
                      <div className="font-bold text-xs" style={{ color: 'var(--color-text)' }}>{tr('admin.users.roleStandardUser', 'Standard User')}</div>
                      <div className="text-[10px]" style={{ color: 'var(--color-text-secondary)' }}>{tr('admin.users.descSubscriber', 'App Subscriber')}</div>
                    </div>
                    <input
                      type="radio"
                      name="addRole"
                      checked={addRole === 'user'}
                      onChange={() => setAddRole('user')}
                      className="accent-[#E05638]"
                    />
                  </div>

                  <div 
                    onClick={() => setAddRole('admin')}
                    className="p-3 rounded-2xl border cursor-pointer transition flex items-center justify-between shadow-xs"
                    style={addRole === 'admin' ? {
                      backgroundColor: 'rgba(224, 86, 56, 0.12)',
                      borderColor: 'var(--color-primary)'
                    } : {
                      backgroundColor: 'var(--color-inner-dark)',
                      borderColor: 'var(--color-border)'
                    }}
                  >
                    <div>
                      <div className="font-bold text-xs flex items-center gap-1" style={{ color: 'var(--color-text)' }}>
                        <Shield className="h-3 w-3" style={{ color: 'var(--color-emerald)' }} /> {tr('admin.users.roleAdmin', 'Admin')}
                      </div>
                      <div className="text-[10px]" style={{ color: 'var(--color-text-secondary)' }}>{tr('admin.users.descFullAccess', 'Full Access')}</div>
                    </div>
                    <input
                      type="radio"
                      name="addRole"
                      checked={addRole === 'admin'}
                      onChange={() => setAddRole('admin')}
                      className="accent-[#E05638]"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t" style={{ borderColor: 'var(--color-border)' }}>
                <button 
                  type="button" 
                  onClick={() => setShowAddModal(false)} 
                  className="px-4 py-2.5 border font-bold rounded-xl text-xs cursor-pointer hover:opacity-85 transition" 
                  style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
                >
                  {tr('admin.users.btnCancel', 'Cancel')}
                </button>
                <button 
                  type="button" 
                  onClick={() => handleAddUserSubmit()} 
                  className="px-5 py-2.5 text-white font-bold rounded-xl shadow-md text-xs cursor-pointer hover:opacity-90 transition flex items-center gap-1.5" 
                  style={{ backgroundColor: 'var(--color-primary)' }}
                >
                  <UserPlus className="h-4 w-4" /> {tr('admin.users.btnCreateUser', 'Create User')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* 4. EDIT USER MODAL (Accessible Container with Autofill Guard) */}
      {/* ───────────────────────────────────────────────────────────── */}
      {showEditModal && (
        <div 
          onClick={() => setShowEditModal(false)} 
          className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4 cursor-pointer animate-in fade-in"
          role="dialog"
          aria-modal="true"
        >
          <div 
            onClick={(e) => e.stopPropagation()} 
            className="border rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl relative text-xs cursor-default" 
            style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
          >
            <button 
              type="button" 
              onClick={() => setShowEditModal(false)} 
              className="absolute top-4 right-4 p-1.5 rounded-md transition cursor-pointer hover:opacity-80" 
              style={{ backgroundColor: 'var(--color-inner-dark)', color: 'var(--color-text-secondary)' }}
            >
              <X className="h-4 w-4" />
            </button>

            <div className="space-y-1 pr-6">
              <h2 className="text-xl font-black flex items-center gap-2" style={{ color: 'var(--color-primary)' }}>
                <Edit3 className="h-5 w-5" /> {tr('admin.users.modalEditTitle', 'Edit User & Plan')}
              </h2>
              <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                {tr('admin.users.modalEditSubtitle', 'Update account details, role permissions, and active subscription plan.')}
              </p>
            </div>

            {editError && (
              <div className="p-3 border rounded-xl font-semibold flex items-center gap-2 bg-red-500/10 border-red-500 text-red-500">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{editError}</span>
              </div>
            )}

            <div className="space-y-3.5">
              <div>
                <label className="block font-bold mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>
                  {tr('admin.users.labelFullName', 'Full Name')} *
                </label>
                <div className="relative">
                  <UserIcon className="h-4 w-4 absolute left-3.5 top-3" style={{ color: 'var(--color-text-secondary)' }} />
                  <input 
                    type="text" 
                    required 
                    data-lpignore="true"
                    data-form-type="other"
                    autoComplete="off"
                    spellCheck={false}
                    value={editName} 
                    onChange={e => setEditName(e.target.value)} 
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleEditUserSubmit(); } }}
                    className="w-full border rounded-xl pl-10 pr-3.5 py-2.5 text-xs outline-none shadow-inner" 
                    style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }} 
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>
                  {tr('admin.users.labelEmail', 'Email Address')} *
                </label>
                <div className="relative">
                  <Mail className="h-4 w-4 absolute left-3.5 top-3" style={{ color: 'var(--color-text-secondary)' }} />
                  <input 
                    type="email" 
                    required 
                    data-lpignore="true"
                    data-form-type="other"
                    autoComplete="off"
                    spellCheck={false}
                    value={editEmail} 
                    onChange={e => setEditEmail(e.target.value)} 
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleEditUserSubmit(); } }}
                    className="w-full border rounded-xl pl-10 pr-3.5 py-2.5 text-xs outline-none font-mono shadow-inner" 
                    style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }} 
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>
                  {tr('admin.users.labelChangePassword', 'Change Password (leave blank to keep current)')}
                </label>
                <div className="relative">
                  <Lock className="h-4 w-4 absolute left-3.5 top-3" style={{ color: 'var(--color-text-secondary)' }} />
                  <input 
                    type="password" 
                    data-lpignore="true"
                    data-form-type="other"
                    autoComplete="new-password"
                    spellCheck={false}
                    placeholder={tr('admin.users.placeholderNewPass', 'Enter new password (min 8 characters)')} 
                    value={editPassword} 
                    onChange={e => setEditPassword(e.target.value)} 
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleEditUserSubmit(); } }}
                    className="w-full border rounded-xl pl-10 pr-3.5 py-2.5 text-xs outline-none font-mono shadow-inner" 
                    style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }} 
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold mb-1.5 flex items-center justify-between" style={{ color: 'var(--color-text-secondary)' }}>
                  <span>{tr('admin.users.labelActivePlan', 'Active Subscription Plan')}</span>
                  <span className="text-[10px] font-bold" style={{ color: 'var(--color-emerald)' }}>
                    {tr('admin.users.liveSynced', 'Live Synced with Payment Ledger')}
                  </span>
                </label>
                <select 
                  value={editSubscriptionPlan} 
                  onChange={e => setEditSubscriptionPlan(e.target.value)} 
                  className="w-full border rounded-xl p-2.5 text-xs outline-none font-bold cursor-pointer" 
                  style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                >
                  {availablePlans.map(plan => (
                    <option key={plan.id || plan.slug} value={plan.slug} style={{ backgroundColor: 'var(--color-card)', color: 'var(--color-text)' }}>
                      {plan.name} ({plan.priceFormatted})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block font-bold" style={{ color: 'var(--color-text-secondary)' }}>
                    {tr('admin.users.labelAssignedRole', 'Assigned Role')}
                  </label>
                  {isEditingFirstAdmin && (
                    <span 
                      className="text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 border"
                      style={{
                        backgroundColor: 'rgba(245, 158, 11, 0.15)',
                        borderColor: '#f59e0b',
                        color: '#fbbf24'
                      }}
                    >
                      <Lock className="h-3 w-3" /> {tr('admin.users.primaryAdminLocked', 'Primary Admin Locked')}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div 
                    onClick={() => {
                      if (!isEditingFirstAdmin) setEditRole('user');
                    }}
                    className={`p-3 rounded-2xl border transition flex items-center justify-between shadow-xs ${
                      isEditingFirstAdmin ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
                    }`}
                    style={editRole === 'user' && !isEditingFirstAdmin ? {
                      backgroundColor: 'rgba(224, 86, 56, 0.12)',
                      borderColor: 'var(--color-primary)'
                    } : {
                      backgroundColor: 'var(--color-inner-dark)',
                      borderColor: 'var(--color-border)'
                    }}
                  >
                    <div>
                      <div className="font-bold text-xs" style={{ color: 'var(--color-text)' }}>{tr('admin.users.roleStandardUser', 'Standard User')}</div>
                      <div className="text-[10px]" style={{ color: 'var(--color-text-secondary)' }}>{tr('admin.users.descSubscriber', 'App Subscriber')}</div>
                    </div>
                    <input
                      type="radio"
                      name="editRole"
                      disabled={isEditingFirstAdmin}
                      checked={editRole === 'user'}
                      onChange={() => {
                        if (!isEditingFirstAdmin) setEditRole('user');
                      }}
                      className="accent-[#E05638] disabled:opacity-50"
                    />
                  </div>

                  <div 
                    onClick={() => setEditRole('admin')}
                    className="p-3 rounded-2xl border cursor-pointer transition flex items-center justify-between shadow-xs"
                    style={editRole === 'admin' ? {
                      backgroundColor: 'rgba(224, 86, 56, 0.12)',
                      borderColor: 'var(--color-primary)'
                    } : {
                      backgroundColor: 'var(--color-inner-dark)',
                      borderColor: 'var(--color-border)'
                    }}
                  >
                    <div>
                      <div className="font-bold text-xs flex items-center gap-1" style={{ color: 'var(--color-text)' }}>
                        <Shield className="h-3 w-3" style={{ color: 'var(--color-emerald)' }} /> {tr('admin.users.roleAdmin', 'Admin')}
                      </div>
                      <div className="text-[10px]" style={{ color: 'var(--color-text-secondary)' }}>{tr('admin.users.descFullAccess', 'Full Access')}</div>
                    </div>
                    <input
                      type="radio"
                      name="editRole"
                      checked={editRole === 'admin'}
                      onChange={() => setEditRole('admin')}
                      className="accent-[#E05638]"
                    />
                  </div>
                </div>

                {isEditingFirstAdmin && (
                  <p className="text-[11px] mt-1.5 font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                    {tr('admin.users.primaryAdminLockedNote', 'The primary system administrator role is permanently protected and cannot be changed or demoted.')}
                  </p>
                )}
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t" style={{ borderColor: 'var(--color-border)' }}>
                <button 
                  type="button" 
                  onClick={() => setShowEditModal(false)} 
                  className="px-4 py-2.5 border font-bold rounded-xl text-xs cursor-pointer hover:opacity-85 transition" 
                  style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
                >
                  {tr('admin.users.btnCancel', 'Cancel')}
                </button>
                <button 
                  type="button" 
                  onClick={() => handleEditUserSubmit()} 
                  className="px-5 py-2.5 text-white font-bold rounded-xl shadow-md text-xs cursor-pointer hover:opacity-90 transition flex items-center gap-1.5" 
                  style={{ backgroundColor: 'var(--color-primary)' }}
                >
                  <Check className="h-4 w-4" /> {tr('admin.users.btnSaveChanges', 'Save Changes')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
