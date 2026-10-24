const net = require('node:net');

const host = process.argv[2];
if (!host) {
  console.error('usage: node tcp-proxy.cjs <wsl-host>');
  process.exit(1);
}

function proxy(listenPort, targetPort) {
  const server = net.createServer((client) => {
    const upstream = net.connect({ host, port: targetPort }, () => {
      client.pipe(upstream);
      upstream.pipe(client);
    });
    upstream.on('error', () => client.destroy());
    client.on('error', () => upstream.destroy());
  });
  server.listen(listenPort, '127.0.0.1', () => {
    console.log('proxy ' + listenPort + ' -> ' + host + ':' + targetPort);
  });
}

proxy(28243, 28244);
proxy(7077, 7078);
