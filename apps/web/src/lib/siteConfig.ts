// Site Configuration Utilities & Synchronizer
export const DEFAULT_SITE_NAME = 'Zecratary';
export const DEFAULT_SITE_TAGLINE = 'Autonomous Culinary Intelligence & Precision Meal Planning';
export const DEFAULT_TITLEBAR_EMOJI = '👨‍🍳';
export const DEFAULT_FAVICON_EMOJI = '👨‍🍳';
export const DEFAULT_FONT_FAMILY = 'Inter, sans-serif';

export interface SiteConfig {
  siteName: string;
  site_name?: string;
  siteTagline: string;
  site_tagline?: string;
  tagline?: string;
  titlebarEmoji: string;
  titlebar_emoji?: string;
  titlebarImage?: string;
  titlebar_image?: string;
  faviconEmoji: string;
  favicon_emoji?: string;
  faviconImage?: string;
  favicon_image?: string;
  fontFamily: string;
  font_family?: string;
  themeColors?: Record<string, string>;
  theme_colors?: Record<string, string>;
  metaDescription?: string;
  meta_description?: string;
  metaKeywords?: string;
  meta_keywords?: string;
  metaAuthor?: string;
  meta_author?: string;
}

export function updateFavicon(emojiOrUrl: string): void {
  if (typeof document === 'undefined') return;
  try {
    let link: HTMLLinkElement | null = document.querySelector("link[rel*='icon']");
    if (!link) {
      link = document.createElement('link');
      link.type = 'image/x-icon';
      link.rel = 'shortcut icon';
      document.getElementsByTagName('head')[0]?.appendChild(link);
    }

    if (!emojiOrUrl) {
      emojiOrUrl = DEFAULT_FAVICON_EMOJI;
    }

    if (emojiOrUrl.startsWith('http://') || emojiOrUrl.startsWith('https://') || emojiOrUrl.startsWith('/') || emojiOrUrl.startsWith('data:image')) {
      link.href = emojiOrUrl;
      link.type = 'image/png';
    } else {
      // SVG emoji data URI
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">${emojiOrUrl}</text></svg>`;
      link.href = `data:image/svg+xml,${encodeURIComponent(svg)}`;
      link.type = 'image/svg+xml';
    }
  } catch (err) {
    console.warn('[Favicon] Failed to update favicon:', err);
  }
}

export async function fetchSiteConfig(): Promise<SiteConfig | null> {
  if (typeof window === 'undefined') return null;
  try {
    const cached = localStorage.getItem('zecratary_site_config');
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (e) {}
  return null;
}

export async function saveSiteConfig(config: Partial<SiteConfig>): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    const cached = localStorage.getItem('zecratary_site_config');
    const existing = cached ? JSON.parse(cached) : {};
    const merged = { ...existing, ...config };
    localStorage.setItem('zecratary_site_config', JSON.stringify(merged));
    localStorage.setItem('zecratary_site_updated_at', Date.now().toString());

    // Broadcast update across windows and components
    window.dispatchEvent(new CustomEvent('zecratary_site_config_updated', { detail: merged }));
  } catch (err) {
    console.warn('[siteConfig] Failed to save config locally:', err);
  }
}
