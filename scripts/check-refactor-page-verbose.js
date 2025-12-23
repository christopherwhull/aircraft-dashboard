const puppeteer = require('puppeteer');
const { spawn } = require('child_process');

async function checkRefactorPage() {
  let browser;
  let server;
  try {
    console.log('Starting server...');
    server = spawn('node', ['server.js'], { stdio: ['ignore', 'pipe', 'pipe'] });
    server.stdout.on('data', d => process.stdout.write('[server stdout] ' + d.toString()));
    server.stderr.on('data', d => process.stderr.write('[server stderr] ' + d.toString()));

    // Wait for the server to start
    await new Promise(resolve => setTimeout(resolve, 3000));

    console.log('Launching browser...');
    browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();

    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log(`Error: ${msg.text()}`);
      } else if (msg.type() === 'warning') {
        console.log(`Warning: ${msg.text()}`);
      } else {
        console.log(`Log: ${msg.text()}`);
      }
    });

    page.on('requestfailed', req => {
      console.log(`Request failed: ${req.url()} - ${req.failure() && req.failure().errorText}`);
    });

    page.on('response', async res => {
      const status = res.status();
      if (status >= 400) {
        console.log(`Response ${status}: ${res.url()}`);
        try { const ct = res.headers()['content-type'] || ''; if (ct.includes('application/json')) console.log('  JSON:', await res.text()); } catch(e){}
      }
    });

    const url = 'http://localhost:3002/live-moving-map-refactor.html';
    console.log(`Navigating to ${url}`);

    await page.goto(url, { waitUntil: 'networkidle2' });

    console.log('Page loaded. Waiting 6s to capture async console messages and network failures...');
    await new Promise(resolve => setTimeout(resolve, 6000));

  } catch (error) {
    console.error('An error occurred:', error);
  } finally {
    if (browser) {
      await browser.close();
      console.log('Browser closed.');
    }
    if (server) {
      server.kill();
      console.log('Server stopped.');
    }
  }
}

checkRefactorPage();