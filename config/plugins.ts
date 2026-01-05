// 1. Keep the import
import { NodeHttpHandler } from '@aws-sdk/node-http-handler';

export default ({ env }) => ({
    upload: {
        config: {
            provider: '@strapi/provider-upload-aws-s3',
            providerOptions: {
                s3Options: {
                    credentials: {
                        // 2. Use env() to read from the hidden file
                        accessKeyId: env('AWS_ACCESS_KEY_ID'),
                        secretAccessKey: env('AWS_ACCESS_SECRET'),
                    },
                    region: env('AWS_REGION'),
                    params: {
                        Bucket: env('AWS_BUCKET'),
                    },
                    forcePathStyle: false, // You can keep this false if bucket name has no dots

                    // 3. KEEP THIS TIMEOUT FIX (It saved you!)
                    requestHandler: new NodeHttpHandler({
                        connectionTimeout: 300000,
                        socketTimeout: 300000,
                    }),
                },
            },
            actionOptions: {
                upload: {},
                uploadStream: {},
                delete: {},
            },
        },
    },
});