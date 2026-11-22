import { NextResponse } from 'next/server';
import { secureJson, restoreMaskedSecrets } from '@/lib/secretRedaction';
import { query } from '@/lib/db';
import fs from 'fs';
import path from 'path';


// Module-scoped type-safe database row extractors (unexported to prevent Next.js TS2344)
function parseDbRows<T = any>(res: any): T[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (typeof res === 'object' && Array.isArray((res as any).rows)) return (res as any).rows;
  return [];
}

function parseDbRow<T = any>(res: any): T | null {
  const rows = parseDbRows<T>(res);
  return rows.length > 0 ? rows[0] : null;
}


export const dynamic = 'force-dynamic';
export const revalidate = 0;

function resolveWorkspacePath(relativeOrAbsolute: string): string {
  if (path.isAbsolute(relativeOrAbsolute)) return relativeOrAbsolute;
  const directPath = path.join(process.cwd(), relativeOrAbsolute);
  if (fs.existsSync(directPath)) return directPath;
  const cwd = process.cwd();
  if (cwd.endsWith('apps/web')) {
    const parentCandidate = path.join(cwd, '..', '..', relativeOrAbsolute);
    if (fs.existsSync(parentCandidate)) return parentCandidate;
  } else {
    const nestedCandidate = path.join(cwd, 'apps', 'web', relativeOrAbsolute);
    if (fs.existsSync(nestedCandidate)) return nestedCandidate;
  }
  return directPath;
}

function getUniversalDiskDiagnostics(recipesJsonDir: string, uploadDir: string) {
  const jsonPath = resolveWorkspacePath(recipesJsonDir);
  const imagesPath = resolveWorkspacePath(uploadDir);

  let jsonExists = false;
  let jsonWritable = false;
  let jsonFileCount = 0;

  try {
    if (!fs.existsSync(jsonPath)) {
      fs.mkdirSync(jsonPath, { recursive: true });
    }
    jsonExists = fs.existsSync(jsonPath);
    if (jsonExists) {
      fs.accessSync(jsonPath, fs.constants.W_OK);
      jsonWritable = true;
      const files = fs.readdirSync(jsonPath);
      jsonFileCount = files.filter(f => f.endsWith('.json') && f !== 'package.json').length;
    }
  } catch (_) {
    jsonWritable = false;
  }

  let imagesExists = false;
  let imagesWritable = false;
  let imagesFileCount = 0;

  try {
    if (!fs.existsSync(imagesPath)) {
      fs.mkdirSync(imagesPath, { recursive: true });
    }
    imagesExists = fs.existsSync(imagesPath);
    if (imagesExists) {
      fs.accessSync(imagesPath, fs.constants.W_OK);
      imagesWritable = true;
      const files = fs.readdirSync(imagesPath);
      const imgExts = ['.jpg', '.jpeg', '.png', '.webp', '.svg', '.gif'];
      imagesFileCount = files.filter(f => imgExts.includes(path.extname(f).toLowerCase())).length;
    }
  } catch (_) {
    imagesWritable = false;
  }

  return {
    recipesJson: {
      configuredPath: recipesJsonDir,
      resolvedPath: jsonPath,
      exists: jsonExists,
      writable: jsonWritable,
      fileCount: jsonFileCount
    },
    recipeImages: {
      configuredPath: uploadDir,
      resolvedPath: imagesPath,
      exists: imagesExists,
      writable: imagesWritable,
      fileCount: imagesFileCount
    },
    status: (jsonWritable && imagesWritable) ? 'healthy' : 'degraded'
  };
}

function readServerStorageFallback(): any {
  const candidatePaths = [
    path.join(process.cwd(), 'apps/web/data/admin_settings.json'),
    path.join(process.cwd(), 'data/admin_settings.json')
  ];
  for (const p of candidatePaths) {
    if (fs.existsSync(p)) {
      try {
        const raw = fs.readFileSync(p, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed?.storageSettings || parsed?.storage_settings) {
          return parsed.storageSettings || parsed.storage_settings;
        }
      } catch (_) {}
    }
  }
  return null;
}

