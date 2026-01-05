// 1. Import the tool
import { NodeHttpHandler } from '@aws-sdk/node-http-handler';

export default ({ env }) => ({
    upload: {
        config: {
            provider: '@strapi/provider-upload-aws-s3',
            providerOptions: {
                s3Options: {
                    credentials: {
                        accessKeyId: env('AWS_ACCESS_KEY_ID'),
                        secretAccessKey: env('AWS_ACCESS_SECRET'),
                    },
                    region: env('AWS_REGION'),
                    params: {
                        Bucket: env('AWS_BUCKET'),
                    },
                    forcePathStyle: false,

                    // 2. SET TIMEOUT TO 5 MINUTES
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