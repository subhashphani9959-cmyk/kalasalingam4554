const { io } = require('socket.io-client');
const { execSync } = require('child_process');

async function testLive() {
  console.log('Testing live clipboard sync with Friend Karthik...');
  const friendClient = io('http://localhost:3000');

  await new Promise((res) => {
    friendClient.emit('select-channel', { friendId: 1, role: 'Friend', customName: 'Karthik' }, res);
  });

  const uniqueSecret = 'HELLO_FROM_KARTHIK_' + Date.now();
  console.log('Sending from friend:', uniqueSecret);

  friendClient.emit('send-message', {
    type: 'text',
    content: uniqueSecret,
    senderRole: 'Friend',
    senderName: 'Karthik'
  });

  await new Promise((res) => setTimeout(res, 2500));

  const clip = execSync('powershell.exe -NoProfile -Command "Get-Clipboard"').toString().trim();
  console.log('Clipboard after friend message:', clip);

  if (clip === uniqueSecret) {
    console.log('\n🎉 SUCCESS: Message from Karthik was copied directly to Windows clipboard!\n');
    friendClient.disconnect();
    process.exit(0);
  } else {
    console.error('\n❌ FAILED: Expected', uniqueSecret, 'got', clip);
    friendClient.disconnect();
    process.exit(1);
  }
}

testLive().catch((e) => {
  console.error(e);
  process.exit(1);
});
