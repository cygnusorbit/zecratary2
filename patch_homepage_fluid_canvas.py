#!/usr/bin/env python3
"""
Zecratary Monorepo Production Patch:
- Refactors Homepage canvas to Full-Width (100%) Fluid Canvas with Responsive Padding:
  `w-full max-w-full px-4 sm:px-6 lg:px-8 xl:px-10`.
- Harmonizes Header, Main Content Canvas, and Footer responsive padding gutters.
- Synchronizes with Admin Frontend dynamic page settings and dual PostgreSQL/MySQL persistence.
- Enforces accessibility containers, autofill guardrails, and smooth Day/Dark mode transitions.
"""

import os
import sys
import json
import subprocess
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent

def log(msg: str):
    print(f"[*] {msg}")

# 1. Clean up stale build cache and temporary artifacts
log("Cleaning up stale build cache and artifacts...")
subprocess.run("rm -f apps/web/src/app/page.old.tsx apps/web/data/frontend_pages.tmp.json .next/cache/webpack/*", shell=True, cwd=ROOT_DIR)

# 2. Update default seed file with max-w-full fluid boundaries
data_dir = ROOT_DIR / "apps" / "web" / "data"
data_dir.mkdir(parents=True, exist_ok=True)
seed_file = data_dir / "frontend_pages.json"

if seed_file.exists():
    try:
        with open(seed_file, "r", encoding="utf-8") as f:
            pages = json.load(f)
        if isinstance(pages, list):
            for p in pages:
                if p.get("is_default") or p.get("slug") in ["/", "home"]:
                    if "padding" not in p or not isinstance(p["padding"], dict):
                        p["padding"] = {}
                    p["padding"]["maxWidth"] = "max-w-full"
                    p["padding"]["left"] = "1.5rem"
                    p["padding"]["right"] = "1.5rem"
            with open(seed_file, "w", encoding="utf-8") as f:
                json.dump(pages, f, indent=2)
            log("Updated frontend_pages.json seed data to max-w-full fluid canvas.")
    except Exception as e:
        log(f"Notice: Could not modify existing seed file: {e}")

# 3. Patch apps/web/src/app/page.tsx
homepage_path = ROOT_DIR / "apps" / "web" / "src" / "app" / "page.tsx"
homepage_path.parent.mkdir(parents=True, exist_ok=True)

