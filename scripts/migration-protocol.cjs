'use strict';
// Existing public knowledge API key/status and Strapi REST protocol syntax.
module.exports = Object.freeze({
  articleKeyPrefix: 'ARTICLE#',
  publishedStatus: 'PUBLISHED',
  defaultContentType: 'application/octet-stream',
  modes: Object.freeze({ plan: '--plan', execute: '--execute' }),
  outcomes: Object.freeze({ planning: 'PLANNING', planned: 'PLAN_READY', complete: 'COMPLETE', failed: 'FAILED' }),
  queryKeys: Object.freeze({ page: 'pagination[page]', pageSize: 'pagination[pageSize]' }),
  query: Object.freeze({ populate: '*', status: 'published', sort: 'id:asc', 'pagination[withCount]': 'true' }),
});
