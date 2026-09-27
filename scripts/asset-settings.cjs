'use strict';
const path = require('node:path');
/** @typedef {Readonly<{directory:string, region:string, bucket:string, keyPrefix:string,
 * maxFiles:number, maxFileBytes:number, maxTotalBytes:number, timeoutMs:number,
 * maxAttempts:number, endpoint:string|undefined}>} AssetSettings */

/** All changeable asset settings live here; credentials use the SDK provider chain.
 * @param {NodeJS.ProcessEnv} [environment] @returns {AssetSettings} */
function readAssetSettings(environment = process.env) {
  /** @param {string} key */
  function text(key) {
    const value = environment[key];
    if (typeof value !== 'string' || !value.trim() || /[\r\n\0]/.test(value)) throw new Error('Invalid asset setting: ' + key);
    return value.trim();
  }
  /** @param {string} key */
  function integer(key) {
    const raw = text(key); const value = Number(raw);
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < 1) throw new Error('Invalid asset limit: ' + key);
    return value;
  }
  const region = text('CMS_ASSET_AWS_REGION');
  const bucket = text('CMS_ASSET_S3_BUCKET');
  const keyPrefix = environment.CMS_ASSET_KEY_PREFIX;
  if (!/^[a-z0-9-]+$/.test(region) || !/^[a-z0-9][a-z0-9.-]+[a-z0-9]$/.test(bucket) || typeof keyPrefix !== 'string' ||
      (keyPrefix !== '' && !/^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*\/$/.test(keyPrefix))) throw new Error('Invalid asset destination');
  let endpoint;
  if (environment.CMS_ASSET_S3_ENDPOINT?.trim()) {
    const url = new URL(text('CMS_ASSET_S3_ENDPOINT'));
    const loopback = ['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname);
    if (url.username || url.password || url.search || url.hash || url.pathname !== '/' ||
        (url.protocol !== 'https:' && !(loopback && url.protocol === 'http:'))) throw new Error('Invalid asset endpoint');
    endpoint = url.href;
  }
  return Object.freeze({ directory: path.resolve(text('CMS_ASSET_SOURCE_DIRECTORY')), region, bucket, keyPrefix, endpoint,
    maxFiles: integer('CMS_ASSET_MAX_FILES'), maxFileBytes: integer('CMS_ASSET_MAX_FILE_BYTES'),
    maxTotalBytes: integer('CMS_ASSET_MAX_TOTAL_BYTES'), timeoutMs: integer('CMS_ASSET_TIMEOUT_MS'),
    maxAttempts: integer('CMS_ASSET_MAX_ATTEMPTS') });
}
module.exports = { readAssetSettings };
