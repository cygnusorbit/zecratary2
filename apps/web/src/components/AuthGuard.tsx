'use client';
import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { getCurrentUser, initAuthStorage, checkServerSession } from '@/lib/auth';

const PUBLIC_ROUTES = ['/login', '/register'];
const ADMIN_RESTRICTED_PREFIXES = ['/admin', '/add-user'];

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    initAuthStorage();
    const user = getCurrentUser();
      const hasCookie = typeof document !== 'undefined' && document.cookie.includes('zecratary_session=');
    const isPublicRoute = PUBLIC_ROUTES.includes(pathname);

    // 1. Unauthenticated users -> Redirect to /login
    if (!user && !isPublicRoute) {
      setAuthorized(false);
      router.replace('/login');
      return;
    }

    // 2. Logged-in users visiting /login or /register -> Redirect to /dashboard
    //    (only when the server still honours the session, otherwise they could never sign in again)
    if (user && isPublicRoute) {
      let cancelled = false;
      checkServerSession().then((r) => {
        if (cancelled) return;
        if (r === 'valid') router.replace('/dashboard');
      });
      return () => { cancelled = true; };
    }

    // 3. Standard users attempting to access Admin pages -> Block and redirect to /dashboard
    const isAdminRoute = ADMIN_RESTRICTED_PREFIXES.some(prefix => 
      pathname === prefix || pathname.startsWith(prefix + '/')
    );

    if (user && isAdminRoute && user.role !== 'admin') {
      alert('Access restricted: Administrator privileges required.');
      router.replace('/dashboard');
      return;
    }

    setAuthorized(true);

    // 4. The browser thinks it is signed in but the server session expired -> forget it and go to /login
    if (user && !isPublicRoute) {
      checkServerSession().then((r) => {
        if (r === 'invalid') router.replace('/login');
      });
    }
  }, [pathname, router]);

  if (!authorized && !PUBLIC_ROUTES.includes(pathname)) {
    return (
      <div className="min-h-screen bg-[#070b13] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#E05638] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return <>{children}</>;
}
