// Global Server-Backed Theme Engine & Typography Manager
// Repository: cygnusorbit/zecratary (GitHub)

export interface ThemeColors {
  primary?: string;
  primaryColor?: string;
  primaryHover?: string;
  accentEmerald?: string;
  accentColor?: string;
  accent?: string;
  sidebarIconColor?: string;
  sidebarIcon?: string;
  backgroundColor?: string;
  backgroundDark?: string;
  cardBackground?: string;
  cardDark?: string;
  cardBorder?: string;
  borderColor?: string;
  textColor?: string;
  textSecondary?: string;
  innerDark?: string;
  fontFamily?: string;
  fontSize?: string;
  fontLetterSpacing?: string;
  [key: string]: any;
}

export const AVAILABLE_FONTS = [
  { id: 'Inter', name: 'Inter', family: "'Inter', system-ui, -apple-system, sans-serif" },
  { id: 'Plus Jakarta Sans', name: 'Plus Jakarta Sans', family: "'Plus Jakarta Sans', system-ui, sans-serif" },
  { id: 'Outfit', name: 'Outfit', family: "'Outfit', system-ui, sans-serif" },
  { id: 'Poppins', name: 'Poppins', family: "'Poppins', system-ui, sans-serif" },
  { id: 'Roboto', name: 'Roboto', family: "'Roboto', system-ui, sans-serif" },
  { id: 'System Default', name: 'System Default', family: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }
];

let memoryThemeColors: ThemeColors = {
  primary: '#10b981',
  primaryColor: '#10b981',
  primaryHover: '#059669',
  accentEmerald: '#10b981',
  backgroundColor: '#070b13',
  backgroundDark: '#070b13',
  cardBackground: '#0f172a',
  cardBorder: '#1e293b',
  textSecondary: '#94a3b8',
};

let memoryGlobalFont: string | null = null;

export function getMemoryThemeColors(): ThemeColors {
  return memoryThemeColors;
}

export function setMemoryThemeColors(colors: Partial<ThemeColors> | null | undefined): void {
  if (colors && Object.keys(colors).length > 0) {
    memoryThemeColors = { ...memoryThemeColors, ...colors };
  }
}

export function getEffectiveThemeMode(fallback: 'light' | 'dark' = 'dark'): 'light' | 'dark' {
  if (typeof window === 'undefined') return fallback;
  try {
    const stored = localStorage.getItem('zecratary_theme_mode');
    if (stored === 'light' || stored === 'day') return 'light';
    if (stored === 'dark' || stored === 'night') return 'dark';
    if (document.documentElement.classList.contains('light')) return 'light';
    if (document.documentElement.classList.contains('dark')) return 'dark';
  } catch (_) {}
  return fallback;
}

export function getThemeMode(): 'light' | 'dark' {
  return getEffectiveThemeMode('dark');
}

export function isDayMode(): boolean {
  return getEffectiveThemeMode('dark') === 'light';
}

export function isDarkMode(): boolean {
  return getEffectiveThemeMode('dark') === 'dark';
}

/**
 * Applies typography font family, size scaling, and tracking dynamically
 */
export function applyGlobalFont(fontFamily?: string, fontSize?: string, letterSpacing?: string): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;

  const targetFont = fontFamily || memoryGlobalFont || (typeof window !== 'undefined' ? localStorage.getItem('zecratary_font_family') || localStorage.getItem('zecratary_global_font') : null) || 'Inter';
  const targetSize = fontSize || (typeof window !== 'undefined' ? localStorage.getItem('zecratary_font_size') : null) || '16px';
  const targetSpacing = letterSpacing || (typeof window !== 'undefined' ? localStorage.getItem('zecratary_font_spacing') : null) || '0em';

  if (targetFont && targetFont !== 'inherit') {
    memoryGlobalFont = targetFont;
    const matched = AVAILABLE_FONTS.find(f => f.id.toLowerCase() === targetFont.toLowerCase() || f.name.toLowerCase() === targetFont.toLowerCase());
    const familyValue = matched ? matched.family : targetFont;

    root.style.setProperty('--font-primary', familyValue);
    root.style.setProperty('--font-family', familyValue);
    root.style.setProperty('--font-family-base', familyValue);
    root.style.setProperty('--font-body', familyValue);
    root.style.setProperty('--font-custom', familyValue);
    root.style.fontFamily = familyValue;

    if (document.body) {
      document.body.style.fontFamily = familyValue;
    }

    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('zecratary_font_family', targetFont);
        localStorage.setItem('zecratary_global_font', targetFont);
      } catch (_) {}
    }
  }

  if (targetSize) {
    root.style.setProperty('--font-size-base', targetSize);
    root.style.setProperty('--font-size-global', targetSize);
    root.style.setProperty('--font-size', targetSize);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('zecratary_font_size', targetSize);
      } catch (_) {}
    }
  }

  if (targetSpacing) {
    root.style.setProperty('--font-letter-spacing', targetSpacing);
    root.style.setProperty('--letter-spacing-global', targetSpacing);
    root.style.setProperty('--letter-spacing', targetSpacing);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('zecratary_font_spacing', targetSpacing);
      } catch (_) {}
    }
  }
}

