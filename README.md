rcon-ts
==============
A modern RCON client implementation written in TypeScript (targeting ES2015) and is async/await friendly.

(Originally `node-modern-rcon`.)

**NOTE: This has only been tested with Minecraft. So be aware of possible bugs with other server implementations. Feel free to submit a PR if you have any problems.**

## Installation

```
npm install rcon-ts --save
```

## API

#### Initialization

Creates a new `Rcon` object.

```typescript
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

## Example

```typescript
import Rcon from 'rcon-ts';
const rcon = new Rcon('localhost', 'some password');

async function sendHelp()
{
	rcon.connect();
	// safe to immediately setup requests without waiting.
	await rcon.send('help');
	rcon.disconnect();
}

sendHelp();
```
