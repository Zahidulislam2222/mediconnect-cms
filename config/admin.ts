import { loadRuntimeSettings, type ConfigContext } from '../src/config/runtime-settings';
export default ({ env }: ConfigContext) => {
  const settings = loadRuntimeSettings(env);
  return {
    auth: { secret: settings.adminJwtSecret }, apiToken: { salt: settings.apiTokenSalt },
    transfer: { token: { salt: settings.transferTokenSalt } },
    secrets: { encryptionKey: settings.encryptionKey },
    flags: { nps: settings.flagNps, promoteEE: settings.flagPromoteEe },
  };
};
