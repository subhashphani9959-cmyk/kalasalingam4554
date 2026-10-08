const { io } = require('socket.io-client');

function waitForEvent(socket, event) {
  return new Promise((resolve) => socket.once(event, resolve));
}

async function testZeroCodeBoard() {
  console.log('Testing Zero-Code QuickBoard...');
  const client1 = io('http://localhost:3000');
  const client2 = io('http://localhost:3000');

  const [init1, init2] = await Promise.all([
    waitForEvent(client1, 'init-board'),
    waitForEvent(client2, 'init-board')
  ]);

  console.log('Client 1 init received. Peer count:', init1.peerCount);
  console.log('Client 2 init received. Peer count:', init2.peerCount);

  // Send message from client 1
  const msgPromise = waitForEvent(client2, 'new-message');
  client1.emit('send-message', {
    type: 'text',
    content: 'Instant message without room code!'
  });

  const received = await msgPromise;
  console.log('Client 2 received message:', received.content);
  if (received.content === 'Instant message without room code!') {
    console.log('✅ TEST PASSED: Direct board broadcast verified!');
  } else {
    throw new Error('Message content mismatch');
  }

  client1.disconnect();
  client2.disconnect();
  console.log('Zero-code board test completed successfully.');
  process.exit(0);
}

testZeroCodeBoard().catch((err) => {
  console.error(err);
  process.exit(1);
});
