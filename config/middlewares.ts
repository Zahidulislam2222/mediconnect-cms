import { loadRuntimeSettings, type ConfigContext } from '../src/config/runtime-settings';
export default ({ env }: ConfigContext) => {
  const settings = loadRuntimeSettings(env);
  return [
    'strapi::errors',
    { name: 'strapi::security', config: { contentSecurityPolicy: { useDefaults: true, directives: {
      'connect-src': settings.connectSources, 'img-src': settings.mediaSources,
      'media-src': settings.mediaSources, upgradeInsecureRequests: null,
    } } } },
    'strapi::cors', 'strapi::poweredBy', 'strapi::logger', 'strapi::query',
    'strapi::body', 'strapi::session', 'strapi::favicon', 'strapi::public',
  ];
};
