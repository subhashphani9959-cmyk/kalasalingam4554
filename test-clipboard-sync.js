const { io } = require('socket.io-client');
const { execSync } = require('child_process');

async function testClipboardSync() {
  console.log('Testing incoming friend message -> Windows clipboard sync...');

  // Start sync daemon
  const syncProcess = require('child_process').fork('sync.js');
  await new Promise((res) => setTimeout(res, 2000));

  // Connect mock friend client on channel 1
  const friendClient = io('http://localhost:3000');
  await new Promise((res) => {
    friendClient.emit('select-channel', { friendId: 1, role: 'Friend', customName: 'TestFriend' }, res);
  });

  // Friend sends text message
  const testSecret = 'FRIEND_MSG_' + Date.now();
  console.log('Friend is sending message:', testSecret);

  friendClient.emit('send-message', {
    type: 'text',
    content: testSecret
  });

  // Wait 2.5 seconds for sync daemon to write to Windows clipboard
  await new Promise((res) => setTimeout(res, 2500));

  // Check Windows clipboard
  const clipOut = execSync('powershell.exe -NoProfile -Command "Get-Clipboard"').toString().trim();
  console.log('Current Windows Clipboard content:', clipOut);

  if (clipOut === testSecret) {
    console.log('\n✅ TEST PASSED: Friend message was written directly to Windows clipboard!');
  } else {
    console.error('\n❌ TEST FAILED: Clipboard does not match friend message.');
    syncProcess.kill();
    friendClient.disconnect();
    process.exit(1);
  }

  syncProcess.kill();
  friendClient.disconnect();
  console.log('Test completed successfully.\n');
  process.exit(0);
}

testClipboardSync().catch((err) => {
  console.error(err);
  process.exit(1);
});
