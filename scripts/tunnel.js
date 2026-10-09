const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CLOUDFLARED = path.join(__dirname, '..', 'cloudflared.exe');
const DATA_DIR = path.join(__dirname, '..', 'data');
const TUNNEL_FILE = path.join(DATA_DIR, 'tunnel.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

if (!fs.existsSync(CLOUDFLARED)) {
  console.error('❌ cloudflared.exe not found in workspace root!');
  process.exit(1);
}

console.log('🚀 Starting Cloudflare Tunnel for QuickBoard (port 3000)...');

const proc = spawn(CLOUDFLARED, ['tunnel', '--url', 'http://localhost:3000'], {
  windowsHide: true
});

let tunnelUrl = null;

function handleOutput(chunk) {
  const text = chunk.toString();
  // Pass through cloudflared logs
  process.stdout.write(text);

  const match = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
  if (match && !tunnelUrl) {
    tunnelUrl = match[0];
    try {
      fs.writeFileSync(
        TUNNEL_FILE,
        JSON.stringify({ url: tunnelUrl, updatedAt: Date.now() }, null, 2),
        'utf8'
      );
    } catch (e) {
      console.error('Error writing tunnel file:', e.message);
    }

    console.log('\n======================================================');
    console.log('🎉 CLOUDFLARE PUBLIC INTERNET LINK IS READY!');
    console.log(` • Live URL:    ${tunnelUrl}`);
    console.log(' • Share this link with any friend across the internet!');
    console.log('======================================================\n');
  }
}

proc.stdout.on('data', handleOutput);
proc.stderr.on('data', handleOutput);

proc.on('close', (code) => {
  console.log(`Cloudflare tunnel process exited with code ${code}`);
  try {
    if (fs.existsSync(TUNNEL_FILE)) {
      fs.unlinkSync(TUNNEL_FILE);
    }
  } catch (e) {}
});

process.on('SIGINT', () => {
  proc.kill();
  process.exit();
});

process.on('SIGTERM', () => {
  proc.kill();
  process.exit();
});
