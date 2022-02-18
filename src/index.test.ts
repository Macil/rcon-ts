import { EventEmitter } from 'events';
import { AddressInfo, Server, Socket } from 'net';
import { Rcon } from '.';
import {
  ClientPacketType,
  createPacketWithLength,
  packetsFromStream,
  ServerPacketType,
} from './protocol';

class RconServer extends EventEmitter {
  private server: Server;

  constructor(connHandler: (socket: Socket) => void) {
    super();
    this.server = new Server(connHandler);
    this.server.on('error', (err) => {
      this.emit('error', err);
    });
  }

  listen(signal?: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
      this.server.listen(
        {
          port: 0,
          host: 'localhost',
          signal,
        },
        resolve
      );
    });
  }

  address() {
    return this.server.address() as AddressInfo;
  }

  close(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.close((err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }
}

let abortSignal: AbortSignal;
{
  let abortController: AbortController;
  beforeEach(() => {
    abortController = new AbortController();
    abortSignal = abortController.signal;
  });
  afterEach(() => {
    abortController.abort();
  });
}

test('basic', async () => {
  const server = new RconServer(async (socket) => {
    const it = packetsFromStream(socket);
    try {
      let result = await it.next();
      expect(result.done).toBe(false);
      expect(result.value!.type).toBe(ClientPacketType.AUTH);
      expect(result.value!.body).toBe('abc');
      socket.write(
        createPacketWithLength({
          id: result.value!.id,
          type: ServerPacketType.RESPONSE_AUTH,
          body: '',
        })
      );

      result = await it.next();
      expect(result.done).toBe(false);
      expect(result.value!.type).toBe(ClientPacketType.COMMAND);
      expect(result.value!.body).toBe('hello!');
      socket.write(
        createPacketWithLength({
          id: result.value!.id,
          type: ServerPacketType.RESPONSE_VALUE,
          body: 'Hey there!',
        })
      );

      result = await it.next();
      expect(result.done).toBe(false);
      expect(result.value!.type).toBe(ClientPacketType.COMMAND);
      expect(result.value!.body).toBe('bye');
      socket.write(
        createPacketWithLength({
          id: result.value!.id,
          type: ServerPacketType.RESPONSE_VALUE,
          body: 'Shutting down!',
        })
      );
    } finally {
      socket.end();
      await it.return();
    }
  });

  await server.listen(abortSignal);
  const address = server.address();

  const rcon = new Rcon({
    host: address.address,
    port: address.port,
    password: 'abc',
  });
  await rcon.connect();

  {
    const response = await rcon.send('hello!');
    expect(response).toBe('Hey there!');
  }

  {
    const response = await rcon.send('bye');
    expect(response).toBe('Shutting down!');
  }
});
