'use client';

import { useEffect, useRef } from 'react';
import { useServerInsertedHTML } from 'next/navigation';
import { applyThemeToDocument, fetchAndApplyServerTheme, applyGlobalFont } from '@/lib/themeConfig';

export default function GlobalThemeSync() {
  const isInserted = useRef(false);

  useServerInsertedHTML(() => {
    if (isInserted.current) return null;
    isInserted.current = true;

    const prehydrateScript = `(function() {
      try {
        var doc = document.documentElement;
        doc.classList.add('theme-preloading');
        var mode = localStorage.getItem('zecratary_theme_mode');
        var isDay = mode === 'light' || mode === 'day';
        if (isDay) {
          doc.classList.remove('dark');
          doc.classList.add('light');
        } else {
          doc.classList.remove('light');
          doc.classList.add('dark');
        }
        var stored = localStorage.getItem('zecratary_theme_colors') || localStorage.getItem('zecratary_theme_config');
        var c = stored ? JSON.parse(stored) : null;
        if (c) {
          var p = c.primary || c.primaryColor || '#10b981';
          var ph = c.primaryHover || '#059669';
          var ac = c.accentEmerald || c.accentColor || c.accent || '#10b981';
          var bg = c.backgroundColor || c.backgroundDark || '#070b13';
          var card = c.cardBackground || c.cardDark || '#0f172a';
          var border = c.cardBorder || c.borderColor || '#1e293b';
          var textSec = c.textSecondary || '#94a3b8';
          var txt = c.textColor || '#ffffff';

          doc.style.setProperty('--color-primary', p);
          doc.style.setProperty('--color-primary-hover', ph);
          doc.style.setProperty('--color-accent', ac);
          doc.style.setProperty('--color-emerald', ac);

          if (isDay) {
            doc.style.setProperty('--color-bg', '#f8fafc');
            doc.style.setProperty('--color-card', '#ffffff');
            doc.style.setProperty('--color-inner-dark', '#f1f5f9');
            doc.style.setProperty('--color-border', '#e2e8f0');
            doc.style.setProperty('--color-text', '#0f172a');
            doc.style.setProperty('--color-text-secondary', '#64748b');
          } else {
            doc.style.setProperty('--color-bg', bg);
            doc.style.setProperty('--color-card', card);
            doc.style.setProperty('--color-inner-dark', '#111726');
            doc.style.setProperty('--color-border', border);
            doc.style.setProperty('--color-text', txt);
            doc.style.setProperty('--color-text-secondary', textSec);
          }
        }
      } catch (e) {}
    })();`;

    return (
      <script
        id="zecratary-theme-prehydrate"
        dangerouslySetInnerHTML={{ __html: prehydrateScript }}
      />
    );
  });

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.classList.remove('theme-preloading');
    }

    fetchAndApplyServerTheme(true);

    const handleThemeUpdate = (e: Event) => {
      // Other tabs change storage with a key. Plain 'storage' events fired by our own pages (recipes, planner, shopping) are not theme changes.
      if (e.type === 'storage') {
        const key = (e as StorageEvent).key;
        if (!key || !key.startsWith('zecratary_theme')) return;
      }
      const detail = (e as CustomEvent)?.detail;
      if (detail && typeof detail === 'object' && !('mode' in detail)) {
        applyThemeToDocument(detail);
      } else {
        fetchAndApplyServerTheme(e.type === 'zecratary_admin_settings_updated');
      }
    };

    const handleFontUpdate = (e: Event) => {
      const detail = (e as CustomEvent)?.detail;
      if (detail) {
        (applyGlobalFont as any)(detail.fontFamily, detail.fontSize, detail.fontLetterSpacing);
      } else {
        (applyGlobalFont as any)();
      }
    };

    const handleModeUpdate = () => {
      applyThemeToDocument();
    };

    window.addEventListener('zecratary_theme_updated', handleThemeUpdate);
    window.addEventListener('zecratary_theme_changed', handleThemeUpdate);
    window.addEventListener('zecratary_admin_settings_updated', handleThemeUpdate);
    window.addEventListener('zecratary_theme_mode_changed', handleModeUpdate);
    window.addEventListener('zecratary_font_updated', handleFontUpdate);
    window.addEventListener('storage', handleThemeUpdate);

    return () => {
      window.removeEventListener('zecratary_theme_updated', handleThemeUpdate);
      window.removeEventListener('zecratary_theme_changed', handleThemeUpdate);
      window.removeEventListener('zecratary_admin_settings_updated', handleThemeUpdate);
      window.removeEventListener('zecratary_theme_mode_changed', handleModeUpdate);
      window.removeEventListener('zecratary_font_updated', handleFontUpdate);
      window.removeEventListener('storage', handleThemeUpdate);
    };
  }, []);

  return null;
}
