import * as net from 'net';
import {Buffer} from 'buffer';

class ExtendableError extends Error {
	constructor(message: string = '') {
		super(message);
		this.message = message;
		this.name = this.constructor.name;
		Error.captureStackTrace(this, this.constructor);
	}
}

class RconError extends ExtendableError {
	constructor(message: string) {
		super(message);
	}
}

export const enum State {
	Disconnected = 0,
	Connecting = 0.5,
	Connected = 1,
	Authorized = 1.5,
	Rejected = -1
}

const enum PacketType {
	AUTH = 0x03, // outgoing
	COMMAND = 0x02, // outgoing
	RESPONSE_AUTH = 0x02 // incoming
}

type Callback = (data: string | null, error?: Error) => void;

export interface RconConfig {
	host: string;
	port?: number;
	password: string;
	timeout?: number;
}

export class Rcon implements RconConfig {
	readonly host: string;
	readonly port: number;
	readonly password: string;
	readonly timeout: number;

	private _authPacketId: number = NaN;
	private _state: State = State.Disconnected;
	private _socket: net.Socket | undefined;
	private _callbacks: Map<number, Callback> = new Map();
	private _errors: Error[] = [];
	get errors(): Error[] {
		return this._errors.slice();
	}

	get state(): State {
		return this._state;
	}

	constructor(config: RconConfig) {
		let host = config.host;
		this.host = host = host && host.trim();
		if (!host)
			throw new TypeError('"host" argument cannot be empty');

		this.port = config.port || 25575;

		const password = config.password;
		if (!password || !password.trim())
			throw new TypeError('"password" argument cannot be empty');

		this.password = password;
		this.timeout = config.timeout || 5000;
	}

	private _connector: Promise<Rcon> | undefined;

	connect(): Promise<Rcon> {
		const _ = this;
		let p = _._connector;
		if (!p) _._connector = p = new Promise<Rcon>((resolve, reject) => {
			_._state = State.Connecting;
			const s = net.createConnection(_.port, _.host);

			function cleanup() {
				if (_._socket == s) _._socket = undefined;
				if (_._connector == p) _._connector = undefined;
			}

			s.on('connect', () => {
				_._state = State.Connected;
				_.send(_.password, PacketType.AUTH).then(() => {
					_._state = State.Authorized;
					return resolve(_);
				}).catch(reason => {
					_._state = State.Rejected;
					cleanup();
					reject(reason);
				});
			});
			s.on('data', data => _._handleResponse(data));
			s.on('error', error => _._errors.push((error)));
			s.on('end', () => {
				_._state = State.Disconnected;
				cleanup();
			});
		});
		return p;
	}

	disconnect(): void {
		const s = this._socket;
		if (s) s.end();
	}

	_handleResponse(data: Buffer): void {
		const len = data.readInt32LE(0);
		if (!len) throw new RconError('Received empty response package');

		let id = data.readInt32LE(4);
		const type = data.readInt32LE(8);
		const callbacks = this._callbacks;
		const authId = this._authPacketId;
		if (id === -1 && !isNaN(authId) && type === PacketType.RESPONSE_AUTH) {
			if (callbacks.has(authId)) {
				id = authId;
				this._authPacketId = NaN;
				callbacks.get(authId)!(null, new RconError('Authentication failed'));
			}
		}
		else if (callbacks.has(id)) {
			let str = data.toString('utf8', 12, len + 2);
			if (str.charAt(str.length - 1) === '\n')
				str = str.substring(0, str.length - 1);

			callbacks.get(id)!(str);
		}

		callbacks.delete(id); // Possibly superfluous but best to be sure.
	}

	private _lastRequestId: number = 0xF4240;

	async send(data: string, cmd?: number): Promise<string> {
		cmd = cmd || PacketType.COMMAND;
		if (!this._connector)
			throw new RconError('Instance is not connected.');

		await this._connector;
		const s = this._socket;
		if (!s || this._state <= 0)
			throw new RconError('Instance was disconnected.');

		const length = Buffer.byteLength(data);
		const id = ++this._lastRequestId;
		if (cmd === PacketType.AUTH) this._authPacketId = id;

		const buf = Buffer.allocUnsafe(length + 14);
		buf.writeInt32LE(length + 10, 0);
		buf.writeInt32LE(id, 4); // Not sure how this is used or needed.
		buf.writeInt32LE(cmd, 8);
		buf.write(data, 12);
		buf.fill(0x00, length + 12);

		await s.write(buf, 'binary');

		return await new Promise<string>((resolve, reject) => {

			const cleanup = () => {
				clearTimeout(timeout);
				s.removeListener('end', onEnded);
				this._callbacks.delete(id);
				if (cmd === PacketType.AUTH) this._authPacketId = NaN;
			};

			const timeout = setTimeout(() => {
				cleanup();
				reject(new RconError('Request timed out'));
			}, this.timeout);

			const onEnded = ()=>{
				cleanup();
				reject(new RconError('Disconnected before response'));
			};

			s.once('end', onEnded);

			this._callbacks.set(id, (data, err) => {
				cleanup();

				if (err) reject(err);
				if (data == null) reject(new RconError("No data returned."));
				else resolve(data);
			});
		});
	}
}

export default Rcon;