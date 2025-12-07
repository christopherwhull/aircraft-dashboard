#!/usr/bin/env node

/**
 * Clean Slate Test Runner for AirSquawk
 *
 * Runs tests with a clean slate by:
 * 1. Backing up existing bucket data
 * 2. Running the test suite
 * 3. Restoring the backup
 *
 * Usage:
 *   node tools/test-clean-slate.js
 *   npm run test:clean-slate
 */

const { spawn } = require('child_process');
const path = require('path');

const BACKUP_SCRIPT = path.join(__dirname, 'backup-buckets.js');
const TEST_SCRIPT = path.join(__dirname, 'test-all.js');

/**
 * Run a command and return promise
 */
function runCommand(command, args = [], options = {}) {
    return new Promise((resolve, reject) => {
        console.log(`\n🔧 Running: ${command} ${args.join(' ')}`);

        const child = spawn(command, args, {
            stdio: 'inherit',
            shell: true,
            ...options
        });

        child.on('close', (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`Command failed with exit code ${code}`));
            }
        });

        child.on('error', (error) => {
            reject(error);
        });
    });
}

/**
 * Main clean slate test function
 */
async function runCleanSlateTests() {
    console.log('🧹 Clean Slate Test Runner');
    console.log('==========================');
    console.log('This will:');
    console.log('1. Backup existing bucket data');
    console.log('2. Run the complete test suite');
    console.log('3. Restore the backup');
    console.log('');

    let backupCreated = false;

    try {
        // Step 1: Backup buckets
        console.log('📦 Step 1: Backing up existing data...');
        await runCommand('node', [BACKUP_SCRIPT, 'backup']);
        backupCreated = true;
        console.log('✅ Backup completed successfully\n');

        // Step 2: Run tests
        console.log('🧪 Step 2: Running test suite...');
        await runCommand('node', [TEST_SCRIPT]);
        console.log('✅ Tests completed successfully\n');

        // Step 3: Restore backup
        console.log('🔄 Step 3: Restoring backup...');
        await runCommand('node', [BACKUP_SCRIPT, 'restore']);
        console.log('✅ Restore completed successfully\n');

        console.log('🎉 Clean slate testing completed successfully!');
        console.log('All data has been restored to its original state.');

    } catch (error) {
        console.error('\n❌ Clean slate testing failed:', error.message);

        if (backupCreated) {
            console.log('\n🔄 Attempting to restore backup due to failure...');
            try {
                await runCommand('node', [BACKUP_SCRIPT, 'restore']);
                console.log('✅ Backup restored successfully');
            } catch (restoreError) {
                console.error('❌ Failed to restore backup:', restoreError.message);
                console.error('\n⚠️  MANUAL INTERVENTION REQUIRED:');
                console.error('Run "npm run restore-buckets" to manually restore your data');
            }
        }

        process.exit(1);
    }
}

/**
 * Show usage information
 */
function showUsage() {
    console.log('Clean Slate Test Runner for AirSquawk');
    console.log('');
    console.log('Usage:');
    console.log('  node tools/test-clean-slate.js');
    console.log('  npm run test:clean-slate');
    console.log('');
    console.log('This command will:');
    console.log('1. Create a backup of all S3 bucket data');
    console.log('2. Run the complete test suite');
    console.log('3. Restore the backup to original state');
    console.log('');
    console.log('Useful for testing with a clean slate while preserving existing data.');
}

/**
 * Main function
 */
async function main() {
    const args = process.argv.slice(2);

    if (args.includes('--help') || args.includes('-h')) {
        showUsage();
        return;
    }

    await runCleanSlateTests();
}

// Run if called directly
if (require.main === module) {
    main().catch(error => {
        console.error('Unexpected error:', error);
        process.exit(1);
    });
}

module.exports = { runCleanSlateTests };