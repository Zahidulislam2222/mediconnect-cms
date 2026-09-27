import { loadRuntimeSettings, type ConfigContext } from '../src/config/runtime-settings';
import { NodeHttpHandler } from '@aws-sdk/node-http-handler';
import type { RuntimeExtension } from '@aws-sdk/client-s3';
export default ({ env }: ConfigContext) => {
  const { upload, jwtSecret } = loadRuntimeSettings(env);
  const credentials = upload.credentials;
  // Strapi's installed extractCredentials drops sessionToken. The public SDK
  // extension API preserves the full identity without mutating process.env.
  const credentialExtension: RuntimeExtension | undefined = credentials ? {
    configure(configuration) { configuration.setCredentials(credentials); },
  } : undefined;
  return {
    'users-permissions': { config: { jwtSecret } },
    upload: { config: {
      provider: '@strapi/provider-upload-aws-s3',
      providerOptions: {
        ...(upload.baseUrl ? { baseUrl: upload.baseUrl } : {}),
        s3Options: {
          ...(credentialExtension ? { extensions: [credentialExtension] } : {}),
          region: upload.region, endpoint: upload.endpoint,
          params: { Bucket: upload.bucket, ACL: upload.visibility === 'private' ? 'private' : 'public-read', signedUrlExpires: upload.signedUrlSeconds },
          forcePathStyle: upload.forcePathStyle, maxAttempts: upload.maxAttempts,
          requestHandler: new NodeHttpHandler({ connectionTimeout: upload.connectionTimeoutMs, socketTimeout: upload.timeoutMs }),
        },
      },
      // The installed provider uses ACL for URL mode. Omit it from actual writes;
      // bucket ownership/policy controls access and is never changed by the CMS.
      actionOptions: { upload: { ACL: undefined }, uploadStream: { ACL: undefined }, delete: {} },
    } },
  };
};
