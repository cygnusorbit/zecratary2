'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { 
  Sun, Moon, Globe, Shield, Zap, Sparkles, ChefHat, BookOpen, 
  Clock, Users, Star, ArrowRight, Check, ExternalLink, ChevronDown, 
  Utensils, Calendar, Layers, ShoppingCart, Heart, Minus, Plus, X 
} from 'lucide-react';
import { useTranslation } from '@/components/LanguageProvider';
import { getSiteName, getSiteIcon, DEFAULT_SITE_NAME, DEFAULT_SITE_ICON } from '@/lib/siteConfig';
import { getCurrentUser, User } from '@/lib/auth';
import { applyThemeToDocument } from '@/lib/themeConfig';

interface PagePaddingSettings {
  top?: string;
  bottom?: string;
  left?: string;
  right?: string;
  x?: string;
  maxWidth?: string;
}

interface FooterSettings {
  enabled?: boolean;
  aboutText?: string;
  copyrightText?: string;
  bgColor?: string;
  textColor?: string;
  borderColor?: string;
  accentColor?: string;
  columns?: Array<{
    title: string;
    links: Array<{ label: string; url: string }>;
  }>;
  socials?: Record<string, string>;
}

interface DynamicPageRecord {
  id: string;
  title: string;
  slug: string;
  description?: string;
  content?: string;
  status: string;
  is_default: boolean;
  show_in_nav: boolean;
  show_in_footer: boolean;
  order_index: number;
  elements: any[];
  padding?: PagePaddingSettings;
  footer?: FooterSettings;
}

const DEFAULT_FOOTER: FooterSettings = {
  enabled: true,
  aboutText: 'Zecratary is an autonomous culinary intelligence platform designed for intelligent recipe management, meal planning, and nutrition telemetry.',
  copyrightText: '© 2026 Zecratary Inc. All rights reserved.',
  columns: [
    {
      title: 'Platform',
      links: [
        { label: 'AI Assistant', url: '/chef' },
        { label: 'Recipe Library', url: '/recipes' },
        { label: 'Cookbooks', url: '/books' },
        { label: 'Meal Planner', url: '/planner' },
      ],
    },
    {
      title: 'Finance & Quotas',
      links: [
        { label: 'Token Portal', url: '/token' },
        { label: 'Store Wallet', url: '/wallet' },
        { label: 'Subscription Plans', url: '/subscriptions' },
        { label: 'Billing History', url: '/billing' },
      ],
    },
  ],
  socials: {
    twitter: 'https://twitter.com',
    github: 'https://github.com/cygnusorbit/zecratary',
    discord: 'https://discord.com',
  },
};

// Fallback configuration without hardcoded mock content elements
const DEFAULT_HOMEPAGE_FALLBACK: DynamicPageRecord = {
  id: 'page_home',
  title: 'Home',
  slug: 'home',
  description: 'Zecratary Autonomous Culinary Planning Platform',
  status: 'published',
  is_default: true,
  show_in_nav: true,
  show_in_footer: true,
  order_index: 1,
  padding: {
    top: '2.5rem',
    bottom: '4rem',
    left: '1.5rem',
    right: '1.5rem',
    maxWidth: 'max-w-full',
  },
  footer: DEFAULT_FOOTER,
  elements: [],
};

