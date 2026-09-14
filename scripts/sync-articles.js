// Import-safe, explicitly invoked Strapi article migration. Never run against real
// providers as a test. A plan performs reads; only --execute performs cloud writes.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { readSettings } = require('./migration-settings.cjs');
const protocol = require('./migration-protocol.cjs');

class MigrationFailure extends Error {
  constructor(stage, summary, cause) {
    super('Article migration failed at ' + stage, { cause });
    this.stage = stage;
    this.summary = { ...summary, status: protocol.outcomes.failed, stage };
  }
}

function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function requireRecord(value) {
  if (!record(value)) throw new Error('Invalid source record');
  return value;
}
function attributes(value) {
  const row = requireRecord(value);
  return row.attributes === undefined ? row : requireRecord(row.attributes);
}
function validPublication(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) return false;
  const expected = value.replace(/(?:\.(\d{1,3}))?Z$/, (_, digits) => '.' + (digits || '').padEnd(3, '0') + 'Z');
  const date = new Date(value);
  return Number.isFinite(date.valueOf()) && date.toISOString() === expected;
}

/** Read only regular files beneath the configured, operator-owned uploads root.
 * Symlinks in requested components are rejected; this is not a filesystem sandbox
 * against an attacker concurrently renaming directories owned by the operator.
 * @param {import('./migration-settings.cjs').MigrationSettings} settings
 * @param {string} rawUrl
 */
