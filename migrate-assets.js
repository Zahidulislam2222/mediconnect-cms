const fs = require('fs');
const path = require('path');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const mime = require('mime-types');

// --- CONFIGURATION ---
const BUCKET_NAME = 'mediconnect-media-assets'; // Your Bucket Name
const REGION = 'us-east-1'; // Your Region
const ACCESS_KEY = process.env.AWS_ACCESS_KEY_ID; // Keys removed for safety
const SECRET_KEY = process.env.AWS_ACCESS_SECRET; // Keys removed for safety
// ---------------------

const s3Client = new S3Client({
    region: REGION,
    credentials: {
        accessKeyId: ACCESS_KEY,
        secretAccessKey: SECRET_KEY,
    },
});

const uploadDir = path.join(__dirname, 'public/uploads');

async function uploadFile(fileName) {
    const filePath = path.join(uploadDir, fileName);
    const fileContent = fs.readFileSync(filePath);
    const contentType = mime.lookup(filePath) || 'application/octet-stream';

    const params = {
        Bucket: BUCKET_NAME,
        Key: fileName, // Keeps the original filename
        Body: fileContent,
        ContentType: contentType,
        ACL: 'public-read', // Makes it viewable
    };

    try {
        await s3Client.send(new PutObjectCommand(params));
        console.log(`✅ Uploaded: ${fileName}`);
    } catch (err) {
        console.error(`❌ Error uploading ${fileName}:`, err.message);
    }
}

async function migrate() {
    console.log('🚀 Starting Enterprise Migration to AWS S3...');

    if (!fs.existsSync(uploadDir)) {
        console.error('Error: public/uploads folder not found!');
        return;
    }

    const files = fs.readdirSync(uploadDir).filter(file => file !== '.gitkeep');

    console.log(`Found ${files.length} files to upload.`);

    for (const file of files) {
        await uploadFile(file);
    }

    console.log('🎉 Migration Complete!');
}

migrate();