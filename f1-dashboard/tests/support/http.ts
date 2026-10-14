import type { Server } from 'node:http';
export async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('The fixture server did not open a TCP port.');
  return `http://127.0.0.1:${address.port}`;
}
