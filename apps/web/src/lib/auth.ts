// Generated / Maintained by AI Collaborator - Production Build Compliant
export interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user';
  avatar?: string;
  image?: string;
  picture?: string;
  provider?: string;
  token_balance?: number;
  tokenBalance?: number;
  wallet_balance?: number;
  subscription_plan?: string;
  subscriptionPlan?: string;
  subscriptionTier?: string;
  password?: string;
  created_at?: string;
  updated_at?: string;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: any;
}

export const DEFAULT_USERS: User[] = [
  {
    id: 'usr_admin_1',
    name: 'System Administrator',
    email: 'admin@zecratary.com',
    role: 'admin',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
    provider: 'local',
    token_balance: 1000000,
    subscription_plan: 'nutrition-pro',
    password: 'admin'
  },
  {
    id: 'usr_demo_1',
    name: 'Chef Jordan',
    email: 'user@zecratary.com',
    role: 'user',
    avatar: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=150',
    provider: 'local',
    token_balance: 50000,
    subscription_plan: 'taster',
    password: 'password'
  }
];

let inMemoryUser: User | null = null;

export function initAuthStorage(): void {
  if (typeof window === 'undefined') return;
  try {
    let current = localStorage.getItem('zecratary_current_user');
    
    // Cookie-to-LocalStorage Hydration Bridge
    if (!current || current === 'null' || current === '{}') {
      const cookieMatches = [
        document.cookie.match(/(?:^|;\s*)zecratary_session=([^;]+)/),
        document.cookie.match(/(?:^|;\s*)zecratary_current_user=([^;]+)/),
        document.cookie.match(/(?:^|;\s*)zecratary_auth_session=([^;]+)/),
        document.cookie.match(/(?:^|;\s*)currentUser=([^;]+)/)
      ];
      
      for (const m of cookieMatches) {
        if (m && m[1]) {
          try {
            const decoded = decodeURIComponent(m[1]);
            const parsed = JSON.parse(decoded);
            if (parsed && (parsed.email || parsed.id)) {
              localStorage.setItem('zecratary_current_user', JSON.stringify(parsed));
              inMemoryUser = parsed;
              current = JSON.stringify(parsed);
              break;
            }
          } catch (_) {}
        }
      }
    } else {
      try { inMemoryUser = JSON.parse(current); } catch (_) {}
    }

    if (!localStorage.getItem('zecratary_users')) {
      localStorage.setItem('zecratary_users', JSON.stringify(DEFAULT_USERS));
    }
  } catch (_) {}
}

export function getCurrentUser(): User | null {
  if (inMemoryUser && (inMemoryUser.email || inMemoryUser.id)) return inMemoryUser;
  if (typeof window === 'undefined') return null;
  try {
    initAuthStorage();
    const raw = localStorage.getItem('zecratary_current_user');
    if (raw && raw !== 'null') {
      const parsed = JSON.parse(raw);
      if (parsed && (parsed.email || parsed.id)) {
        inMemoryUser = parsed;
        return inMemoryUser;
      }
    }

    const cookieMatches = [
      document.cookie.match(/(?:^|;\s*)zecratary_session=([^;]+)/),
      document.cookie.match(/(?:^|;\s*)zecratary_current_user=([^;]+)/),
      document.cookie.match(/(?:^|;\s*)zecratary_auth_session=([^;]+)/),
      document.cookie.match(/(?:^|;\s*)currentUser=([^;]+)/)
    ];
    for (const m of cookieMatches) {
      if (m && m[1]) {
        try {
          const parsed = JSON.parse(decodeURIComponent(m[1]));
          if (parsed && (parsed.email || parsed.id)) {
            inMemoryUser = parsed;
            localStorage.setItem('zecratary_current_user', JSON.stringify(parsed));
            return inMemoryUser;
          }
        } catch (_) {}
      }
    }
  } catch (_) {}
  return null;
}

export function syncSessionCookie(user: any): void {
  if (typeof window === 'undefined' || !user) return;
  try {
    const raw = JSON.stringify(user);
    const encoded = encodeURIComponent(raw);
    const keys = ['zecratary_session', 'zecratary_current_user', 'zecratary_auth_session', 'currentUser'];
    keys.forEach(k => {
      document.cookie = `${k}=${encoded}; path=/; max-age=604800; SameSite=Lax`;
    });
  } catch (_) {}
}

export function isSessionCookieValid(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const cookieMatches = [
      document.cookie.match(/(?:^|;\s*)zecratary_session=([^;]+)/),
      document.cookie.match(/(?:^|;\s*)zecratary_current_user=([^;]+)/),
      document.cookie.match(/(?:^|;\s*)zecratary_auth_session=([^;]+)/),
      document.cookie.match(/(?:^|;\s*)currentUser=([^;]+)/)
    ];
    for (const m of cookieMatches) {
      if (m && m[1]) {
        try {
          const parsed = JSON.parse(decodeURIComponent(m[1]));
          if (parsed && (parsed.email || parsed.id)) {
            return true;
          }
        } catch (_) {}
      }
    }
  } catch (_) {}
  return false;
}

