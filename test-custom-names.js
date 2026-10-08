const { io } = require('socket.io-client');

async function testCustomNames() {
  console.log('Testing Custom Friend Names...');

  const clientYou = io('http://localhost:3000');
  const clientFriend = io('http://localhost:3000');

  // 1. 'You' selects Channel 2
  const youRes = await new Promise((res) => {
    clientYou.emit('select-channel', { friendId: 2, role: 'You', customName: 'David' }, res);
  });
  console.log('You connected. Channel 2 status:', youRes.status.friendName);

  // 2. Friend connects to Channel 2 with custom name 'Rahul'
  const namesPromise = new Promise((resolve) => {
    clientYou.on('names-updated', (names) => {
      if (names[2] === 'Rahul') resolve(names);
    });
  });

  const fRes = await new Promise((res) => {
    clientFriend.emit('select-channel', { friendId: 2, role: 'Friend', customName: 'Rahul' }, res);
  });
  console.log('Friend joined Channel 2 with name Rahul:', fRes.friendName);

  const updatedNames = await namesPromise;
  console.log('Channel names globally broadcast:', updatedNames);

  // 3. Friend sends message
  const youReceived = new Promise((resolve) => {
    clientYou.once('new-message', (msg) => resolve(msg));
  });

  clientFriend.emit('send-message', {
    type: 'text',
    content: 'Hi David! This is Rahul.',
    senderName: 'Rahul'
  });

  const msg = await youReceived;
  console.log('Received message from friend:', msg.content, 'senderName:', msg.senderName);
  if (msg.senderName !== 'Rahul') {
    throw new Error('Expected senderName to be Rahul');
  }

  // 4. Test dynamic renaming
  const renamePromise = new Promise((resolve) => {
    clientYou.on('names-updated', (names) => {
      if (names[2] === 'Rahul Sharma') resolve(names);
    });
  });

  await new Promise((res) => {
    clientFriend.emit('set-name', { friendId: 2, name: 'Rahul Sharma', role: 'Friend' }, res);
  });

  const renames = await renamePromise;
  console.log('Renamed Channel 2 to:', renames[2]);

  clientYou.disconnect();
  clientFriend.disconnect();
  console.log('\n========================================');
  console.log('🎉 CUSTOM FRIEND NAMES TEST PASSED 100%');
  console.log('========================================\n');
  process.exit(0);
}

testCustomNames().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