export async function GET() {
  let settings: any = readServerStorageFallback();

  try {
    const sRes: any = await Promise.race([
      query(`SELECT storage_settings FROM admin_settings WHERE id = 'primary_settings' OR id = '1' LIMIT 1`),
      new Promise((_, reject) => setTimeout(() => reject(new Error('DB Timeout')), 3000))
    ]).catch(() => null);

    const sRow = parseDbRow(sRes);
    if (sRow?.storage_settings) {
      const parsed = typeof sRow.storage_settings === 'string' ? JSON.parse(sRow.storage_settings) : sRow.storage_settings;
      if (parsed && typeof parsed === 'object') {
        settings = { ...(settings || {}), ...parsed };
      }
    }
  } catch (err: any) {
    console.warn('[Storage API] Handled fallback to server JSON store:', err?.message || err);
  }

  const defaultStorage = {
    provider: 'localhost',
    localhost: {
      recipesJsonDir: 'apps/web/public/recipes',
      uploadDir: 'apps/web/public/recipes/images',
      uploadPath: 'apps/web/public/recipes/images',
      publicPrefix: '/recipes/images',
      publicServingUrl: '/recipes/images',
      maxFileSizeMb: 10
    },
    supabase: {
      enabled: false,
      endpoint: 'https://tnhrkjtujdfgvwhsuuxb.storage.supabase.co/storage/v1/s3',
      region: 'us-west-1',
      accessKeyId: 'f3e0affef5c74972a535153349eb24cc',
      secretAccessKey: '',
      bucket: 'recipes',
      bucketName: 'recipes',
      publicUrl: 'https://tnhrkjtujdfgvwhsuuxb.supabase.co/storage/v1/object/public/recipes',
      publicUrlPrefix: 'https://tnhrkjtujdfgvwhsuuxb.supabase.co/storage/v1/object/public/recipes',
      maxFileSizeMb: 25
    },
    allowedFormats: ['jpg', 'jpeg', 'png', 'webp', 'svg'],
    isConnected: false
  };

  const finalConfig = settings ? {
    ...defaultStorage,
    ...settings,
    localhost: {
      ...defaultStorage.localhost,
      ...(settings.localhost || {})
    },
    supabase: {
      ...defaultStorage.supabase,
      ...(settings.supabase || {})
    }
  } : defaultStorage;

  // Harmonize all aliases
  finalConfig.localhost.recipesJsonDir = finalConfig.localhost.recipesJsonDir || 'apps/web/public/recipes';
  finalConfig.localhost.uploadDir = finalConfig.localhost.uploadDir || finalConfig.localhost.uploadPath || 'apps/web/public/recipes/images';
  finalConfig.localhost.uploadPath = finalConfig.localhost.uploadDir;
  finalConfig.localhost.publicPrefix = finalConfig.localhost.publicPrefix || finalConfig.localhost.publicServingUrl || '/recipes/images';
  finalConfig.localhost.publicServingUrl = finalConfig.localhost.publicPrefix;

  finalConfig.supabase.bucket = finalConfig.supabase.bucket || finalConfig.supabase.bucketName || 'recipes';
  finalConfig.supabase.bucketName = finalConfig.supabase.bucket;
  finalConfig.supabase.publicUrl = finalConfig.supabase.publicUrl || finalConfig.supabase.publicUrlPrefix || '';
  finalConfig.supabase.publicUrlPrefix = finalConfig.supabase.publicUrl;
  finalConfig.supabase.enabled = finalConfig.provider === 'supabase';

  const diagnostics = getUniversalDiskDiagnostics(
    finalConfig.localhost.recipesJsonDir,
    finalConfig.localhost.uploadDir
  );

  return secureJson({
    success: true,
    storageSettings: finalConfig,
    settings: finalConfig,
    diagnostics
  }, {
    headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' }
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const rawSettings = body.storageSettings || body.settings || body;

    {
      let currentStored: any = readServerStorageFallback() || {};
      try {
        const sRes: any = await query(`SELECT storage_settings FROM admin_settings WHERE id = 'primary_settings' OR id = '1' LIMIT 1`);
        const sRow: any = parseDbRow(sRes);
        if (sRow?.storage_settings) {
          const parsed = typeof sRow.storage_settings === 'string' ? JSON.parse(sRow.storage_settings) : sRow.storage_settings;
          if (parsed && typeof parsed === 'object') currentStored = { ...currentStored, ...parsed };
        }
      } catch (_) {}
      restoreMaskedSecrets(rawSettings, currentStored);
    }

    const normalizedSettings = {
      ...rawSettings,
      localhost: {
        ...rawSettings.localhost,
        recipesJsonDir: rawSettings.localhost?.recipesJsonDir || 'apps/web/public/recipes',
        uploadDir: rawSettings.localhost?.uploadDir || rawSettings.localhost?.uploadPath || 'apps/web/public/recipes/images',
        uploadPath: rawSettings.localhost?.uploadDir || rawSettings.localhost?.uploadPath || 'apps/web/public/recipes/images',
        publicPrefix: rawSettings.localhost?.publicPrefix || rawSettings.localhost?.publicServingUrl || '/recipes/images',
        publicServingUrl: rawSettings.localhost?.publicPrefix || rawSettings.localhost?.publicServingUrl || '/recipes/images',
        maxFileSizeMb: parseInt(rawSettings.localhost?.maxFileSizeMb, 10) || 10
      },
      supabase: {
        ...rawSettings.supabase,
        bucket: rawSettings.supabase?.bucketName || rawSettings.supabase?.bucket || 'recipes',
        bucketName: rawSettings.supabase?.bucketName || rawSettings.supabase?.bucket || 'recipes',
        publicUrl: rawSettings.supabase?.publicUrlPrefix || rawSettings.supabase?.publicUrl || '',
        publicUrlPrefix: rawSettings.supabase?.publicUrlPrefix || rawSettings.supabase?.publicUrl || '',
        enabled: rawSettings.provider === 'supabase',
        maxFileSizeMb: parseInt(rawSettings.supabase?.maxFileSizeMb, 10) || 25
      }
    };

    const jsonStr = JSON.stringify(normalizedSettings);

    // Dual-dialect database persistence
    try {
      await query(
        `INSERT INTO admin_settings (id, storage_settings, updated_at)
         VALUES ('primary_settings', $1::jsonb, NOW())
         ON CONFLICT (id) DO UPDATE SET
           storage_settings = EXCLUDED.storage_settings,
           updated_at = NOW()`,
        [jsonStr]
      ).catch(async () => {
        return await query(
          `INSERT INTO admin_settings (id, storage_settings, updated_at)
           VALUES ('primary_settings', ?, NOW())
           ON DUPLICATE KEY UPDATE
             storage_settings = VALUES(storage_settings),
             updated_at = NOW()`,
          [jsonStr]
        );
      });
    } catch (dbErr: any) {
      console.warn('[Storage API] Database warning during save:', dbErr?.message || dbErr);
    }

    // Mirror to dual server JSON stores
    for (const subDir of ['apps/web/data', 'data']) {
      try {
        const fullDir = path.join(process.cwd(), subDir);
        const fPath = path.join(fullDir, 'admin_settings.json');
        if (!fs.existsSync(fullDir)) fs.mkdirSync(fullDir, { recursive: true });
        let existing: any = {};
        if (fs.existsSync(fPath)) {
          try { existing = JSON.parse(fs.readFileSync(fPath, 'utf8')); } catch (_) {}
        }
        existing.storageSettings = normalizedSettings;
        existing.updatedAt = new Date().toISOString();
        fs.writeFileSync(fPath, JSON.stringify(existing, null, 2), 'utf8');
      } catch (_) {}
    }

    const diagnostics = getUniversalDiskDiagnostics(
      normalizedSettings.localhost.recipesJsonDir,
      normalizedSettings.localhost.uploadDir
    );

    return secureJson({
      success: true,
      message: 'Storage settings saved successfully to server and database!',
      storageSettings: normalizedSettings,
      diagnostics
    });
  } catch (err: any) {
    return secureJson({ success: false, error: err.message }, { status: 500 });
  }
}
