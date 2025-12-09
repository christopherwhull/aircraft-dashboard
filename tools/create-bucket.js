#!/usr/bin/env node

/**
 * Bucket Creation Script for AirSquawk
 *
 * Creates the required S3/MinIO buckets for the aircraft dashboard:
 * - Read bucket: aircraft-data (historical data)
 * - Write bucket: aircraft-data-new (current data)
 *
 * Usage:
 *   node tools/create-bucket.js
 *   npm run create-buckets
 */

const { S3Client, CreateBucketCommand, HeadBucketCommand, ListBucketsCommand } = require('@aws-sdk/client-s3');
const config = require('../config-loader');

const s3 = new S3Client({
    endpoint: config.s3.endpoint,
    region: config.s3.region,
    credentials: config.s3.credentials,
    forcePathStyle: config.s3.forcePathStyle,
});

const BUCKETS = {
    read: config.buckets.readBucket,
    write: config.buckets.writeBucket,
};

async function bucketExists(bucketName) {
    try {
        const command = new HeadBucketCommand({ Bucket: bucketName });
        await s3.send(command);
        return true;
    } catch (error) {
        if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
            return false;
        }
        throw error;
    }
}

async function createBucket(bucketName) {
    try {
        console.log(`Creating bucket: ${bucketName}...`);
        const command = new CreateBucketCommand({ Bucket: bucketName });
        await s3.send(command);
        console.log(`✅ Bucket '${bucketName}' created successfully.`);
        return true;
    } catch (error) {
        if (error.name === 'BucketAlreadyExists' || error.name === 'BucketAlreadyOwnedByYou') {
            console.log(`ℹ️  Bucket '${bucketName}' already exists.`);
            return false;
        }
        console.error(`❌ Error creating bucket '${bucketName}':`, error.message);
        throw error;
    }
}

async function listBuckets() {
    try {
        const command = new ListBucketsCommand({});
        const response = await s3.send(command);
        return response.Buckets.map(bucket => bucket.Name);
    } catch (error) {
        console.error('Error listing buckets:', error.message);
        return [];
    }
}

async function main() {
    console.log('🚀 AirSquawk Bucket Creation Script');
    console.log('=====================================');
    console.log(`S3 Endpoint: ${config.s3.endpoint}`);
    console.log(`Read Bucket: ${BUCKETS.read}`);
    console.log(`Write Bucket: ${BUCKETS.write}`);
    console.log('');

    try {
        // Check S3 connection
        console.log('🔍 Checking S3 connection...');
        const existingBuckets = await listBuckets();
        console.log(`✅ Connected to S3. Found ${existingBuckets.length} existing buckets.`);
        console.log('');

        // Create buckets
        const results = [];
        for (const [type, bucketName] of Object.entries(BUCKETS)) {
            const exists = await bucketExists(bucketName);
            if (exists) {
                console.log(`ℹ️  ${type} bucket '${bucketName}' already exists.`);
                results.push({ type, bucket: bucketName, created: false, existed: true });
            } else {
                const created = await createBucket(bucketName);
                results.push({ type, bucket: bucketName, created, existed: false });
            }
        }

        console.log('');
        console.log('📊 Summary:');
        console.log('===========');

        const createdCount = results.filter(r => r.created).length;
        const existedCount = results.filter(r => r.existed).length;

        results.forEach(result => {
            const status = result.created ? '✅ Created' : result.existed ? 'ℹ️  Exists' : '❌ Failed';
            console.log(`${status} ${result.type} bucket: ${result.bucket}`);
        });

        console.log('');
        if (createdCount > 0) {
            console.log(`🎉 Successfully created ${createdCount} bucket(s).`);
        }
        if (existedCount > 0) {
            console.log(`ℹ️  ${existedCount} bucket(s) already existed.`);
        }

        console.log('');
        console.log('📋 Next Steps:');
        console.log('==============');
        console.log('1. Start the aircraft tracker: python aircraft-tracker.py --enable-s3');
        console.log('2. Start the dashboard server: npm start');
        console.log('3. Access dashboard at: http://localhost:3002');

    } catch (error) {
        console.error('');
        console.error('❌ Bucket creation failed:', error.message);
        console.error('');
        console.error('🔧 Troubleshooting:');
        console.error('- Ensure MinIO/S3 is running and accessible');
        console.error('- Check S3 credentials (config.json or environment variables)');
        console.error('- Verify network connectivity to S3 endpoint');
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    main().catch(error => {
        console.error('Unexpected error:', error);
        process.exit(1);
    });
}

module.exports = { createBucket, bucketExists, listBuckets };
