'use client';

import React, { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { syncUserSavedRecipes } from '@/lib/recipeSync';
import { LanguageProvider } from '@/components/LanguageProvider';
import Sidebar from '@/components/Sidebar';

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || '';
  const router = useRouter();

  // First-run: a brand-new install with no database configured goes to /setup (checked once per tab session).
  useEffect(() => {
    if (pathname === '/setup' || pathname.startsWith('/api')) return;
    try {
      if (window.sessionStorage.getItem('zecratary_setup_ok') === '1') return;
    } catch (_) {}
    let cancelled = false;
    fetch('/api/setup')
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d && d.needsSetup) router.replace('/setup');
        else { try { window.sessionStorage.setItem('zecratary_setup_ok', '1'); } catch (_) {} }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [pathname, router]);

  // Global Cross-Browser Recipe Sync Bridge
  useEffect(() => {
    try {
      let activeUserId = 'guest';
      if (typeof window !== 'undefined') {
        try {
          const raw = localStorage.getItem('zecratary_user');
          if (raw) {
            const u = JSON.parse(raw);
            if (u?.id || u?.email) activeUserId = u.id || u.email;
          }
        } catch (_) {}
      }
      (syncUserSavedRecipes as any)(activeUserId);
    } catch (_) {}
  }, []);

  return (
    <LanguageProvider>
      <div className="min-h-screen flex flex-col md:flex-row bg-[#0B101D] text-slate-100 font-sans antialiased">
        <Sidebar />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 w-full min-w-0">
          {children}
        </main>
      </div>
    </LanguageProvider>
  );
}
