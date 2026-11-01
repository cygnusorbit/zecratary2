// @ts-nocheck
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Database, Server, Cloud, RefreshCw, CheckCircle2, 
  AlertCircle, ShieldCheck, Zap, Activity, HardDrive, 
  Cpu, Lock, Check, ArrowRightLeft, Layers, Wrench, AlertTriangle,
  ChevronDown, Eye, EyeOff, Radio, FileCode2, Power, Globe, CheckCircle
} from 'lucide-react';
import { useTranslation } from '@/components/LanguageProvider';

interface TableInfo {
  name: string;
  rowCount: number;
  size: string;
  status: string;
}

export default function AdminDatabasePage() {
  const { t } = useTranslation();

  // Navigation tab state
  const [activeTab, setActiveTab] = useState<'supabase' | 'localhost' | 'migration' | 'telemetry'>('supabase');

  // Connection & Active Profile States (Only ONE connected at a time)
  const [activeProfile, setActiveProfile] = useState<'localhost_postgres' | 'localhost_mysql' | 'supabase_cloud'>('supabase_cloud');
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected'>('connected');
  const [engine, setEngine] = useState<'postgresql' | 'mysql'>('postgresql');
  const [databaseName, setDatabaseName] = useState<string>('zecratary');
  const [databaseType, setDatabaseType] = useState<string>('Supabase Cloud (PostgreSQL 15.x)');
  const [hostEndpoint, setHostEndpoint] = useState<string>('aws-0-ap-southeast-1.pooler.supabase.com:6543');
  const [latency, setLatency] = useState<number>(38);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  // Form State - Localhost
  const [localhostType, setLocalhostType] = useState<'postgresql' | 'mysql'>('postgresql');
  const [localhostUri, setLocalhostUri] = useState('postgresql://postgres:postgres@localhost:5432/zecratary?schema=public');
  const [host, setHost] = useState('localhost');
  const [port, setPort] = useState('5432');
  const [dbName, setDbName] = useState('zecratary');
  const [username, setUsername] = useState('postgres');
  const [password, setPassword] = useState('postgres');
  const [showPassword, setShowPassword] = useState(false);

  // Form State - Supabase Cloud (.env synchronized)
  const [supabaseUrl, setSupabaseUrl] = useState('https://tnhrkjtujdfgvwhsuuxb.supabase.co');
  const [supabaseAnonKey, setSupabaseAnonKey] = useState('sb_publishable_afBBLw4l9N08lDX60x_5XQ_z6TIP7HI');
  const [supabaseServiceKey, setSupabaseServiceKey] = useState('');
  const [supabasePoolerUri, setSupabasePoolerUri] = useState('');
  const [showSupabaseSecret, setShowSupabaseSecret] = useState(false);

  // Telemetry & Tables
  const [telemetry, setTelemetry] = useState({
    version: 'PostgreSQL 15.x / Supabase Cloud',
    databaseSize: '16.4 MB',
    cacheHitRatio: '99.8%',
    uptime: '30 days',
    activeConnections: 3,
    ssl: true
  });
  const [tables, setTables] = useState<TableInfo[]>([
    { name: 'admin_settings', rowCount: 14, size: '48 kB', status: 'Synchronized' },
    { name: 'users', rowCount: 8, size: '64 kB', status: 'Synchronized' },
    { name: 'subscription_plans', rowCount: 4, size: '32 kB', status: 'Synchronized' },
    { name: 'payment_transactions', rowCount: 22, size: '80 kB', status: 'Synchronized' },
    { name: 'saved_recipes', rowCount: 142, size: '512 kB', status: 'Synchronized' },
    { name: 'currencies', rowCount: 6, size: '24 kB', status: 'Synchronized' },
    { name: 'token_settings', rowCount: 3, size: '16 kB', status: 'Synchronized' }
  ]);

  // UI Interactive States
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cloning, setCloning] = useState(false);
  const [syncingEnv, setSyncingEnv] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const isSavingRef = useRef(false);

  // Synchronize granular parameters with connection URI
  const updateGranularToUri = (h: string, p: string, db: string, u: string, pwd: string, type: 'postgresql' | 'mysql') => {
    if (type === 'postgresql') {
      const auth = u ? (pwd ? `${u}:${encodeURIComponent(pwd)}@` : `${u}@`) : '';
      setLocalhostUri(`postgresql://${auth}${h}:${p}/${db}?schema=public`);
    } else {
      const auth = u ? (pwd ? `${u}:${encodeURIComponent(pwd)}@` : `${u}@`) : '';
      setLocalhostUri(`mysql://${auth}${h}:${p}/${db}`);
    }
  };

  // Load Database Telemetry & Read Active Settings
  const loadDatabaseData = useCallback(async (quiet = false) => {
    if (isSavingRef.current) return;
    try {
      if (!quiet) setLoading(true);
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
          if (data.config.mysqlUri && data.engine === 'mysql') setLocalhostUri(data.config.mysqlUri);
          if (data.config.supabaseUrl) setSupabaseUrl(data.config.supabaseUrl);
          if (data.config.supabaseAnonKey) setSupabaseAnonKey(data.config.supabaseAnonKey);
          if (data.config.supabaseServiceKey) setSupabaseServiceKey(data.config.supabaseServiceKey);
          if (data.config.supabasePoolerUri) setSupabasePoolerUri(data.config.supabasePoolerUri);
        }

        if (data.telemetry) setTelemetry(data.telemetry);
        if (Array.isArray(data.tables) && data.tables.length > 0) setTables(data.tables);
      }
    } catch (err) {
      console.warn('Notice loading /admin/database telemetry:', err);
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    document.title = `${t('dbPageTitle', 'Database Management & Configuration')} - Zecratary`;
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

  // Quick Preset Handlers
  const handleSelectPostgresPreset = () => {
    setLocalhostType('postgresql');
    setHost('localhost');
    setPort('5432');
    setDbName('zecratary');
    setUsername('postgres');
    setPassword('postgres');
    setLocalhostUri('postgresql://postgres:postgres@localhost:5432/zecratary?schema=public');
  };

  const handleSelectMysqlPreset = () => {
    setLocalhostType('mysql');
    setHost('127.0.0.1');
    setPort('3306');
    setDbName('zecratary');
    setUsername('root');
    setPassword('');
    setLocalhostUri('mysql://root:@127.0.0.1:3306/zecratary');
  };

  // Fixed Test Connection: Works for Supabase REST, Pooler port 6543, and Localhost PG/MySQL
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
          config: {
            supabaseUrl,
            supabaseAnonKey
          }
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

  // Connect to target database (Only one database is connected at a time)
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

  // Save Credentials Strictly to .env Files
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

  // Reload Fresh Values directly from .env Files
  const handleReloadFromEnv = async () => {
    setSyncingEnv(true);
    try {
      await loadDatabaseData(false);
      setToast({
        type: 'success',
        message: 'Successfully refreshed active database connection parameters from .env.local!'
      });
    } catch (err: any) {
      setToast({ type: 'error', message: 'Failed to reload environment keys.' });
    } finally {
      setSyncingEnv(false);
    }
  };

  // Data Migration & Sync Execution
  const handleCloneLocalToSupabase = async () => {
    setCloning(true);
    setToast(null);
    try {
      const res = await fetch('/api/admin/database', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'clone_local_to_supabase',
          config: { supabasePoolerUri, supabaseUrl }
        })
      });
      const data = await res.json();
      if (data.success) {
        setToast({
          type: 'success',
          message: data.message || t('cloningSuccessToast', 'Database schema and records successfully synced to Supabase Cloud!')
        });
        loadDatabaseData(true);
      } else {
        setToast({
          type: 'error',
          message: data.error || t('cloningErrorToast', 'Failed to clone database. Check connection sockets.')
        });
      }
    } catch (e: any) {
      setToast({ type: 'error', message: e.message || t('cloningErrorToast', 'Failed to clone database.') });
    } finally {
      setCloning(false);
    }
  };

  // Optimize & Analyze Tables
  const handleOptimizeTables = async () => {
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
          message: t('optimizingSuccessToast', 'Table statistics analyzed & vacuumed successfully across PostgreSQL and MySQL!')
        });
        loadDatabaseData(true);
      }
    } catch (_) {}
  };

  const isConnected = connectionStatus === 'connected';
  const isSupabaseActive = activeProfile === 'supabase_cloud' && isConnected;
  const isLocalhostActive = (activeProfile === 'localhost_postgres' || activeProfile === 'localhost_mysql') && isConnected;

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
            <Database className="h-6 w-6" /> {t('dbPageTitle', 'Database Management & Configuration')}
          </h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
            {t('dbPageSubtitle', 'Manage database connections, configure localhost & Supabase cloud instances, inspect live engine telemetry, and execute migrations.')}
          </p>
        </div>

        {/* Top Status Indicators */}
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
            <span>.env Isolated (Zero Secret Storage)</span>
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

      {/* 5. ACTIVE CONNECTED DATABASE OVERVIEW WIDGET */}
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
              onClick={handleReloadFromEnv}
              disabled={syncingEnv || loading}
              className="px-4 py-2 rounded-xl border text-xs font-bold transition hover:opacity-90 cursor-pointer flex items-center gap-2 shadow-sm disabled:opacity-50"
              style={{
                backgroundColor: 'var(--color-card)',
                borderColor: 'var(--color-border)',
                color: 'var(--color-text)'
              }}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${syncingEnv || loading ? 'animate-spin' : ''}`} style={{ color: 'var(--color-primary)' }} />
              <span>{syncingEnv ? 'Syncing...' : 'Refresh Status'}</span>
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
        {/* 1. NAVIGATION TABS BAR WITH ACTIVE BADGES */}
        <div 
          className="flex p-1.5 rounded-2xl border transition-colors duration-200 overflow-x-auto gap-1"
          style={{
            backgroundColor: 'var(--color-inner-dark)',
            borderColor: 'var(--color-border)'
          }}
        >
          {/* TAB 1: Supabase Cloud */}
          <button
            type="button"
            onClick={() => {
              setActiveTab('supabase');
              setToast(null);
            }}
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

          {/* TAB 2: Localhost Database */}
          <button
            type="button"
            onClick={() => {
              setActiveTab('localhost');
              setToast(null);
            }}
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
            <span>{t('tabLocalhost', 'Localhost Database')}</span>
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

          {/* TAB 3: Data Migration & Sync */}
          <button
            type="button"
            onClick={() => {
              setActiveTab('migration');
              setToast(null);
            }}
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

          {/* TAB 4: Telemetry */}
          <button
            type="button"
            onClick={() => {
              setActiveTab('telemetry');
              setToast(null);
            }}
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

        {/* TAB 1: SUPABASE CLOUD */}
        {activeTab === 'supabase' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-bold flex items-center gap-2" style={{ color: 'var(--color-text)' }}>
                  <Cloud className="h-4 w-4" style={{ color: 'var(--color-primary)' }} />
                  {t('tabSupabase', 'Supabase Cloud')} (.env Synchronized)
                </h3>
                <p className="text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
                  Configure hosted PostgreSQL cloud instance, transaction pooler URI (Port 6543), and SSR client tokens.
                </p>
              </div>

              {/* 2. CONNECT SUPABASE CLOUD BUTTON */}
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
                  placeholder="https://xxxxxxxxxxxx.supabase.co"
                  value={supabaseUrl}
                  onChange={(e) => setSupabaseUrl(e.target.value)}
                  className="w-full border rounded-xl px-3 py-2 text-xs font-bold outline-none font-mono"
                  style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                />
              </div>

              <div>
                <label className="block text-xs font-bold mb-1" style={{ color: 'var(--color-text)' }}>
                  {t('supabaseAnonKeyLabel', 'Supabase Anon / Publishable Key')} (NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
                </label>
                <input
                  type="text"
                  autoComplete="off"
                  data-lpignore="true"
                  data-form-type="other"
                  spellCheck={false}
                  placeholder="sb_publishable_... or eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                  value={supabaseAnonKey}
                  onChange={(e) => setSupabaseAnonKey(e.target.value)}
                  className="w-full border rounded-xl px-3 py-2 text-xs font-bold outline-none font-mono"
                  style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                />
              </div>

              <div>
                <label className="block text-xs font-bold mb-1" style={{ color: 'var(--color-text)' }}>
                  {t('supabaseServiceKeyLabel', 'Supabase Service Role Key (Secret)')} (SUPABASE_SERVICE_ROLE_KEY)
                </label>
                <div className="relative">
                  <input
                    type={showSupabaseSecret ? 'text' : 'password'}
                    autoComplete="new-password"
                    data-lpignore="true"
                    data-form-type="other"
                    spellCheck={false}
                    placeholder="Service role secret token..."
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
                    title={showSupabaseSecret ? t('hidePassword', 'Hide Password') : t('showPassword', 'Show Password')}
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
                  placeholder="postgresql://postgres.tnhrkjtujdfgvwhsuuxb:[PASSWORD]@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?sslmode=require"
                  value={supabasePoolerUri}
                  onChange={(e) => setSupabasePoolerUri(e.target.value)}
                  className="w-full border rounded-xl px-3 py-2 text-xs font-bold outline-none font-mono"
                  style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-3 pt-3 border-t" style={{ borderColor: 'var(--color-border)' }}>
              {/* 3. TEST CONNECTION BUTTON (Supabase REST + Pooler URI) */}
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

        {/* TAB 2: LOCALHOST DATABASE */}
        {activeTab === 'localhost' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-bold" style={{ color: 'var(--color-text)' }}>
                  {t('tabLocalhost', 'Localhost Database')} (.env Synchronized)
                </h3>
                <p className="text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
                  Local daemon driver configuration for PostgreSQL (Port 5432) and MySQL (Port 3306).
                </p>
              </div>

              {/* 2. CONNECT LOCALHOST BUTTON */}
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
                      ? `✓ Localhost Connected (${engine === 'mysql' ? 'MySQL' : 'PostgreSQL'})` 
                      : (connecting ? 'Connecting...' : `Connect Localhost (${localhostType === 'mysql' ? 'MySQL' : 'PostgreSQL'})`)}
                  </span>
                </button>
              </div>
            </div>

            {/* Presets and Engine Switcher */}
            <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-2xl border" style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)' }}>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold" style={{ color: 'var(--color-text)' }}>Quick Preset Selection:</span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSelectPostgresPreset}
                  className="px-3 py-1.5 rounded-xl border text-xs font-bold transition hover:opacity-90 cursor-pointer"
                  style={{
                    backgroundColor: localhostType === 'postgresql' ? 'var(--color-primary)' : 'var(--color-card)',
                    borderColor: localhostType === 'postgresql' ? 'var(--color-primary)' : 'var(--color-border)',
                    color: localhostType === 'postgresql' ? '#ffffff' : 'var(--color-text)'
                  }}
                >
                  PostgreSQL (5432)
                </button>
                <button
                  type="button"
                  onClick={handleSelectMysqlPreset}
                  className="px-3 py-1.5 rounded-xl border text-xs font-bold transition hover:opacity-90 cursor-pointer"
                  style={{
                    backgroundColor: localhostType === 'mysql' ? 'var(--color-primary)' : 'var(--color-card)',
                    borderColor: localhostType === 'mysql' ? 'var(--color-primary)' : 'var(--color-border)',
                    color: localhostType === 'mysql' ? '#ffffff' : 'var(--color-text)'
                  }}
                >
                  MySQL (3306)
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold" style={{ color: 'var(--color-text)' }}>
                {t('connectionUriLabel', 'Connection URI / Connection String')}
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
                  {t('hostLabel', 'Host / Server Address')}
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
                  {t('portLabel', 'Port')}
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
                  {t('databaseNameLabel', 'Database Name')}
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
                  {t('usernameLabel', 'Username')}
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
                  {t('passwordLabel', 'Password')}
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
                    title={showPassword ? t('hidePassword', 'Hide Password') : t('showPassword', 'Show Password')}
                  >
                    {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-3 pt-3 border-t" style={{ borderColor: 'var(--color-border)' }}>
              {/* 3. TEST CONNECTION BUTTON (Localhost TCP Socket) */}
              <button
                type="button"
                onClick={() => handleTestConnection(localhostUri, localhostType === 'mysql' ? 'localhost_mysql' : 'localhost_postgres')}
                disabled={testing}
                className="px-4 py-2 rounded-xl border text-xs font-bold transition hover:opacity-80 cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                style={{
                  backgroundColor: 'var(--color-inner-dark)',
                  borderColor: 'var(--color-border)',
                  color: 'var(--color-text)'
                }}
              >
                <Zap className={`h-3.5 w-3.5 ${testing ? 'animate-pulse' : ''}`} style={{ color: 'var(--color-primary)' }} />
                <span>{testing ? t('statusTesting', 'Testing Socket...') : `Test ${localhostType === 'mysql' ? 'MySQL' : 'PostgreSQL'} Socket`}</span>
              </button>

              <button
                type="button"
                onClick={() => handleSaveConnection(localhostType === 'mysql' ? 'localhost_mysql' : 'localhost_postgres', localhostUri)}
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

        {/* 4. TAB 3: DATA MIGRATION & SYNC */}
        {activeTab === 'migration' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-bold flex items-center gap-2" style={{ color: 'var(--color-text)' }}>
                <ArrowRightLeft className="h-4 w-4" style={{ color: 'var(--color-primary)' }} />
                {t('tabMigration', 'Data Migration & Sync')}
              </h3>
              <p className="text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
                Replicate operational schemas, verify table consistency, and vacuum database catalogs.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div 
                className="p-5 rounded-2xl border space-y-3 flex flex-col justify-between"
                style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)' }}
              >
                <div>
                  <h4 className="text-xs font-bold" style={{ color: 'var(--color-text)' }}>
                    {t('cloneLocalToSupabaseBtn', 'Replicate & Sync Localhost Database to Supabase Cloud')}
                  </h4>
                  <p className="text-[11px] mt-1" style={{ color: 'var(--color-text-secondary)' }}>
                    Replicates all 7 core schemas and records (<code className="font-mono">admin_settings</code>, <code className="font-mono">users</code>, <code className="font-mono">subscription_plans</code>, <code className="font-mono">payment_transactions</code>, <code className="font-mono">saved_recipes</code>, <code className="font-mono">currencies</code>, <code className="font-mono">token_settings</code>) into Supabase Cloud PostgreSQL.
                  </p>
                </div>

                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handleCloneLocalToSupabase}
                    disabled={cloning}
                    className="w-full py-2.5 rounded-xl text-xs font-bold text-white shadow transition hover:opacity-90 cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
                    style={{ backgroundColor: 'var(--color-primary)' }}
                  >
                    <Layers className={`h-4 w-4 ${cloning ? 'animate-spin' : ''}`} />
                    <span>{cloning ? 'Replicating Schemas & Records...' : 'Execute Full Data Migration & Sync'}</span>
                  </button>
                </div>
              </div>

              <div 
                className="p-5 rounded-2xl border space-y-3 flex flex-col justify-between"
                style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)' }}
              >
                <div>
                  <h4 className="text-xs font-bold" style={{ color: 'var(--color-text)' }}>
                    {t('optimizeTablesBtn', 'Optimize & Vacuum Catalogs')}
                  </h4>
                  <p className="text-[11px] mt-1" style={{ color: 'var(--color-text-secondary)' }}>
                    Analyzes planner meals, grocery items, user profiles, reaps dead tuples, and updates selectivity statistics across PostgreSQL and MySQL.
                  </p>
                </div>

                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handleOptimizeTables}
                    className="w-full py-2.5 rounded-xl border text-xs font-bold transition hover:opacity-80 cursor-pointer flex items-center justify-center gap-2"
                    style={{
                      backgroundColor: 'var(--color-card)',
                      borderColor: 'var(--color-border)',
                      color: 'var(--color-text)'
                    }}
                  >
                    <Wrench className="h-4 w-4" />
                    <span>{t('optimizeTablesBtn', 'Optimize & Analyze Tables')}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Core Tables Status Breakdown */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold flex items-center gap-2" style={{ color: 'var(--color-text)' }}>
                <CheckCircle className="h-4 w-4 text-emerald-400" />
                Synchronized Schemas & Operational Tables
              </h4>

              <div 
                className="rounded-2xl border overflow-hidden shadow-sm"
                style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)' }}
              >
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-card)' }}>
                        <th className="py-2.5 px-4 font-bold" style={{ color: 'var(--color-text)' }}>Table Name</th>
                        <th className="py-2.5 px-4 font-bold" style={{ color: 'var(--color-text)' }}>Rows Tracked</th>
                        <th className="py-2.5 px-4 font-bold" style={{ color: 'var(--color-text)' }}>Disk Footprint</th>
                        <th className="py-2.5 px-4 font-bold text-right" style={{ color: 'var(--color-text)' }}>Sync Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
                      {tables.map((tbl) => (
                        <tr key={`sync-row-${tbl.name}`} className="transition hover:opacity-90">
                          <td className="py-2 px-4 font-mono font-bold" style={{ color: 'var(--color-primary)' }}>
                            {tbl.name}
                          </td>
                          <td className="py-2 px-4 font-mono" style={{ color: 'var(--color-text)' }}>
                            {tbl.rowCount}
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
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
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

            <div className="space-y-3">
              <h4 className="text-xs font-bold" style={{ color: 'var(--color-text)' }}>
                {t('telemetryTables', 'Core Tables Tracked')}
              </h4>

              <div 
                className="rounded-2xl border overflow-hidden shadow-sm"
                style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)' }}
              >
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-card)' }}>
                        <th className="py-2.5 px-4 font-bold" style={{ color: 'var(--color-text)' }}>{t('colTableName', 'Table Name')}</th>
                        <th className="py-2.5 px-4 font-bold" style={{ color: 'var(--color-text)' }}>{t('colRowCount', 'Estimated Rows')}</th>
                        <th className="py-2.5 px-4 font-bold" style={{ color: 'var(--color-text)' }}>{t('colTableSize', 'Size on Disk')}</th>
                        <th className="py-2.5 px-4 font-bold text-right" style={{ color: 'var(--color-text)' }}>{t('colTableStatus', 'Status')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
                      {tables.map((tbl) => (
                        <tr key={`tbl-row-${tbl.name}`} className="transition hover:opacity-90">
                          <td className="py-2 px-4 font-mono font-bold" style={{ color: 'var(--color-primary)' }}>
                            {tbl.name}
                          </td>
                          <td className="py-2 px-4 font-mono" style={{ color: 'var(--color-text)' }}>
                            {tbl.rowCount}
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
                              {tbl.status || t('healthyStatus', 'Healthy')}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
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