export function getGlobalFont(): string | null {
  if (memoryGlobalFont) return memoryGlobalFont;
  if (typeof window !== 'undefined') {
    try {
      return localStorage.getItem('zecratary_font_family') || localStorage.getItem('zecratary_global_font');
    } catch (_) {}
  }
  return null;
}

export async function saveGlobalFont(fontName: string): Promise<void> {
  memoryGlobalFont = fontName;
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem('zecratary_font_family', fontName);
      localStorage.setItem('zecratary_global_font', fontName);
    } catch (_) {}
    applyGlobalFont(fontName);
    window.dispatchEvent(new CustomEvent('zecratary_font_updated', { detail: { fontFamily: fontName } }));
  }

  try {
    await fetch('/api/admin/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fontFamily: fontName })
    });
  } catch (_) {}
}

export function applyThemeToDocument(colors?: ThemeColors | null): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const isDay = getEffectiveThemeMode('dark') === 'light';

  let activeColors = (colors && Object.keys(colors).length > 0) ? colors : memoryThemeColors;
  if (!activeColors && typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem('zecratary_theme_colors') || localStorage.getItem('zecratary_theme_config');
      if (stored) activeColors = JSON.parse(stored);
    } catch (_) {}
  }

  if (activeColors) {
    setMemoryThemeColors(activeColors);
    const p = activeColors.primary || activeColors.primaryColor || '#10b981';
    const ph = activeColors.primaryHover || '#059669';
    const ac = activeColors.accentEmerald || activeColors.accentColor || activeColors.accent || '#10b981';
    const sbi = activeColors.sidebarIconColor || activeColors.sidebarIcon || ac;
    const bg = activeColors.backgroundColor || activeColors.backgroundDark || '#070b13';
    const card = activeColors.cardBackground || activeColors.cardDark || '#0f172a';
    const border = activeColors.cardBorder || activeColors.borderColor || '#1e293b';
    const textSec = activeColors.textSecondary || '#94a3b8';
    const txt = activeColors.textColor || '#ffffff';

    root.style.setProperty('--color-primary', p);
    root.style.setProperty('--color-primary-hover', ph);
    root.style.setProperty('--color-accent', ac);
    root.style.setProperty('--color-emerald', ac);
    root.style.setProperty('--color-sidebar-icon', sbi);

    if (isDay) {
      root.classList.remove('dark');
      root.classList.add('light');
      root.style.setProperty('--color-bg', '#f8fafc');
      root.style.setProperty('--color-background', '#f8fafc');
      root.style.setProperty('--color-bg-dark', '#f8fafc');
      root.style.setProperty('--color-card', '#ffffff');
      root.style.setProperty('--color-card-dark', '#ffffff');
      root.style.setProperty('--color-inner-dark', '#f1f5f9');
      root.style.setProperty('--color-border', '#e2e8f0');
      root.style.setProperty('--color-border-dark', '#e2e8f0');
      root.style.setProperty('--color-text', '#0f172a');
      root.style.setProperty('--color-text-secondary', '#64748b');
      if (document.body) {
        document.body.style.backgroundColor = '#f8fafc';
        document.body.style.color = '#0f172a';
      }
    } else {
      root.classList.remove('light');
      root.classList.add('dark');
      root.style.setProperty('--color-bg', bg);
      root.style.setProperty('--color-background', bg);
      root.style.setProperty('--color-bg-dark', bg);
      root.style.setProperty('--color-card', card);
      root.style.setProperty('--color-card-dark', card);
      root.style.setProperty('--color-inner-dark', '#111726');
      root.style.setProperty('--color-border', border);
      root.style.setProperty('--color-border-dark', border);
      root.style.setProperty('--color-text', txt);
      root.style.setProperty('--color-text-secondary', textSec);
      if (document.body) {
        document.body.style.backgroundColor = bg;
        document.body.style.color = txt;
      }
    }
  }

  if (memoryGlobalFont) {
    applyGlobalFont(memoryGlobalFont);
  }
}

