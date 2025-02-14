import * as net from 'net';
import { Buffer } from 'buffer';
import { ClientPacketType, ServerPacketType } from './protocol';

export class ExtendableError extends Error {
  constructor(message: string = '', public readonly innerException?: Error) {
    super(message);
    this.message = message;
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class RconError extends ExtendableError {
  constructor(message: string, innerException?: Error) {
    super(message, innerException);
    Object.freeze(this);
  }
}

export enum State {
  Disconnected = 0,
  Connecting = 0.5,
  Connected = 1,
  Authorized = 2,
  Refused = -1,
  Unauthorized = -2,
}

type Callback = (data: string | null, error?: Error) => void;

export interface RconConfig {
  host: string;
  port?: number;
  password: string;
  timeout?: number;
}

const Defaults = {
  PORT: 25575,
  TIMEOUT: 5000,
};

export class Rcon implements RconConfig {
  readonly host: string;
  readonly port: number;
  readonly password: string;
  readonly timeout: number;

  enableConsoleLogging: boolean = false;

  private _authPacketId: number = NaN;
  private _state: State = State.Disconnected;
  private _socket: net.Socket | undefined;
  private _lastRequestId: number = 0xf4240;
  private _callbacks: Map<number, Callback> = new Map();
  private _errors: Error[] = [];
  private _connector: Promise<Rcon> | undefined;
  private _sessionCount: number = 0;

  get errors(): Error[] {
    return this._errors.slice();
  }

  get state(): State {
    return this._state;
  }

  constructor(config: RconConfig) {
    let host = config.host;
    this.host = host = host && host.trim();
    if (!host) throw new TypeError('"host" argument cannot be empty');

    this.port = config.port || Defaults.PORT;

    const password = config.password;
    if (!password || !password.trim())
      throw new TypeError('"password" argument cannot be empty');

    this.password = password;
    this.timeout = config.timeout || Defaults.TIMEOUT;
  }

  connect(): Promise<Rcon> {
    let p = this._connector;
    if (!p)
      this._connector = p = new Promise<Rcon>((resolve, reject) => {
        this._state = State.Connecting;
        if (this.enableConsoleLogging)
          console.log(this.toString(), 'Connecting...');
        const s = (this._socket = net.createConnection(this.port, this.host));

        const cleanup = (message?: string, error?: Error): RconError | void => {
          if (error) this._errors.push(error);
          s.removeAllListeners();
          if (this._socket == s) this._socket = undefined;
          if (this._connector == p) this._connector = undefined;
          if (message) {
            if (this.enableConsoleLogging)
              console.error(this.toString(), message);
            if (message) return new RconError(message, error);
          }
        };

        // Look for connection failure...
        s.once('error', (error) => {
          this._state = State.Refused;
          reject(cleanup('Connection refused.', error)); // ** First point of failure.
        });

        // Look for successful connection...
        s.once('connect', () => {
          s.removeAllListeners('error');
          this._state = State.Connected;
          if (this.enableConsoleLogging)
            console.log(this.toString(), 'Connected. Authorizing ...');

          s.on('data', (data) => this._handleResponse(data));

          s.on('error', (error) => {
            this._errors.push(error);
            if (this.enableConsoleLogging)
              console.error(this.toString(), error);
          });

          resolve(
            this._send(this.password, ClientPacketType.AUTH)
              .then(() => {
                this._state = State.Authorized;
                if (this.enableConsoleLogging)
                  console.log(this.toString(), 'Authorized.');
                return this;
              })
              .catch((error) => {
                this._state = State.Unauthorized;
                throw cleanup('Authorization failed.', error); // ** Second point of failure.
              })
          );
        });

        s.once('end', () => {
          if (this.enableConsoleLogging)
            console.warn(this.toString(), 'Disconnected.');
          this._state = State.Disconnected;
          cleanup();
        });
      });
    return p;
  }

  async session<T>(
    context: (rcon: Rcon, sessionId: number) => Promise<T>
  ): Promise<T> {
    const sessionId = ++this._sessionCount;
    let rcon: Rcon | undefined;
    try {
      rcon = await this.connect();
      return await context(rcon, sessionId);
    } finally {
      this._sessionCount--;
      if (!this._sessionCount && rcon) rcon.disconnect();
    }
  }

  toString(): string {
    return `RCON: ${this.host}:${this.port}`;
  }

  disconnect(): void {
    const s = this._socket;
    this._callbacks.clear();
    if (s) s.end();
    this._socket = undefined;
    this._connector = undefined;
  }

  private _handleResponse(data: Buffer): void {
    const len = data.readInt32LE(0);
    if (!len) throw new RconError('Received empty response package');

    let id = data.readInt32LE(4);
    const type = data.readInt32LE(8);
    const callbacks = this._callbacks;
    const authId = this._authPacketId;

    if (
      id === -1 &&
      !isNaN(authId) &&
      type === ServerPacketType.RESPONSE_AUTH
    ) {
      const callback = callbacks.get(authId);
      if (callback) {
        id = authId;
        this._authPacketId = NaN;
        callback(null, new RconError('Authentication failed.'));
        callbacks.delete(id);
      }
    } else {
      const callback = callbacks.get(id);
      if (callback) {
        let str = data.toString('utf8', 12, len + 2);
        if (str.charAt(str.length - 1) === '\n')
          str = str.substring(0, str.length - 1);

        callback(str);
        callbacks.delete(id);
      }
    }
  }

  async send(data: string): Promise<string> {
    if (!this._connector || this._state <= 0)
      throw new RconError('Instance is not connected.');

    await this._connector;
    return await this._send(data, ClientPacketType.COMMAND);
  }

  private async _send(data: string, cmd: number): Promise<string> {
    const s = this._socket;
    if (!s || this._state <= 0)
      throw new RconError('Instance was disconnected.');

    const length = Buffer.byteLength(data);
    const id = ++this._lastRequestId;
    if (cmd === ClientPacketType.AUTH) this._authPacketId = id;

    const buf = Buffer.allocUnsafe(length + 14);
    buf.writeInt32LE(length + 10, 0);
    buf.writeInt32LE(id, 4); // Not sure how this is used or needed.
    buf.writeInt32LE(cmd, 8);
    buf.write(data, 12);
    buf.fill(0x00, length + 12);

    s.write(buf, 'binary');

    return await new Promise<string>((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timeout);
        s.removeListener('end', onEnded);
        s.removeListener('error', onEnded);
        this._callbacks.delete(id);
        if (cmd === ClientPacketType.AUTH) this._authPacketId = NaN;
      };

      const timeout = setTimeout(() => {
        cleanup();
        reject(new RconError('Request timed out'));
      }, this.timeout);

      const onEnded = () => {
        cleanup();
        reject(new RconError('Disconnected before response.'));
      };

      s.once('end', onEnded);
      s.once('error', onEnded);

      this._callbacks.set(id, (data, err) => {
        cleanup();

        if (err) reject(err);
        if (data == null) reject(new RconError('No data returned.'));
        else resolve(data);
      });
    });
  }
}
