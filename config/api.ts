import { loadRuntimeSettings, type ConfigContext } from '../src/config/runtime-settings';
export default ({ env }: ConfigContext) => {
  const settings = loadRuntimeSettings(env);
  return { rest: { defaultLimit: settings.restDefaultLimit, maxLimit: settings.restMaxLimit, withCount: settings.restWithCount } };
};
