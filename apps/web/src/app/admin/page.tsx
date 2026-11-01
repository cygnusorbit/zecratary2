// @ts-nocheck
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Sparkles, Save, RotateCcw, Globe, Search, Tag, User, 
  CheckCircle2, AlertCircle, Palette, Type, Sliders, ExternalLink, 
  ShieldCheck, Upload, UploadCloud, Image as ImageIcon, Trash2, Eye, RefreshCw
} from 'lucide-react';
import { useTranslation } from '@/components/LanguageProvider';
import { 
  fetchSiteConfig, saveSiteConfig, updateFavicon, 
  DEFAULT_SITE_NAME, DEFAULT_SITE_TAGLINE, DEFAULT_TITLEBAR_EMOJI, DEFAULT_FAVICON_EMOJI,
  DEFAULT_FONT_FAMILY
} from '@/lib/siteConfig';

const FONT_OPTIONS = [
  { id: 'Inter, sans-serif', label: 'Inter (Modern Sans)' },
  { id: 'system-ui, -apple-system, sans-serif', label: 'System Native' },
  { id: "'Plus Jakarta Sans', sans-serif", label: 'Plus Jakarta Sans' },
  { id: "'Playfair Display', serif", label: 'Playfair Display (Editorial)' },
  { id: 'monospace', label: 'Monospace (Terminal)' }
];

const PRESET_THEMES = [
  {
    name: 'Coral Glow (Default)',
    primary: '#E05638',
    primaryHover: '#c94529',
    accentEmerald: '#10b981',
    background: '#070b13',
    card: '#0d131f',
    innerDark: '#080d16',
    border: '#1a2234',
    text: '#ffffff',
    textSecondary: '#94a3b8'
  },
  {
    name: 'Emerald Forest',
    primary: '#10b981',
    primaryHover: '#059669',
    accentEmerald: '#34d399',
    background: '#06130d',
    card: '#0a1f16',
    innerDark: '#04100b',
    border: '#133526',
    text: '#ffffff',
    textSecondary: '#86efac'
  },
  {
    name: 'Cyber Blue / Sapphire',
    primary: '#3b82f6',
    primaryHover: '#2563eb',
    accentEmerald: '#10b981',
    background: '#070d18',
    card: '#0c172a',
    innerDark: '#050a14',
    border: '#1e293b',
    text: '#ffffff',
    textSecondary: '#93c5fd'
  },
  {
    name: 'Amber Harvest',
    primary: '#f59e0b',
    primaryHover: '#d97706',
    accentEmerald: '#10b981',
    background: '#140c04',
    card: '#221608',
    innerDark: '#0d0802',
    border: '#3b250d',
    text: '#ffffff',
    textSecondary: '#fcd34d'
  },
  {
    name: 'Sunset Rose / Crimson',
    primary: '#f43f5e',
    primaryHover: '#e11d48',
    accentEmerald: '#10b981',
    background: '#16080c',
    card: '#230c14',
    innerDark: '#0f0508',
    border: '#3b1522',
    text: '#ffffff',
    textSecondary: '#fda4af'
  },
  {
    name: 'Violet Neon / Amethyst',
    primary: '#8b5cf6',
    primaryHover: '#7c3aed',
    accentEmerald: '#10b981',
    background: '#0c0817',
    card: '#150d26',
    innerDark: '#090510',
    border: '#271747',
    text: '#ffffff',
    textSecondary: '#c4b5fd'
  },
  {
    name: 'Obsidian Stealth',
    primary: '#e2e8f0',
    primaryHover: '#cbd5e1',
    accentEmerald: '#10b981',
    background: '#09090b',
    card: '#141417',
    innerDark: '#09090b',
    border: '#27272a',
    text: '#fafafa',
    textSecondary: '#a1a1aa'
  },
  {
    name: 'Nordic Frost',
    primary: '#06b6d4',
    primaryHover: '#0891b2',
    accentEmerald: '#10b981',
    background: '#061217',
    card: '#0a1d26',
    innerDark: '#040b0f',
    border: '#123342',
    text: '#ffffff',
    textSecondary: '#a5f3fc'
  }
];

