import { Readable } from 'stream';

export enum ClientPacketType {
  AUTH = 3,
  COMMAND = 2,
}

export enum ServerPacketType {
  RESPONSE_AUTH = 2,
  RESPONSE_VALUE = 0,
}

export interface Packet {
  id: number;
  type: ClientPacketType | ServerPacketType;
  body: string;
}

export function parsePacket(packet: Buffer): Packet {
  const id = packet.readInt32LE(0);
  const type = packet.readInt32LE(4);
  const body = packet.subarray(8, packet.length - 2).toString();
  return { id, type, body };
}

export function createPacketWithLength(packet: Packet): Buffer {
  const bodyLength = Buffer.byteLength(packet.body);
  const length = 10 + bodyLength;
  const buf = Buffer.allocUnsafe(4 + length);
  buf.writeInt32LE(length, 0);
  buf.writeInt32LE(packet.id, 4);
  buf.writeInt32LE(packet.type, 8);
  buf.write(packet.body, 12);
  buf.fill(0, 12 + bodyLength);
  return buf;
}

export async function* packetsFromStream(stream: Readable) {
  let data = Buffer.alloc(0);

  for await (const _chunk of stream) {
    const chunk: Buffer = _chunk;
    if (data.length === 0) {
      data = chunk;
    } else {
      data = Buffer.concat([data, chunk]);
    }

    if (data.length >= 14) {
      const length = data.readInt32LE(0);
      if (data.length + 4 >= length) {
        const packetBuf = data.subarray(4, 4 + length);
        yield parsePacket(packetBuf);
        data = data.subarray(4 + length);
        if (data.length === 0) {
          data = Buffer.alloc(0);
        }
      }
    }
  }

  if (data.length > 0) {
    throw new Error('Incomplete stream');
  }
}