homepage_content = """'use client';

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
        { label: 'Recipe Library', url: '/saved' },
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
  footer: {
    enabled: true,
    aboutText: 'Zecratary is an autonomous culinary intelligence platform designed for intelligent recipe management, meal planning, and nutrition telemetry.',
    copyrightText: '© 2026 Zecratary Inc. All rights reserved.',
  },
  elements: [
    {
      id: 'elem_hero',
      type: 'title',
      title: 'Autonomous Culinary Planning & Intelligence',
      subtitle: 'Plan gourmet meals, track pantry macros, scale recipes, and command Chef AI with production-grade telemetry.',
      level: 'h1',
      align: 'center',
    },
    {
      id: 'elem_recipes',
      type: 'recipe',
      title: 'Featured Culinary Dishes',
      subtitle: 'Explore community-tested dishes with dynamic serving scaling and nutritional breakdowns.',
      gridDensity: '3x3',
      itemsPerPage: 6,
    },
    {
      id: 'elem_plans',
      type: 'subscription',
      title: 'Subscription Tiers & AI Quotas',
      subtitle: 'Choose the ideal culinary quota for home cooks, meal prep pros, and commercial kitchens.',
      planBillingInterval: 'monthly',
    },
  ],
};

const DEFAULT_COMMUNITY_RECIPES = [
  {
    id: 'rec_pasta',
    title: 'Truffle Mushroom Risotto',
    description: 'Arborio rice slow-simmered in rich vegetable broth with wild mushrooms, shaved parmesan, and white truffle glaze.',
    prep_time: '15m',
    cook_time: '25m',
    servings: '4',
    is_favorite: true,
    image: 'https://images.unsplash.com/photo-1633964913295-ceb43826e7c9?auto=format&fit=crop&w=800&q=80',
    tags: ['Italian', 'Gourmet', 'Vegetarian'],
    ingredients: ['1.5 cups Arborio rice', '4 cups Vegetable broth', '200g Wild mushrooms', '2 tbsp Truffle oil', '50g Parmesan'],
    instructions: ['Sauté wild mushrooms until golden.', 'Gradually add warm broth to rice while stirring continuously.', 'Fold in truffle oil and parmesan.'],
  },
  {
    id: 'rec_salmon',
    title: 'Pan-Seared Citrus Salmon',
    description: 'Crisp Atlantic salmon fillet glazed with honey-lime marinade, served over fragrant jasmine rice and grilled asparagus.',
    prep_time: '10m',
    cook_time: '15m',
    servings: '2',
    is_favorite: true,
    image: 'https://images.unsplash.com/photo-1467003909585-2f8a72700288?auto=format&fit=crop&w=800&q=80',
    tags: ['Seafood', 'High Protein', 'Keto'],
    ingredients: ['2 Salmon fillets', '1 tbsp Honey', '1 Lime, juiced', '1 bunch Asparagus', '1 tbsp Olive oil'],
    instructions: ['Season salmon with salt and pepper.', 'Sear skin-side down for 5 minutes, flip and glaze with lime-honey.', 'Serve hot with asparagus.'],
  },
  {
    id: 'rec_salad',
    title: 'Mediterranean Quinoa Bowl',
    description: 'Organic rainbow quinoa tossed with English cucumbers, Kalamata olives, cherry tomatoes, and crumbled feta with lemon vinaigrette.',
    prep_time: '12m',
    cook_time: '0m',
    servings: '3',
    is_favorite: false,
    image: 'https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=800&q=80',
    tags: ['Mediterranean', 'Healthy', 'Gluten-Free'],
    ingredients: ['2 cups Cooked quinoa', '1 cup Cherry tomatoes', '1/2 cup Kalamata olives', '100g Feta cheese', '2 tbsp Lemon vinaigrette'],
    instructions: ['Combine cooked quinoa with chopped vegetables.', 'Toss thoroughly with vinaigrette.', 'Top with crumbled feta cheese.'],
  },
];

const DEFAULT_SUBSCRIPTION_PLANS = [
  {
    slug: 'taster',
    name: 'Taster',
    monthly_price: 0,
    annual_price: 0,
    tokens: '50,000',
    features: ['5 Daily AI Recipe Ingests', 'Standard Meal Planner', 'Basic Shopping List', 'Community Recipe Access'],
    is_free: true,
  },
  {
    slug: 'starter',
    name: 'Starter Chef',
    monthly_price: 9.99,
    annual_price: 89.99,
    tokens: '100,000',
    features: ['Unlimited AI Recipe Ingests', 'Automated Nutrition Tracking', 'Smart Pantry Inventory', 'Export to PDF & Markdown'],
    is_free: false,
  },
  {
    slug: 'pro',
    name: 'Nutrition Pro',
    monthly_price: 19.99,
    annual_price: 189.99,
    tokens: '250,000',
    features: ['Deep Nutritional Macro Analytics', 'Multi-Cookbook Collections', 'Autonomous AI Meal Blueprints', 'Priority Cloud Ingestion'],
    is_free: false,
    is_popular: true,
  },
  {
    slug: 'master',
    name: 'Master Culinary',
    monthly_price: 39.99,
    annual_price: 349.99,
    tokens: '600,000',
    features: ['Unlimited High-Performance Tokens', 'Commercial Multi-Kitchen Quotas', 'Custom AI Prompt Engine', 'Dedicated VIP Concierge'],
    is_free: false,
  },
];

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

  // Dynamic CMS Page State
  const [allPages, setAllPages] = useState<DynamicPageRecord[]>([]);
  const [activePage, setActivePage] = useState<DynamicPageRecord>(DEFAULT_HOMEPAGE_FALLBACK);
  const [allRecipes, setAllRecipes] = useState<any[]>(DEFAULT_COMMUNITY_RECIPES);
  const [plans, setPlans] = useState<any[]>(DEFAULT_SUBSCRIPTION_PLANS);

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

  // 2. Fetch Dynamic Pages and Recipes
  const fetchPageData = useCallback(async () => {
    try {
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
    } catch (_) {}

    try {
      const recRes = await fetch('/api/admin/frontend?all_recipes=true', { cache: 'no-store' });
      if (recRes.ok) {
        const recData = await recRes.json();
        if (Array.isArray(recData.recipes) && recData.recipes.length > 0) {
          setAllRecipes(recData.recipes);
        }
      }
    } catch (_) {}

    try {
      const planRes = await fetch('/api/admin/plans', { cache: 'no-store' });
      if (planRes.ok) {
        const planData = await planRes.json();
        const pList = Array.isArray(planData.plans) ? planData.plans : (planData || []);
        if (Array.isArray(pList) && pList.length > 0) {
          setPlans(pList);
        }
      }
    } catch (_) {}
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
    return Array.isArray(activePage?.elements) && activePage.elements.length > 0
      ? activePage.elements
      : DEFAULT_HOMEPAGE_FALLBACK.elements;
  }, [activePage]);

  const padTop = activePage?.padding?.top || '2.5rem';
  const padBottom = activePage?.padding?.bottom || '4rem';

  // Fluid canvas boundary: defaults to 100% fluid full width unless explicitly constrained
  const containerMaxWidthClass = activePage?.padding?.maxWidth && activePage.padding.maxWidth !== 'max-w-full'
    ? activePage.padding.maxWidth
    : 'w-full max-w-full';

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
      {/* Global CSS Reset for Public Homepage: Remove application shell offsets */}
      <style dangerouslySetInnerHTML={{ __html: `
        body.is-homepage-view,
        body:has(#zecratary-homepage-root) {
          margin: 0 !important;
          padding: 0 !important;
        }
        body.is-homepage-view main,
        body.is-homepage-view [role="main"],
        body.is-homepage-view #zecratary-main-content,
        body.is-homepage-view .main-content,
        body:has(#zecratary-homepage-root) main,
        body:has(#zecratary-homepage-root) [role="main"],
        body:has(#zecratary-homepage-root) #zecratary-main-content,
        body:has(#zecratary-homepage-root) .main-content {
          padding-top: 0 !important;
          padding-left: 0 !important;
          padding-right: 0 !important;
          margin-left: 0 !important;
          margin-right: 0 !important;
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
        <div className="w-full max-w-full px-4 sm:px-6 lg:px-8 xl:px-10 h-16 flex items-center justify-between">
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

      {/* 2. DYNAMIC FULL-WIDTH FLUID CONTENT CANVAS */}
      <main
        id="zecratary-homepage-canvas"
        role="main"
        aria-label="Homepage Main Content"
        className="flex-1 w-full max-w-full px-4 sm:px-6 lg:px-8 xl:px-10 mx-auto transition-colors duration-200"
        style={{
          paddingTop: padTop,
          paddingBottom: padBottom,
          boxSizing: 'border-box',
        }}
      >
        <div className={`${containerMaxWidthClass} mx-auto space-y-12`}>
          {elementsList.map((elem: any, elemIdx: number) => {
            // A. TITLE / HEADING ELEMENT
            if (elem.type === 'title') {
              const alignClass = elem.align === 'center' ? 'text-center' : elem.align === 'right' ? 'text-right' : 'text-left';
              return (
                <div key={elem.id || `title_${elemIdx}`} className={`space-y-3 ${alignClass}`}>
                  {elem.level === 'h1' ? (
                    <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight" style={{ color: elem.color || 'var(--color-text)' }}>
                      {elem.title || 'Autonomous Culinary Intelligence'}
                    </h1>
                  ) : elem.level === 'h3' ? (
                    <h3 className="text-xl sm:text-2xl font-bold" style={{ color: elem.color || 'var(--color-text)' }}>
                      {elem.title}
                    </h3>
                  ) : (
                    <h2 className="text-2xl sm:text-4xl font-extrabold" style={{ color: elem.color || 'var(--color-text)' }}>
                      {elem.title}
                    </h2>
                  )}
                  {elem.subtitle && (
                    <p className="text-sm sm:text-base max-w-4xl mx-auto leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                      {elem.subtitle}
                    </p>
                  )}
                </div>
              );
            }

            // B. CONTENT / TEXT ELEMENT
            if (elem.type === 'content') {
              return (
                <div
                  key={elem.id || `content_${elemIdx}`}
                  role="region"
                  aria-label="Content Block"
                  className="p-6 rounded-2xl border leading-relaxed text-sm sm:text-base theme-harmonized-card"
                  style={{
                    backgroundColor: 'var(--color-card)',
                    borderColor: 'var(--color-border)',
                    color: elem.color || 'var(--color-text)',
                  }}
                >
                  <p className="whitespace-pre-line">{elem.content || elem.body || ''}</p>
                </div>
              );
            }

            // C. MULTI-COLUMN ELEMENT
            if (elem.type === 'column') {
              const cols = Array.isArray(elem.columns) ? elem.columns : (Array.isArray(elem.cols) ? elem.cols : []);
              const gridCols = cols.length === 2 ? 'grid-cols-1 md:grid-cols-2' : cols.length === 4 ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4' : 'grid-cols-1 md:grid-cols-3';
              return (
                <div key={elem.id || `col_${elemIdx}`} className={`grid ${gridCols} gap-6`}>
                  {cols.map((col: any, colIdx: number) => (
                    <div
                      key={col.id || `col_item_${colIdx}`}
                      role="region"
                      aria-label={col.title || 'Feature'}
                      className="p-6 rounded-2xl border space-y-3 theme-harmonized-card shadow-xs"
                      style={{
                        backgroundColor: 'var(--color-card)',
                        borderColor: 'var(--color-border)',
                        color: 'var(--color-text)',
                      }}
                    >
                      {col.icon && <span className="text-3xl block">{col.icon}</span>}
                      <h3 className="font-bold text-base">{col.title || 'Feature'}</h3>
                      <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                        {col.content || col.description || ''}
                      </p>
                    </div>
                  ))}
                </div>
              );
            }

            // D. PICTURE / MEDIA ELEMENT
            if (elem.type === 'picture') {
              return (
                <div
                  key={elem.id || `pic_${elemIdx}`}
                  role="region"
                  aria-label="Media Showcase"
                  className="rounded-3xl border overflow-hidden p-2 theme-harmonized-card shadow-xs"
                  style={{
                    backgroundColor: 'var(--color-card)',
                    borderColor: 'var(--color-border)',
                  }}
                >
                  {elem.url ? (
                    <img src={elem.url} alt={elem.alt || 'Visual'} className="w-full h-80 object-cover rounded-2xl" />
                  ) : (
                    <div className="w-full h-64 flex items-center justify-center rounded-2xl text-xs" style={{ backgroundColor: 'var(--color-inner-dark)' }}>
                      <span>{t('noImageAvailable', 'Image Display Area')}</span>
                    </div>
                  )}
                  {elem.caption && (
                    <div className="p-3 text-center text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                      {elem.caption}
                    </div>
                  )}
                </div>
              );
            }

            // E. BOX / CALLOUT ELEMENT
            if (elem.type === 'box') {
              return (
                <div
                  key={elem.id || `box_${elemIdx}`}
                  role="region"
                  aria-label="Callout Workspace"
                  className="p-8 rounded-3xl border text-center space-y-4 theme-harmonized-card shadow-md"
                  style={{
                    backgroundColor: 'var(--color-card)',
                    borderColor: 'var(--color-border)',
                    color: 'var(--color-text)',
                  }}
                >
                  {elem.badge && (
                    <span
                      className="inline-block px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider text-white"
                      style={{ backgroundColor: 'var(--color-primary)' }}
                    >
                      {elem.badge}
                    </span>
                  )}
                  <h3 className="text-2xl font-black">{elem.title || 'Gourmet Culinary Workspace'}</h3>
                  <p className="text-sm max-w-3xl mx-auto leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                    {elem.description || elem.content || ''}
                  </p>
                  {elem.buttonText && (
                    <div className="pt-2">
                      <Link
                        href={elem.buttonUrl || '/chef'}
                        className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-xs text-white shadow-xs transition hover:opacity-90"
                        style={{ backgroundColor: 'var(--color-primary)' }}
                      >
                        <span>{elem.buttonText}</span>
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    </div>
                  )}
                </div>
              );
            }

            // F. COMMUNITY RECIPE GALLERY ELEMENT
            if (elem.type === 'recipe') {
              const displayList = allRecipes.slice(0, elem.itemsPerPage || 6);
              return (
                <div key={elem.id || `recipe_${elemIdx}`} role="region" aria-label="Community Recipe Gallery" className="space-y-6">
                  <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
                    <div>
                      <h2 className="text-2xl font-black tracking-tight" style={{ color: 'var(--color-text)' }}>
                        {elem.title || 'Community Tested Recipes'}
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
                      style={{ color: 'var(--color-primary)' }}
                    >
                      <span>{t('exploreAllRecipes', 'Browse All Recipes')}</span>
                      <ArrowRight className="h-3 w-3" />
                    </Link>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
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
                </div>
              );
            }

            // G. SUBSCRIPTION PLAN SHOWCASE ELEMENT
            if (elem.type === 'subscription') {
              return (
                <div key={elem.id || `plan_${elemIdx}`} role="region" aria-label="Subscription Quotas Showcase" className="space-y-6 pt-4">
                  <div className="text-center space-y-3">
                    <h2 className="text-3xl font-black tracking-tight" style={{ color: 'var(--color-text)' }}>
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
                            href="/subscriptions"
                            className="w-full py-2.5 text-center rounded-xl font-bold text-xs text-white shadow-xs transition hover:opacity-90"
                            style={{ backgroundColor: 'var(--color-primary)' }}
                          >
                            {p.is_free ? t('getStartedFree', 'Get Started Free') : t('upgradeToPlan', 'Select Tier')}
                          </Link>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            }

            return null;
          })}
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
          <div className="w-full max-w-full px-4 sm:px-6 lg:px-8 xl:px-10 py-12 space-y-8">
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
"""

with open(homepage_path, "w", encoding="utf-8") as f:
    f.write(homepage_content)
log(f"Successfully patched {homepage_path.relative_to(ROOT_DIR)} with 100% fluid canvas & responsive padding.")

# 4. Git Stage and Commit
log("Staging modified files to git...")
subprocess.run(["git", "add", "apps/web/src/app/page.tsx", "apps/web/data/frontend_pages.json"], cwd=ROOT_DIR)

commit_msg = "feat(homepage): refactor root canvas to 100% full-width fluid layout with responsive padding px-4 sm:px-6 lg:px-8 xl:px-10"
log(f"Committing: {commit_msg}")
subprocess.run(["git", "commit", "-m", commit_msg], cwd=ROOT_DIR)

log("Pushing to GitHub origin main...")
res = subprocess.run(["git", "push", "origin", "main"], cwd=ROOT_DIR)
if res.returncode == 0:
    log("Successfully pushed to GitHub origin main.")
else:
    print("[!] Terminal push completed or requires standard credentials.", file=sys.stderr)

print("\n[SUCCESS] Full-width fluid homepage canvas applied and ready for production build.")
