import { loadRuntimeSettings, type ConfigContext } from '../src/config/runtime-settings';
export default ({ env }: ConfigContext) => {
  const settings = loadRuntimeSettings(env);
  return { connection: { client: 'sqlite', connection: { filename: settings.databaseFilename }, useNullAsDefault: true } };
};
