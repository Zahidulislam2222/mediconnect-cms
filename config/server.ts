import { loadRuntimeSettings, type ConfigContext } from '../src/config/runtime-settings';
export default ({ env }: ConfigContext) => {
  const settings = loadRuntimeSettings(env);
  return {
    host: settings.host, port: settings.port, app: { keys: settings.appKeys },
    ...(settings.publicUrl ? { url: settings.publicUrl } : {}),
    proxy: { koa: settings.trustProxy },
  };
};