export function setThemeMode(mode: 'light' | 'dark'): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem('zecratary_theme_mode', mode);
  } catch (_) {}
  applyThemeToDocument();
  window.dispatchEvent(new CustomEvent('zecratary_theme_mode_changed', { detail: { mode } }));
  window.dispatchEvent(new Event('zecratary_theme_changed'));
  window.dispatchEvent(new Event('storage'));
}

export function toggleThemeMode(): 'light' | 'dark' {
  const current = getEffectiveThemeMode('dark');
  const next = current === 'light' ? 'dark' : 'light';
  setThemeMode(next);
  return next;
}

export async function saveThemeColors(colors: ThemeColors): Promise<void> {
  setMemoryThemeColors(colors);
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem('zecratary_theme_colors', JSON.stringify(colors));
    } catch (_) {}
    applyThemeToDocument(colors);
    window.dispatchEvent(new CustomEvent('zecratary_theme_updated', { detail: colors }));
    window.dispatchEvent(new Event('zecratary_theme_changed'));
    window.dispatchEvent(new Event('storage'));
  }

  try {
    await fetch('/api/admin/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ themeColors: colors })
    });
  } catch (_) {}

  try {
    await fetch('/api/user/theme', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ themeColors: colors })
    });
  } catch (_) {}
}

let lastThemeFetchAt = 0;
let lastThemeSignature = '';

// Applies a theme only when it really differs from what is already showing, so navigating between pages never repaints the same colours.
function applyIfChanged(theme: ThemeColors): void {
  const sig = JSON.stringify(theme);
  if (sig === lastThemeSignature) return;
  lastThemeSignature = sig;
  setMemoryThemeColors(theme);
  applyThemeToDocument(theme);
  try {
    // Keep the cached copy in step with the server, so the next page load paints the right colours from the first frame.
    const cached = localStorage.getItem('zecratary_theme_colors');
    if (cached !== sig) localStorage.setItem('zecratary_theme_colors', sig);
  } catch (_) {}
}

export async function fetchAndApplyServerTheme(force = false): Promise<void> {
  if (typeof window === 'undefined') return;
  if (!force && Date.now() - lastThemeFetchAt < 30000) return;
  lastThemeFetchAt = Date.now();
  try {
    const res = await fetch('/api/admin/settings', { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      const settings = data?.settings || data;
      const theme = settings?.themeColors || settings?.theme_colors;
      if (theme && Object.keys(theme).length > 0) {
        applyIfChanged(theme);
      }
      const font = settings?.fontFamily || settings?.font_family;
      if (font) {
        applyGlobalFont(font, settings?.fontSize || settings?.font_size, settings?.fontLetterSpacing || settings?.letter_spacing);
      }
      return;
    }
  } catch (_) {}

  try {
    const uRes = await fetch('/api/user/theme', { cache: 'no-store' });
    if (uRes.ok) {
      const uData = await uRes.json();
      const uTheme = uData?.themeColors || uData?.theme_colors;
      if (uTheme && Object.keys(uTheme).length > 0) {
        applyIfChanged(uTheme);
      }
      if (uData?.fontFamily || uData?.font_family) {
        applyGlobalFont(uData.fontFamily || uData.font_family);
      }
    }
  } catch (_) {}
}

export default {
  applyThemeToDocument,
  getEffectiveThemeMode,
  getThemeMode,
  isDayMode,
  isDarkMode,
  fetchAndApplyServerTheme,
  saveThemeColors,
  applyGlobalFont,
  getGlobalFont,
  saveGlobalFont,
  getMemoryThemeColors,
  setMemoryThemeColors,
  setThemeMode,
  toggleThemeMode,
  AVAILABLE_FONTS
};
