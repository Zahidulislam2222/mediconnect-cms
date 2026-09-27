'use strict';
// Explicit operator tool: import performs no migration; --plan is local-only.
const fs = require('node:fs');
const path = require('node:path');
const { readAssetSettings } = require('./scripts/asset-settings.cjs');
const protocol = require('./scripts/migration-protocol.cjs');
/** @typedef {{key:string, body:Buffer, contentType:string}} Asset */
/** @typedef {{upload:(asset:Asset)=>Promise<void>, close:()=>void}} AssetAdapter */
/** @typedef {{status:string, planned:number, bytes:number, uploaded:number, stage?:string}} Summary */

class AssetMigrationFailure extends Error {
  /** @param {string} stage @param {Summary} summary @param {unknown} cause */
  constructor(stage, summary, cause) {
    super('Asset migration failed at ' + stage, { cause });
    this.summary = { ...summary, status: protocol.outcomes.failed, stage };
  }
}

/** Preflight a quiescent operator-owned directory, not a sandbox against concurrent parent renames.
 * @param {import('./scripts/asset-settings.cjs').AssetSettings} settings @returns {Asset[]} */
function planAssets(settings) {
  const rootStat = fs.lstatSync(settings.directory);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error('Invalid asset directory');
  const root = fs.realpathSync(settings.directory);
  const directory = fs.opendirSync(root);
  const names = [];
  try {
    let entry;
    while ((entry = directory.readSync()) !== null) {
      if (entry.name === '.gitkeep') continue;
      if (!entry.isFile() || !/^[A-Za-z0-9][A-Za-z0-9._ -]*$/.test(entry.name)) throw new Error('Invalid asset entry');
      names.push(entry.name);
      if (names.length > settings.maxFiles) throw new Error('Asset count exceeds limit');
    }
  } finally { directory.closeSync(); }
  if (!names.length) throw new Error('No assets to migrate');
  names.sort();
  let total = 0;
  return names.map(name => {
    const file = path.join(root, name);
    const expected = fs.lstatSync(file);
    if (!expected.isFile() || expected.isSymbolicLink()) throw new Error('Invalid asset file');
    const descriptor = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
    try {
      const stat = fs.fstatSync(descriptor);
      if (!stat.isFile() || stat.ino !== expected.ino || stat.dev !== expected.dev || stat.size < 1 ||
          stat.size > settings.maxFileBytes || stat.size > settings.maxTotalBytes - total) throw new Error('Invalid asset size or identity');
      const body = Buffer.alloc(stat.size);
      let offset = 0;
      while (offset < body.length) {
        const count = fs.readSync(descriptor, body, offset, body.length - offset, offset);
        if (!count) throw new Error('Asset changed during read');
        offset += count;
      }
      const after = fs.fstatSync(descriptor);
      if (after.size !== stat.size || after.mtimeMs !== stat.mtimeMs ||
          fs.readSync(descriptor, Buffer.alloc(1), 0, 1, offset) !== 0) throw new Error('Asset changed during read');
      total += body.length;
      return { key: settings.keyPrefix + name, body,
        contentType: require('mime-types').lookup(name) || protocol.defaultContentType };
    } finally { fs.closeSync(descriptor); }
  });
}

/** @param {import('./scripts/asset-settings.cjs').AssetSettings} settings @returns {AssetAdapter} */
function createAssetAdapter(settings) {
  const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
  const { NodeHttpHandler } = require('@aws-sdk/node-http-handler');
  const client = new S3Client({ region: settings.region, endpoint: settings.endpoint,
    forcePathStyle: Boolean(settings.endpoint), maxAttempts: settings.maxAttempts,
    requestHandler: new NodeHttpHandler({ connectionTimeout: settings.timeoutMs, socketTimeout: settings.timeoutMs }) });
  return {
    async upload(asset) {
      await client.send(new PutObjectCommand({ Bucket: settings.bucket, Key: asset.key, Body: asset.body,
        ContentType: asset.contentType, IfNoneMatch: '*' }));
    },
    close() { client.destroy(); },
  };
}

/** @param {import('./scripts/asset-settings.cjs').AssetSettings} settings
 * @param {string} mode @param {AssetAdapter} [adapter] @returns {Promise<Summary>} */
async function migrateAssets(settings, mode, adapter) {
  const summary = { status: protocol.outcomes.planning, planned: 0, bytes: 0, uploaded: 0 };
  let stage = 'MODE';
  try {
    if (mode !== protocol.modes.plan && mode !== protocol.modes.execute) throw new Error('Invalid mode');
    stage = 'PREFLIGHT';
    const assets = planAssets(settings);
    summary.planned = assets.length;
    summary.bytes = assets.reduce((sum, asset) => sum + asset.body.length, 0);
    if (mode === protocol.modes.plan) return { ...summary, status: protocol.outcomes.planned };
    stage = 'UPLOAD';
    adapter = adapter || createAssetAdapter(settings);
    for (const asset of assets) { await adapter.upload(asset); summary.uploaded++; }
    return { ...summary, status: protocol.outcomes.complete };
  } catch (error) { throw new AssetMigrationFailure(stage, summary, error); }
  finally { adapter?.close(); }
}

/** @param {string[]} argv @returns {Promise<number>} */
async function main(argv) {
  let stage = 'MODE';
  try {
    if (argv.length !== 1 || (argv[0] !== protocol.modes.plan && argv[0] !== protocol.modes.execute)) throw new Error('Invalid mode');
    stage = 'CONFIGURATION';
    const result = await migrateAssets(readAssetSettings(), argv[0]);
    process.stdout.write(JSON.stringify(result) + '\n');
    return 0;
  } catch (error) {
    const summary = error instanceof AssetMigrationFailure ? error.summary
      : { status: protocol.outcomes.failed, planned: 0, bytes: 0, uploaded: 0, stage };
    process.stderr.write(JSON.stringify(summary) + '\n');
    return 1;
  }
}
if (require.main === module) main(process.argv.slice(2)).then(code => { process.exitCode = code; });
module.exports = { planAssets, migrateAssets, createAssetAdapter, main, AssetMigrationFailure };
