const { io } = require('socket.io-client');

async function testRoleSync() {
  console.log('Testing Role Switch (You vs Friend)...');
  const clientYou = io('http://localhost:3000');
  const clientFriend = io('http://localhost:3000');

  await Promise.all([
    new Promise((res) => clientYou.once('init-board', res)),
    new Promise((res) => clientFriend.once('init-board', res))
  ]);

  // Friend client receives message
  const friendReceived = new Promise((resolve) => {
    clientFriend.once('new-message', (msg) => {
      resolve(msg);
    });
  });

  clientYou.emit('send-message', {
    type: 'text',
    content: 'Message from You',
    senderRole: 'You'
  });

  const msg1 = await friendReceived;
  console.log('Received msg1 senderRole:', msg1.senderRole);
  if (msg1.senderRole !== 'You') throw new Error('Expected senderRole to be You');

  // You client receives message from Friend
  const youReceived = new Promise((resolve) => {
    clientYou.once('new-message', (msg) => {
      resolve(msg);
    });
  });

  clientFriend.emit('send-message', {
    type: 'text',
    content: 'Message from Friend',
    senderRole: 'Friend'
  });

  const msg2 = await youReceived;
  console.log('Received msg2 senderRole:', msg2.senderRole);
  if (msg2.senderRole !== 'Friend') throw new Error('Expected senderRole to be Friend');

  clientYou.disconnect();
  clientFriend.disconnect();
  console.log('✅ TEST PASSED: Both You and Friend roles verified successfully!');
  process.exit(0);
}

testRoleSync().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