export function setCurrentUser(user: User | null): void {
  inMemoryUser = user;
  if (typeof window === 'undefined') return;
  try {
    const keys = ['zecratary_current_user', 'zecratary_session', 'zecratary_auth_session', 'currentUser', 'user'];
    if (!user) {
      keys.forEach(k => {
        localStorage.removeItem(k);
        document.cookie = `${k}=; path=/; max-age=0; SameSite=Lax`;
      });
      return;
    }

    const raw = JSON.stringify(user);
    const encoded = encodeURIComponent(raw);
    keys.forEach(k => {
      localStorage.setItem(k, raw);
      document.cookie = `${k}=${encoded}; path=/; max-age=604800; SameSite=Lax`;
    });

    syncSessionCookie(user);
  } catch (_) {}

  try {
    window.dispatchEvent(new CustomEvent('zecratary_auth_changed', { detail: user }));
    window.dispatchEvent(new CustomEvent('zecratary_users_updated', { detail: user }));
    window.dispatchEvent(new Event('storage'));
  } catch (_) {}
}

export function isAuthenticated(): boolean {
  return getCurrentUser() !== null || isSessionCookieValid();
}

export function loginUser(
  emailOrPayload: string | { email?: string; password?: string; [key: string]: any },
  passwordInput?: string
): (User & { success: boolean; user: User }) | null {
  if (typeof window === 'undefined') return null;
  initAuthStorage();
  try {
    let email = '';
    let password = '';
    if (typeof emailOrPayload === 'string') {
      email = emailOrPayload.trim().toLowerCase();
      password = (passwordInput || '').trim();
    } else if (emailOrPayload && typeof emailOrPayload === 'object') {
      email = (emailOrPayload.email || '').trim().toLowerCase();
      password = (emailOrPayload.password || passwordInput || '').trim();
    }

    if (!email) return null;

    let storedUsers: User[] = [];
    const raw = localStorage.getItem('zecratary_users');
    if (raw) {
      try { storedUsers = JSON.parse(raw); } catch (_) {}
    }
    const combined = [...DEFAULT_USERS, ...storedUsers];
    const match = combined.find(u => u.email.toLowerCase().trim() === email);

    if (match) {
      if (password && match.password && match.password !== password) {
        return null;
      }
      const safe: User = { ...match };
      delete (safe as any).password;
      setCurrentUser(safe);
      syncSessionCookie(safe);
      return Object.assign(safe, { success: true, user: safe });
    }
  } catch (_) {}
  return null;
}

const LOCAL_SESSION_KEYS = [
  'zecratary_current_user',
  'zecratary_session',
  'zecratary_auth_session',
  'currentUser',
  'user',
  'zec_login_bounce_ts',
  'zec_login_bounce_count'
];

// Forget the browser-side sign-in only (no network). Used when the server no longer knows the session.
export function clearLocalSession(): void {
  inMemoryUser = null;
  if (typeof window === 'undefined') return;
  LOCAL_SESSION_KEYS.forEach(k => {
    try { localStorage.removeItem(k); } catch (_) {}
    try { sessionStorage.removeItem(k); } catch (_) {}
    document.cookie = `${k}=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`;
  });
  try { window.dispatchEvent(new Event('zecratary_auth_changed')); } catch (_) {}
}

let serverSessionCheck: { at: number; result: 'valid' | 'invalid' } | null = null;

// Asks the server whether the HttpOnly session is still valid. A stale local sign-in is cleared on 'invalid'.
// Network or server errors count as 'valid' so a hiccup never signs anyone out.
export async function checkServerSession(force = false): Promise<'valid' | 'invalid'> {
  if (typeof window === 'undefined') return 'valid';
  if (!force && serverSessionCheck && Date.now() - serverSessionCheck.at < 30000) return serverSessionCheck.result;
  let result: 'valid' | 'invalid' = 'valid';
  try {
    const res = await fetch('/api/auth/me', { cache: 'no-store' });
    if (res.status === 401) result = 'invalid';
  } catch (_) {}
  serverSessionCheck = { at: Date.now(), result };
  if (result === 'invalid') clearLocalSession();
  return result;
}

export async function logoutUser(): Promise<void> {
  try {
    await fetch('/api/auth/logout', { method: 'POST', cache: 'no-store' });
  } catch (_) {}

  if (typeof window !== 'undefined') {
    const keys = [
      'zecratary_current_user',
      'zecratary_session',
      'zecratary_auth_session',
      'currentUser',
      'user',
      'zec_login_bounce_ts',
      'zec_login_bounce_count'
    ];
    keys.forEach(k => {
      try { localStorage.removeItem(k); } catch (_) {}
      try { sessionStorage.removeItem(k); } catch (_) {}
      document.cookie = `${k}=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`;
    });

    try {
      Object.keys(localStorage).forEach(k => {
        if (k.startsWith('zecratary_tokens_') || k.startsWith('zecratary_wallet_')) {
          localStorage.removeItem(k);
        }
      });
    } catch (_) {}
  }

  setCurrentUser(null);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('zecratary_auth_changed'));
    window.dispatchEvent(new Event('storage'));
  }
}

export async function registerUser(payload: { email: string; name?: string; password?: string; [key: string]: any }): Promise<any> {
  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (res.ok && data.success && data.user) {
      setCurrentUser(data.user);
      syncSessionCookie(data.user);
      return { success: true, user: data.user };
    }
    return { success: false, error: data.error || 'Registration failed' };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
