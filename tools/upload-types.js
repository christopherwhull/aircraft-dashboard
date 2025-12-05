const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');
const path = require('path');

const config = require('../config');
// Use S3 configuration from config.js only
const S3_ENDPOINT = (config && config.s3 && config.s3.endpoint) ? config.s3.endpoint : 'http://localhost:9000';
const S3_REGION = (config && config.s3 && config.s3.region) ? config.s3.region : 'us-east-1';
const S3_ACCESS_KEY = (config && config.s3 && config.s3.credentials && config.s3.credentials.accessKeyId) ? config.s3.credentials.accessKeyId : 'minioadmin';
const S3_SECRET_KEY = (config && config.s3 && config.s3.credentials && config.s3.credentials.secretAccessKey) ? config.s3.credentials.secretAccessKey : 'minioadmin123';
const S3_FORCE_PATH_STYLE = (config && typeof config.s3.forcePathStyle !== 'undefined') ? !!config.s3.forcePathStyle : true;

const BUCKET_NAME = (config && config.buckets && config.buckets.readBucket) ? config.buckets.readBucket : 'aircraft-data';
const DEFAULT_FILE = path.join(__dirname, 'aircraft_types.json');
const FILE_PATH = (config && config.tools && config.tools.typesFilePath) ? config.tools.typesFilePath : DEFAULT_FILE;
const OBJECT_KEY = 'aircraft_types.json';

const DRY_RUN = (config && config.tools && !!config.tools.dryRun) || process.argv.includes('--dry-run');

const s3 = new S3Client({
    endpoint: S3_ENDPOINT,
    region: S3_REGION,
    credentials: {
        accessKeyId: S3_ACCESS_KEY,
        secretAccessKey: S3_SECRET_KEY,
    },
    forcePathStyle: S3_FORCE_PATH_STYLE,
});

function readFileAsString(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        // Validate JSON
        try {
            JSON.parse(content);
        } catch (err) {
            console.warn(`Warning: ${filePath} is not valid JSON. Uploading raw content.`);
        }
        return content;
    } catch (err) {
        console.error(`Failed to read file ${filePath}:`, err.message);
        throw err;
    }
}

async function uploadFile() {
    const finalFilePath = FILE_PATH;
    if (!fs.existsSync(finalFilePath)) {
        console.error(`File not found: ${finalFilePath}`);
        process.exit(1);
    }

    const fileContent = readFileAsString(finalFilePath);

    console.log(`Preparing to upload ${finalFilePath} -> s3://${BUCKET_NAME}/${OBJECT_KEY}`);
    if (DRY_RUN) {
        console.log('DRY_RUN enabled: The file will not be uploaded.');
        console.log('File content preview (first 500 chars):\n');
        console.log(fileContent.slice(0, 500));
        return;
    }

    try {
        const command = new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: OBJECT_KEY,
            Body: fileContent,
            ContentType: 'application/json'
        });
        await s3.send(command);
        console.log('File uploaded successfully.');
    } catch (error) {
        console.error('Error uploading file:', error);
    }
}

uploadFile();
