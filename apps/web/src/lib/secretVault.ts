import crypto from 'crypto';
import { isSecretKeyName } from '@/lib/secretRedaction';
import { isMasked } from '@/lib/adminGuard';

// Encryption at rest for secrets saved from the admin pages (AES-256-GCM).
// The key comes from the SECRETS_KEY environment variable (32+ characters) and is never stored with the data.
// Without SECRETS_KEY nothing is encrypted (legacy behaviour), and any encrypted value reads back as '' rather than as garbage.

const PREFIX = 'enc:v1:';

function keyBytes(): Buffer | null {
  const k = (process.env.SECRETS_KEY || '').trim();
  if (k.length < 32) return null;
  return crypto.createHash('sha256').update(k).digest();
}

export function vaultEnabled(): boolean {
  return keyBytes() !== null;
}

export function isEncrypted(v: unknown): boolean {
  return typeof v === 'string' && v.startsWith(PREFIX);
}

export function encryptSecret(plain: string): string {
  const key = keyBytes();
  if (!key || !plain || isEncrypted(plain) || isMasked(plain)) return plain;
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return PREFIX + Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64');
}

export function decryptSecret(value: string): string {
  if (!isEncrypted(value)) return value;
  const key = keyBytes();
  if (!key) { console.warn('[vault] encrypted value found but SECRETS_KEY is not set'); return ''; }
  try {
    const buf = Buffer.from(value.slice(PREFIX.length), 'base64');
    const d = crypto.createDecipheriv('aes-256-gcm', key, buf.subarray(0, 12));
    d.setAuthTag(buf.subarray(12, 28));
    return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString('utf8');
  } catch (_) {
    console.warn('[vault] could not decrypt a value (wrong SECRETS_KEY?)');
    return '';
  }
}

// Returns a copy where every secret-named string field is encrypted.
export function encryptSecretsDeep<T = any>(value: T): T {
  if (!vaultEnabled()) return value;
  if (Array.isArray(value)) return value.map((v) => encryptSecretsDeep(v)) as any;
  if (value && typeof value === 'object') {
    const out: any = {};
    for (const [k, v] of Object.entries(value as any)) {
      out[k] = typeof v === 'string' && v !== '' && isSecretKeyName(k) ? encryptSecret(v) : encryptSecretsDeep(v);
    }
    return out;
  }
  return value;
}

// Returns a copy where every encrypted string is decrypted (plain strings pass through unchanged).
export function decryptSecretsDeep<T = any>(value: T): T {
  if (Array.isArray(value)) return value.map((v) => decryptSecretsDeep(v)) as any;
  if (value && typeof value === 'object') {
    const out: any = {};
    for (const [k, v] of Object.entries(value as any)) out[k] = decryptSecretsDeep(v);
    return out;
  }
  return typeof value === 'string' && isEncrypted(value) ? (decryptSecret(value) as any) : value;
}

// For local JSON mirrors: with the vault on, secrets are left out of files entirely (the database copy is the source).
export function stripSecretsDeep<T = any>(value: T): T {
  if (!vaultEnabled()) return value;
  if (Array.isArray(value)) return value.map((v) => stripSecretsDeep(v)) as any;
  if (value && typeof value === 'object') {
    const out: any = {};
    for (const [k, v] of Object.entries(value as any)) {
      if (typeof v === 'string' && v !== '' && isSecretKeyName(k)) continue;
      out[k] = stripSecretsDeep(v);
    }
    return out;
  }
  return value;
}

// Counts secret fields still stored in clear text.
export function countPlaintextSecrets(value: any): number {
  if (Array.isArray(value)) return value.reduce((n, v) => n + countPlaintextSecrets(v), 0);
  if (value && typeof value === 'object') {
    let n = 0;
    for (const [k, v] of Object.entries(value)) {
      if (typeof v === 'string' && v !== '' && isSecretKeyName(k)) { if (!isEncrypted(v) && !isMasked(v)) n++; }
      else n += countPlaintextSecrets(v);
    }
    return n;
  }
  return 0;
}
