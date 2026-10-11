import path from 'node:path';
import { isIP } from 'node:net';
import defaults from './runtime-defaults.json';

export type Environment = (name: string) => string | undefined;
export type ConfigContext = { env: Environment };

/** One configuration owner. Importing this module performs no I/O. */
export function loadRuntimeSettings(read: Environment, root: string = process.cwd()) {
  const text = (name: string, fallback?: string): string => {
    const value = read(name) ?? fallback;
    if (typeof value !== 'string' || !value.trim() || /[\r\n\0]/.test(value)) {
      throw new Error(`Missing or invalid setting: ${name}`);
    }
    return value.trim();
  };
  const secret = (name: string) => text(name);
  const integer = (name: string, fallback: number): number => {
    const raw = read(name) ?? String(fallback);
    if (!/^\d+$/.test(raw)) throw new Error(`Invalid integer setting: ${name}`);
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value < 1) throw new Error(`Invalid integer setting: ${name}`);
    return value;
  };
  const bool = (name: string, fallback: boolean): boolean => {
    const value = read(name) ?? String(fallback);
    if (value !== 'true' && value !== 'false') throw new Error(`Invalid boolean setting: ${name}`);
    return value === 'true';
  };
  const origin = (name: string, localAllowed: boolean): string | undefined => {
    const value = read(name);
    if (!value) return undefined;
    // Reject non-origin syntax before URL parsing can normalize or discard it.
    if (!/^https?:\/\/[^/\\?#\s]+\/?$/i.test(value) || /[\u0000-\u0020\u007f-\u009f]/.test(value)) {
      throw new Error(`Invalid origin: ${name}`);
    }
    let url: URL;
    try { url = new URL(value); } catch { throw new Error(`Invalid origin: ${name}`); }
    const loopback = url.hostname === 'localhost' || url.hostname === '[::1]' ||
      (isIP(url.hostname) === 4 && url.hostname.startsWith('127.'));
    if (url.username || url.password || url.search || url.hash || url.pathname !== '/' ||
      (url.protocol !== 'https:' && !(localAllowed && loopback && url.protocol === 'http:'))) {
      throw new Error(`Invalid origin: ${name}`);
    }
    return url.origin;
  };

  const publicUrl = origin('CMS_PUBLIC_URL', true);
  const trustProxy = bool('CMS_TRUST_PROXY', defaults.trustProxy);
  if (trustProxy && !publicUrl) throw new Error('CMS_PUBLIC_URL is required when trusting a proxy');
  const port = integer('PORT', defaults.port);
  if (port > 65535) throw new Error('Invalid port');
  const restDefaultLimit = integer('CMS_REST_DEFAULT_LIMIT', defaults.restDefaultLimit);
  const restMaxLimit = integer('CMS_REST_MAX_LIMIT', defaults.restMaxLimit);
  if (restDefaultLimit > restMaxLimit) throw new Error('Default API limit exceeds maximum');
  const appKeys = secret('APP_KEYS').split(',').map(k => k.trim());
  if (appKeys.some(k => !k)) throw new Error('Invalid APP_KEYS');

  const accessKeyId = read('AWS_ACCESS_KEY_ID') || undefined;
  const standardSecret = read('AWS_SECRET_ACCESS_KEY') || undefined;
  const legacySecret = read('AWS_ACCESS_SECRET') || undefined;
  const secretAccessKey = standardSecret || legacySecret;
  const sessionToken = read('AWS_SESSION_TOKEN') || undefined;
  if ((standardSecret && legacySecret && standardSecret !== legacySecret) ||
      Boolean(accessKeyId) !== Boolean(secretAccessKey) || (sessionToken && !accessKeyId)) {
    throw new Error('Incomplete or conflicting AWS credential configuration');
  }
  for (const value of [accessKeyId, secretAccessKey, sessionToken]) {
    if (value !== undefined && (!value.trim() || /[\r\n\0]/.test(value))) {
      throw new Error('Invalid AWS credential configuration');
    }
  }
  const visibility = text('CMS_UPLOAD_VISIBILITY', defaults.uploadVisibility);
  if (visibility !== 'public' && visibility !== 'private') throw new Error('Invalid upload visibility');
  const baseUrl = origin('CMS_UPLOAD_PUBLIC_ORIGIN', false);
  // Installed Strapi provider deliberately skips signing when a CDN base URL is set.
  if (visibility === 'private' && baseUrl) throw new Error('Private uploads cannot use a public CDN origin');
  const signedUrlSeconds = integer('CMS_UPLOAD_SIGNED_URL_SECONDS', defaults.uploadSignedUrlSeconds);
  // AWS SigV4 presigned URL protocol maximum is seven days.
  if (signedUrlSeconds > 604800) throw new Error('Signed URL duration exceeds protocol maximum');
  for (const sources of [defaults.mediaSources, defaults.connectSources]) {
    if (!Array.isArray(sources) || !sources.length || sources.some(v => typeof v !== 'string' || !v || /[\r\n\0]/.test(v))) {
      throw new Error('Invalid maintained CSP sources');
    }
  }
  return {
    host: text('HOST', defaults.host), port, appKeys, publicUrl, trustProxy,
    databaseFilename: path.resolve(root, text('DATABASE_FILENAME', defaults.databaseFilename)),
    adminJwtSecret: secret('ADMIN_JWT_SECRET'), apiTokenSalt: secret('API_TOKEN_SALT'),
    transferTokenSalt: secret('TRANSFER_TOKEN_SALT'), encryptionKey: secret('ENCRYPTION_KEY'),
    jwtSecret: secret('JWT_SECRET'), flagNps: bool('FLAG_NPS', defaults.flagNps),
    flagPromoteEe: bool('FLAG_PROMOTE_EE', defaults.flagPromoteEe),
    restDefaultLimit, restMaxLimit, restWithCount: bool('CMS_REST_WITH_COUNT', defaults.restWithCount),
    mediaSources: [...defaults.mediaSources], connectSources: [...defaults.connectSources],
    upload: {
      region: text('AWS_REGION'), bucket: text('AWS_BUCKET'),
      credentials: accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey, ...(sessionToken ? { sessionToken } : {}) } : undefined,
      endpoint: origin('CMS_UPLOAD_ENDPOINT', true), baseUrl,
      connectionTimeoutMs: integer('CMS_UPLOAD_CONNECTION_TIMEOUT_MS', defaults.uploadConnectionTimeoutMs),
      timeoutMs: integer('CMS_UPLOAD_TIMEOUT_MS', defaults.uploadTimeoutMs),
      maxAttempts: integer('CMS_UPLOAD_MAX_ATTEMPTS', defaults.uploadMaxAttempts),
      forcePathStyle: bool('CMS_UPLOAD_FORCE_PATH_STYLE', defaults.uploadForcePathStyle),
      visibility, signedUrlSeconds,
    },
  };
}