export default function AdminSettingsPage() {
  const { t } = useTranslation();

  // Branding States
  const [siteName, setSiteName] = useState('Zecratary');
  const [siteTagline, setSiteTagline] = useState('Autonomous Culinary Intelligence & Precision Meal Planning');
  const [titlebarEmoji, setTitlebarEmoji] = useState('👨‍🍳');
  const [titlebarImage, setTitlebarImage] = useState('');
  const [faviconEmoji, setFaviconEmoji] = useState('👨‍🍳');
  const [faviconImage, setFaviconImage] = useState('');
  const [fontFamily, setFontFamily] = useState('Inter, sans-serif');

  // Basic SEO States
  const [metaDescription, setMetaDescription] = useState('Autonomous culinary intelligence, precision meal planning, and pantry inventory tracking.');
  const [metaKeywords, setMetaKeywords] = useState('culinary ai, recipe generator, meal planner, pantry management');
  const [metaAuthor, setMetaAuthor] = useState('Zecratary Culinary Intelligence Inc.');

  // Theme Elements Colors State
  const [themeColors, setThemeColors] = useState({
    primary: '#E05638',
    primaryHover: '#c94529',
    accentEmerald: '#10b981',
    background: '#070b13',
    card: '#0d131f',
    innerDark: '#080d16',
    border: '#1a2234',
    text: '#ffffff',
    textSecondary: '#94a3b8'
  });

  const [activeTab, setActiveTab] = useState<'branding' | 'theme' | 'seo' | 'typography'>('branding');
  const [saving, setSaving] = useState(false);
  const [uploadingTitlebar, setUploadingTitlebar] = useState(false);
  const [uploadingFavicon, setUploadingFavicon] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const titlebarFileInputRef = useRef<HTMLInputElement>(null);
  const faviconFileInputRef = useRef<HTMLInputElement>(null);

  // Mutex locks to permanently avoid server looping after save
  const isSavingRef = useRef(false);
  const isLoadingRef = useRef(false);

  // Dynamic Header Title String: <Display Name> - <Tagline>
  const dynamicHeaderTitle = `${siteName.trim() || DEFAULT_SITE_NAME} - ${siteTagline.trim() || DEFAULT_SITE_TAGLINE}`;

  // Synchronize document.title dynamically
  useEffect(() => {
    document.title = dynamicHeaderTitle;
  }, [dynamicHeaderTitle]);

  // Apply theme custom properties to document root dynamically
  const applyThemeVariables = useCallback((colors: typeof themeColors, font?: string) => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    if (colors.primary) root.style.setProperty('--color-primary', colors.primary);
    if (colors.primaryHover) root.style.setProperty('--color-primary-hover', colors.primaryHover);
    if (colors.accentEmerald) {
      root.style.setProperty('--color-emerald', colors.accentEmerald);
      root.style.setProperty('--color-accent', colors.accentEmerald);
    }
    if (colors.background) root.style.setProperty('--color-bg', colors.background);
    if (colors.card) root.style.setProperty('--color-card', colors.card);
    if (colors.innerDark) root.style.setProperty('--color-inner-dark', colors.innerDark);
    if (colors.border) root.style.setProperty('--color-border', colors.border);
    if (colors.text) root.style.setProperty('--color-text', colors.text);
    if (colors.textSecondary) root.style.setProperty('--color-text-secondary', colors.textSecondary);
    if (font) root.style.setProperty('--font-custom', font);
  }, []);

  const loadSettings = useCallback(async () => {
    if (isLoadingRef.current) return;
    isLoadingRef.current = true;
    try {
      // 1. Resolve local cache
      const data = await fetchSiteConfig();
      if (data) {
        if (data.siteName) setSiteName(data.siteName);
        if (data.siteTagline || data.tagline) setSiteTagline(data.siteTagline || data.tagline || '');
        if (data.titlebarEmoji) setTitlebarEmoji(data.titlebarEmoji);
        if (data.titlebarImage !== undefined) setTitlebarImage(data.titlebarImage || '');
        if (data.faviconEmoji) setFaviconEmoji(data.faviconEmoji);
        if (data.faviconImage !== undefined) setFaviconImage(data.faviconImage || '');
        if (data.fontFamily) setFontFamily(data.fontFamily);
        if (data.metaDescription) setMetaDescription(data.metaDescription);
        if (data.metaKeywords) setMetaKeywords(data.metaKeywords);
        if (data.metaAuthor) setMetaAuthor(data.metaAuthor);
      }

      // 2. Fetch authoritative server settings
      const res = await fetch(`/api/admin/settings?t=${Date.now()}`, { cache: 'no-store' });
      if (res.ok) {
        const json = await res.json();
        const s = json.settings || json;
        if (s) {
          if (s.siteName || s.site_name) setSiteName(s.siteName || s.site_name);
          if (s.siteTagline || s.site_tagline || s.tagline) setSiteTagline(s.siteTagline || s.site_tagline || s.tagline);
          if (s.titlebarEmoji || s.titlebar_emoji) setTitlebarEmoji(s.titlebarEmoji || s.titlebar_emoji);
          if (s.titlebarImage !== undefined || s.titlebar_image !== undefined) setTitlebarImage(s.titlebarImage || s.titlebar_image || '');
          if (s.faviconEmoji || s.favicon_emoji) setFaviconEmoji(s.faviconEmoji || s.favicon_emoji);
          if (s.faviconImage !== undefined || s.favicon_image !== undefined) setFaviconImage(s.faviconImage || s.favicon_image || '');
          if (s.fontFamily || s.font_family) setFontFamily(s.fontFamily || s.font_family);
          if (s.metaDescription || s.meta_description) setMetaDescription(s.metaDescription || s.meta_description);
          if (s.metaKeywords || s.meta_keywords) setMetaKeywords(s.metaKeywords || s.meta_keywords);
          if (s.metaAuthor || s.meta_author) setMetaAuthor(s.metaAuthor || s.meta_author);

          const colors = s.themeColors || s.theme_colors;
          if (colors) {
            const merged = { ...PRESET_THEMES[0], ...colors };
            setThemeColors(merged);
            applyThemeVariables(merged, s.fontFamily || s.font_family);
          }
        }
      }
    } catch (err) {
      console.warn('Failed to load admin settings:', err);
    } finally {
      isLoadingRef.current = false;
    }
  }, [applyThemeVariables]);

  useEffect(() => {
    loadSettings();

    const handleSync = () => {
      // Discard sync events dispatched during or immediately after saving
      if (isSavingRef.current) return;
      loadSettings();
    };

    window.addEventListener('zecratary_site_config_updated', handleSync);
    window.addEventListener('zecratary_site_settings_changed', handleSync);
    window.addEventListener('storage', handleSync);

    return () => {
      window.removeEventListener('zecratary_site_config_updated', handleSync);
      window.removeEventListener('zecratary_site_settings_changed', handleSync);
      window.removeEventListener('storage', handleSync);
    };
  }, [loadSettings]);

  // Handle Logo & Favicon File Uploads
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'titlebar' | 'favicon') => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (type === 'titlebar') setUploadingTitlebar(true);
    else setUploadingFavicon(true);
    setStatus(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', type);

      const res = await fetch('/api/admin/upload-branding', {
        method: 'POST',
        body: formData
      });

      if (res.ok) {
        const data = await res.json();
        const publicUrl = data.url;

        if (type === 'titlebar') {
          setTitlebarImage(publicUrl);
          await saveSiteConfig({ titlebarImage: publicUrl, titlebar_image: publicUrl });
        } else {
          setFaviconImage(publicUrl);
          updateFavicon(publicUrl);
          await saveSiteConfig({ faviconImage: publicUrl, favicon_image: publicUrl });
        }
        setStatus({
          type: 'success',
          msg: `${type === 'titlebar' ? 'Brand logo' : 'Favicon'} uploaded successfully!`
        });
      } else {
        const reader = new FileReader();
        reader.onload = () => {
          const base64 = reader.result as string;
          if (type === 'titlebar') {
            setTitlebarImage(base64);
          } else {
            setFaviconImage(base64);
            updateFavicon(base64);
          }
        };
        reader.readAsDataURL(file);
      }
    } catch (uploadErr) {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result as string;
        if (type === 'titlebar') setTitlebarImage(base64);
        else {
          setFaviconImage(base64);
          updateFavicon(base64);
        }
      };
      reader.readAsDataURL(file);
    } finally {
      if (type === 'titlebar') setUploadingTitlebar(false);
      else setUploadingFavicon(false);
      e.target.value = '';
    }
  };

  const handleRevertToEmoji = (type: 'titlebar' | 'favicon') => {
    if (type === 'titlebar') {
      setTitlebarImage('');
    } else {
      setFaviconImage('');
      updateFavicon(faviconEmoji || DEFAULT_FAVICON_EMOJI);
    }
    if (titlebarFileInputRef.current) titlebarFileInputRef.current.value = '';
    if (faviconFileInputRef.current) faviconFileInputRef.current.value = '';
  };

  const handleColorChange = (key: keyof typeof themeColors, val: string) => {
    const updated = { ...themeColors, [key]: val };
    setThemeColors(updated);
    applyThemeVariables(updated, fontFamily);
  };

  const handleSelectPresetTheme = (theme: typeof PRESET_THEMES[0]) => {
    setThemeColors(theme);
    applyThemeVariables(theme, fontFamily);
  };

  const handleSave = async () => {
    if (saving || isSavingRef.current) return;
    setSaving(true);
    isSavingRef.current = true;
    setStatus(null);

    const payload = {
      siteName: siteName.trim() || DEFAULT_SITE_NAME,
      site_name: siteName.trim() || DEFAULT_SITE_NAME,
      siteTagline: siteTagline.trim() || DEFAULT_SITE_TAGLINE,
      site_tagline: siteTagline.trim() || DEFAULT_SITE_TAGLINE,
      tagline: siteTagline.trim() || DEFAULT_SITE_TAGLINE,
      titlebarEmoji,
      titlebar_emoji: titlebarEmoji,
      titlebarImage,
      titlebar_image: titlebarImage,
      faviconEmoji,
      favicon_emoji: faviconEmoji,
      faviconImage,
      favicon_image: faviconImage,
      fontFamily,
      font_family: fontFamily,
      themeColors,
      theme_colors: themeColors,
      metaDescription: metaDescription.trim(),
      meta_description: metaDescription.trim(),
      metaKeywords: metaKeywords.trim(),
      meta_keywords: metaKeywords.trim(),
      metaAuthor: metaAuthor.trim(),
      meta_author: metaAuthor.trim()
    };

    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error('Failed to save settings to server.');

      await saveSiteConfig(payload);
      applyThemeVariables(themeColors, fontFamily);

      setStatus({
        type: 'success',
        msg: t('adminSettingsSaved', 'Settings Saved & Broadcasted!')
      });
    } catch (err: any) {
      setStatus({
        type: 'error',
        msg: err.message || 'Error occurred while saving settings.'
      });
    } finally {
      setSaving(false);
      // Cooldown timer to prevent self-triggered sync loops
      setTimeout(() => {
        isSavingRef.current = false;
      }, 600);
    }
  };

  const handleResetDefaults = () => {
    setSiteName(DEFAULT_SITE_NAME);
    setSiteTagline(DEFAULT_SITE_TAGLINE);
    setTitlebarEmoji(DEFAULT_TITLEBAR_EMOJI);
    setTitlebarImage('');
    setFaviconEmoji(DEFAULT_FAVICON_EMOJI);
    setFaviconImage('');
    setFontFamily(DEFAULT_FONT_FAMILY || 'Inter, sans-serif');
    setMetaDescription('Autonomous culinary intelligence, precision meal planning, and pantry inventory tracking.');
    setMetaKeywords('culinary ai, recipe generator, meal planner, pantry management');
    setMetaAuthor('Zecratary Culinary Intelligence Inc.');
    handleSelectPresetTheme(PRESET_THEMES[0]);
    updateFavicon(DEFAULT_FAVICON_EMOJI);
  };

  return (
    <div 
      id="zecratary-admin-canvas"
      role="region"
      data-lpignore="true"
      className="w-full max-w-full px-4 sm:px-6 lg:px-8 xl:px-10 pb-24 font-sans transition-colors duration-200"
      style={{ 
        boxSizing: 'border-box',
        color: 'var(--color-text)'
      }}
    >
      {/* Hidden File Inputs for Brand Logo and Favicon */}
      <input
        ref={titlebarFileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/svg+xml,image/webp"
        className="hidden"
        onChange={(e) => handleFileUpload(e, 'titlebar')}
      />
      <input
        ref={faviconFileInputRef}
        type="file"
        accept="image/png,image/svg+xml,image/x-icon,image/vnd.microsoft.icon"
        className="hidden"
        onChange={(e) => handleFileUpload(e, 'favicon')}
      />

      {/* Dynamic Header: <Display Name> - <Tagline> */}
      <div 
        className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b pb-5 pt-2 mb-6"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            {titlebarImage ? (
              <img 
                src={titlebarImage} 
                alt="Logo" 
                className="w-9 h-9 object-contain rounded-xl border p-1 shadow-sm shrink-0"
                style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-card)' }}
              />
            ) : (
              <span className="text-3xl shrink-0">{titlebarEmoji || '👨‍🍳'}</span>
            )}
            <h1 className="text-xl sm:text-2xl font-black tracking-tight" style={{ color: 'var(--color-primary)' }}>
              {dynamicHeaderTitle}
            </h1>
          </div>
          <p className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
            {t('adminSiteSettingsTitle', 'Site Settings & Identity')} • {t('adminHeaderTitleFormatDesc', 'Every page header title dynamically synchronizes to <Display Name> - <Tagline>')}
          </p>
        </div>

        {/* Global Save and Reset Actions */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleResetDefaults}
            className="px-4 py-2 rounded-xl text-xs font-bold border transition flex items-center gap-2 cursor-pointer hover:opacity-80"
            style={{ 
              backgroundColor: 'var(--color-inner-dark)', 
              borderColor: 'var(--color-border)', 
              color: 'var(--color-text-secondary)' 
            }}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Reset Defaults</span>
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2.5 rounded-xl text-xs font-bold text-white transition flex items-center gap-2 shadow-lg cursor-pointer hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            <Save className={`h-4 w-4 ${saving ? 'animate-spin' : ''}`} />
            <span>{saving ? t('adminSaving', 'Saving...') : t('adminSaveSettings', 'Save Settings')}</span>
          </button>
        </div>
      </div>

      {/* Status Toast */}
      {status && (
        <div
          className="mb-6 p-4 rounded-2xl border text-xs font-semibold flex items-center gap-2 animate-in fade-in"
          style={{
            backgroundColor: 'var(--color-inner-dark)',
            borderColor: status.type === 'success' ? 'var(--color-emerald)' : 'rgba(239, 68, 68, 0.4)',
            color: status.type === 'success' ? 'var(--color-emerald)' : '#ef4444'
          }}
        >
          {status.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: 'var(--color-emerald)' }} />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
          )}
          <span>{status.msg}</span>
        </div>
      )}

      {/* Navigation Sub-Tabs */}
      <div 
        className="flex p-1.5 rounded-2xl border mb-6 transition-colors duration-200 overflow-x-auto"
        style={{
          backgroundColor: 'var(--color-inner-dark)',
          borderColor: 'var(--color-border)'
        }}
      >
        {[
          { id: 'branding', label: 'Identity & Brand Upload', icon: Sparkles },
          { id: 'theme', label: 'Theme & Element Colors', icon: Palette },
          { id: 'seo', label: 'Basic SEO & Meta', icon: Search },
          { id: 'typography', label: 'Global Typography', icon: Type }
        ].map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as any)}
              className="flex-1 min-w-[140px] py-3 text-xs font-bold rounded-xl flex items-center justify-center gap-2 transition cursor-pointer"
              style={isActive ? {
                backgroundColor: 'var(--color-card)',
                color: 'var(--color-primary)',
                borderColor: 'var(--color-primary)',
                borderWidth: '1px',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
              } : {
                color: 'var(--color-text-secondary)'
              }}
            >
              <tab.icon className="h-4 w-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: IDENTITY & BRAND LOGO UPLOAD */}
      {activeTab === 'branding' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div 
            role="region"
            data-lpignore="true"
            className="rounded-3xl p-6 border shadow-xl space-y-6 transition-colors duration-200"
            style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }}
          >
            <h2 className="text-sm font-black uppercase tracking-wider flex items-center gap-2" style={{ color: 'var(--color-primary)' }}>
              <Sparkles className="h-4 w-4" /> Application Identity & Naming
            </h2>

            <div>
              <label className="block text-xs font-bold mb-1.5" style={{ color: 'var(--color-text)' }}>
                Application Display Name *
              </label>
              <input
                type="text"
                autoComplete="off"
                data-lpignore="true"
                data-form-type="other"
                spellCheck="false"
                value={siteName}
                onChange={(e) => setSiteName(e.target.value)}
                placeholder="e.g. Zecratary"
                className="w-full border rounded-xl px-4 py-3 text-sm outline-none font-semibold transition"
                style={{
                  backgroundColor: 'var(--color-inner-dark)',
                  borderColor: 'var(--color-border)',
                  color: 'var(--color-text)'
                }}
                onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--color-primary)')}
                onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--color-border)')}
              />
            </div>

            <div>
              <label className="block text-xs font-bold mb-1.5" style={{ color: 'var(--color-text)' }}>
                {t('adminAppTagline', 'Application Tagline & Subtitle')} *
              </label>
              <input
                type="text"
                autoComplete="off"
                data-lpignore="true"
                data-form-type="other"
                spellCheck="false"
                value={siteTagline}
                onChange={(e) => setSiteTagline(e.target.value)}
                placeholder={t('adminAppTaglinePlaceholder', 'Autonomous Culinary Intelligence & Precision Meal Planning')}
                className="w-full border rounded-xl px-4 py-3 text-sm outline-none font-medium transition"
                style={{
                  backgroundColor: 'var(--color-inner-dark)',
                  borderColor: 'var(--color-border)',
                  color: 'var(--color-text)'
                }}
                onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--color-primary)')}
                onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--color-border)')}
              />
              <p className="text-[11px] mt-1" style={{ color: 'var(--color-text-secondary)' }}>
                Appears dynamically in every header, footer, meta title, and document tab.
              </p>
            </div>

            {/* Titlebar / Sidebar Brand Icon */}
            <div 
              className="p-4 rounded-2xl border space-y-3"
              style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)' }}
            >
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold flex items-center gap-1.5" style={{ color: 'var(--color-text)' }}>
                  <ImageIcon className="h-4 w-4" style={{ color: 'var(--color-primary)' }} />
                  {t('titlebarIconHeading', 'Titlebar & Sidebar Brand Icon')}
                </label>
                {titlebarImage && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-emerald-500/10 border-emerald-500/30 text-emerald-400">
                    Image Active
                  </span>
                )}
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-4">
                {titlebarImage ? (
                  <div className="relative group shrink-0">
                    <img 
                      src={titlebarImage} 
                      alt="Brand Logo" 
                      className="w-16 h-16 object-contain rounded-2xl border p-1 shadow-inner"
                      style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-primary)' }}
                    />
                  </div>
                ) : (
                  <input
                    type="text"
                    autoComplete="off"
                    data-lpignore="true"
                    data-form-type="other"
                    spellCheck="false"
                    value={titlebarEmoji}
                    onChange={(e) => setTitlebarEmoji(e.target.value)}
                    className="w-16 h-16 border rounded-2xl text-center text-2xl outline-none shrink-0"
                    style={{
                      backgroundColor: 'var(--color-card)',
                      borderColor: 'var(--color-border)',
                      color: 'var(--color-text)'
                    }}
                  />
                )}

                <div className="flex-1 space-y-2 w-full">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={uploadingTitlebar}
                      onClick={() => titlebarFileInputRef.current?.click()}
                      className="px-3.5 py-2 rounded-xl text-xs font-bold border transition flex items-center gap-1.5 cursor-pointer hover:opacity-80"
                      style={{
                        backgroundColor: 'var(--color-card)',
                        borderColor: 'var(--color-border)',
                        color: 'var(--color-text)'
                      }}
                    >
                      <Upload className={`h-3.5 w-3.5 ${uploadingTitlebar ? 'animate-bounce' : ''}`} />
                      <span>{uploadingTitlebar ? 'Uploading...' : t('uploadImageBtn', 'Upload Image')}</span>
                    </button>

                    {titlebarImage && (
                      <button
                        type="button"
                        onClick={() => handleRevertToEmoji('titlebar')}
                        className="px-3.5 py-2 rounded-xl text-xs font-bold border transition flex items-center gap-1.5 cursor-pointer text-red-400 hover:bg-red-950/20"
                        style={{ borderColor: 'rgba(239, 68, 68, 0.4)' }}
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        <span>{t('revertEmojiBtn', 'Revert to Emoji')}</span>
                      </button>
                    )}
                  </div>
                  <p className="text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
                    PNG, SVG, JPG, or WebP. Replaces emoji across headers and navigation.
                  </p>
                </div>
              </div>
            </div>

            {/* Browser Favicon */}
            <div 
              className="p-4 rounded-2xl border space-y-3"
              style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)' }}
            >
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold flex items-center gap-1.5" style={{ color: 'var(--color-text)' }}>
                  <Globe className="h-4 w-4" style={{ color: 'var(--color-primary)' }} />
                  {t('faviconHeading', 'Browser Favicon')}
                </label>
                {faviconImage && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-emerald-500/10 border-emerald-500/30 text-emerald-400">
                    Favicon Active
                  </span>
                )}
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-4">
                {faviconImage ? (
                  <div className="relative group shrink-0">
                    <img 
                      src={faviconImage} 
                      alt="Favicon" 
                      className="w-16 h-16 object-contain rounded-2xl border p-2 shadow-inner"
                      style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-primary)' }}
                    />
                  </div>
                ) : (
                  <input
                    type="text"
                    autoComplete="off"
                    data-lpignore="true"
                    data-form-type="other"
                    spellCheck="false"
                    value={faviconEmoji}
                    onChange={(e) => {
                      setFaviconEmoji(e.target.value);
                      updateFavicon(e.target.value);
                    }}
                    className="w-16 h-16 border rounded-2xl text-center text-2xl outline-none shrink-0"
                    style={{
                      backgroundColor: 'var(--color-card)',
                      borderColor: 'var(--color-border)',
                      color: 'var(--color-text)'
                    }}
                  />
                )}

                <div className="flex-1 space-y-2 w-full">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={uploadingFavicon}
                      onClick={() => faviconFileInputRef.current?.click()}
                      className="px-3.5 py-2 rounded-xl text-xs font-bold border transition flex items-center gap-1.5 cursor-pointer hover:opacity-80"
                      style={{
                        backgroundColor: 'var(--color-card)',
                        borderColor: 'var(--color-border)',
                        color: 'var(--color-text)'
                      }}
                    >
                      <UploadCloud className={`h-3.5 w-3.5 ${uploadingFavicon ? 'animate-bounce' : ''}`} />
                      <span>{uploadingFavicon ? 'Uploading...' : t('uploadFaviconBtn', 'Upload Favicon')}</span>
                    </button>

                    {faviconImage && (
                      <button
                        type="button"
                        onClick={() => handleRevertToEmoji('favicon')}
                        className="px-3.5 py-2 rounded-xl text-xs font-bold border transition flex items-center gap-1.5 cursor-pointer text-red-400 hover:bg-red-950/20"
                        style={{ borderColor: 'rgba(239, 68, 68, 0.4)' }}
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        <span>{t('revertEmojiBtn', 'Revert to Emoji')}</span>
                      </button>
                    )}
                  </div>
                  <p className="text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
                    Replaces the browser tab icon. Supports .png, .ico, and .svg formats.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Live Preview Card */}
          <div 
            role="region"
            data-lpignore="true"
            className="rounded-3xl p-6 border shadow-xl space-y-5 transition-colors duration-200"
            style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }}
          >
            <h2 className="text-sm font-black uppercase tracking-wider flex items-center gap-2" style={{ color: 'var(--color-primary)' }}>
              <ExternalLink className="h-4 w-4" /> Live Header & Brand Simulator
            </h2>

            <div 
              className="p-4 rounded-2xl border space-y-1.5"
              style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)' }}
            >
              <div className="text-[10px] uppercase font-bold tracking-wider" style={{ color: 'var(--color-text-secondary)' }}>
                Browser Window Tab Title
              </div>
              <div className="flex items-center gap-2.5 font-mono text-xs">
                {faviconImage ? (
                  <img src={faviconImage} alt="Favicon" className="w-4 h-4 object-contain rounded" />
                ) : (
                  <span>{faviconEmoji || '👨‍🍳'}</span>
                )}
                <span className="font-bold truncate" style={{ color: 'var(--color-text)' }}>
                  {dynamicHeaderTitle}
                </span>
              </div>
            </div>

            <div 
              className="p-4 rounded-2xl border space-y-2"
              style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)' }}
            >
              <div className="text-[10px] uppercase font-bold tracking-wider" style={{ color: 'var(--color-text-secondary)' }}>
                Navigation Brand Header Component
              </div>
              <div className="flex items-center gap-3 pt-1">
                <div 
                  className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl shadow-inner border overflow-hidden p-1"
                  style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }}
                >
                  {titlebarImage ? (
                    <img src={titlebarImage} alt="Brand" className="w-full h-full object-contain" />
                  ) : (
                    <span>{titlebarEmoji || '👨‍🍳'}</span>
                  )}
                </div>
                <div>
                  <div className="font-black text-sm tracking-tight" style={{ color: 'var(--color-text)' }}>
                    {siteName || DEFAULT_SITE_NAME}
                  </div>
                  <div className="text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--color-primary)' }}>
                    {siteTagline || DEFAULT_SITE_TAGLINE}
                  </div>
                </div>
              </div>
            </div>

            <div 
              className="p-4 rounded-2xl border space-y-2"
              style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)' }}
            >
              <div className="text-[10px] uppercase font-bold tracking-wider" style={{ color: 'var(--color-text-secondary)' }}>
                Desktop Topbar Token Capsule Context
              </div>
              <div className="flex items-center gap-3 pt-1">
                <div 
                  className="px-3 py-1.5 rounded-xl border flex items-center gap-2 text-xs font-mono font-bold"
                  style={{ 
                    backgroundColor: 'var(--color-card)', 
                    borderColor: 'var(--color-border)',
                    color: 'var(--color-primary)'
                  }}
                >
                  <span>💎</span>
                  <span>1,000,000 Tokens</span>
                </div>
                <div 
                  className="px-3 py-1.5 rounded-xl border flex items-center gap-2 text-xs font-mono font-bold"
                  style={{ 
                    backgroundColor: 'var(--color-card)', 
                    borderColor: 'var(--color-border)',
                    color: 'var(--color-emerald)'
                  }}
                >
                  <span>$125.00 Wallet</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: THEME & MULTI-ELEMENT COLOR VARIATION */}
      {activeTab === 'theme' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div 
            role="region"
            data-lpignore="true"
            className="lg:col-span-5 rounded-3xl p-6 border shadow-xl space-y-5 transition-colors duration-200"
            style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }}
          >
            <div>
              <h2 className="text-sm font-black uppercase tracking-wider flex items-center gap-2" style={{ color: 'var(--color-primary)' }}>
                <Palette className="h-4 w-4" /> {t('themePaletteHeading', 'Preset Color Palettes')}
              </h2>
              <p className="text-xs mt-1" style={{ color: 'var(--color-text-secondary)' }}>
                Select an expertly balanced aesthetic or fine-tune individual swatches.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {PRESET_THEMES.map((theme, idx) => {
                const isSelected = themeColors.primary === theme.primary && themeColors.background === theme.background;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSelectPresetTheme(theme)}
                    className="p-3 rounded-2xl border text-left flex flex-col justify-between transition cursor-pointer hover:scale-[1.01]"
                    style={{
                      backgroundColor: 'var(--color-inner-dark)',
                      borderColor: isSelected ? 'var(--color-primary)' : 'var(--color-border)',
                      borderWidth: isSelected ? '2px' : '1px'
                    }}
                  >
                    <div className="text-xs font-bold mb-2 truncate" style={{ color: 'var(--color-text)' }}>
                      {theme.name}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-4 h-4 rounded-full border border-white/20 shrink-0" style={{ backgroundColor: theme.primary }} title="Primary" />
                      <span className="w-4 h-4 rounded-full border border-white/20 shrink-0" style={{ backgroundColor: theme.background }} title="Background" />
                      <span className="w-4 h-4 rounded-full border border-white/20 shrink-0" style={{ backgroundColor: theme.card }} title="Card Surface" />
                      <span className="w-4 h-4 rounded-full border border-white/20 shrink-0" style={{ backgroundColor: theme.accentEmerald }} title="Accent" />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div 
            role="region"
            data-lpignore="true"
            className="lg:col-span-7 rounded-3xl p-6 border shadow-xl space-y-5 transition-colors duration-200"
            style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }}
          >
            <div>
              <h2 className="text-sm font-black uppercase tracking-wider flex items-center gap-2" style={{ color: 'var(--color-primary)' }}>
                <Sliders className="h-4 w-4" /> {t('elementColorsHeading', 'Granular Element Colors')}
              </h2>
              <p className="text-xs mt-1" style={{ color: 'var(--color-text-secondary)' }}>
                Customize colors for every individual UI element across Day and Dark modes.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                { key: 'primary', label: t('primaryColorLabel', 'Primary Accent Color') },
                { key: 'primaryHover', label: t('primaryHoverColorLabel', 'Primary Hover Accent') },
                { key: 'accentEmerald', label: t('accentEmeraldColorLabel', 'Secondary / Emerald Accent') },
                { key: 'background', label: t('bgColorLabel', 'Canvas Background Surface') },
                { key: 'card', label: t('cardColorLabel', 'Card / Container Surface') },
                { key: 'innerDark', label: t('innerDarkColorLabel', 'Deep Inner / Input Surface') },
                { key: 'border', label: t('borderColorLabel', 'Border & Divider Line') },
                { key: 'text', label: t('textColorLabel', 'Headings & Primary Text') },
                { key: 'textSecondary', label: t('textSecondaryColorLabel', 'Muted / Secondary Text') }
              ].map(({ key, label }) => (
                <div key={key} className="space-y-1.5">
                  <label className="block text-[11px] font-bold" style={{ color: 'var(--color-text)' }}>
                    {label}
                  </label>
                  <div 
                    className="flex items-center gap-2 border rounded-xl p-1.5 transition"
                    style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)' }}
                  >
                    <input
                      type="color"
                      value={(themeColors as any)[key] || '#ffffff'}
                      onChange={(e) => handleColorChange(key as any, e.target.value)}
                      className="w-8 h-8 rounded-lg cursor-pointer border-0 bg-transparent shrink-0"
                    />
                    <input
                      type="text"
                      autoComplete="off"
                      data-lpignore="true"
                      data-form-type="other"
                      spellCheck="false"
                      value={(themeColors as any)[key] || ''}
                      onChange={(e) => handleColorChange(key as any, e.target.value)}
                      className="flex-1 bg-transparent text-xs font-mono outline-none uppercase font-bold"
                      style={{ color: 'var(--color-text)' }}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div 
              className="p-4 rounded-2xl border space-y-3 mt-4"
              style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)' }}
            >
              <div className="text-[10px] uppercase font-bold tracking-wider" style={{ color: 'var(--color-text-secondary)' }}>
                Live Component Theme Preview
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  className="px-4 py-2 rounded-xl text-xs font-bold text-white shadow"
                  style={{ backgroundColor: themeColors.primary }}
                >
                  Primary Action
                </button>
                <button
                  type="button"
                  className="px-4 py-2 rounded-xl text-xs font-bold text-white shadow"
                  style={{ backgroundColor: themeColors.accentEmerald }}
                >
                  Emerald Badge
                </button>
                <div 
                  className="px-3 py-1.5 rounded-xl border text-xs font-bold shadow-xs"
                  style={{ 
                    backgroundColor: themeColors.card, 
                    borderColor: themeColors.border,
                    color: themeColors.text
                  }}
                >
                  Card Text Element
                </div>
                <span className="text-xs font-medium" style={{ color: themeColors.textSecondary }}>
                  Muted Description
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: BASIC SEO FIELDS */}
      {activeTab === 'seo' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div 
            role="region"
            data-lpignore="true"
            className="rounded-3xl p-6 border shadow-xl space-y-5 transition-colors duration-200"
            style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }}
          >
            <div>
              <h2 className="text-sm font-black uppercase tracking-wider flex items-center gap-2" style={{ color: 'var(--color-primary)' }}>
                <Search className="h-4 w-4" /> {t('adminSeoSettingsTitle', 'Basic Search Engine Optimization (SEO)')}
              </h2>
              <p className="text-xs mt-1" style={{ color: 'var(--color-text-secondary)' }}>
                {t('adminSeoSettingsSubtitle', 'Configure site meta tags, search keywords, and description for Google and social previews.')}
              </p>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold" style={{ color: 'var(--color-text)' }}>
                  {t('adminMetaDescriptionLabel', 'Site Meta Description')} *
                </label>
                <span className="text-[11px] font-mono" style={{ color: metaDescription.length > 160 ? '#ef4444' : 'var(--color-text-secondary)' }}>
                  {metaDescription.length}/160 {t('adminCharCount', 'characters')} ({t('adminRecommended', 'Recommended')}: 140-160)
                </span>
              </div>
              <textarea
                autoComplete="off"
                data-lpignore="true"
                data-form-type="other"
                spellCheck="false"
                rows={4}
                value={metaDescription}
                onChange={(e) => setMetaDescription(e.target.value)}
                placeholder={t('adminMetaDescriptionPlaceholder', 'A brief summary of your culinary intelligence platform for search engines...')}
                className="w-full border rounded-xl p-3.5 text-xs outline-none resize-none font-medium transition"
                style={{
                  backgroundColor: 'var(--color-inner-dark)',
                  borderColor: 'var(--color-border)',
                  color: 'var(--color-text)'
                }}
                onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--color-primary)')}
                onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--color-border)')}
              />
            </div>

            <div>
              <label className="block text-xs font-bold mb-1.5" style={{ color: 'var(--color-text)' }}>
                {t('adminMetaKeywordsLabel', 'Meta Keywords (Comma separated)')}
              </label>
              <input
                type="text"
                autoComplete="off"
                data-lpignore="true"
                data-form-type="other"
                spellCheck="false"
                value={metaKeywords}
                onChange={(e) => setMetaKeywords(e.target.value)}
                placeholder={t('adminMetaKeywordsPlaceholder', 'culinary ai, recipe generator, meal planner, pantry management')}
                className="w-full border rounded-xl px-4 py-3 text-xs outline-none font-medium transition"
                style={{
                  backgroundColor: 'var(--color-inner-dark)',
                  borderColor: 'var(--color-border)',
                  color: 'var(--color-text)'
                }}
                onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--color-primary)')}
                onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--color-border)')}
              />
              <div className="flex flex-wrap gap-1.5 mt-2">
                {metaKeywords.split(',').map((k, idx) => {
                  const clean = k.trim();
                  if (!clean) return null;
                  return (
                    <span 
                      key={idx}
                      className="px-2 py-0.5 rounded-md text-[10px] font-mono border"
                      style={{ 
                        backgroundColor: 'var(--color-inner-dark)', 
                        borderColor: 'var(--color-border)',
                        color: 'var(--color-text-secondary)'
                      }}
                    >
                      #{clean}
                    </span>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold mb-1.5" style={{ color: 'var(--color-text)' }}>
                {t('adminMetaAuthorLabel', 'Site Author / Organization')}
              </label>
              <input
                type="text"
                autoComplete="off"
                data-lpignore="true"
                data-form-type="other"
                spellCheck="false"
                value={metaAuthor}
                onChange={(e) => setMetaAuthor(e.target.value)}
                placeholder={t('adminMetaAuthorPlaceholder', 'Zecratary Culinary Intelligence Inc.')}
                className="w-full border rounded-xl px-4 py-3 text-xs outline-none font-medium transition"
                style={{
                  backgroundColor: 'var(--color-inner-dark)',
                  borderColor: 'var(--color-border)',
                  color: 'var(--color-text)'
                }}
                onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--color-primary)')}
                onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--color-border)')}
              />
            </div>
          </div>

          <div 
            role="region"
            data-lpignore="true"
            className="rounded-3xl p-6 border shadow-xl space-y-5 transition-colors duration-200"
            style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }}
          >
            <h2 className="text-sm font-black uppercase tracking-wider flex items-center gap-2" style={{ color: 'var(--color-primary)' }}>
              <Globe className="h-4 w-4" /> {t('adminSeoPreviewTitle', 'Live Google Search Snippet Preview')}
            </h2>

            <div 
              className="p-5 rounded-2xl border space-y-2 bg-[#ffffff] text-[#1a0dab] font-sans shadow-md"
              style={{ borderColor: 'var(--color-border)' }}
            >
              <div className="flex items-center gap-2 text-xs text-[#202124]">
                <div className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center text-xs overflow-hidden">
                  {faviconImage ? (
                    <img src={faviconImage} alt="Favicon" className="w-full h-full object-contain" />
                  ) : (
                    faviconEmoji || '👨‍🍳'
                  )}
                </div>
                <div className="flex flex-col">
                  <span className="text-[12px] font-semibold text-[#202124]">{siteName || DEFAULT_SITE_NAME}</span>
                  <span className="text-[11px] text-[#4d5156]">https://zecratary.com</span>
                </div>
              </div>

              <div className="text-base font-semibold hover:underline cursor-pointer text-[#1a0dab] leading-snug">
                {dynamicHeaderTitle}
              </div>

              <div className="text-xs text-[#4d5156] leading-relaxed">
                {metaDescription || 'Autonomous culinary intelligence, precision meal planning, and pantry inventory tracking.'}
              </div>
            </div>

            <div 
              className="p-4 rounded-2xl border text-xs space-y-2"
              style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)' }}
            >
              <div className="font-bold flex items-center gap-1.5" style={{ color: 'var(--color-primary)' }}>
                <ShieldCheck className="h-4 w-4" /> SEO Indexing Guardrail
              </div>
              <p className="text-[11px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                These values are persisted to PostgreSQL/MySQL `admin_settings`, synchronized to server caches, and consumed by Next.js `generateMetadata()` for crawlers and social OpenGraph tags.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: GLOBAL TYPOGRAPHY */}
      {activeTab === 'typography' && (
        <div 
          role="region"
          data-lpignore="true"
          className="rounded-3xl p-6 border shadow-xl space-y-5 transition-colors duration-200 max-w-2xl"
          style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }}
        >
          <h2 className="text-sm font-black uppercase tracking-wider flex items-center gap-2" style={{ color: 'var(--color-primary)' }}>
            <Type className="h-4 w-4" /> Global Typography
          </h2>

          <div className="space-y-3">
            {FONT_OPTIONS.map((f) => (
              <div
                key={f.id}
                onClick={() => {
                  setFontFamily(f.id);
                  applyThemeVariables(themeColors, f.id);
                }}
                className="p-3.5 rounded-2xl border flex items-center justify-between cursor-pointer transition"
                style={{
                  backgroundColor: 'var(--color-inner-dark)',
                  borderColor: fontFamily === f.id ? 'var(--color-primary)' : 'var(--color-border)'
                }}
              >
                <div style={{ fontFamily: f.id }}>
                  <div className="text-xs font-bold" style={{ color: 'var(--color-text)' }}>{f.label}</div>
                  <div className="text-[11px] opacity-70">Sphinx of black quartz, judge my vow.</div>
                </div>
                {fontFamily === f.id && (
                  <CheckCircle2 className="h-4 w-4" style={{ color: 'var(--color-primary)' }} />
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
