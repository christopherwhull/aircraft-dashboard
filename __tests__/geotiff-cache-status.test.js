const { spawn } = require('child_process');
const fetch = require('node-fetch');
const path = require('path');

jest.setTimeout(30000); // allow up to 30s for server startup

describe('GeoTIFF tile server cache status API', () => {
  let serverProc;

  beforeAll((done) => {
    // Spawn the geotiff server as a child process
    const serverPath = path.resolve(__dirname, '..', 'geotiff-server.js');
    serverProc = spawn(process.execPath, [serverPath], { cwd: path.resolve(__dirname, '..') });

    let started = false;
    const onData = (data) => {
      const s = data.toString();
      // Wait for the log line indicating the server is running
      if (s.includes('GeoTIFF Tile Server running')) {
        started = true;
        serverProc.stdout.off('data', onData);
        // small delay to ensure server is ready to accept connections
        setTimeout(done, 200);
      }
    };

    serverProc.stdout.on('data', onData);
    serverProc.stderr.on('data', (d) => {
      // print errors to help debugging if startup fails
      console.error('[geotiff stderr]', d.toString());
    });

    serverProc.on('error', (err) => {
      console.error('Failed to start geotiff-server.js:', err);
      done(err);
    });

    // Safety timeout
    setTimeout(() => {
      if (!started) {
        // attempt to continue anyway
        done();
      }
    }, 10000);
  });

  afterAll(() => {
    if (serverProc && !serverProc.killed) {
      serverProc.kill('SIGKILL');
    }
  });

  test('GET /cache/status returns expected JSON shape', async () => {
    const url = 'http://localhost:3003/cache/status';
    const res = await fetch(url).catch((e) => null);
    expect(res).not.toBeNull();
    expect(res.ok).toBeTruthy();
    const json = await res.json();

    expect(json).toHaveProperty('totalBytes');
    expect(typeof json.totalBytes).toBe('number');

    expect(json).toHaveProperty('files');
    expect(typeof json.files).toBe('number');

    expect(json).toHaveProperty('charts');
    expect(typeof json.charts).toBe('object');
  });
});
