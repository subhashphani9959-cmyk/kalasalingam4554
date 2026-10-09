const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('\n======================================================');
console.log('   🚀 QuickBoard Multi-Process Launcher');
console.log('======================================================');

// 1. Launch web & socket server
const server = spawn('node', ['server.js'], { stdio: 'inherit' });

// 2. Launch Windows clipboard sync daemon
setTimeout(() => {
  const sync = spawn('node', ['sync.js'], { stdio: 'inherit' });
}, 1000);

// 3. Launch Cloudflare public tunnel if cloudflared.exe exists
const cloudflaredPath = path.join(__dirname, 'cloudflared.exe');
if (fs.existsSync(cloudflaredPath) && !process.argv.includes('--no-tunnel')) {
  setTimeout(() => {
    const tunnel = spawn('node', ['scripts/tunnel.js'], { stdio: 'inherit' });
  }, 1500);
}
