const fs = require('fs');
const path = require('path');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const config = require('../config');

const s3 = new S3Client({
    endpoint: config.s3.endpoint,
    region: config.s3.region,
    credentials: config.s3.credentials,
    forcePathStyle: config.s3.forcePathStyle,
});

const BUCKET_NAME = config.buckets.writeBucket;
const LOGO_FILE_PATH = path.join(__dirname, '..', 'public', 'airsquak.jpg');
const LOGO_S3_KEY = 'logos/airsquak.jpg';

async function uploadLogo() {
    try {
        const fileContent = fs.readFileSync(LOGO_FILE_PATH);
        const command = new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: LOGO_S3_KEY,
            Body: fileContent,
            ContentType: 'image/jpeg',
        });
        await s3.send(command);
        console.log(`Successfully uploaded logo to ${BUCKET_NAME}/${LOGO_S3_KEY}`);
    } catch (error) {
        console.error('Error uploading logo:', error);
    }
}

uploadLogo();
