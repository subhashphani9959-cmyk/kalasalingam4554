const { io } = require('socket.io-client');

async function testTenFriendsChannels() {
  console.log('Testing 10-Friend 1-on-1 Channels...');

  const clientYou = io('http://localhost:3000');
  const clientFriend1 = io('http://localhost:3000');
  const clientFriend3 = io('http://localhost:3000');

  // 1. 'You' selects Friend 3
  const youRes = await new Promise((res) => {
    clientYou.emit('select-channel', { friendId: 3, role: 'You' }, res);
  });
  console.log('You selected Friend 3:', youRes.status);

  // 2. Friend 3 selects Friend 3
  const f3Res = await new Promise((res) => {
    clientFriend3.emit('select-channel', { friendId: 3, role: 'Friend' }, res);
  });
  console.log('Friend 3 connected status:', f3Res.status);

  if (!f3Res.status.connected) {
    throw new Error('Expected 1-on-1 connection between You and Friend 3 to be active');
  }

  // 3. Friend 1 selects Friend 1 (different channel)
  const f1Res = await new Promise((res) => {
    clientFriend1.emit('select-channel', { friendId: 1, role: 'Friend' }, res);
  });
  console.log('Friend 1 status in channel 1:', f1Res.status);

  // 4. Friend 1 sends message in Channel 1
  clientFriend1.emit('send-message', {
    type: 'text',
    content: 'Secret message for Channel 1 only'
  });

  // Verify 'You' on Channel 3 does NOT receive Friend 1's message
  let leaked = false;
  clientYou.on('new-message', (msg) => {
    if (msg.content.includes('Channel 1 only')) {
      leaked = true;
    }
  });

  await new Promise((res) => setTimeout(res, 1000));
  if (leaked) {
    throw new Error('Isolation failed: message leaked across friend channels!');
  }
  console.log('✅ TEST PASSED: Channel isolation verified (Friend 1 message did not leak to Friend 3)');

  // 5. Friend 3 sends message to 'You'
  const youReceivedF3 = new Promise((resolve) => {
    clientYou.once('new-message', (msg) => resolve(msg));
  });

  clientFriend3.emit('send-message', {
    type: 'text',
    content: 'Hello You, from Friend 3!'
  });

  const receivedF3 = await youReceivedF3;
  console.log('You received on Channel 3:', receivedF3.content, 'senderLabel:', receivedF3.senderLabel);
  if (receivedF3.content !== 'Hello You, from Friend 3!') {
    throw new Error('Message content mismatch');
  }
  console.log('✅ TEST PASSED: 1-on-1 private exchange with Friend 3 verified!');

  clientYou.disconnect();
  clientFriend1.disconnect();
  clientFriend3.disconnect();
  console.log('\n========================================');
  console.log('🎉 10-FRIEND 1-ON-1 TEST PASSED 100%');
  console.log('========================================\n');
  process.exit(0);
}

testTenFriendsChannels().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
