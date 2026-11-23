'use client';
import { useEffect, useState } from 'react';
import { Mail } from 'lucide-react';
import { useTranslation } from '@/components/LanguageProvider';

export default function ContactPage() {
  const { t } = useTranslation();
  // The support address is set by the administrator on /admin (Support Email).
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/settings?t=${Date.now()}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const e = String(d?.settings?.supportEmail || '').trim();
        if (!cancelled) setEmail(e || '');
      })
      .catch(() => { if (!cancelled) setEmail(''); });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="max-w-4xl mx-auto space-y-6" style={{ color: 'var(--color-text)' }}>
      <div>
        <h1 className="text-3xl font-extrabold" style={{ color: 'var(--color-primary)' }}>{t('contactUs', 'Contact Us')}</h1>
        <p className="text-xs mt-1" style={{ color: 'var(--color-emerald)' }}>{t('contactSubtitle', "We'd love to hear from you")}</p>
      </div>

      <div className="border rounded-3xl p-16 text-center space-y-5 transition-colors duration-200" style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }}>
        <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto" style={{ backgroundColor: 'var(--color-inner-dark)', color: 'var(--color-primary)' }}>
          <Mail className="h-6 w-6" />
        </div>
        <h2 className="text-xl font-bold" style={{ color: 'var(--color-primary)' }}>{t('contactGetInTouch', 'Get in Touch')}</h2>
        {email === null ? (
          <div className="h-10 max-w-md mx-auto rounded-xl animate-pulse" style={{ backgroundColor: 'var(--color-inner-dark)' }} />
        ) : email ? (
          <p className="text-xs max-w-md mx-auto leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
            {t('contactIntro', 'If you have any questions, feedback or would like to report an issue, please reach out to us at')}{' '}
            <a href={`mailto:${email}`} className="font-bold underline" style={{ color: 'var(--color-emerald)' }}>{email}</a>{' '}
            {t('contactOutro', 'and we will get back to you as soon as we can.')}
          </p>
        ) : (
          <p className="text-xs max-w-md mx-auto leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
            {t('contactNotConfigured', 'Contact details have not been set up yet. Please check back soon.')}
          </p>
        )}
      </div>
    </div>
  );
}
