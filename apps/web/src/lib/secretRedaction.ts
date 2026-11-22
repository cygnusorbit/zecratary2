import { NextResponse } from 'next/server';
import { maskSecret, isMasked } from '@/lib/adminGuard';

// Secrets must never leave the server in API responses. Admin pages receive a masked value
// (bullets + last 4 characters); when they save it back unchanged, the stored secret is kept.

const SECRET_KEY_RE = /^(secret|secretKey|secret_key|clientSecret|client_secret|appSecret|app_secret|webhookSecret|webhook_secret|secretAccessKey|secret_access_key|accessKeyId|access_key_id|apiKey|api_key|privateKey|private_key|password|accessToken|access_token|refreshToken|refresh_token|serviceRoleKey|serviceKey)$/i;

export function isSecretKeyName(name: string): boolean {
  return SECRET_KEY_RE.test(name);
}

export function redactSecrets<T = any>(value: T): T {
  if (Array.isArray(value)) return value.map((v) => redactSecrets(v)) as any;
  if (value && typeof value === 'object') {
    const out: any = {};
    for (const [k, v] of Object.entries(value as any)) {
      if (typeof v === 'string' && v !== '' && isSecretKeyName(k)) out[k] = isMasked(v) ? v : maskSecret(v);
      else out[k] = redactSecrets(v);
    }
    return out;
  }
  return value;
}

// Mutates `incoming`: every masked secret is replaced by the stored value at the same path.
// If no stored value exists at that path the masked field is removed, so it can never be saved.
export function restoreMaskedSecrets<T = any>(incoming: T, current: any): T {
  if (Array.isArray(incoming)) {
    incoming.forEach((item: any, i: number) => restoreMaskedSecrets(item, Array.isArray(current) ? current[i] : undefined));
    return incoming;
  }
  if (incoming && typeof incoming === 'object') {
    const obj: any = incoming;
    for (const k of Object.keys(obj)) {
      const v = obj[k];
      const cur = current && typeof current === 'object' ? (current as any)[k] : undefined;
      if (typeof v === 'string' && isMasked(v) && isSecretKeyName(k)) {
        if (typeof cur === 'string' && cur !== '' && !isMasked(cur)) obj[k] = cur;
        else delete obj[k];
      } else if (v && typeof v === 'object') {
        restoreMaskedSecrets(v, cur);
      }
    }
  }
  return incoming;
}

// Drop-in replacement for NextResponse.json that redacts secrets first.
export function secureJson(body: any, init?: ResponseInit): NextResponse {
  return NextResponse.json(redactSecrets(body), init);
}
