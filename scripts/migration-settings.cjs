'use strict';
const path = require('node:path');

/** @typedef {Readonly<{strapiUrl:string, articlesPath:string, token:string, region:string,
 * table:string, bucket:string, mediaBaseUrl:string, publicRoot:string, mediaPrefix:string,
 * objectPrefix:string, pageSize:number, maxPages:number, timeoutMs:number,
 * maxHttpBytes:number, maxMediaBytes:number, maxPlanBytes:number, maxArticleBytes:number,
 * maxAttempts:number, s3Endpoint:string|undefined, dynamoEndpoint:string|undefined}>} MigrationSettings */

/** @param {string} value @param {boolean} allowLoopback */
function endpoint(value, allowLoopback) {
  const url = new URL(value);
  const loopback = ['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash ||
      (url.protocol !== 'https:' && !(allowLoopback && loopback && url.protocol === 'http:'))) {
    throw new Error('Invalid migration endpoint');
  }
  return url.href;
}

/** The only owner of migration environment values. No credentials are logged.
 * @param {NodeJS.ProcessEnv} [environment]
 * @returns {MigrationSettings}
 */
function readSettings(environment = process.env) {
  /** @param {string} key */
  function text(key) {
    const value = environment[key];
    if (typeof value !== 'string' || !value.trim() || /[\r\n\0]/.test(value)) {
      throw new Error('Missing or invalid migration setting: ' + key);
    }
    return value.trim();
  }
  /** @param {string} key */
  function integer(key) {
    const raw = text(key);
    const value = Number(raw);
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < 1) {
      throw new Error('Invalid migration limit: ' + key);
    }
    return value;
  }
  /** @param {string} key */
  function optionalEndpoint(key) {
    return environment[key]?.trim() ? endpoint(text(key), true) : undefined;
  }
  const articlesPath = text('CMS_SYNC_ARTICLES_PATH');
  const mediaPrefix = text('CMS_SYNC_MEDIA_URL_PREFIX');
  const objectPrefix = text('CMS_SYNC_OBJECT_PREFIX');
  if (!/^\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/.test(articlesPath) ||
      !/^\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*\/$/.test(mediaPrefix) ||
      !/^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*\/$/.test(objectPrefix)) {
    throw new Error('Invalid migration path configuration');
  }
  const token = environment.CMS_SYNC_STRAPI_TOKEN || '';
  if (/[\r\n\0]/.test(token)) throw new Error('Invalid migration token');
  const region = text('CMS_SYNC_AWS_REGION');
  const table = text('CMS_SYNC_DYNAMODB_TABLE');
  const bucket = text('CMS_SYNC_S3_BUCKET');
  if (!/^[a-z0-9-]+$/.test(region) || !/^[A-Za-z0-9_.-]+$/.test(table) ||
      !/^[a-z0-9.-]+$/.test(bucket)) throw new Error('Invalid migration destination');
  const mediaBaseUrl = endpoint(text('CMS_SYNC_MEDIA_PUBLIC_BASE_URL'), false);
  if (!mediaBaseUrl.endsWith('/')) throw new Error('Media base URL must end with a slash');
  const sourceBase = endpoint(text('CMS_SYNC_STRAPI_URL'), true);
  return Object.freeze({
    strapiUrl: sourceBase.endsWith('/') ? sourceBase : sourceBase + '/', articlesPath, token,
    region, table, bucket, mediaBaseUrl,
    publicRoot: path.resolve(text('CMS_SYNC_PUBLIC_ROOT')), mediaPrefix, objectPrefix,
    pageSize: integer('CMS_SYNC_PAGE_SIZE'), maxPages: integer('CMS_SYNC_MAX_PAGES'),
    timeoutMs: integer('CMS_SYNC_HTTP_TIMEOUT_MS'), maxHttpBytes: integer('CMS_SYNC_MAX_HTTP_BYTES'),
    maxMediaBytes: integer('CMS_SYNC_MAX_MEDIA_BYTES'), maxPlanBytes: integer('CMS_SYNC_MAX_PLAN_BYTES'),
    maxArticleBytes: integer('CMS_SYNC_MAX_ARTICLE_BYTES'), maxAttempts: integer('CMS_SYNC_MAX_ATTEMPTS'),
    s3Endpoint: optionalEndpoint('CMS_SYNC_S3_ENDPOINT'),
    dynamoEndpoint: optionalEndpoint('CMS_SYNC_DYNAMODB_ENDPOINT'),
  });
}

module.exports = { readSettings };
