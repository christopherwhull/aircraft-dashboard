#!/usr/bin/env node

/**
 * Wiki Publishing Script
 * 
 * This script helps publish wiki content from the /wiki directory to the GitHub Wiki.
 * 
 * Usage:
 *   node tools/publish-wiki.js [--check]
 * 
 * Options:
 *   --check    Only check wiki files without publishing
 */

const fs = require('fs');
const path = require('path');

const WIKI_DIR = path.join(__dirname, '..', 'wiki');
const WIKI_REPO_DIR = path.join(__dirname, '..', 'aircraft-dashboard.wiki');

// ANSI color codes for output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function checkWikiFiles() {
  log('\n=== Checking Wiki Files ===\n', 'blue');
  
  if (!fs.existsSync(WIKI_DIR)) {
    log(`Error: Wiki directory not found at ${WIKI_DIR}`, 'red');
    return false;
  }

  const wikiFiles = fs.readdirSync(WIKI_DIR).filter(file => file.endsWith('.md'));
  
  log(`Found ${wikiFiles.length} wiki files:\n`, 'green');
  
  wikiFiles.forEach(file => {
    const filePath = path.join(WIKI_DIR, file);
    const stats = fs.statSync(filePath);
    const sizeKB = (stats.size / 1024).toFixed(2);
    console.log(`  ✓ ${file} (${sizeKB} KB)`);
  });

  // Check for required files
  const requiredFiles = ['Home.md', '_Sidebar.md'];
  log('\n=== Checking Required Files ===\n', 'blue');
  
  let allPresent = true;
  requiredFiles.forEach(file => {
    if (wikiFiles.includes(file)) {
      log(`  ✓ ${file} found`, 'green');
    } else {
      log(`  ✗ ${file} missing`, 'red');
      allPresent = false;
    }
  });

  return allPresent;
}

function publishWiki() {
  log('\n=== Publishing Wiki ===\n', 'blue');
  
  // Check if wiki repository is cloned
  if (!fs.existsSync(WIKI_REPO_DIR)) {
    log('Wiki repository not found locally.', 'yellow');
    log('\nTo publish the wiki, follow these steps:\n', 'blue');
    log('1. Clone the wiki repository:');
    log('   git clone https://github.com/christopherwhull/aircraft-dashboard.wiki.git\n');
    log('2. Copy wiki files:');
    log(`   cp wiki/*.md aircraft-dashboard.wiki/\n`);
    log('3. Commit and push:');
    log('   cd aircraft-dashboard.wiki');
    log('   git add .');
    log('   git commit -m "Update wiki content"');
    log('   git push origin master\n');
    return false;
  }

  // Copy files to wiki repository
  const wikiFiles = fs.readdirSync(WIKI_DIR).filter(file => 
    file.endsWith('.md') && file !== 'README.md' // Don't copy README.md to wiki
  );
  
  let copiedCount = 0;
  wikiFiles.forEach(file => {
    const sourcePath = path.join(WIKI_DIR, file);
    const destPath = path.join(WIKI_REPO_DIR, file);
    
    fs.copyFileSync(sourcePath, destPath);
    log(`  ✓ Copied ${file}`, 'green');
    copiedCount++;
  });

  log(`\nSuccessfully copied ${copiedCount} files to wiki repository.`, 'green');
  log('\nNext steps:', 'blue');
  log('1. cd aircraft-dashboard.wiki');
  log('2. git status (to see changes)');
  log('3. git add .');
  log('4. git commit -m "Update wiki content"');
  log('5. git push origin master\n');
  
  return true;
}

function main() {
  const args = process.argv.slice(2);
  const checkOnly = args.includes('--check');

  log('═══════════════════════════════════════', 'blue');
  log('   Aircraft Dashboard Wiki Publisher   ', 'blue');
  log('═══════════════════════════════════════', 'blue');

  const filesOk = checkWikiFiles();

  if (!filesOk) {
    log('\n⚠ Some required wiki files are missing.', 'yellow');
    process.exit(1);
  }

  if (checkOnly) {
    log('\n✓ Wiki files check passed!', 'green');
    process.exit(0);
  }

  publishWiki();
}

if (require.main === module) {
  main();
}

module.exports = { checkWikiFiles, publishWiki };
