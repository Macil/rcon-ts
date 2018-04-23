rcon-ts
==============
A modern RCON client implementation written in TypeScript (targeting ES2015) and is async/await friendly.

(Originally `node-modern-rcon`.)

## Installation

```
npm install rcon-ts --save
```

## API

#### Initialization

Creates a new `Rcon` object.

```typescript
import Rcon from 'rcon-ts';
const rcon = new Rcon({
    host: "host-path",
    port: 25575 /*default*/, 
    password: "required",
    timeout: 5000 /*default (5 seconds)*/
});
````

#### Connecting

Connects with the credentials provided in the constructor.
Can be awaited on.
```typescript
rcon.connect();
```

#### Sending

Executes the provided command on the open connection and returns the response.

```typescript
let response = await rcon.send("[rcon request]");
````
#### Disconnecting

Ends the current socket and subsequently signals to any pending request that the connection was disconnected.

```typescript
rcon.disconnect();
````

## Code Example

```typescript
async function sendHelp()
{
	rcon.connect();
	// safe to immediately setup requests without waiting.
	await rcon.send('help');
	rcon.disconnect();
}

sendHelp();
```

or

```typescript
rcon
	.session(async c=> {
		return {
		part1: await c.send('part1'),
			part2: await c.send('part2')
		}
	})
	.then(result=>
		console.log(result));
```

## Factorio

#### Setup:

For usage or testing, make sure you are starting the game from command line or connecting to an rcon configured remote instance.

`factorio.exe --start-server [save-name].zip --rcon-port [port] --rcon-password [password]`

#### Verifying It's Working:

```typescript
rcon
	.session(c=> c.send('/help')) // As what is possible in the current state.
	.then(result=> console.log(result));
```
