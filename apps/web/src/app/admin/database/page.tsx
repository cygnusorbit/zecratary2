// @ts-nocheck
'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { 
  Database, Server, Cloud, RefreshCw, CheckCircle2, 
  AlertCircle, ShieldCheck, Zap, Activity, HardDrive, 
  Cpu, Lock, Check, ArrowRightLeft, Layers, Wrench, AlertTriangle,
  ChevronDown, ChevronLeft, ChevronRight, Eye, EyeOff, Radio, FileCode2,
  Power, Globe, CheckCircle, Search, Filter, Hash, ArrowUpRight, ArrowDownLeft
} from 'lucide-react';
import { useTranslation } from '@/components/LanguageProvider';

interface TableInfo {
  name: string;
  rowCount?: number;
  sourceRows?: number;
  targetRows?: number;
  size: string;
  status: string;
  category?: string;
}

export default function AdminDatabasePage() {
  const { t } = useTranslation();

  // Navigation tab state
  const [activeTab, setActiveTab] = useState<'supabase' | 'localhost' | 'migration' | 'telemetry'>('migration');

  // Connection & Active Profile States
  const [activeProfile, setActiveProfile] = useState<'localhost_postgres' | 'localhost_mysql' | 'supabase_cloud'>('supabase_cloud');
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected'>('connected');
  const [engine, setEngine] = useState<'postgresql' | 'mysql'>('postgresql');
  const [databaseName, setDatabaseName] = useState<string>('zecratary');
  const [databaseType, setDatabaseType] = useState<string>('Supabase Cloud (PostgreSQL 15.x)');
  const [hostEndpoint, setHostEndpoint] = useState<string>('aws-0-ap-southeast-1.pooler.supabase.com:6543');
  const [latency, setLatency] = useState<number>(38);

  // Form State - Localhost / MySQL
  const [localhostType, setLocalhostType] = useState<'postgresql' | 'mysql'>('mysql');
  const [localhostUri, setLocalhostUri] = useState('mysql://root:@127.0.0.1:3306/zecratary');
  const [host, setHost] = useState('127.0.0.1');
  const [port, setPort] = useState('3306');
  const [dbName, setDbName] = useState('zecratary');
  const [username, setUsername] = useState('root');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Form State - Supabase Cloud
  const [supabaseUrl, setSupabaseUrl] = useState('https://tnhrkjtujdfgvwhsuuxb.supabase.co');
  const [supabaseAnonKey, setSupabaseAnonKey] = useState('sb_publishable_afBBLw4l9N08lDX60x_5XQ_z6TIP7HI');
  const [supabaseServiceKey, setSupabaseServiceKey] = useState('');
  const [supabasePoolerUri, setSupabasePoolerUri] = useState('');
  const [showSupabaseSecret, setShowSupabaseSecret] = useState(false);

  // Telemetry Metrics
  const [telemetry, setTelemetry] = useState({
    version: 'PostgreSQL 15.x / Supabase Cloud',
    databaseSize: '19.5 MB',
    cacheHitRatio: '99.8%',
    uptime: '30 days',
    activeConnections: 3,
    ssl: true
  });

  // Dynamic Operational Tables (No hardcoded metrics; populated by shadow loader)
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [tablesLoading, setTablesLoading] = useState(true);

  // Filtering & Pagination States
  const [tableSearch, setTableSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(6);

  // Action & Sync States
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncingToMysql, setSyncingToMysql] = useState(false);
  const [syncingToSupabase, setSyncingToSupabase] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [syncingEnv, setSyncingEnv] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [lastSyncTelemetry, setLastSyncTelemetry] = useState<any | null>(null);

  const isSavingRef = useRef(false);

  const updateGranularToUri = (h: string, p: string, db: string, u: string, pwd: string, type: 'postgresql' | 'mysql') => {
    if (type === 'postgresql') {
      const auth = u ? (pwd ? `${u}:${encodeURIComponent(pwd)}@` : `${u}@`) : '';
      setLocalhostUri(`postgresql://${auth}${h}:${p}/${db}?schema=public`);
    } else {
      const auth = u ? (pwd ? `${u}:${encodeURIComponent(pwd)}@` : `${u}@`) : '';
      setLocalhostUri(`mysql://${auth}${h}:${p}/${db}`);
    }
  };

  // Dynamic Data Fetcher (Shadow loader replaces hardcoded elements)
  const loadDatabaseData = useCallback(async (quiet = false) => {
    if (isSavingRef.current) return;
    try {
      if (!quiet) {
        setLoading(true);
        setTablesLoading(true);
      }
      const res = await fetch(`/api/admin/database?t=${Date.now()}`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setConnectionStatus(data.status || 'connected');
        if (data.activeProfile) setActiveProfile(data.activeProfile);
        if (data.latency) setLatency(data.latency);
        if (data.engine) setEngine(data.engine);
        if (data.databaseName) setDatabaseName(data.databaseName);
        if (data.databaseType) setDatabaseType(data.databaseType);
        if (data.host && data.port) setHostEndpoint(`${data.host}:${data.port}`);

        if (data.config) {
          if (data.config.postgresUri) setLocalhostUri(data.config.postgresUri);
          if (data.config.mysqlUri && (data.engine === 'mysql' || localhostType === 'mysql')) {
            setLocalhostUri(data.config.mysqlUri);
          }
          if (data.config.supabaseUrl) setSupabaseUrl(data.config.supabaseUrl);
          if (data.config.supabaseAnonKey) setSupabaseAnonKey(data.config.supabaseAnonKey);
          if (data.config.supabaseServiceKey) setSupabaseServiceKey(data.config.supabaseServiceKey);
          if (data.config.supabasePoolerUri) setSupabasePoolerUri(data.config.supabasePoolerUri);
        }

        if (data.telemetry) setTelemetry(data.telemetry);
        if (Array.isArray(data.tables)) {
          setTables(data.tables);
        }
      }
    } catch (err) {
      console.warn('Notice loading /admin/database telemetry:', err);
    } finally {
      if (!quiet) {
        setLoading(false);
        setTablesLoading(false);
      }
    }
  }, [localhostType]);

  useEffect(() => {
    document.title = `${t('dbPageTitle', 'Database Management & Sync')} - Zecratary`;
    loadDatabaseData();

    const handleThemeChange = () => {};
    window.addEventListener('zecratary_theme_mode_changed', handleThemeChange);
    window.addEventListener('zecratary_theme_changed', handleThemeChange);
    window.addEventListener('zecratary_locale_changed', () => loadDatabaseData(true));

    return () => {
      window.removeEventListener('zecratary_theme_mode_changed', handleThemeChange);
      window.removeEventListener('zecratary_theme_changed', handleThemeChange);
      window.removeEventListener('zecratary_locale_changed', () => loadDatabaseData(true));
    };
  }, [loadDatabaseData, t]);

  // Synchronize to MySQL (PostgreSQL -> MySQL)
  const handleSyncToMysql = async () => {
    setSyncingToMysql(true);
    setToast(null);
    try {
      const res = await fetch('/api/admin/database', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sync_to_mysql' })
      });
      const data = await res.json();
      if (data.success) {
        setLastSyncTelemetry(data);
        setToast({
          type: 'success',
          message: `${t('syncSuccessToast', 'Successfully synchronized')} ${data.totalRowsTransferred} ${t('rowsToMysql', 'rows to MySQL across')} ${data.totalTables} ${t('tablesCount', 'tables in')} ${data.durationMs}ms!`
        });
        await loadDatabaseData(true);
      } else {
        setToast({
          type: 'error',
          message: data.error || t('syncFailedToast', 'Database sync to MySQL failed. Verify connection string.')
        });
      }
    } catch (e: any) {
      setToast({ type: 'error', message: e.message || 'Error executing sync to MySQL.' });
    } finally {
      setSyncingToMysql(false);
    }
  };

  // Synchronize to Supabase Cloud (MySQL -> PostgreSQL)
  const handleSyncToSupabase = async () => {
    setSyncingToSupabase(true);
    setToast(null);
    try {
      const res = await fetch('/api/admin/database', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sync_to_supabase' })
      });
      const data = await res.json();
      if (data.success) {
        setLastSyncTelemetry(data);
        setToast({
          type: 'success',
          message: `${t('syncSuccessToast', 'Successfully synchronized')} ${data.totalRowsTransferred} ${t('rowsToSupabase', 'rows to Supabase Cloud in')} ${data.durationMs}ms!`
        });
        await loadDatabaseData(true);
      } else {
        setToast({
          type: 'error',
          message: data.error || 'Database sync to Supabase failed.'
        });
      }
    } catch (e: any) {
      setToast({ type: 'error', message: e.message || 'Error executing sync to Supabase.' });
    } finally {
      setSyncingToSupabase(false);
    }
  };

  // Optimize & Vacuum Catalogs
  const handleOptimizeTables = async () => {
    setOptimizing(true);
    try {
      const res = await fetch('/api/admin/database', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'optimize_tables' })
      });
      const data = await res.json();
      if (data.success) {
        setToast({
          type: 'success',
          message: data.message || t('optimizingSuccessToast', 'All database schemas optimized and vacuumed successfully!')
        });
        loadDatabaseData(true);
      }
    } catch (e: any) {
      setToast({ type: 'error', message: e.message || 'Error optimizing database tables.' });
    } finally {
      setOptimizing(false);
    }
  };

  // Test Connection
  const handleTestConnection = async (targetUri: string, profileHint?: string) => {
    setTesting(true);
    setToast(null);
    try {
      const res = await fetch('/api/admin/database', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          action: 'test_connection', 
          uri: targetUri,
          targetProfile: profileHint,
          config: { supabaseUrl, supabaseAnonKey }
        })
      });
      const data = await res.json();
      if (data.success) {
        setLatency(data.latency || 25);
        setToast({
          type: 'success',
          message: data.message || `${t('testSuccessToast', 'Database socket handshake succeeded!')} Latency: ${data.latency}ms`
        });
      } else {
        setToast({
          type: 'error',
          message: `${t('testFailedToast', 'Connection test failed:')} ${data.error || 'Connection refused'}`
        });
      }
    } catch (e: any) {
      setToast({ type: 'error', message: `${t('testFailedToast', 'Connection test failed:')} ${e.message}` });
    } finally {
      setTesting(false);
    }
  };

  // Switch Active Database
  const handleConnectDatabase = async (targetType: 'supabase_cloud' | 'localhost_postgres' | 'localhost_mysql', uriToConnect?: string) => {
    setConnecting(true);
    setToast(null);
    try {
      const res = await fetch('/api/admin/database', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'connect_database',
          targetProfile: targetType,
          uri: uriToConnect || (targetType === 'supabase_cloud' ? (supabasePoolerUri || supabaseUrl) : localhostUri),
          config: {
            supabaseUrl,
            supabaseAnonKey,
            supabaseServiceKey,
            supabasePoolerUri
          }
        })
      });
      const data = await res.json();
      if (data.success) {
        setActiveProfile(targetType);
        setConnectionStatus('connected');
        setToast({
          type: 'success',
          message: data.message || `Switched active database to ${targetType}. Other databases disconnected.`
        });
        await loadDatabaseData(true);
      } else {
        setToast({ type: 'error', message: data.error || 'Failed to switch database.' });
      }
    } catch (e: any) {
      setToast({ type: 'error', message: e.message || 'Error connecting to database.' });
    } finally {
      setConnecting(false);
    }
  };

  // Save Settings to .env Files
  const handleSaveConnection = async (targetType: typeof activeProfile, uriToSave: string) => {
    setSaving(true);
    setToast(null);
    try {
      const res = await fetch('/api/admin/database', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save_connection',
          targetProfile: targetType,
          uri: uriToSave,
          config: {
            supabaseUrl,
            supabaseAnonKey,
            supabaseServiceKey,
            supabasePoolerUri
          }
        })
      });
      const data = await res.json();
      if (data.success) {
        setToast({
          type: 'success',
          message: t('savedToast', 'Credentials synchronized directly into .env.local! Database tables kept clean of secrets.')
        });
        loadDatabaseData(true);
      } else {
        setToast({ type: 'error', message: data.error || t('errorToast', 'An error occurred while saving database settings.') });
      }
    } catch (e: any) {
      setToast({ type: 'error', message: e.message || t('errorToast', 'An error occurred while saving database settings.') });
    } finally {
      setSaving(false);
    }
  };

  // Filtering & Pagination
  const categories = useMemo(() => {
    const set = new Set<string>();
    tables.forEach(t => { if (t.category) set.add(t.category); });
    return ['ALL', ...Array.from(set)];
  }, [tables]);

  const filteredTables = useMemo(() => {
    return tables.filter(t => {
      const matchesSearch = t.name.toLowerCase().includes(tableSearch.toLowerCase()) ||
                            (t.category && t.category.toLowerCase().includes(tableSearch.toLowerCase()));
      const matchesCategory = selectedCategory === 'ALL' || t.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [tables, tableSearch, selectedCategory]);

  const totalPages = Math.max(1, Math.ceil(filteredTables.length / pageSize));

  useEffect(() => {
    setCurrentPage(1);
  }, [tableSearch, selectedCategory, pageSize]);

  const paginatedTables = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredTables.slice(start, start + pageSize);
  }, [filteredTables, currentPage, pageSize]);

  const isConnected = connectionStatus === 'connected';
  const isSupabaseActive = activeProfile === 'supabase_cloud' && isConnected;
  const isLocalhostActive = (activeProfile === 'localhost_postgres' || activeProfile === 'localhost_mysql') && isConnected;

  // Reusable Paginated Tables Section with Shadow Loaders
  const renderPaginatedTableSection = (titleText: string, subtitleText: string) => (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h4 className="text-xs font-bold flex items-center gap-2" style={{ color: 'var(--color-text)' }}>
            <CheckCircle className="h-4 w-4 text-emerald-400 shrink-0" />
            <span>{titleText}</span>
            <span 
              className="px-2 py-0.5 rounded-full text-[10px] font-extrabold border"
              style={{ 
                backgroundColor: 'var(--color-card)', 
                borderColor: 'var(--color-border)',
                color: 'var(--color-primary)' 
              }}
            >
              {tablesLoading ? '...' : `${filteredTables.length} ${t('tablesCount', 'Tables')}`}
            </span>
          </h4>
          <p className="text-[11px] mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
            {subtitleText}
          </p>
        </div>

        {/* Search, Filter & Rows Per Page */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[160px] sm:min-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 opacity-50 pointer-events-none" style={{ color: 'var(--color-text)' }} />
            <input
              type="text"
              autoComplete="off"
              data-lpignore="true"
              data-form-type="other"
              value={tableSearch}
              onChange={(e) => setTableSearch(e.target.value)}
              placeholder={t('searchTables', 'Search tables...')}
              className="w-full pl-8 pr-3 py-1.5 text-xs font-bold rounded-xl border outline-none transition"
              style={{
                backgroundColor: 'var(--color-inner-dark)',
                borderColor: 'var(--color-border)',
                color: 'var(--color-text)'
              }}
            />
          </div>

          <div className="relative">
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="appearance-none border rounded-xl pl-3 pr-8 py-1.5 text-xs font-bold outline-none cursor-pointer"
              style={{
                backgroundColor: 'var(--color-inner-dark)',
                borderColor: 'var(--color-border)',
                color: 'var(--color-text)'
              }}
            >
              {categories.map(c => (
                <option key={`cat-${c}`} value={c} style={{ backgroundColor: 'var(--color-card)', color: 'var(--color-text)' }}>
                  {c}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3 w-3 pointer-events-none opacity-50" style={{ color: 'var(--color-text)' }} />
          </div>

          <div className="relative">
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="appearance-none border rounded-xl pl-2.5 pr-7 py-1.5 text-xs font-bold outline-none cursor-pointer"
              style={{
                backgroundColor: 'var(--color-inner-dark)',
                borderColor: 'var(--color-border)',
                color: 'var(--color-text)'
              }}
              title="Rows per page"
            >
              <option value={6} style={{ backgroundColor: 'var(--color-card)', color: 'var(--color-text)' }}>6 / page</option>
              <option value={10} style={{ backgroundColor: 'var(--color-card)', color: 'var(--color-text)' }}>10 / page</option>
              <option value={20} style={{ backgroundColor: 'var(--color-card)', color: 'var(--color-text)' }}>20 / page</option>
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 pointer-events-none opacity-50" style={{ color: 'var(--color-text)' }} />
          </div>
        </div>
      </div>

      {/* Table Container */}
      <div 
        className="rounded-2xl border overflow-hidden shadow-sm transition-colors duration-200"
        style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)' }}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-card)' }}>
                <th className="py-2.5 px-4 font-bold" style={{ color: 'var(--color-text)' }}>{t('colTableName', 'Table Name')}</th>
                <th className="py-2.5 px-4 font-bold" style={{ color: 'var(--color-text)' }}>Category</th>
                <th className="py-2.5 px-4 font-bold" style={{ color: 'var(--color-text)' }}>Live MySQL Rows</th>
                <th className="py-2.5 px-4 font-bold" style={{ color: 'var(--color-text)' }}>{t('colTableSize', 'Size on Disk')}</th>
                <th className="py-2.5 px-4 font-bold text-right" style={{ color: 'var(--color-text)' }}>{t('colTableStatus', 'Status')}</th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
              {tablesLoading ? (
                // Pure Monorepo Shadow Loader Skeletons (No hardcoded elements)
                Array.from({ length: pageSize }).map((_, i) => (
                  <tr key={`tbl-skel-${i}`} className="animate-pulse">
                    <td className="py-3 px-4">
                      <div className="h-4 w-32 rounded-md bg-white/10" />
                    </td>
                    <td className="py-3 px-4">
                      <div className="h-4 w-20 rounded-md bg-white/10" />
                    </td>
                    <td className="py-3 px-4">
                      <div className="h-4 w-12 rounded-md bg-white/10" />
                    </td>
                    <td className="py-3 px-4">
                      <div className="h-4 w-16 rounded-md bg-white/10" />
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="h-4 w-20 rounded-md bg-white/10 ml-auto" />
                    </td>
                  </tr>
                ))
              ) : paginatedTables.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                    No tables found matching your search.
                  </td>
                </tr>
              ) : (
                paginatedTables.map((tbl) => (
                  <tr key={`sync-row-${tbl.name}`} className="transition hover:opacity-90">
                    <td className="py-2 px-4 font-mono font-bold flex items-center gap-2" style={{ color: 'var(--color-primary)' }}>
                      <Hash className="h-3 w-3 opacity-60 shrink-0" />
                      <span>{tbl.name}</span>
                    </td>
                    <td className="py-2 px-4">
                      <span 
                        className="px-2 py-0.5 rounded-md text-[10px] font-bold border"
                        style={{
                          backgroundColor: 'var(--color-card)',
                          borderColor: 'var(--color-border)',
                          color: 'var(--color-text-secondary)'
                        }}
                      >
                        {tbl.category || 'General'}
                      </span>
                    </td>
                    <td className="py-2 px-4 font-mono font-bold" style={{ color: 'var(--color-text)' }}>
                      {(tbl.targetRows ?? tbl.rowCount ?? 0).toLocaleString()}
                    </td>
                    <td className="py-2 px-4 font-mono text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
                      {tbl.size}
                    </td>
                    <td className="py-2 px-4 text-right">
                      <span 
                        className="px-2 py-0.5 rounded-full text-[10px] font-bold border"
                        style={{ 
                          backgroundColor: 'rgba(16, 185, 129, 0.12)', 
                          borderColor: 'var(--color-emerald)', 
                          color: 'var(--color-emerald)' 
                        }}
                      >
                        {tbl.status || 'Synchronized'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Navigation */}
        <div 
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-2.5 border-t"
          style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-card)' }}
        >
          <div className="text-[11px] font-bold" style={{ color: 'var(--color-text-secondary)' }}>
            Showing {filteredTables.length > 0 ? (currentPage - 1) * pageSize + 1 : 0} to {Math.min(currentPage * pageSize, filteredTables.length)} of {filteredTables.length} tables
          </div>

          <div className="flex items-center gap-1.5 self-center sm:self-auto">
            <button
              type="button"
              disabled={currentPage <= 1 || tablesLoading}
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              className="p-1.5 rounded-xl border text-xs font-bold transition hover:opacity-80 disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed flex items-center justify-center shadow-xs"
              style={{
                backgroundColor: 'var(--color-inner-dark)',
                borderColor: 'var(--color-border)',
                color: 'var(--color-text)'
              }}
              aria-label="Previous Page"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>

            {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => {
              const isCurrent = pageNum === currentPage;
              return (
                <button
                  key={`page-btn-${pageNum}`}
                  type="button"
                  onClick={() => setCurrentPage(pageNum)}
                  className="px-2.5 py-1 rounded-xl border text-xs font-bold transition cursor-pointer shadow-xs"
                  style={isCurrent ? {
                    backgroundColor: 'var(--color-primary)',
                    borderColor: 'var(--color-primary)',
                    color: '#ffffff'
                  } : {
                    backgroundColor: 'var(--color-inner-dark)',
                    borderColor: 'var(--color-border)',
                    color: 'var(--color-text)'
                  }}
                >
                  {pageNum}
                </button>
              );
            })}

            <button
              type="button"
              disabled={currentPage >= totalPages || tablesLoading}
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              className="p-1.5 rounded-xl border text-xs font-bold transition hover:opacity-80 disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed flex items-center justify-center shadow-xs"
              style={{
                backgroundColor: 'var(--color-inner-dark)',
                borderColor: 'var(--color-border)',
                color: 'var(--color-text)'
              }}
              aria-label="Next Page"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div 
      className="w-full max-w-full space-y-6 pb-24 px-4 sm:px-6 lg:px-8 xl:px-10 pt-2 font-sans transition-colors duration-200"
      style={{ color: 'var(--color-text)' }}
    >
      {/* Top Header */}
      <div 
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <div>
          <h1 className="text-2xl font-black tracking-tight flex items-center gap-2" style={{ color: 'var(--color-primary)' }}>
            <Database className="h-6 w-6" /> {t('dbPageTitle', 'Database Management & Synchronization')}
          </h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
            {t('dbPageSubtitle', 'Synchronize live operational data between Supabase PostgreSQL and Hostinger/Local MySQL, monitor live latencies, and optimize catalogs.')}
          </p>
        </div>

        {/* Top Badges */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div 
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[11px] font-bold shadow-sm"
            style={{ 
              backgroundColor: 'var(--color-inner-dark)', 
              borderColor: 'var(--color-emerald)',
              color: 'var(--color-emerald)' 
            }}
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>.env Isolated (Zero Secret Leak)</span>
          </div>

          <div 
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[11px] font-bold shadow-sm"
            style={{ 
              backgroundColor: 'var(--color-inner-dark)', 
              borderColor: isConnected ? 'var(--color-emerald)' : 'rgba(239, 68, 68, 0.4)',
              color: isConnected ? 'var(--color-emerald)' : '#ef4444'
            }}
          >
            <Activity className="h-3.5 w-3.5" />
            <span>{isConnected ? t('statusConnected', 'Connected') : t('statusDisconnected', 'Disconnected')}</span>
          </div>

          {isConnected && (
            <div 
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[11px] font-bold shadow-sm"
              style={{ 
                backgroundColor: 'var(--color-inner-dark)', 
                borderColor: 'var(--color-border)', 
                color: 'var(--color-text)' 
              }}
            >
              <Zap className="h-3.5 w-3.5" style={{ color: 'var(--color-primary)' }} />
              <span>{latency} ms</span>
            </div>
          )}

          <button
            type="button"
            onClick={() => loadDatabaseData(false)}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition hover:opacity-80 cursor-pointer shadow-sm disabled:opacity-50"
            style={{ 
              backgroundColor: 'var(--color-inner-dark)', 
              borderColor: 'var(--color-border)',
              color: 'var(--color-text)'
            }}
            title={t('refreshBtn', 'Refresh Telemetry')}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {/* ACTIVE CONNECTED DATABASE OVERVIEW WIDGET */}
      <div 
        role="region"
        aria-label="Active Database Connection Status"
        data-lpignore="true"
        className="p-5 rounded-3xl border shadow-sm transition-colors duration-200"
        style={{
          backgroundColor: 'var(--color-inner-dark)',
          borderColor: 'var(--color-border)'
        }}
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3.5">
            <div 
              className="p-3 rounded-2xl flex items-center justify-center shrink-0 shadow-sm"
              style={{ 
                backgroundColor: 'var(--color-card)', 
                borderColor: 'var(--color-border)',
                borderWidth: '1px',
                color: 'var(--color-primary)'
              }}
            >
              <Database className="h-6 w-6" />
            </div>

            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--color-text-secondary)' }}>
                  Currently Connected Database:
                </span>
                <span 
                  className="px-2.5 py-0.5 rounded-full text-xs font-extrabold border flex items-center gap-1.5"
                  style={{
                    backgroundColor: isConnected ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                    borderColor: isConnected ? 'var(--color-emerald)' : '#ef4444',
                    color: isConnected ? 'var(--color-emerald)' : '#ef4444'
                  }}
                >
                  <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
                  {isConnected ? 'ACTIVE & CONNECTED' : 'DISCONNECTED'}
                </span>

                <span 
                  className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border"
                  style={{
                    backgroundColor: 'var(--color-card)',
                    borderColor: 'var(--color-border)',
                    color: 'var(--color-primary)'
                  }}
                >
                  {activeProfile.replace('_', ' ')}
                </span>
              </div>

              <div className="flex flex-wrap items-baseline gap-3 mt-1.5">
                <h2 className="text-xl font-black tracking-tight" style={{ color: 'var(--color-text)' }}>
                  {databaseName}
                </h2>
                <span className="text-xs font-bold" style={{ color: 'var(--color-text-secondary)' }}>
                  • {databaseType}
                </span>
              </div>

              <p className="text-[11px] font-mono mt-1 opacity-80" style={{ color: 'var(--color-text-secondary)' }}>
                Endpoint: <span className="font-bold" style={{ color: 'var(--color-text)' }}>{hostEndpoint}</span> | Engine: <span className="font-bold capitalize">{engine}</span> | Ping: <span className="font-bold text-emerald-400">{latency} ms</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 self-start lg:self-center shrink-0">
            <button
              type="button"
              onClick={() => loadDatabaseData(false)}
              disabled={loading}
              className="px-4 py-2 rounded-xl border text-xs font-bold transition hover:opacity-90 cursor-pointer flex items-center gap-2 shadow-sm disabled:opacity-50"
              style={{
                backgroundColor: 'var(--color-card)',
                borderColor: 'var(--color-border)',
                color: 'var(--color-text)'
              }}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} style={{ color: 'var(--color-primary)' }} />
              <span>Refresh Status</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Accessible Region Container */}
      <div 
        role="region"
        aria-label="Database Configuration Tabs"
        data-lpignore="true"
        className="rounded-3xl p-6 space-y-6 shadow-xl border transition-colors duration-200"
        style={{
          backgroundColor: 'var(--color-card)',
          borderColor: 'var(--color-border)'
        }}
      >
        {/* NAVIGATION TABS BAR */}
        <div 
          className="flex p-1.5 rounded-2xl border transition-colors duration-200 overflow-x-auto gap-1"
          style={{
            backgroundColor: 'var(--color-inner-dark)',
            borderColor: 'var(--color-border)'
          }}
        >
          {/* TAB 1: Data Migration & Sync */}
          <button
            type="button"
            onClick={() => { setActiveTab('migration'); setToast(null); }}
            className="flex-1 min-w-[170px] py-3 px-3 text-xs font-bold rounded-xl flex items-center justify-center gap-2 transition cursor-pointer"
            style={activeTab === 'migration' ? {
              backgroundColor: 'var(--color-card)',
              color: 'var(--color-primary)',
              borderColor: 'var(--color-primary)',
              borderWidth: '1px',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
            } : {
              color: 'var(--color-text-secondary)'
            }}
          >
            <ArrowRightLeft className="h-4 w-4 shrink-0" />
            <span>{t('tabMigration', 'Data Migration & Sync')}</span>
          </button>

          {/* TAB 2: Supabase Cloud */}
          <button
            type="button"
            onClick={() => { setActiveTab('supabase'); setToast(null); }}
            className="flex-1 min-w-[170px] py-3 px-3 text-xs font-bold rounded-xl flex items-center justify-center gap-2 transition cursor-pointer relative"
            style={activeTab === 'supabase' ? {
              backgroundColor: 'var(--color-card)',
              color: 'var(--color-primary)',
              borderColor: 'var(--color-primary)',
              borderWidth: '1px',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
            } : {
              color: 'var(--color-text-secondary)'
            }}
          >
            <Cloud className="h-4 w-4 shrink-0" />
            <span>{t('tabSupabase', 'Supabase Cloud')}</span>
            {isSupabaseActive && (
              <span 
                className="px-2 py-0.5 rounded-full text-[10px] font-extrabold flex items-center gap-1 border shrink-0"
                style={{
                  backgroundColor: 'rgba(16, 185, 129, 0.15)',
                  borderColor: 'var(--color-emerald)',
                  color: 'var(--color-emerald)'
                }}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Active
              </span>
            )}
          </button>

          {/* TAB 3: MySQL / Localhost Database */}
          <button
            type="button"
            onClick={() => { setActiveTab('localhost'); setToast(null); }}
            className="flex-1 min-w-[170px] py-3 px-3 text-xs font-bold rounded-xl flex items-center justify-center gap-2 transition cursor-pointer relative"
            style={activeTab === 'localhost' ? {
              backgroundColor: 'var(--color-card)',
              color: 'var(--color-primary)',
              borderColor: 'var(--color-primary)',
              borderWidth: '1px',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
            } : {
              color: 'var(--color-text-secondary)'
            }}
          >
            <Server className="h-4 w-4 shrink-0" />
            <span>{t('tabLocalhost', 'MySQL / Local Database')}</span>
            {isLocalhostActive && (
              <span 
                className="px-2 py-0.5 rounded-full text-[10px] font-extrabold flex items-center gap-1 border shrink-0"
                style={{
                  backgroundColor: 'rgba(16, 185, 129, 0.15)',
                  borderColor: 'var(--color-emerald)',
                  color: 'var(--color-emerald)'
                }}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Active ({engine === 'mysql' ? 'MySQL' : 'PG'})
              </span>
            )}
          </button>

          {/* TAB 4: Telemetry */}
          <button
            type="button"
            onClick={() => { setActiveTab('telemetry'); setToast(null); }}
            className="flex-1 min-w-[170px] py-3 px-3 text-xs font-bold rounded-xl flex items-center justify-center gap-2 transition cursor-pointer"
            style={activeTab === 'telemetry' ? {
              backgroundColor: 'var(--color-card)',
              color: 'var(--color-primary)',
              borderColor: 'var(--color-primary)',
              borderWidth: '1px',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
            } : {
              color: 'var(--color-text-secondary)'
            }}
          >
            <Activity className="h-4 w-4 shrink-0" />
            <span>{t('tabTelemetry', 'Live Telemetry & Status')}</span>
          </button>
        </div>

        {/* TAB 1: FULL DATA MIGRATION & SYNC */}
        {activeTab === 'migration' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-bold flex items-center gap-2" style={{ color: 'var(--color-text)' }}>
                  <ArrowRightLeft className="h-4 w-4" style={{ color: 'var(--color-primary)' }} />
                  {t('tabMigration', 'Database Migration & Parity Synchronization')}
                </h3>
                <p className="text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
                  Synchronize all operational schemas and live records between Supabase Cloud (PostgreSQL) and Hostinger / Local MySQL.
                </p>
              </div>
            </div>

            {/* SYNC ACTIONS GRID */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Card 1: Sync to MySQL */}
              <div 
                className="p-5 rounded-2xl border space-y-3 flex flex-col justify-between shadow-sm transition-colors duration-200"
                style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-primary)' }}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs font-bold" style={{ color: 'var(--color-text)' }}>
                      Sync Database to MySQL
                    </h4>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold border" style={{ backgroundColor: 'rgba(16, 185, 129, 0.12)', borderColor: 'var(--color-emerald)', color: 'var(--color-emerald)' }}>
                      PG → MySQL
                    </span>
                  </div>
                  <p className="text-[11px] mt-1" style={{ color: 'var(--color-text-secondary)' }}>
                    Pulls all records from Supabase Cloud PostgreSQL, sanitizes JSON and booleans, and writes them into Hostinger/Local MySQL using upserts.
                  </p>
                </div>

                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handleSyncToMysql}
                    disabled={syncingToMysql || syncingToSupabase}
                    className="w-full py-2.5 rounded-xl text-xs font-bold text-white shadow transition hover:opacity-90 cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
                    style={{ backgroundColor: 'var(--color-primary)' }}
                  >
                    <ArrowDownLeft className={`h-4 w-4 ${syncingToMysql ? 'animate-bounce' : ''}`} />
                    <span>{syncingToMysql ? 'Syncing into MySQL...' : 'Execute Sync to MySQL'}</span>
                  </button>
                </div>
              </div>

              {/* Card 2: Sync to Supabase Cloud */}
              <div 
                className="p-5 rounded-2xl border space-y-3 flex flex-col justify-between shadow-sm transition-colors duration-200"
                style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)' }}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs font-bold" style={{ color: 'var(--color-text)' }}>
                      Sync Database to Supabase
                    </h4>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold border" style={{ backgroundColor: 'rgba(59, 130, 246, 0.12)', borderColor: '#3b82f6', color: '#3b82f6' }}>
                      MySQL → PG
                    </span>
                  </div>
                  <p className="text-[11px] mt-1" style={{ color: 'var(--color-text-secondary)' }}>
                    Reads all records from your MySQL database and upserts them directly into your connected Supabase Cloud PostgreSQL database.
                  </p>
                </div>

                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handleSyncToSupabase}
                    disabled={syncingToMysql || syncingToSupabase}
                    className="w-full py-2.5 rounded-xl border text-xs font-bold transition hover:opacity-80 cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
                    style={{
                      backgroundColor: 'var(--color-card)',
                      borderColor: 'var(--color-border)',
                      color: 'var(--color-text)'
                    }}
                  >
                    <ArrowUpRight className={`h-4 w-4 ${syncingToSupabase ? 'animate-bounce' : ''}`} />
                    <span>{syncingToSupabase ? 'Syncing to Supabase...' : 'Execute Sync to Supabase'}</span>
                  </button>
                </div>
              </div>

              {/* Card 3: Optimize Catalogs */}
              <div 
                className="p-5 rounded-2xl border space-y-3 flex flex-col justify-between shadow-sm transition-colors duration-200"
                style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)' }}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs font-bold" style={{ color: 'var(--color-text)' }}>
                      Optimize & Vacuum Catalogs
                    </h4>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold border" style={{ backgroundColor: 'rgba(234, 179, 8, 0.12)', borderColor: '#eab308', color: '#eab308' }}>
                      Maintenance
                    </span>
                  </div>
                  <p className="text-[11px] mt-1" style={{ color: 'var(--color-text-secondary)' }}>
                    Reaps dead tuples, analyzes query planner selectivity, and executes <code className="font-mono">OPTIMIZE TABLE</code> across active MySQL schemas.
                  </p>
                </div>

                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handleOptimizeTables}
                    disabled={optimizing}
                    className="w-full py-2.5 rounded-xl border text-xs font-bold transition hover:opacity-80 cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
                    style={{
                      backgroundColor: 'var(--color-card)',
                      borderColor: 'var(--color-border)',
                      color: 'var(--color-text)'
                    }}
                  >
                    <Wrench className={`h-4 w-4 ${optimizing ? 'animate-spin' : ''}`} />
                    <span>{optimizing ? 'Optimizing...' : 'Optimize & Vacuum'}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* LAST SYNC TELEMETRY CARD */}
            {lastSyncTelemetry && (
              <div 
                className="p-4 rounded-2xl border space-y-2 animate-in fade-in"
                style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-emerald)' }}
              >
                <div className="flex items-center justify-between text-xs font-bold">
                  <span className="flex items-center gap-2 text-emerald-400">
                    <CheckCircle2 className="h-4 w-4" />
                    Last Sync Completed: {lastSyncTelemetry.totalRowsTransferred} rows transferred across {lastSyncTelemetry.totalTables} tables
                  </span>
                  <span className="font-mono opacity-80" style={{ color: 'var(--color-text-secondary)' }}>
                    Duration: {lastSyncTelemetry.durationMs}ms
                  </span>
                </div>
              </div>
            )}

            {/* Paginated Operational Tables Subsystem */}
            {renderPaginatedTableSection(
              'Synchronized Schemas & Operational Tables',
              'Real-time inspection of database table row volumes, disk footprints, and synchronization health.'
            )}
          </div>
        )}

        {/* TAB 2: SUPABASE CLOUD CONFIG */}
        {activeTab === 'supabase' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-bold flex items-center gap-2" style={{ color: 'var(--color-text)' }}>
                  <Cloud className="h-4 w-4" style={{ color: 'var(--color-primary)' }} />
                  {t('tabSupabase', 'Supabase Cloud')} (.env Synchronized)
                </h3>
                <p className="text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
                  Configure hosted PostgreSQL cloud instance, transaction pooler URI (Port 6543), and client keys.
                </p>
              </div>

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => handleConnectDatabase('supabase_cloud', supabasePoolerUri || supabaseUrl)}
                  disabled={connecting || isSupabaseActive}
                  className="px-4 py-2 rounded-xl text-xs font-bold shadow-sm transition hover:opacity-90 cursor-pointer flex items-center gap-2 disabled:opacity-80"
                  style={isSupabaseActive ? {
                    backgroundColor: 'rgba(16, 185, 129, 0.15)',
                    borderColor: 'var(--color-emerald)',
                    borderWidth: '1px',
                    color: 'var(--color-emerald)'
                  } : {
                    backgroundColor: 'var(--color-primary)',
                    color: '#ffffff'
                  }}
                >
                  <Power className="h-3.5 w-3.5" />
                  <span>
                    {isSupabaseActive 
                      ? '✓ Supabase Connected & Active' 
                      : (connecting ? 'Connecting...' : 'Connect Supabase Cloud')}
                  </span>
                </button>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold mb-1" style={{ color: 'var(--color-text)' }}>
                  {t('supabaseUrlLabel', 'Supabase Project URL')} (NEXT_PUBLIC_SUPABASE_URL)
                </label>
                <input
                  type="text"
                  autoComplete="off"
                  data-lpignore="true"
                  data-form-type="other"
                  spellCheck={false}
                  value={supabaseUrl}
                  onChange={(e) => setSupabaseUrl(e.target.value)}
                  className="w-full border rounded-xl px-3 py-2 text-xs font-bold outline-none font-mono"
                  style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                />
              </div>

              <div>
                <label className="block text-xs font-bold mb-1" style={{ color: 'var(--color-text)' }}>
                  {t('supabaseAnonKeyLabel', 'Supabase Anon / Publishable Key')}
                </label>
                <input
                  type="text"
                  autoComplete="off"
                  data-lpignore="true"
                  data-form-type="other"
                  spellCheck={false}
                  value={supabaseAnonKey}
                  onChange={(e) => setSupabaseAnonKey(e.target.value)}
                  className="w-full border rounded-xl px-3 py-2 text-xs font-bold outline-none font-mono"
                  style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                />
              </div>

              <div>
                <label className="block text-xs font-bold mb-1" style={{ color: 'var(--color-text)' }}>
                  {t('supabaseServiceKeyLabel', 'Supabase Service Role Key (Secret)')}
                </label>
                <div className="relative">
                  <input
                    type={showSupabaseSecret ? 'text' : 'password'}
                    autoComplete="new-password"
                    data-lpignore="true"
                    data-form-type="other"
                    spellCheck={false}
                    value={supabaseServiceKey}
                    onChange={(e) => setSupabaseServiceKey(e.target.value)}
                    className="w-full border rounded-xl px-3 py-2 pr-9 text-xs font-bold outline-none font-mono"
                    style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowSupabaseSecret(!showSupabaseSecret)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-xs opacity-60 hover:opacity-100 cursor-pointer"
                    style={{ color: 'var(--color-text)' }}
                  >
                    {showSupabaseSecret ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold mb-1" style={{ color: 'var(--color-text)' }}>
                  {t('supabasePoolerUriLabel', 'Supabase Transaction Pooler URI (Port 6543)')} (DATABASE_URL)
                </label>
                <input
                  type="text"
                  autoComplete="off"
                  data-lpignore="true"
                  data-form-type="other"
                  spellCheck={false}
                  value={supabasePoolerUri}
                  onChange={(e) => setSupabasePoolerUri(e.target.value)}
                  className="w-full border rounded-xl px-3 py-2 text-xs font-bold outline-none font-mono"
                  style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-3 pt-3 border-t" style={{ borderColor: 'var(--color-border)' }}>
              <button
                type="button"
                onClick={() => handleTestConnection(supabasePoolerUri || supabaseUrl, 'supabase_cloud')}
                disabled={testing}
                className="px-4 py-2 rounded-xl border text-xs font-bold transition hover:opacity-80 cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                style={{
                  backgroundColor: 'var(--color-inner-dark)',
                  borderColor: 'var(--color-border)',
                  color: 'var(--color-text)'
                }}
              >
                <Zap className={`h-3.5 w-3.5 ${testing ? 'animate-pulse' : ''}`} style={{ color: 'var(--color-primary)' }} />
                <span>{testing ? t('statusTesting', 'Testing Socket...') : 'Test Supabase Connection'}</span>
              </button>

              <button
                type="button"
                onClick={() => handleSaveConnection('supabase_cloud', supabasePoolerUri || supabaseUrl)}
                disabled={saving}
                className="px-5 py-2 rounded-xl text-xs font-bold transition hover:opacity-90 cursor-pointer disabled:opacity-50 border"
                style={{ 
                  backgroundColor: 'var(--color-inner-dark)', 
                  borderColor: 'var(--color-primary)',
                  color: 'var(--color-primary)' 
                }}
              >
                {saving ? t('statusSaving', 'Saving to .env...') : 'Save to .env.local'}
              </button>
            </div>
          </div>
        )}

        {/* TAB 3: MYSQL / LOCALHOST CONFIG */}
        {activeTab === 'localhost' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-bold" style={{ color: 'var(--color-text)' }}>
                  {t('tabLocalhost', 'MySQL / Localhost Database')} (.env Synchronized)
                </h3>
                <p className="text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
                  Direct database driver configuration for MySQL (Port 3306) and PostgreSQL (Port 5432).
                </p>
              </div>

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => handleConnectDatabase(localhostType === 'mysql' ? 'localhost_mysql' : 'localhost_postgres', localhostUri)}
                  disabled={connecting || isLocalhostActive}
                  className="px-4 py-2 rounded-xl text-xs font-bold shadow-sm transition hover:opacity-90 cursor-pointer flex items-center gap-2 disabled:opacity-80"
                  style={isLocalhostActive ? {
                    backgroundColor: 'rgba(16, 185, 129, 0.15)',
                    borderColor: 'var(--color-emerald)',
                    borderWidth: '1px',
                    color: 'var(--color-emerald)'
                  } : {
                    backgroundColor: 'var(--color-primary)',
                    color: '#ffffff'
                  }}
                >
                  <Power className="h-3.5 w-3.5" />
                  <span>
                    {isLocalhostActive 
                      ? `✓ MySQL Connected & Active` 
                      : (connecting ? 'Connecting...' : `Connect MySQL (Port 3306)`)}
                  </span>
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold" style={{ color: 'var(--color-text)' }}>
                {t('connectionUriLabel', 'Connection URI / Connection String')} (MYSQL_URL)
              </label>
              <input
                type="text"
                autoComplete="off"
                data-lpignore="true"
                data-form-type="other"
                spellCheck={false}
                value={localhostUri}
                onChange={(e) => setLocalhostUri(e.target.value)}
                className="w-full border rounded-xl px-4 py-2.5 text-xs font-mono font-bold outline-none transition"
                style={{
                  backgroundColor: 'var(--color-inner-dark)',
                  borderColor: 'var(--color-border)',
                  color: 'var(--color-text)'
                }}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 pt-1">
              <div>
                <label className="block text-xs font-bold mb-1" style={{ color: 'var(--color-text)' }}>
                  Host / Server Address
                </label>
                <input
                  type="text"
                  autoComplete="off"
                  data-lpignore="true"
                  data-form-type="other"
                  spellCheck={false}
                  value={host}
                  onChange={(e) => {
                    setHost(e.target.value);
                    updateGranularToUri(e.target.value, port, dbName, username, password, localhostType);
                  }}
                  className="w-full border rounded-xl px-3 py-2 text-xs font-bold outline-none font-mono"
                  style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                />
              </div>

              <div>
                <label className="block text-xs font-bold mb-1" style={{ color: 'var(--color-text)' }}>
                  Port
                </label>
                <input
                  type="text"
                  autoComplete="off"
                  data-lpignore="true"
                  data-form-type="other"
                  spellCheck={false}
                  value={port}
                  onChange={(e) => {
                    setPort(e.target.value);
                    updateGranularToUri(host, e.target.value, dbName, username, password, localhostType);
                  }}
                  className="w-full border rounded-xl px-3 py-2 text-xs font-bold outline-none font-mono"
                  style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                />
              </div>

              <div>
                <label className="block text-xs font-bold mb-1" style={{ color: 'var(--color-text)' }}>
                  Database Name
                </label>
                <input
                  type="text"
                  autoComplete="off"
                  data-lpignore="true"
                  data-form-type="other"
                  spellCheck={false}
                  value={dbName}
                  onChange={(e) => {
                    setDbName(e.target.value);
                    updateGranularToUri(host, port, e.target.value, username, password, localhostType);
                  }}
                  className="w-full border rounded-xl px-3 py-2 text-xs font-bold outline-none font-mono"
                  style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                />
              </div>

              <div>
                <label className="block text-xs font-bold mb-1" style={{ color: 'var(--color-text)' }}>
                  Username
                </label>
                <input
                  type="text"
                  autoComplete="off"
                  data-lpignore="true"
                  data-form-type="other"
                  spellCheck={false}
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    updateGranularToUri(host, port, dbName, e.target.value, password, localhostType);
                  }}
                  className="w-full border rounded-xl px-3 py-2 text-xs font-bold outline-none font-mono"
                  style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                />
              </div>

              <div>
                <label className="block text-xs font-bold mb-1" style={{ color: 'var(--color-text)' }}>
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    data-lpignore="true"
                    data-form-type="other"
                    spellCheck={false}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      updateGranularToUri(host, port, dbName, username, e.target.value, localhostType);
                    }}
                    className="w-full border rounded-xl px-3 py-2 pr-9 text-xs font-bold outline-none font-mono"
                    style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-xs opacity-60 hover:opacity-100 cursor-pointer"
                    style={{ color: 'var(--color-text)' }}
                  >
                    {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-3 pt-3 border-t" style={{ borderColor: 'var(--color-border)' }}>
              <button
                type="button"
                onClick={() => handleTestConnection(localhostUri, 'localhost_mysql')}
                disabled={testing}
                className="px-4 py-2 rounded-xl border text-xs font-bold transition hover:opacity-80 cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                style={{
                  backgroundColor: 'var(--color-inner-dark)',
                  borderColor: 'var(--color-border)',
                  color: 'var(--color-text)'
                }}
              >
                <Zap className={`h-3.5 w-3.5 ${testing ? 'animate-pulse' : ''}`} style={{ color: 'var(--color-primary)' }} />
                <span>{testing ? t('statusTesting', 'Testing Socket...') : 'Test MySQL Socket'}</span>
              </button>

              <button
                type="button"
                onClick={() => handleSaveConnection('localhost_mysql', localhostUri)}
                disabled={saving}
                className="px-5 py-2 rounded-xl text-xs font-bold transition hover:opacity-90 cursor-pointer disabled:opacity-50 border"
                style={{ 
                  backgroundColor: 'var(--color-inner-dark)', 
                  borderColor: 'var(--color-primary)',
                  color: 'var(--color-primary)' 
                }}
              >
                {saving ? t('statusSaving', 'Saving to .env...') : 'Save to .env.local'}
              </button>
            </div>
          </div>
        )}

        {/* TAB 4: LIVE TELEMETRY & STATUS */}
        {activeTab === 'telemetry' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-bold flex items-center gap-2" style={{ color: 'var(--color-text)' }}>
                <Activity className="h-4 w-4" style={{ color: 'var(--color-primary)' }} />
                {t('tabTelemetry', 'Live Telemetry & Status')}
              </h3>
              <p className="text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
                Real-time runtime statistics from database system catalogs.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {[
                { label: t('telemetryLatency', 'Ping Latency'), val: `${latency} ms`, icon: Zap },
                { label: t('telemetryActiveConns', 'Active Pool Connections'), val: telemetry.activeConnections, icon: Server },
                { label: t('telemetryDbSize', 'Database Disk Footprint'), val: telemetry.databaseSize, icon: HardDrive },
                { label: t('telemetryCacheHit', 'Cache Hit Efficiency'), val: telemetry.cacheHitRatio, icon: Activity },
                { label: t('telemetryUptime', 'Database Uptime'), val: telemetry.uptime, icon: Cpu },
                { label: t('telemetrySsl', 'SSL Encryption'), val: telemetry.ssl ? t('enabledBadge', 'Enabled') : t('disabledBadge', 'Disabled'), icon: Lock }
              ].map((card, idx) => (
                <div 
                  key={`telemetry-card-${idx}`}
                  className="p-3.5 rounded-2xl border flex flex-col justify-between h-24"
                  style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)' }}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold" style={{ color: 'var(--color-text-secondary)' }}>{card.label}</span>
                    <card.icon className="h-3.5 w-3.5" style={{ color: 'var(--color-primary)' }} />
                  </div>
                  <div className="text-sm font-black font-mono" style={{ color: 'var(--color-text)' }}>
                    {card.val}
                  </div>
                </div>
              ))}
            </div>

            {renderPaginatedTableSection(
              'Core Operational Tables Tracked',
              'System catalog metrics, disk utilization, and table storage profiles across active schemas.'
            )}
          </div>
        )}

        {/* Toast Banner */}
        {toast && (
          <div
            className="p-4 rounded-2xl border text-xs font-semibold flex items-center gap-2 animate-in fade-in"
            style={{
              backgroundColor: 'var(--color-inner-dark)',
              borderColor: toast.type === 'success' ? 'var(--color-emerald)' : 'rgba(239, 68, 68, 0.4)',
              color: toast.type === 'success' ? 'var(--color-emerald)' : '#ef4444'
            }}
          >
            {toast.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: 'var(--color-emerald)' }} />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
            )}
            <span>{toast.message}</span>
          </div>
        )}
      </div>
    </div>
  );
}
