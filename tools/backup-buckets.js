#!/usr/bin/env node

/**
 * S3 Backup/Restore Script for AirSquawk
 *
 * Provides backup and restore functionality for S3/MinIO buckets
 * Used for clean slate testing and data recovery
 *
 * Usage:
 *   node tools/backup-buckets.js backup    # Backup all buckets
 *   node tools/backup-buckets.js restore   # Restore from backup
 *   node tools/backup-buckets.js clean     # Remove backup files
 *   npm run backup-buckets
 *   npm run restore-buckets
 */

const { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand, DeleteObjectsCommand } = require('@aws-sdk/client-s3');
const fs = require('fs').promises;
const path = require('path');
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

const BACKUP_DIR = path.join(__dirname, '..', 'runtime', 'bucket-backups');
const BACKUP_MANIFEST = 'backup-manifest.json';

/**
 * Ensure backup directory exists
 */
async function ensureBackupDir() {
    try {
        await fs.mkdir(BACKUP_DIR, { recursive: true });
    } catch (error) {
        if (error.code !== 'EEXIST') {
            throw error;
        }
    }
}

/**
 * List all objects in a bucket
 */
async function listBucketObjects(bucketName) {
    const objects = [];
    let continuationToken;

    do {
        const command = new ListObjectsV2Command({
            Bucket: bucketName,
            ContinuationToken: continuationToken,
        });

        const response = await s3.send(command);
        if (response.Contents) {
            objects.push(...response.Contents.map(obj => ({
                key: obj.Key,
                size: obj.Size,
                lastModified: obj.LastModified,
                etag: obj.ETag,
            })));
        }
        continuationToken = response.NextContinuationToken;
    } while (continuationToken);

    return objects;
}

/**
 * Download object from S3
 */
async function downloadObject(bucketName, key, localPath) {
    const command = new GetObjectCommand({
        Bucket: bucketName,
        Key: key,
    });

    const response = await s3.send(command);
    const buffer = await response.Body.transformToByteArray();
    await fs.writeFile(localPath, buffer);
    return buffer.length;
}

/**
 * Upload object to S3
 */
async function uploadObject(bucketName, key, localPath) {
    const buffer = await fs.readFile(localPath);
    const command = new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: buffer,
    });

    await s3.send(command);
    return buffer.length;
}

/**
 * Create backup manifest
 */
function createBackupManifest(bucketBackups) {
    return {
        timestamp: new Date().toISOString(),
        version: '1.0',
        buckets: bucketBackups,
        config: {
            endpoint: config.s3.endpoint,
            region: config.s3.region,
            readBucket: config.buckets.readBucket,
            writeBucket: config.buckets.writeBucket,
        },
    };
}

/**
 * Backup all buckets
 */
async function backupBuckets() {
    console.log('🚀 Starting S3 Bucket Backup');
    console.log('=============================');

    await ensureBackupDir();

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(BACKUP_DIR, `backup-${timestamp}`);
    await fs.mkdir(backupPath, { recursive: true });

    const bucketBackups = {};
    let totalObjects = 0;
    let totalSize = 0;

    for (const [type, bucketName] of Object.entries(BUCKETS)) {
        console.log(`\n📦 Backing up ${type} bucket: ${bucketName}`);

        try {
            const objects = await listBucketObjects(bucketName);
            console.log(`   Found ${objects.length} objects`);

            if (objects.length === 0) {
                console.log(`   ℹ️  Bucket is empty, skipping...`);
                bucketBackups[bucketName] = { objects: [], totalSize: 0 };
                continue;
            }

            const bucketBackupPath = path.join(backupPath, bucketName);
            await fs.mkdir(bucketBackupPath, { recursive: true });

            const backupObjects = [];

            for (const obj of objects) {
                const localPath = path.join(bucketBackupPath, obj.key.replace(/\//g, '_'));
                console.log(`   📥 ${obj.key} (${(obj.size / 1024).toFixed(1)} KB)`);

                try {
                    const bytesDownloaded = await downloadObject(bucketName, obj.key, localPath);
                    backupObjects.push({
                        key: obj.key,
                        localPath: path.relative(backupPath, localPath),
                        size: obj.size,
                        lastModified: obj.lastModified,
                        etag: obj.etag,
                    });
                    totalObjects++;
                    totalSize += obj.size;
                } catch (error) {
                    console.error(`   ❌ Failed to download ${obj.key}:`, error.message);
                }
            }

            bucketBackups[bucketName] = {
                objects: backupObjects,
                totalSize: backupObjects.reduce((sum, obj) => sum + obj.size, 0),
            };

            console.log(`   ✅ ${type} bucket backup complete (${backupObjects.length} objects)`);

        } catch (error) {
            console.error(`   ❌ Failed to backup ${type} bucket:`, error.message);
            bucketBackups[bucketName] = { error: error.message };
        }
    }

    // Save manifest
    const manifest = createBackupManifest(bucketBackups);
    const manifestPath = path.join(backupPath, BACKUP_MANIFEST);
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));

    console.log('\n📊 Backup Summary:');
    console.log('==================');
    console.log(`Backup Location: ${backupPath}`);
    console.log(`Total Objects: ${totalObjects}`);
    console.log(`Total Size: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`Manifest: ${manifestPath}`);

    console.log('\n✅ Backup completed successfully!');
    console.log('\n💡 To restore later, run: npm run restore-buckets');

    return backupPath;
}

/**
 * Find latest backup
 */
async function findLatestBackup() {
    try {
        const entries = await fs.readdir(BACKUP_DIR);
        const backups = entries
            .filter(entry => entry.startsWith('backup-'))
            .sort()
            .reverse();

        if (backups.length === 0) {
            return null;
        }

        return path.join(BACKUP_DIR, backups[0]);
    } catch (error) {
        return null;
    }
}

/**
 * Restore buckets from backup
 */
async function restoreBuckets(backupPath = null) {
    console.log('🔄 Starting S3 Bucket Restore');
    console.log('==============================');

    if (!backupPath) {
        backupPath = await findLatestBackup();
        if (!backupPath) {
            console.error('❌ No backup found. Run backup first: npm run backup-buckets');
            process.exit(1);
        }
    }

    console.log(`Backup Source: ${backupPath}`);

    const manifestPath = path.join(backupPath, BACKUP_MANIFEST);
    let manifest;

    try {
        const manifestData = await fs.readFile(manifestPath, 'utf8');
        manifest = JSON.parse(manifestData);
    } catch (error) {
        console.error(`❌ Failed to read backup manifest: ${error.message}`);
        process.exit(1);
    }

    console.log(`Backup created: ${manifest.timestamp}`);
    console.log(`Total objects in backup: ${Object.values(manifest.buckets).reduce((sum, bucket) => sum + (bucket.objects?.length || 0), 0)}`);

    let totalRestored = 0;
    let totalSize = 0;

    for (const [bucketName, bucketData] of Object.entries(manifest.buckets)) {
        console.log(`\n📦 Restoring bucket: ${bucketName}`);

        if (bucketData.error) {
            console.log(`   ⚠️  Skipping bucket with backup error: ${bucketData.error}`);
            continue;
        }

        if (!bucketData.objects || bucketData.objects.length === 0) {
            console.log(`   ℹ️  No objects to restore for this bucket`);
            continue;
        }

        for (const obj of bucketData.objects) {
            const localPath = path.join(backupPath, obj.localPath);
            console.log(`   📤 ${obj.key} (${(obj.size / 1024).toFixed(1)} KB)`);

            try {
                const bytesUploaded = await uploadObject(bucketName, obj.key, localPath);
                totalRestored++;
                totalSize += obj.size;
            } catch (error) {
                console.error(`   ❌ Failed to restore ${obj.key}:`, error.message);
            }
        }

        console.log(`   ✅ Restored ${bucketData.objects.length} objects to ${bucketName}`);
    }

    console.log('\n📊 Restore Summary:');
    console.log('===================');
    console.log(`Objects Restored: ${totalRestored}`);
    console.log(`Total Size: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);

    console.log('\n✅ Restore completed successfully!');
}

