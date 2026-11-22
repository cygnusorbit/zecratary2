// Centralized Media Storage Engine (Option C: Localhost vs Supabase S3)
// GitHub: cygnusorbit/zecratary

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { query } from '@/lib/db';
import { getJsonSetting, setJsonSetting } from '@/lib/adminSettingsStore';
import { stripSecretsDeep } from '@/lib/secretVault';

export interface StorageConfig {
  provider: 'localhost' | 'supabase';
  localhost: {
    uploadDir: string;
    publicPrefix: string;
    recipesJsonDir: string;
    maxSizeMb: number;
    allowedTypes?: string;
  };
  supabase: {
    enabled: boolean;
    endpoint: string;
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
    bucket: string;
    publicUrl: string;
  };
}

export const DEFAULT_STORAGE_CONFIG: StorageConfig = {
  provider: 'localhost',
  localhost: {
    uploadDir: 'apps/web/public/recipes/images',
    publicPrefix: '/recipes/images',
    recipesJsonDir: 'apps/web/public/recipes',
    maxSizeMb: 10,
    allowedTypes: 'image/jpeg, image/png, image/webp, image/gif, image/avif',
  },
  supabase: {
    enabled: true,
    endpoint: 'https://tnhrkjtujdfgvwhsuuxb.storage.supabase.co/storage/v1/s3',
    region: 'us-west-1',
    accessKeyId: 'f3e0affef5c74972a535153349eb24cc',
    secretAccessKey: '',
    bucket: 'recipes',
    publicUrl: 'https://tnhrkjtujdfgvwhsuuxb.supabase.co/storage/v1/object/public/recipes',
  },
};

let memoryStorageConfig: StorageConfig = { ...DEFAULT_STORAGE_CONFIG };

