const CDP = require('chrome-remote-interface');

async function draw() {
  const client = await CDP();
  const { Input } = client;

  const startX = 400;
  const startY = 500;
  const endX = 800;
  const endY = 500;

  await Input.dispatchMouseEvent({ type: 'mousePressed', x: startX, y: startY, button: 'left', clickCount: 1 });
  await Input.dispatchMouseEvent({ type: 'mouseMoved', x: (startX + endX) / 2, y: startY, button: 'left' });
  await Input.dispatchMouseEvent({ type: 'mouseMoved', x: endX, y: endY, button: 'left' });
  await Input.dispatchMouseEvent({ type: 'mouseReleased', x: endX, y: endY, button: 'left', clickCount: 1 });

  client.close();
}
draw();