/**
 * Clean backup files
 */
async function cleanBackups() {
    console.log('🧹 Cleaning Backup Files');
    console.log('========================');

    try {
        const entries = await fs.readdir(BACKUP_DIR);
        const backups = entries.filter(entry => entry.startsWith('backup-'));

        if (backups.length === 0) {
            console.log('ℹ️  No backup files found');
            return;
        }

        console.log(`Found ${backups.length} backup(s):`);
        for (const backup of backups) {
            console.log(`  - ${backup}`);
        }

        console.log('\n🗑️  Removing backups...');
        for (const backup of backups) {
            const backupPath = path.join(BACKUP_DIR, backup);
            await fs.rm(backupPath, { recursive: true, force: true });
            console.log(`  ✅ Removed: ${backup}`);
        }

        console.log('\n✅ All backup files cleaned!');

    } catch (error) {
        console.error('❌ Failed to clean backups:', error.message);
    }
}

/**
 * Show backup status
 */
async function showStatus() {
    console.log('📋 Backup Status');
    console.log('================');

    try {
        const latestBackup = await findLatestBackup();
        if (latestBackup) {
            const manifestPath = path.join(latestBackup, BACKUP_MANIFEST);
            try {
                const manifestData = await fs.readFile(manifestPath, 'utf8');
                const manifest = JSON.parse(manifestData);

                console.log(`Latest Backup: ${path.basename(latestBackup)}`);
                console.log(`Created: ${manifest.timestamp}`);
                console.log(`Location: ${latestBackup}`);

                let totalObjects = 0;
                let totalSize = 0;

                for (const [bucketName, bucketData] of Object.entries(manifest.buckets)) {
                    if (bucketData.objects) {
                        totalObjects += bucketData.objects.length;
                        totalSize += bucketData.totalSize || 0;
                        console.log(`  ${bucketName}: ${bucketData.objects.length} objects`);
                    }
                }

                console.log(`Total Objects: ${totalObjects}`);
                console.log(`Total Size: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);

            } catch (error) {
                console.log(`Latest Backup: ${path.basename(latestBackup)} (manifest corrupted)`);
            }
        } else {
            console.log('ℹ️  No backups found');
        }

    } catch (error) {
        console.log('❌ Error checking backup status:', error.message);
    }
}

/**
 * Main function
 */
async function main() {
    const command = process.argv[2] || 'status';

    try {
        switch (command) {
            case 'backup':
                await backupBuckets();
                break;
            case 'restore':
                await restoreBuckets();
                break;
            case 'clean':
                await cleanBackups();
                break;
            case 'status':
                await showStatus();
                break;
            default:
                console.log('Usage: node tools/backup-buckets.js <command>');
                console.log('Commands:');
                console.log('  backup  - Create backup of all buckets');
                console.log('  restore - Restore buckets from latest backup');
                console.log('  clean   - Remove all backup files');
                console.log('  status  - Show backup status (default)');
                process.exit(1);
        }
    } catch (error) {
        console.error('❌ Operation failed:', error.message);
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

module.exports = { backupBuckets, restoreBuckets, cleanBackups, showStatus };