export function getCanonicalWebPublicDir(): string {
  const candidates = [
    path.join(process.cwd(), 'apps', 'web', 'public'),
    path.join(process.cwd(), 'public'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  const primary = path.join(process.cwd(), 'apps', 'web', 'public');
  if (!fs.existsSync(primary)) {
    fs.mkdirSync(primary, { recursive: true });
  }
  return primary;
}

export const getWebPublicDir = getCanonicalWebPublicDir;

export function getCanonicalImagesDir(): string {
  const candidates = [
    path.join(process.cwd(), 'apps', 'web', 'public', 'recipes', 'images'),
    path.join(process.cwd(), 'public', 'recipes', 'images'),
    path.join(process.cwd(), 'recipes', 'images'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  const primary = path.join(process.cwd(), 'apps', 'web', 'public', 'recipes', 'images');
  if (!fs.existsSync(primary)) {
    fs.mkdirSync(primary, { recursive: true });
  }
  return primary;
}

export const getImagesDir = getCanonicalImagesDir;

export function getCanonicalRecipesDir(): string {
  const candidates = [
    path.join(process.cwd(), 'apps', 'web', 'public', 'recipes'),
    path.join(process.cwd(), 'public', 'recipes'),
    path.join(process.cwd(), 'recipes'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  const primary = path.join(process.cwd(), 'apps', 'web', 'public', 'recipes');
  if (!fs.existsSync(primary)) {
    fs.mkdirSync(primary, { recursive: true });
  }
  return primary;
}

export const getRecipesDir = getCanonicalRecipesDir;

export async function getStorageSettings(): Promise<StorageConfig> {
  // 1. Database (decrypted by the settings store)
  try {
    const parsed: any = await getJsonSetting<any>('storage_settings');
    if (parsed && typeof parsed === 'object') {
      memoryStorageConfig = {
        ...DEFAULT_STORAGE_CONFIG,
        ...parsed,
        localhost: { ...DEFAULT_STORAGE_CONFIG.localhost, ...(parsed.localhost || {}) },
        supabase: { ...DEFAULT_STORAGE_CONFIG.supabase, ...(parsed.supabase || {}) },
      };
      return memoryStorageConfig;
    }
  } catch (_) {}

  // 2. Fallback to Local JSON stores
  const jsonPaths = [
    path.join(process.cwd(), 'apps', 'web', 'data', 'admin_settings.json'),
    path.join(process.cwd(), 'data', 'admin_settings.json'),
  ];
  for (const jp of jsonPaths) {
    if (fs.existsSync(jp)) {
      try {
        const fileData = JSON.parse(fs.readFileSync(jp, 'utf8'));
        if (fileData.storage_settings) {
          memoryStorageConfig = {
            ...DEFAULT_STORAGE_CONFIG,
            ...fileData.storage_settings,
            localhost: { ...DEFAULT_STORAGE_CONFIG.localhost, ...(fileData.storage_settings.localhost || {}) },
            supabase: { ...DEFAULT_STORAGE_CONFIG.supabase, ...(fileData.storage_settings.supabase || {}) },
          };
          return memoryStorageConfig;
        }
      } catch (_) {}
    }
  }

  return memoryStorageConfig;
}

export async function saveStorageSettings(config: Partial<StorageConfig>): Promise<StorageConfig> {
  const current = await getStorageSettings();
  const merged: StorageConfig = {
    ...current,
    ...config,
    localhost: { ...current.localhost, ...(config.localhost || {}) },
    supabase: { ...current.supabase, ...(config.supabase || {}) },
  };

  memoryStorageConfig = merged;

  // 1. Database (secrets are encrypted by the settings store)
  try {
    await setJsonSetting('storage_settings', merged, 'storage');
  } catch (err: any) {
    console.warn('[StorageService] DB commit notice:', err.message);
  }

  // 2. Mirror to JSON files
  const jsonPaths = [
    path.join(process.cwd(), 'apps', 'web', 'data', 'admin_settings.json'),
    path.join(process.cwd(), 'data', 'admin_settings.json'),
  ];
  for (const jp of jsonPaths) {
    try {
      const dir = path.dirname(jp);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      let existing: any = {};
      if (fs.existsSync(jp)) {
        try { existing = JSON.parse(fs.readFileSync(jp, 'utf8')); } catch (_) {}
      }
      existing.storage_settings = stripSecretsDeep(merged);
      fs.writeFileSync(jp, JSON.stringify(existing, null, 2), 'utf8');
    } catch (_) {}
  }

  return merged;
}

// AWS S3 SigV4 Upload Protocol for Supabase S3 Gateway
export async function uploadToSupabaseS3(
  buffer: Buffer,
  filename: string,
  contentType: string,
  config: StorageConfig['supabase']
): Promise<string> {
  const endpoint = config.endpoint.replace(/\/+$/, '');
  const bucket = config.bucket.trim();
  const region = config.region.trim() || 'us-west-1';
  const accessKey = config.accessKeyId.trim();
  const secretKey = config.secretAccessKey.trim();

  if (!accessKey || !secretKey) {
    throw new Error('Supabase S3 Access Key ID or Secret Access Key is missing');
  }

  const endpointUrl = new URL(endpoint);
  const host = endpointUrl.host;
  const canonicalUri = `${endpointUrl.pathname}/${bucket}/${encodeURIComponent(filename)}`.replace(/\/+/g, '/');

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);

  const payloadHash = crypto.createHash('sha256').update(buffer).digest('hex');

  const canonicalHeaders = `content-type:${contentType}\nhost:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date';

  const canonicalRequest = `PUT\n${canonicalUri}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;

  const algorithm = 'AWS4-HMAC-SHA256';
  const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
  const stringToSign = `${algorithm}\n${amzDate}\n${credentialScope}\n${crypto.createHash('sha256').update(canonicalRequest).digest('hex')}`;

  function getSignatureKey(key: string, date: string, reg: string, service: string) {
    const kDate = crypto.createHmac('sha256', 'AWS4' + key).update(date).digest();
    const kRegion = crypto.createHmac('sha256', kDate).update(reg).digest();
    const kService = crypto.createHmac('sha256', kRegion).update(service).digest();
    return crypto.createHmac('sha256', kService).update('aws4_request').digest();
  }

  const signingKey = getSignatureKey(secretKey, dateStamp, region, 's3');
  const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');

  const authorizationHeader = `${algorithm} Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  const uploadTargetUrl = `${endpointUrl.protocol}//${host}${canonicalUri}`;

  const res = await fetch(uploadTargetUrl, {
    method: 'PUT',
    headers: {
      'Host': host,
      'Content-Type': contentType,
      'x-amz-date': amzDate,
      'x-amz-content-sha256': payloadHash,
      'Authorization': authorizationHeader,
    },
    body: new Uint8Array(buffer),
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => res.statusText);
    throw new Error(`Supabase S3 upload failed (HTTP ${res.status}): ${errorText}`);
  }

  if (config.publicUrl) {
    const base = config.publicUrl.replace(/\/+$/, '');
    return `${base}/${filename}`;
  }

  return uploadTargetUrl;
}

export async function uploadMediaFile(
  buffer: Buffer,
  originalFilename: string,
  contentType: string = 'image/jpeg'
): Promise<string> {
  const settings = await getStorageSettings();
  const ext = path.extname(originalFilename) || '.jpg';
  const cleanName = `${Date.now()}_${crypto.randomBytes(6).toString('hex')}${ext}`;

  // Mode: Supabase Cloud S3
  if (settings.provider === 'supabase' && settings.supabase.enabled && settings.supabase.secretAccessKey) {
    try {
      return await uploadToSupabaseS3(buffer, cleanName, contentType, settings.supabase);
    } catch (err: any) {
      console.warn('[Storage] Supabase S3 failed, falling back to localhost disk:', err.message);
    }
  }

  // Mode: Localhost Disk (apps/web/public/recipes/images)
  const targetDir = getCanonicalImagesDir();
  fs.writeFileSync(path.join(targetDir, cleanName), buffer);

  const prefix = settings.localhost.publicPrefix || '/recipes/images';
  return `${prefix}/${cleanName}`;
}

export function getUniversalDiskDiagnostics() {
  const recipesDir = getCanonicalRecipesDir();
  const imagesDir = getCanonicalImagesDir();

  let recipesCount = 0;
  let imagesCount = 0;
  let jsonDirWritable = false;
  let imagesDirWritable = false;

  try {
    if (!fs.existsSync(recipesDir)) fs.mkdirSync(recipesDir, { recursive: true });
    recipesCount = fs.readdirSync(recipesDir).filter(f => f.endsWith('.json')).length;
    fs.accessSync(recipesDir, fs.constants.W_OK);
    jsonDirWritable = true;
  } catch (_) {}

  try {
    if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true });
    imagesCount = fs.readdirSync(imagesDir).filter(f => /\.(jpg|jpeg|png|webp|gif|avif)$/i.test(f)).length;
    fs.accessSync(imagesDir, fs.constants.W_OK);
    imagesDirWritable = true;
  } catch (_) {}

  return {
    recipesCount,
    imagesCount,
    jsonDirWritable,
    imagesDirWritable,
    jsonDirPath: 'apps/web/public/recipes',
    imagesDirPath: 'apps/web/public/recipes/images',
  };
}
