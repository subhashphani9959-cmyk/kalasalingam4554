const { spawn } = require('child_process');

console.log('Launching QuickBoard Server & Windows Clipboard Sync...');

const server = spawn('node', ['server.js'], { stdio: 'inherit' });
setTimeout(() => {
  const sync = spawn('node', ['sync.js'], { stdio: 'inherit' });
}, 1000);