function readMedia(settings, rawUrl) {
  if (typeof rawUrl !== 'string' || /[\\\0?#]/.test(rawUrl)) throw new Error('Invalid media reference');
  const decoded = decodeURIComponent(rawUrl);
  if (!decoded.startsWith(settings.mediaPrefix) || /[\\\0%?#]/.test(decoded)) throw new Error('Invalid media reference');
  const components = decoded.slice(1).split('/');
  if (components.some(part => !part || part === '.' || part === '..' || part.includes(':'))) throw new Error('Invalid media path');
  const root = fs.realpathSync(settings.publicRoot);
  let target = root;
  for (const [index, component] of components.entries()) {
    target = path.join(target, component);
    const stat = fs.lstatSync(target);
    if (stat.isSymbolicLink() || (index < components.length - 1 && !stat.isDirectory())) throw new Error('Unsafe media component');
  }
  const resolved = fs.realpathSync(target);
  const relative = path.relative(root, resolved);
  if (!relative || path.isAbsolute(relative) || relative === '..' || relative.startsWith('..' + path.sep)) throw new Error('Escaped media root');
  const descriptor = fs.openSync(resolved, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
  try {
    const stat = fs.fstatSync(descriptor);
    if (!stat.isFile() || stat.size < 1 || stat.size > settings.maxMediaBytes) throw new Error('Invalid media size/type');
    // Bounded descriptor reads also prevent a concurrently growing file from
    // making readFileSync allocate beyond the configured media limit.
    const body = Buffer.alloc(stat.size);
    let offset = 0;
    while (offset < body.length) {
      const count = fs.readSync(descriptor, body, offset, body.length - offset, offset);
      if (!count) throw new Error('Media changed during read');
      offset += count;
    }
    if (fs.readSync(descriptor, Buffer.alloc(1), 0, 1, offset) !== 0 || fs.fstatSync(descriptor).size !== stat.size) {
      throw new Error('Media changed during read');
    }
    const extension = path.extname(resolved).toLowerCase();
    if (!/^\.[a-z0-9]+$/.test(extension)) throw new Error('Invalid media extension');
    const key = settings.objectPrefix + crypto.createHash('sha256').update(body).digest('hex') + extension;
    return { body, key, contentType: require('mime-types').lookup(resolved) || protocol.defaultContentType,
      url: new URL(key, settings.mediaBaseUrl).href };
  } finally {
    fs.closeSync(descriptor);
  }
}

/** @param {import('./migration-settings.cjs').MigrationSettings} settings */
function createAdapters(settings) {
  let clients;
  function cloud() {
    if (!clients) {
      const { DynamoDBClient, PutItemCommand } = require('@aws-sdk/client-dynamodb');
      const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
      const { NodeHttpHandler } = require('@aws-sdk/node-http-handler');
      const { marshall } = require('@aws-sdk/util-dynamodb');
      const options = { region: settings.region, maxAttempts: settings.maxAttempts,
        requestHandler: new NodeHttpHandler({ connectionTimeout: settings.timeoutMs, socketTimeout: settings.timeoutMs }) };
      clients = { dynamo: new DynamoDBClient({ ...options, endpoint: settings.dynamoEndpoint }),
        s3: new S3Client({ ...options, endpoint: settings.s3Endpoint }), PutItemCommand, PutObjectCommand, marshall };
    }
    return clients;
  }
  return {
    async fetchPage(page) {
      const url = new URL(settings.articlesPath.slice(1), settings.strapiUrl);
      for (const [key, value] of Object.entries(protocol.query)) url.searchParams.set(key, value);
      url.searchParams.set(protocol.queryKeys.page, String(page));
      url.searchParams.set(protocol.queryKeys.pageSize, String(settings.pageSize));
      const response = await require('axios').get(url.href, {
        headers: settings.token ? { Authorization: 'Bearer ' + settings.token } : {},
        timeout: settings.timeoutMs, maxContentLength: settings.maxHttpBytes,
        // Keep the token at the operator-configured origin; never follow redirects
        // or route credential-bearing requests through ambient proxy settings.
        maxBodyLength: settings.maxHttpBytes, maxRedirects: 0, proxy: false,
      });
      return response.data;
    },
    readMedia: raw => readMedia(settings, raw),
    async upload(media) {
      const c = cloud();
      await c.s3.send(new c.PutObjectCommand({ Bucket: settings.bucket, Key: media.key,
        Body: media.body, ContentType: media.contentType }));
    },
    async write(item) {
      const c = cloud();
      await c.dynamo.send(new c.PutItemCommand({ TableName: settings.table,
        Item: c.marshall(item, { removeUndefinedValues: true }) }));
    },
    close() { if (clients) { clients.dynamo.destroy(); clients.s3.destroy(); } },
  };
}

/** Validate the complete plan before any writes; partial execute failures reject.
 * @param {import('./migration-settings.cjs').MigrationSettings} settings
 */
async function migrateArticles(settings, adapters, mode) {
  const summary = { status: protocol.outcomes.planning, pages: 0, received: 0, planned: 0, skippedDrafts: 0,
    uploaded: 0, completed: 0 };
  let stage = 'MODE';
  try {
    if (!Object.values(protocol.modes).includes(mode)) throw new Error('Explicit mode required');
    const plans = [], seen = new Set();
    let pagination, planBytes = 0;
    for (let page = 1; ; page++) {
      stage = 'SOURCE_HTTP';
      const response = requireRecord(await adapters.fetchPage(page));
      stage = 'PAGINATION';
      const meta = requireRecord(requireRecord(response.meta).pagination);
      for (const key of ['page', 'pageSize', 'pageCount', 'total']) {
        if (!Number.isSafeInteger(meta[key]) || meta[key] < 0) throw new Error('Invalid pagination');
      }
      if (meta.page !== page || meta.pageSize < 1 || meta.pageSize > settings.pageSize ||
          meta.pageCount !== Math.ceil(meta.total / meta.pageSize) || meta.pageCount > settings.maxPages ||
          !Array.isArray(response.data)) throw new Error('Invalid pagination');
      if (pagination && ['pageSize', 'pageCount', 'total'].some(key => pagination[key] !== meta[key])) throw new Error('Pagination changed');
      pagination = meta;
      const expected = Math.min(meta.pageSize, Math.max(0, meta.total - (page - 1) * meta.pageSize));
      if (response.data.length !== expected) throw new Error('Incomplete page');
      summary.pages++;
      for (const article of response.data) {
        stage = 'ARTICLE';
        const row = requireRecord(article), attr = attributes(row);
        const id = row.id;
        if (!((Number.isSafeInteger(id) && id > 0) || (typeof id === 'string' && /^[A-Za-z0-9_-]+$/.test(id)))) throw new Error('Invalid identity');
        const key = protocol.articleKeyPrefix + id;
        if (seen.has(key)) throw new Error('Repeated identity');
        seen.add(key); summary.received++;
        if (attr.publishedAt === null) { summary.skippedDrafts++; continue; }
        if (!validPublication(attr.publishedAt) || typeof attr.title !== 'string' || !attr.title.trim() ||
            !Array.isArray(attr.content)) throw new Error('Invalid article metadata');
        const item = { topic: key, title: attr.title, content: JSON.stringify(attr.content),
          slug: attr.title.toLowerCase().replace(/[^a-z0-9]+/g, '-'), publishedAt: attr.publishedAt,
          status: protocol.publishedStatus };
        for (const field of ['category', 'author']) {
          if (typeof attr[field] === 'string' && attr[field].trim()) item[field] = attr[field];
        }
        let media;
        if (attr.coverImage !== undefined && attr.coverImage !== null) {
          const relation = attr.coverImage;
          const data = record(relation) && Object.hasOwn(relation, 'data') ? relation.data : relation;
          const image = Array.isArray(data) ? data[0] : data;
          if (image !== undefined && image !== null) {
            stage = 'MEDIA';
            media = await adapters.readMedia(attributes(image).url);
            item.coverImage = media.url;
            planBytes += media.body.length;
          }
        }
        stage = 'ARTICLE';
        const itemBytes = Buffer.byteLength(JSON.stringify(item));
        planBytes += itemBytes;
        if (itemBytes > settings.maxArticleBytes || planBytes > settings.maxPlanBytes) throw new Error('Plan size limit');
        plans.push({ item, media }); summary.planned++;
      }
      if (page >= meta.pageCount) break;
    }
    if (summary.received !== pagination.total) throw new Error('Incomplete source');
    if (mode === protocol.modes.execute) {
      for (const plan of plans) {
        if (plan.media) { stage = 'MEDIA_UPLOAD'; await adapters.upload(plan.media); summary.uploaded++; }
        stage = 'DATABASE_WRITE'; await adapters.write(plan.item); summary.completed++;
      }
    }
    return { ...summary, status: mode === protocol.modes.execute ? protocol.outcomes.complete : protocol.outcomes.planned };
  } catch (cause) {
    throw new MigrationFailure(stage, summary, cause);
  }
}

async function main(argv) {
  let adapters;
  try {
    if (argv.length !== 1 || !Object.values(protocol.modes).includes(argv[0])) {
      throw new MigrationFailure('MODE', { completed: 0 }, undefined);
    }
    const settings = readSettings();
    adapters = createAdapters(settings);
    console.log(JSON.stringify(await migrateArticles(settings, adapters, argv[0])));
    return 0;
  } catch (error) {
    // Provider errors can contain request data or credentials; print counts/stage only.
    console.error(JSON.stringify(error instanceof MigrationFailure ? error.summary : { status: protocol.outcomes.failed, stage: 'CONFIGURATION', completed: 0 }));
    return 1;
  } finally { adapters?.close(); }
}

module.exports = { migrateArticles, createAdapters, readMedia, validPublication, main, MigrationFailure };
if (require.main === module) main(process.argv.slice(2)).then(code => { process.exitCode = code; });
