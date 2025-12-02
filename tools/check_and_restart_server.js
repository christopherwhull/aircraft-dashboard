#!/usr/bin/env node
/**
 * tools/check_and_restart_server.js
 * Checks whether the running server's commit matches the local commit and restarts if needed.
 * Usage: node tools/check_and_restart_server.js --server http://localhost:3002 --auto-restart
 */

const axios = require('axios');
const { execSync, spawnSync } = require('child_process');

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

function restartServer(platform = process.platform) {
  // On windows run npm script restart:node (powershell script)
  try {
    if (platform === 'win32') {
      console.log('Restarting server on Windows using `npm run restart:node`...');
      const r = spawnSync('npm', ['run', 'restart:node'], { stdio: 'inherit', shell: true });
      return r.status === 0;
    }
    // On unix-like, start using restart:unix
    console.log('Restarting server on Unix using `npm run restart:unix`...');
    const r = spawnSync('npm', ['run', 'restart:unix'], { stdio: 'inherit', shell: true });
    return r.status === 0;
  } catch (err) {
    console.error('Failed to start server via npm script:', err);
    return false;
  }
}

async function waitForHealth(serverUrl, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await axios.get(`${serverUrl.replace(/\/$/,'')}/api/health`, { timeout: 2000 });
      if (r.data && r.data.status === 'ok') return true;
    } catch (err) {}
    await new Promise(r => setTimeout(r, 1000));
  }
  return false;
}

async function main() {
  const argv = process.argv.slice(2);
  let serverUrl = 'http://localhost:3002';
  let autoRestart = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--server' && argv[i+1]) {
      serverUrl = argv[i+1];
      i++;
    } else if (argv[i] === '--auto-restart') {
      autoRestart = true;
    }
  }

  const local = getLocalCommitAndDirty();
  console.log(`Local commit: ${local.commit || '(unknown)'}`);
  console.log(`Local dirty: ${local.dirty}`);

  const server = await getServerStatus(serverUrl);
  if (server.error) {
    console.error(`Failed to query server status at ${serverUrl}:`, server.error);
    process.exit(2);
  }
  console.log(`Server commit: ${server.gitCommit || '(unknown)'}`);
  console.log(`Server dirty: ${server.gitDirty}`);

  // Determine if we need to restart
  if (local.commit && server.gitCommit && local.commit !== server.gitCommit) {
    console.warn('Local and server commits differ. The server should be restarted to pick up local changes.');

    if (!autoRestart) {
      console.log('Run this script with --auto-restart to restart automatically.');
      process.exit(1);
    }

    console.log('Auto-restart requested. Restarting...');
    const ok = restartServer();
    if (!ok) {
      console.error('Failed to restart server.');
      process.exit(2);
    }

    // Wait for the server to be healthy again
    console.log('Waiting for server to return healthy status...');
    const healthy = await waitForHealth(serverUrl, 30000);
    if (!healthy) {
      console.error('Server did not become healthy within timeout.');
      process.exit(3);
    }

    const newServer = await getServerStatus(serverUrl);
    console.log(`After restart: Server commit: ${newServer.gitCommit} dirty: ${newServer.gitDirty}`);

    if (local.commit === newServer.gitCommit && !newServer.gitDirty) {
      console.log('Server now matches local commit and is clean.');
      process.exit(0);
    } else {
      console.warn('Server commit did not match or server still dirty after restart.');
      process.exit(1);
    }
  } else if (local.dirty) {
    console.warn('Local working tree has uncommitted changes; a restart may still be required if changes are not committed.');
    process.exit(1);
  } else {
    console.log('Server and local commit are the same (or commit info not available), or no restart needed.');
    process.exit(0);
  }
}

main().catch(err => {
  console.error('Unhandled error:', err);
  process.exit(3);
});