export default function DynamicHomePage() {
  const pathnameHook = usePathname();
  const pathname = pathnameHook || '';

  const params = useParams();
  const router = useRouter();
  const { t } = useTranslation();

  const [mounted, setMounted] = useState<boolean>(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [siteName, setSiteName] = useState<string>(DEFAULT_SITE_NAME);
  const [siteIcon, setSiteIcon] = useState<string>(DEFAULT_SITE_ICON);
  const [isDarkMode, setIsDarkMode] = useState<boolean>(true);

  // Dynamic CMS Page State (Initialized without hardcoded mock elements)
  const [allPages, setAllPages] = useState<DynamicPageRecord[]>([]);
  const [activePage, setActivePage] = useState<DynamicPageRecord>(DEFAULT_HOMEPAGE_FALLBACK);
  const [allRecipes, setAllRecipes] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);

  // Loading States for Shadow Loaders
  const [pageLoading, setPageLoading] = useState<boolean>(true);
  const [recipesLoading, setRecipesLoading] = useState<boolean>(true);
  const [plansLoading, setPlansLoading] = useState<boolean>(true);

  // Element UI States
  const [planBillingInterval, setPlanBillingInterval] = useState<'monthly' | 'annual'>('monthly');
  const [activeRecipeModal, setActiveRecipeModal] = useState<any | null>(null);
  const [modalServings, setModalServings] = useState<number>(4);
  const [modalFontZoom, setModalFontZoom] = useState<number>(100);

  // Determine active route slug
  const rawSlug = params?.slug ? (typeof params.slug === 'string' ? params.slug : params.slug[0]) : '';
  const currentSlug = rawSlug ? rawSlug.replace(/^\/+/, '') : 'home';

  // 1. Synchronize Day/Night Theme State
  const syncThemeState = useCallback(() => {
    try {
      if (typeof window !== 'undefined') {
        const storedMode = localStorage.getItem('zecratary_theme_mode');
        const isDark = storedMode !== 'light' && storedMode !== 'day';
        setIsDarkMode(isDark);
        if (isDark) {
          document.documentElement.classList.add('dark');
          document.documentElement.classList.remove('light');
        } else {
          document.documentElement.classList.remove('dark');
          document.documentElement.classList.add('light');
        }
      }
    } catch (_) {}
  }, []);

  const toggleTheme = () => {
    const nextDark = !isDarkMode;
    setIsDarkMode(nextDark);
    if (typeof window !== 'undefined') {
      const modeStr = nextDark ? 'dark' : 'light';
      localStorage.setItem('zecratary_theme_mode', modeStr);
      if (nextDark) {
        document.documentElement.classList.add('dark');
        document.documentElement.classList.remove('light');
      } else {
        document.documentElement.classList.remove('dark');
        document.documentElement.classList.add('light');
      }
      applyThemeToDocument(null);
      window.dispatchEvent(new CustomEvent('zecratary_theme_mode_changed', { detail: { mode: modeStr } }));
      window.dispatchEvent(new Event('zecratary_theme_updated'));
    }
  };

  // 2. Fetch Dynamic Pages and Content
  const fetchPageData = useCallback(async () => {
    try {
      setPageLoading(true);
      const res = await fetch(`/api/admin/frontend?t=${Date.now()}`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.pages) && data.pages.length > 0) {
          setAllPages(data.pages);
          const found = data.pages.find((p: DynamicPageRecord) => p.slug === currentSlug) ||
                        data.pages.find((p: DynamicPageRecord) => p.is_default) ||
                        data.pages[0];
          if (found) setActivePage(found);
        }
      }
    } catch (_) {
    } finally {
      setPageLoading(false);
    }

    try {
      setRecipesLoading(true);
      const recRes = await fetch('/api/admin/frontend?all_recipes=true', { cache: 'no-store' });
      if (recRes.ok) {
        const recData = await recRes.json();
        if (Array.isArray(recData.recipes)) {
          setAllRecipes(recData.recipes);
        }
      }
    } catch (_) {
    } finally {
      setRecipesLoading(false);
    }

    try {
      setPlansLoading(true);
      const planRes = await fetch('/api/admin/plans', { cache: 'no-store' });
      if (planRes.ok) {
        const planData = await planRes.json();
        const pList = Array.isArray(planData.plans) ? planData.plans : (Array.isArray(planData) ? planData : []);
        setPlans(pList);
      }
    } catch (_) {
    } finally {
      setPlansLoading(false);
    }
  }, [currentSlug]);

  useEffect(() => {
    setMounted(true);
    setCurrentUser(getCurrentUser());
    setSiteName(getSiteName());
    setSiteIcon(getSiteIcon());
    syncThemeState();
    fetchPageData();

    if (typeof document !== 'undefined' && document.body) {
      document.body.classList.add('is-homepage-view');
    }

    const handleThemeSync = () => syncThemeState();
    const handlePageSync = () => fetchPageData();

    window.addEventListener('zecratary_theme_mode_changed', handleThemeSync);
    window.addEventListener('zecratary_theme_updated', handleThemeSync);
    window.addEventListener('zecratary_admin_settings_updated', handleThemeSync);
    window.addEventListener('zecratary_frontend_pages_updated', handlePageSync);
    window.addEventListener('storage', handleThemeSync);
    window.addEventListener('focus', handlePageSync);

    return () => {
      window.removeEventListener('zecratary_theme_mode_changed', handleThemeSync);
      window.removeEventListener('zecratary_theme_updated', handleThemeSync);
      window.removeEventListener('zecratary_admin_settings_updated', handleThemeSync);
      window.removeEventListener('zecratary_frontend_pages_updated', handlePageSync);
      window.removeEventListener('storage', handleThemeSync);
      window.removeEventListener('focus', handlePageSync);
      if (typeof document !== 'undefined' && document.body) {
        document.body.classList.remove('is-homepage-view');
      }
    };
  }, [syncThemeState, fetchPageData]);

  const getSafeHostname = (urlStr?: string | null): string => {
    if (!urlStr) return 'source link';
    try {
      return new URL(urlStr).hostname.replace(/^www\./, '');
    } catch (_) {
      return urlStr;
    }
  };

  const navPages = useMemo(() => {
    return allPages.filter((p: DynamicPageRecord) => p.show_in_nav && p.status === 'published');
  }, [allPages]);

  const elementsList = useMemo(() => {
    return Array.isArray(activePage?.elements) ? activePage.elements : [];
  }, [activePage]);

  const padTop = activePage?.padding?.top || '2.5rem';
  const padBottom = activePage?.padding?.bottom || '4rem';

  // Synchronized Layout Container: Strictly matches Header, Content Canvas, and Footer
  const containerMaxWidthClass = activePage?.padding?.maxWidth && activePage.padding.maxWidth !== 'max-w-full'
    ? activePage.padding.maxWidth
    : 'w-full max-w-full';

  const sharedContainerPadding = 'px-4 sm:px-6 lg:px-8 xl:px-10';

  return (
    <div
      id="zecratary-homepage-root"
      role="region"
      aria-label="Zecratary Public Homepage Canvas"
      className="min-h-screen flex flex-col font-sans antialiased theme-harmonized-card transition-colors duration-200"
      style={{
        backgroundColor: 'var(--color-bg)',
        color: 'var(--color-text)',
      }}
    >
      {/* Global CSS Reset for Public Homepage: Prevents application shell offsets */}
      <style dangerouslySetInnerHTML={{ __html: `
        body.is-homepage-view,
        body:has(#zecratary-homepage-root) {
          margin: 0 !important;
          padding: 0 !important;
        }
        body.is-homepage-view > main,
        body.is-homepage-view #zecratary-main-content,
        body.is-homepage-view .main-content,
        body:has(#zecratary-homepage-root) > main,
        body:has(#zecratary-homepage-root) #zecratary-main-content,
        body:has(#zecratary-homepage-root) .main-content {
          padding: 0 !important;
          margin: 0 !important;
          width: 100% !important;
          max-width: 100% !important;
        }
        body.is-homepage-view aside,
        body.is-homepage-view #zecratary-desktop-topbar,
        body.is-homepage-view .zecratary-mobile-topbar,
        body:has(#zecratary-homepage-root) aside,
        body:has(#zecratary-homepage-root) #zecratary-desktop-topbar,
        body:has(#zecratary-homepage-root) .zecratary-mobile-topbar {
          display: none !important;
        }
      ` }} />

      {/* 1. PUBLIC HOMEPAGE HEADER NAVIGATION */}
      <header
        role="banner"
        className="sticky top-0 z-40 border-b backdrop-blur-md theme-harmonized-card transition-colors duration-200"
        style={{
          backgroundColor: isDarkMode ? 'rgba(15, 23, 42, 0.85)' : 'rgba(255, 255, 255, 0.9)',
          borderColor: 'var(--color-border)',
          color: 'var(--color-text)',
        }}
      >
        <div className={`${containerMaxWidthClass} ${sharedContainerPadding} mx-auto h-16 flex items-center justify-between`}>
          {/* BRAND */}
          <Link href="/" className="flex items-center gap-2.5 font-black text-xl text-[var(--color-primary)]">
            <span className="text-2xl">{siteIcon || '🍳'}</span>
            <span>{siteName || 'Zecratary'}</span>
          </Link>

          {/* DYNAMIC CMS NAVIGATION TABS */}
          <nav className="hidden md:flex items-center gap-1" aria-label="Main Navigation">
            {navPages.map((page: DynamicPageRecord) => {
              const isActive = (currentSlug === 'home' && page.is_default) || currentSlug === page.slug;
              return (
                <Link
                  key={page.id}
                  href={page.is_default ? '/' : `/${page.slug}`}
                  className="px-3.5 py-1.5 rounded-xl text-xs font-bold transition"
                  style={
                    isActive
                      ? { backgroundColor: 'var(--color-primary)', color: '#ffffff' }
                      : { color: 'var(--color-text-secondary)', backgroundColor: 'transparent' }
                  }
                >
                  {page.title}
                </Link>
              );
            })}
          </nav>

          {/* ACTIONS: THEME TOGGLE & AUTH */}
          <div className="flex items-center gap-3">
            {/* DAY/NIGHT SWITCHER */}
            <button
              type="button"
              onClick={toggleTheme}
              className="p-2 rounded-xl border transition cursor-pointer shadow-xs hover:opacity-90"
              style={{
                backgroundColor: 'var(--color-inner-dark)',
                borderColor: 'var(--color-border)',
                color: 'var(--color-text)',
              }}
              title={isDarkMode ? t('switchToDayMode', 'Switch to Day Mode') : t('switchToDarkMode', 'Switch to Dark Mode')}
              aria-label={isDarkMode ? 'Switch to Day Mode' : 'Switch to Dark Mode'}
            >
              {isDarkMode ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4 text-slate-700" />}
            </button>

            {/* CONTEXTUAL AUTH BUTTON */}
            {currentUser ? (
              <Link
                href="/dashboard"
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white shadow-xs transition cursor-pointer hover:opacity-90"
                style={{ backgroundColor: 'var(--color-primary)' }}
              >
                <span>{t('dashboard', 'Dashboard')}</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            ) : (
              <div className="flex items-center gap-2">
                <Link
                  href="/login"
                  className="px-3.5 py-2 rounded-xl border text-xs font-bold transition shadow-xs hover:bg-white/5"
                  style={{
                    backgroundColor: 'var(--color-inner-dark)',
                    borderColor: 'var(--color-border)',
                    color: 'var(--color-text)',
                  }}
                >
                  {t('signIn', 'Sign In')}
                </Link>
                <Link
                  href="/register"
                  className="px-4 py-2 rounded-xl text-xs font-bold text-white shadow-xs transition hover:opacity-90"
                  style={{ backgroundColor: 'var(--color-primary)' }}
                >
                  {t('getStarted', 'Get Started')}
                </Link>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* 2. DYNAMIC CONTENT CANVAS (Strictly aligned with topbar logo & buttons) */}
      <main
        id="zecratary-homepage-canvas"
        role="main"
        aria-label="Homepage Main Content"
        className="flex-1 w-full mx-auto transition-colors duration-200"
        style={{
          paddingTop: padTop,
          paddingBottom: padBottom,
          boxSizing: 'border-box',
        }}
      >
        <div className={`${containerMaxWidthClass} ${sharedContainerPadding} mx-auto space-y-12`}>
          {/* SHADOW LOADER: Rendered during initial fetch instead of hardcoded elements */}
          {pageLoading ? (
            <div className="space-y-12 py-4">
              {/* Hero Title Shadow Loader */}
              <div className="w-full flex flex-col items-center justify-center space-y-4 py-6">
                <div className="h-12 sm:h-16 w-3/4 max-w-2xl rounded-2xl bg-[var(--color-inner-dark)] shadow-inner animate-pulse" />
                <div className="h-5 sm:h-6 w-1/2 max-w-lg rounded-xl bg-[var(--color-inner-dark)]/70 shadow-xs animate-pulse" />
              </div>

              {/* Feature Cards Shadow Loader */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[1, 2, 3].map((n) => (
                  <div key={n} className="p-6 rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] space-y-4 shadow-sm animate-pulse">
                    <div className="w-10 h-10 rounded-xl bg-[var(--color-inner-dark)]" />
                    <div className="h-5 w-2/3 rounded-lg bg-[var(--color-inner-dark)]" />
                    <div className="space-y-2">
                      <div className="h-3 w-full rounded bg-[var(--color-inner-dark)]/70" />
                      <div className="h-3 w-4/5 rounded bg-[var(--color-inner-dark)]/70" />
                    </div>
                  </div>
                ))}
              </div>

              {/* Recipe Gallery Shadow Loader */}
              <div className="space-y-6">
                <div className="flex justify-between items-center">
                  <div className="h-7 w-48 rounded-xl bg-[var(--color-inner-dark)] animate-pulse" />
                  <div className="h-4 w-24 rounded-lg bg-[var(--color-inner-dark)]/60 animate-pulse" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {[1, 2, 3].map((n) => (
                    <div key={n} className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] overflow-hidden space-y-4 shadow-sm animate-pulse">
                      <div className="h-48 w-full bg-[var(--color-inner-dark)]" />
                      <div className="p-4 space-y-3">
                        <div className="h-4 w-3/4 rounded bg-[var(--color-inner-dark)]" />
                        <div className="h-3 w-full rounded bg-[var(--color-inner-dark)]/70" />
                        <div className="pt-2 border-t border-[var(--color-border)] flex justify-between">
                          <div className="h-3 w-16 rounded bg-[var(--color-inner-dark)]/50" />
                          <div className="h-3 w-16 rounded bg-[var(--color-inner-dark)]/50" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : elementsList.length === 0 ? (
            /* Empty State when no elements are published in /admin/frontend */
            <div className="p-16 text-center rounded-3xl border border-dashed border-[var(--color-border)] bg-[var(--color-card)] space-y-3 my-8">
              <ChefHat className="h-10 w-10 mx-auto text-[var(--color-primary)] opacity-80" />
              <h3 className="text-lg font-bold">{t('homepage.noElementsTitle', 'Welcome to Zecratary')}</h3>
              <p className="text-xs text-[var(--color-text-secondary)] max-w-md mx-auto">
                {t('homepage.noElementsDesc', 'No canvas elements are currently published. Configure and publish sections in the Admin Frontend builder.')}
              </p>
              {currentUser && (
                <Link
                  href="/admin/frontend"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white shadow-xs transition hover:opacity-90"
                  style={{ backgroundColor: 'var(--color-primary)' }}
                >
                  <span>{t('admin.frontend.openBuilder', 'Open Page Builder')}</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              )}
            </div>
          ) : (
            elementsList.map((elem: any, elemIdx: number) => {
              // A. TITLE / HEADING ELEMENT (Fixed: supports both `alignment` & `align` with true center alignment)
              if (elem.type === 'title') {
                const alignment = (elem.alignment || elem.align || 'center').toLowerCase();
                const isCenter = alignment === 'center';
                const isRight = alignment === 'right';

                const containerAlign = isCenter
                  ? 'text-center mx-auto items-center'
                  : isRight
                  ? 'text-right ml-auto items-end'
                  : 'text-left mr-auto items-start';

                const headingAlign = isCenter
                  ? 'text-center mx-auto'
                  : isRight
                  ? 'text-right ml-auto'
                  : 'text-left mr-auto';

                const titleColor = elem.textColor || elem.color || elem.accentColor || 'var(--color-text)';
                const subtitleColor = elem.subtitleColor || 'var(--color-text-secondary)';

                return (
                  <div
                    key={elem.id || `title_${elemIdx}`}
                    role="region"
                    aria-label={elem.title || 'Section Heading'}
                    className={`w-full flex flex-col space-y-3 ${containerAlign}`}
                  >
                    {elem.level === 'h1' ? (
                      <h1
                        className={`w-full text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight leading-tight ${headingAlign}`}
                        style={{ color: titleColor }}
                      >
                        {elem.title || ''}
                      </h1>
                    ) : elem.level === 'h3' ? (
                      <h3
                        className={`w-full text-xl sm:text-2xl font-bold ${headingAlign}`}
                        style={{ color: titleColor }}
                      >
                        {elem.title || ''}
                      </h3>
                    ) : (
                      <h2
                        className={`w-full text-2xl sm:text-4xl font-extrabold tracking-tight ${headingAlign}`}
                        style={{ color: titleColor }}
                      >
                        {elem.title || ''}
                      </h2>
                    )}
                    {elem.subtitle && (
                      <p
                        className={`w-full text-sm sm:text-base max-w-4xl leading-relaxed ${headingAlign}`}
                        style={{ color: subtitleColor }}
                      >
                        {elem.subtitle}
                      </p>
                    )}
                  </div>
                );
              }

              // B. CONTENT / TEXT ELEMENT (Styled according to settings)
              if (elem.type === 'content') {
                return (
                  <div
                    key={elem.id || `content_${elemIdx}`}
                    role="region"
                    aria-label="Content Block"
                    className="p-6 rounded-2xl border leading-relaxed text-sm sm:text-base theme-harmonized-card transition-colors duration-200"
                    style={{
                      backgroundColor: elem.bgColor || 'var(--color-card)',
                      borderColor: elem.borderColor || 'var(--color-border)',
                      color: elem.textColor || elem.color || 'var(--color-text)',
                    }}
                  >
                    <p className="whitespace-pre-line">{elem.content || elem.body || ''}</p>
                  </div>
                );
              }

              // C. MULTI-COLUMN ELEMENT (Styled according to columnsCount & settings)
              if (elem.type === 'column') {
                const cols = Array.isArray(elem.columns) ? elem.columns : (Array.isArray(elem.cols) ? elem.cols : []);
                const count = elem.columnsCount || cols.length || 3;
                const gridCols = count === 1 ? 'grid-cols-1' : count === 2 ? 'grid-cols-1 md:grid-cols-2' : count === 4 ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4' : 'grid-cols-1 md:grid-cols-3';

                return (
                  <div key={elem.id || `col_${elemIdx}`} className="space-y-4">
                    {elem.title && (
                      <h2 className="text-2xl font-black tracking-tight" style={{ color: elem.textColor || 'var(--color-text)' }}>
                        {elem.title}
                      </h2>
                    )}
                    <div className={`grid ${gridCols} gap-6`}>
                      {cols.map((col: any, colIdx: number) => (
                        <div
                          key={col.id || `col_item_${colIdx}`}
                          role="region"
                          aria-label={col.title || 'Feature'}
                          className="p-6 rounded-2xl border space-y-3 theme-harmonized-card shadow-xs transition-colors duration-200"
                          style={{
                            backgroundColor: col.bgColor || elem.bgColor || 'var(--color-card)',
                            borderColor: col.borderColor || elem.borderColor || 'var(--color-border)',
                            color: col.textColor || elem.textColor || 'var(--color-text)',
                          }}
                        >
                          {col.icon && <span className="text-3xl block">{col.icon}</span>}
                          <h3 className="font-bold text-base">{col.title || 'Feature'}</h3>
                          <p className="text-xs leading-relaxed opacity-80">
                            {col.content || col.description || ''}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              }

              // D. PICTURE / MEDIA ELEMENT (Supports imageUrl & altText from /admin/frontend)
              if (elem.type === 'picture') {
                const imgUrl = elem.imageUrl || elem.url;
                const imgAlt = elem.altText || elem.alt || 'Visual Showcase';

                return (
                  <div
                    key={elem.id || `pic_${elemIdx}`}
                    role="region"
                    aria-label="Media Showcase"
                    className="rounded-3xl border overflow-hidden p-2 theme-harmonized-card shadow-xs transition-colors duration-200"
                    style={{
                      backgroundColor: elem.bgColor || 'var(--color-card)',
                      borderColor: elem.borderColor || 'var(--color-border)',
                    }}
                  >
                    {imgUrl ? (
                      <img src={imgUrl} alt={imgAlt} className="w-full h-80 object-cover rounded-2xl" />
                    ) : (
                      <div className="w-full h-64 flex items-center justify-center rounded-2xl text-xs" style={{ backgroundColor: 'var(--color-inner-dark)' }}>
                        <span>{t('noImageAvailable', 'Image Display Area')}</span>
                      </div>
                    )}
                    {elem.caption && (
                      <div className="p-3 text-center text-xs" style={{ color: elem.textColor || 'var(--color-text-secondary)' }}>
                        {elem.caption}
                      </div>
                    )}
                  </div>
                );
              }

              // E. BOX / CALLOUT ELEMENT (Supports boxStyle, subtitle, & accentColor)
              if (elem.type === 'box') {
                const boxStyle = elem.boxStyle || 'highlight';
                const boxBg = elem.bgColor || (boxStyle === 'subtle' ? 'var(--color-inner-dark)' : 'var(--color-card)');
                const boxBorder = elem.borderColor || (boxStyle === 'highlight' ? 'var(--color-primary)' : 'var(--color-border)');
                const boxAccent = elem.accentColor || 'var(--color-primary)';
                const boxText = elem.textColor || 'var(--color-text)';
                const subtitleText = elem.subtitle || elem.description || elem.content || '';

                return (
                  <div
                    key={elem.id || `box_${elemIdx}`}
                    role="region"
                    aria-label={elem.title || 'Callout Workspace'}
                    className={`p-8 rounded-3xl border text-center space-y-4 theme-harmonized-card shadow-md transition-colors duration-200 ${
                      boxStyle === 'border' ? 'border-2' : ''
                    }`}
                    style={{
                      backgroundColor: boxBg,
                      borderColor: boxBorder,
                      color: boxText,
                    }}
                  >
                    {elem.badge && (
                      <span
                        className="inline-block px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider text-white shadow-xs"
                        style={{ backgroundColor: boxAccent }}
                      >
                        {elem.badge}
                      </span>
                    )}
                    <h3 className="text-2xl font-black">{elem.title || ''}</h3>
                    {subtitleText && (
                      <p className="text-sm max-w-3xl mx-auto leading-relaxed opacity-85">
                        {subtitleText}
                      </p>
                    )}
                    {elem.buttonText && (
                      <div className="pt-2">
                        <Link
                          href={elem.buttonUrl || '/chef'}
                          className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-xs text-white shadow-xs transition hover:opacity-90 cursor-pointer"
                          style={{ backgroundColor: boxAccent }}
                        >
                          <span>{elem.buttonText}</span>
                          <ArrowRight className="h-4 w-4" />
                        </Link>
                      </div>
                    )}
                  </div>
                );
              }

              // F. COMMUNITY RECIPE GALLERY ELEMENT (Supports recipeGridDensity & recipeLimit)
              if (elem.type === 'recipe') {
                const limit = elem.recipeLimit || elem.itemsPerPage || 6;
                const density = Number(elem.recipeGridDensity) || (elem.gridDensity === '2x2' ? 2 : elem.gridDensity === '4x4' ? 4 : 3);
                const gridClass = density === 2
                  ? 'grid-cols-1 sm:grid-cols-2'
                  : density === 4
                  ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'
                  : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3';

                const filtered = elem.recipeCategoryFilter && elem.recipeCategoryFilter !== 'all'
                  ? allRecipes.filter((r) => Array.isArray(r.tags) && r.tags.some((t: string) => t.toLowerCase() === elem.recipeCategoryFilter.toLowerCase()))
                  : allRecipes;

                const displayList = filtered.slice(0, limit);

                return (
                  <div key={elem.id || `recipe_${elemIdx}`} role="region" aria-label="Community Recipe Gallery" className="space-y-6">
                    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
                      <div>
                        <h2 className="text-2xl font-black tracking-tight" style={{ color: elem.textColor || 'var(--color-text)' }}>
                          {elem.title || t('recipes.communityTitle', 'Community Recipes')}
                        </h2>
                        {elem.subtitle && (
                          <p className="text-xs pt-1" style={{ color: 'var(--color-text-secondary)' }}>
                            {elem.subtitle}
                          </p>
                        )}
                      </div>
                      <Link
                        href="/recipes"
                        className="text-xs font-bold flex items-center gap-1 hover:underline"
                        style={{ color: elem.accentColor || 'var(--color-primary)' }}
                      >
                        <span>{t('exploreAllRecipes', 'Browse All Recipes')}</span>
                        <ArrowRight className="h-3 w-3" />
                      </Link>
                    </div>

                    {recipesLoading ? (
                      <div className={`grid ${gridClass} gap-6`}>
                        {Array.from({ length: limit }).map((_, rIdx) => (
                          <div key={rIdx} className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] overflow-hidden space-y-4 shadow-sm animate-pulse">
                            <div className="h-48 w-full bg-[var(--color-inner-dark)]" />
                            <div className="p-4 space-y-3">
                              <div className="h-4 w-3/4 rounded bg-[var(--color-inner-dark)]" />
                              <div className="h-3 w-full rounded bg-[var(--color-inner-dark)]/70" />
                              <div className="pt-2 border-t border-[var(--color-border)] flex justify-between">
                                <div className="h-3 w-16 rounded bg-[var(--color-inner-dark)]/50" />
                                <div className="h-3 w-16 rounded bg-[var(--color-inner-dark)]/50" />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : displayList.length === 0 ? (
                      <div className="p-10 text-center rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-card)] text-xs text-[var(--color-text-secondary)]">
                        {t('recipes.noRecipesFound', 'No recipes found for this filter.')}
                      </div>
                    ) : (
                      <div className={`grid ${gridClass} gap-6`}>
                        {displayList.map((rec: any, recIdx: number) => (
                          <div
                            key={rec.id || `rec_${recIdx}`}
                            onClick={() => {
                              setActiveRecipeModal(rec);
                              setModalServings(Number(rec.servings) || 4);
                            }}
                            className="rounded-2xl border overflow-hidden cursor-pointer hover:shadow-lg transition flex flex-col theme-harmonized-card"
                            style={{
                              backgroundColor: 'var(--color-card)',
                              borderColor: 'var(--color-border)',
                              color: 'var(--color-text)',
                            }}
                          >
                            <div className="relative h-48 w-full overflow-hidden bg-slate-800">
                              {rec.image ? (
                                <img src={rec.image} alt={rec.title} className="w-full h-full object-cover transition duration-300 hover:scale-105" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-4xl">🍳</div>
                              )}
                              {rec.is_favorite && (
                                <span className="absolute top-2.5 right-2.5 p-1.5 rounded-full bg-black/60 text-amber-400">
                                  <Star className="h-3.5 w-3.5 fill-current" />
                                </span>
                              )}
                            </div>
                            <div className="p-4 flex-1 flex flex-col justify-between space-y-2">
                              <div>
                                <h3 className="font-bold text-sm line-clamp-1">{rec.title}</h3>
                                <p className="text-xs line-clamp-2 pt-1" style={{ color: 'var(--color-text-secondary)' }}>
                                  {rec.description || 'Delicious culinary creation crafted with fresh ingredients.'}
                                </p>
                              </div>
                              <div className="flex items-center justify-between text-[11px] pt-2 border-t" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}>
                                <span className="flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  <span>{rec.cook_time || rec.prep_time || '20m'}</span>
                                </span>
                                <span className="flex items-center gap-1">
                                  <Users className="h-3 w-3" />
                                  <span>{rec.servings || 4} servings</span>
                                </span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              }

              // G. SUBSCRIPTION PLAN SHOWCASE ELEMENT (Supports planBillingInterval & CTA options)
              if (elem.type === 'subscription') {
                return (
                  <div key={elem.id || `plan_${elemIdx}`} role="region" aria-label="Subscription Quotas Showcase" className="space-y-6 pt-4">
                    <div className="text-center space-y-3">
                      <h2 className="text-3xl font-black tracking-tight" style={{ color: elem.textColor || 'var(--color-text)' }}>
                        {elem.title || 'Subscription Tiers & AI Quotas'}
                      </h2>
                      {elem.subtitle && (
                        <p className="text-xs sm:text-sm max-w-2xl mx-auto" style={{ color: 'var(--color-text-secondary)' }}>
                          {elem.subtitle}
                        </p>
                      )}

                      {/* MONTHLY / ANNUAL TOGGLE PILL */}
                      <div className="inline-flex items-center p-1 rounded-xl border" style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)' }}>
                        <button
                          type="button"
                          onClick={() => setPlanBillingInterval('monthly')}
                          className="px-4 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer"
                          style={
                            planBillingInterval === 'monthly'
                              ? { backgroundColor: 'var(--color-primary)', color: '#ffffff' }
                              : { color: 'var(--color-text-secondary)' }
                          }
                        >
                          {t('monthlyBilling', 'Monthly')}
                        </button>
                        <button
                          type="button"
                          onClick={() => setPlanBillingInterval('annual')}
                          className="px-4 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5"
                          style={
                            planBillingInterval === 'annual'
                              ? { backgroundColor: 'var(--color-primary)', color: '#ffffff' }
                              : { color: 'var(--color-text-secondary)' }
                          }
                        >
                          <span>{t('annualBilling', 'Annual')}</span>
                          <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded-full font-black">SAVE 20%</span>
                        </button>
                      </div>
                    </div>

                    {plansLoading ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 pt-4">
                        {[1, 2, 3, 4].map((n) => (
                          <div key={n} className="p-6 rounded-3xl border border-[var(--color-border)] bg-[var(--color-card)] space-y-6 shadow-sm animate-pulse">
                            <div className="space-y-3">
                              <div className="h-5 w-24 rounded bg-[var(--color-inner-dark)]" />
                              <div className="h-8 w-32 rounded bg-[var(--color-inner-dark)]" />
                            </div>
                            <div className="space-y-2 pt-2 border-t border-[var(--color-border)]">
                              <div className="h-3 w-full rounded bg-[var(--color-inner-dark)]/60" />
                              <div className="h-3 w-4/5 rounded bg-[var(--color-inner-dark)]/60" />
                              <div className="h-3 w-3/4 rounded bg-[var(--color-inner-dark)]/60" />
                            </div>
                            <div className="h-10 w-full rounded-xl bg-[var(--color-inner-dark)]" />
                          </div>
                        ))}
                      </div>
                    ) : plans.length === 0 ? (
                      <div className="p-8 text-center rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-card)] text-xs text-[var(--color-text-secondary)]">
                        {t('subscriptions.noPlansAvailable', 'No subscription tiers are currently available.')}
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 pt-4">
                        {plans.map((p: any, pIdx: number) => {
                          const price = planBillingInterval === 'annual' ? (p.annual_price || p.price_annual || 0) : (p.monthly_price || p.price_monthly || 0);
                          const featuresList = Array.isArray(p.features) ? p.features : ['AI Assistant Access', 'Personal Recipe Database', 'Pantry Manager'];
                          return (
                            <div
                              key={p.slug || `tier_${pIdx}`}
                              className="p-6 rounded-3xl border flex flex-col justify-between space-y-6 theme-harmonized-card shadow-xs relative"
                              style={{
                                backgroundColor: 'var(--color-card)',
                                borderColor: p.is_popular ? 'var(--color-primary)' : 'var(--color-border)',
                                color: 'var(--color-text)',
                              }}
                            >
                              {p.is_popular && (
                                <span
                                  className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full text-[10px] font-black uppercase text-white shadow-xs"
                                  style={{ backgroundColor: 'var(--color-primary)' }}
                                >
                                  Most Popular
                                </span>
                              )}

                              <div className="space-y-4">
                                <div>
                                  <h3 className="font-extrabold text-base">{p.name}</h3>
                                  <div className="pt-2 flex items-baseline gap-1">
                                    <span className="text-3xl font-black">${Number(price).toFixed(2)}</span>
                                    <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                                      /{planBillingInterval === 'annual' ? 'yr' : 'mo'}
                                    </span>
                                  </div>
                                </div>

                                <div className="space-y-2 text-xs pt-2 border-t" style={{ borderColor: 'var(--color-border)' }}>
                                  {featuresList.map((feat: any, fIdx: number) => (
                                    <div key={fIdx} className="flex items-center gap-2">
                                      <Check className="h-3.5 w-3.5 text-[var(--color-primary)] shrink-0" />
                                      <span style={{ color: 'var(--color-text-secondary)' }}>{feat}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              <Link
                                href={elem.planCtaUrl || '/subscriptions'}
                                className="w-full py-2.5 text-center rounded-xl font-bold text-xs text-white shadow-xs transition hover:opacity-90"
                                style={{ backgroundColor: 'var(--color-primary)' }}
                              >
                                {p.is_free ? t('getStartedFree', 'Get Started Free') : (elem.planCtaText || t('upgradeToPlan', 'Select Tier'))}
                              </Link>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              }

              return null;
            })
          )}
        </div>
      </main>

      {/* 3. DYNAMIC MULTI-COLUMN FOOTER */}
      {activePage?.footer?.enabled !== false && (
        <footer
          role="contentinfo"
          className="border-t theme-harmonized-card transition-colors duration-200"
          style={{
            backgroundColor: activePage?.footer?.bgColor || 'var(--color-card)',
            borderColor: activePage?.footer?.borderColor || 'var(--color-border)',
            color: activePage?.footer?.textColor || 'var(--color-text)',
          }}
        >
          <div className={`${containerMaxWidthClass} ${sharedContainerPadding} mx-auto py-12 space-y-8`}>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
              {/* BRAND MISSION */}
              <div className="space-y-3 md:col-span-2">
                <div className="flex items-center gap-2 text-[var(--color-primary)] font-black text-lg">
                  <span>{siteIcon || '🍳'}</span>
                  <span>{siteName || 'Zecratary'}</span>
                </div>
                <p className="text-xs leading-relaxed max-w-md" style={{ color: 'var(--color-text-secondary)' }}>
                  {activePage?.footer?.aboutText || DEFAULT_HOMEPAGE_FALLBACK.footer?.aboutText}
                </p>
              </div>

              {/* NAVIGATION COLUMNS */}
              {(activePage?.footer?.columns || DEFAULT_FOOTER.columns || []).map((col: any, colIdx: number) => (
                <div key={colIdx} className="space-y-3">
                  <h4 className="text-xs font-black uppercase tracking-wider">{col.title}</h4>
                  <ul className="space-y-2 text-xs">
                    {(col.links || []).map((link: any, linkIdx: number) => (
                      <li key={linkIdx}>
                        <Link href={link.url} className="hover:underline transition" style={{ color: 'var(--color-text-secondary)' }}>
                          {link.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            {/* COPYRIGHT NOTICE */}
            <div className="pt-8 border-t flex flex-col sm:flex-row items-center justify-between text-xs" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}>
              <span>{activePage?.footer?.copyrightText || DEFAULT_HOMEPAGE_FALLBACK.footer?.copyrightText}</span>
              <div className="flex items-center gap-4 pt-2 sm:pt-0">
                <Link href="/privacy" className="hover:underline">Privacy</Link>
                <Link href="/terms" className="hover:underline">Terms</Link>
                <Link href="/contact" className="hover:underline">Contact</Link>
              </div>
            </div>
          </div>
        </footer>
      )}

      {/* 4. FULL RECIPE MODAL POPUP */}
      {activeRecipeModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={activeRecipeModal.title}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs"
          onClick={() => setActiveRecipeModal(null)}
        >
          <div
            className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl border p-6 space-y-6 theme-harmonized-card shadow-2xl"
            style={{
              backgroundColor: 'var(--color-card)',
              borderColor: 'var(--color-border)',
              color: 'var(--color-text)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-black">{activeRecipeModal.title}</h2>
                {activeRecipeModal.source_url && (
                  <a
                    href={activeRecipeModal.source_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] flex items-center gap-1 hover:underline pt-1 text-[var(--color-primary)]"
                  >
                    <span>{getSafeHostname(activeRecipeModal.source_url)}</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
              <button
                type="button"
                onClick={() => setActiveRecipeModal(null)}
                className="p-1.5 rounded-lg border hover:bg-slate-800/20 cursor-pointer"
                style={{ borderColor: 'var(--color-border)' }}
                aria-label="Close modal"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {activeRecipeModal.image && (
              <img src={activeRecipeModal.image} alt={activeRecipeModal.title} className="w-full h-56 object-cover rounded-2xl" />
            )}

            {/* CONTROLS: SERVINGS & ZOOM */}
            <div className="flex items-center justify-between p-3 rounded-2xl border text-xs" style={{ backgroundColor: 'var(--color-inner-dark)', borderColor: 'var(--color-border)' }}>
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-[var(--color-primary)]" />
                <span className="font-bold">Servings:</span>
                <button
                  type="button"
                  onClick={() => setModalServings(Math.max(1, modalServings - 1))}
                  className="p-1 rounded-md border hover:bg-white/5 cursor-pointer"
                  style={{ borderColor: 'var(--color-border)' }}
                  aria-label="Decrease servings"
                >
                  <Minus className="h-3 w-3" />
                </button>
                <span className="font-black px-1">{modalServings}</span>
                <button
                  type="button"
                  onClick={() => setModalServings(modalServings + 1)}
                  className="p-1 rounded-md border hover:bg-white/5 cursor-pointer"
                  style={{ borderColor: 'var(--color-border)' }}
                  aria-label="Increase servings"
                >
                  <Plus className="h-3 w-3" />
                </button>
              </div>

              <div className="flex items-center gap-2">
                <span className="font-bold">Text:</span>
                <button
                  type="button"
                  onClick={() => setModalFontZoom(Math.max(80, modalFontZoom - 10))}
                  className="px-2 py-0.5 rounded border hover:bg-white/5 cursor-pointer"
                  style={{ borderColor: 'var(--color-border)' }}
                >
                  A-
                </button>
                <button
                  type="button"
                  onClick={() => setModalFontZoom(Math.min(150, modalFontZoom + 10))}
                  className="px-2 py-0.5 rounded border hover:bg-white/5 cursor-pointer"
                  style={{ borderColor: 'var(--color-border)' }}
                >
                  A+
                </button>
              </div>
            </div>

            {/* INGREDIENTS */}
            <div className="space-y-2">
              <h3 className="font-extrabold text-sm uppercase tracking-wider text-[var(--color-primary)]">Ingredients</h3>
              <ul className="space-y-1.5 text-xs" style={{ fontSize: `${modalFontZoom}%` }}>
                {(Array.isArray(activeRecipeModal.ingredients) ? activeRecipeModal.ingredients : []).map((ing: any, iIdx: number) => (
                  <li key={iIdx} className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-primary)] shrink-0" />
                    <span>{typeof ing === 'string' ? ing : ing.name || JSON.stringify(ing)}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* INSTRUCTIONS */}
            <div className="space-y-2">
              <h3 className="font-extrabold text-sm uppercase tracking-wider text-[var(--color-primary)]">Instructions</h3>
              <ol className="space-y-2 text-xs list-decimal list-inside" style={{ fontSize: `${modalFontZoom}%` }}>
                {(Array.isArray(activeRecipeModal.instructions) ? activeRecipeModal.instructions : []).map((ins: any, insIdx: number) => (
                  <li key={insIdx} className="leading-relaxed">
                    <span>{typeof ins === 'string' ? ins : ins.text || JSON.stringify(ins)}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
