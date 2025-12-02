#!/usr/bin/env node
/**
 * check_server_restart.js
 * CLI tool to check whether the running server is using the same commit as the local code
 * Usage: node tools/check_server_restart.js [--server http://localhost:3002] [--local]
 * --server: server URL (default http://localhost:3002)
 * --local: only check local commit and working tree status
 */

const axios = require('axios');
const { execSync } = require('child_process');

function getLocalCommitAndDirty() {
  try {
    const commit = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
    const status = execSync('git status --porcelain', { encoding: 'utf8' }).trim();
    const dirty = status.length > 0;
    return { commit, dirty };
  } catch (err) {
    return { commit: '', dirty: false };
  }
}

async function getServerStatus(serverUrl) {
  try {
    const r = await axios.get(`${serverUrl.replace(/\/$/,'')}/api/server-status`);
    return r.data;
  } catch (err) {
    return { error: err.message };
  }
}

async function main() {
  const argv = process.argv.slice(2);
  let serverUrl = 'http://localhost:3002';
  let localOnly = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--server' && argv[i+1]) {
      serverUrl = argv[i+1];
      i++;
    } else if (argv[i] === '--local') {
      localOnly = true;
    }
  }

  const local = getLocalCommitAndDirty();
  console.log(`Local commit: ${local.commit || '(unknown)'}`);
  console.log(`Local dirty: ${local.dirty}`);

  if (localOnly) return;

  const server = await getServerStatus(serverUrl);
  if (server.error) {
    console.error(`Failed to query server at ${serverUrl}: ${server.error}`);
    process.exit(2);
  }

  console.log(`Server start: ${server.serverStartIso || '(unknown)'}`);
  console.log(`Server uptime ms: ${server.serverUptimeMs || 0}`);
  console.log(`Server commit: ${server.gitCommit || '(unknown)'}`);
  console.log(`Server dirty: ${server.gitDirty ? 'true' : 'false'}`);

  if (!local.commit && !server.gitCommit) {
    console.log('No commit information available locally or on server. Cannot determine if restart is needed.');
    process.exit(0);
  }

  if (local.commit !== server.gitCommit) {
    console.warn('Server is running a different commit from the local commit. You may need to restart the server.');
    console.log(`Server commit: ${server.gitCommit}`);
    console.log(`Local commit:  ${local.commit}`);
    process.exit(1);
  }

  if (local.dirty) {
    console.warn('Local working tree has uncommitted changes. The server was started with commit', server.gitCommit, 'but you have local changes that are not deployed.');
    process.exit(1);
  }

  console.log('OK: Local commit and server commit match, and local tree is clean.');
  process.exit(0);
}

main().catch(err => {
  console.error('Unhandled error', err);
  process.exit(3);
});
