rcon-ts
==============
A modern RCON client implementation written in TypeScript (targeting ES2015) and is async/await friendly.

(Originally `node-modern-rcon`.)

## Installation

```
npm install rcon-ts --save
```

## API

### Initialization

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

### Connecting

Connects with the credentials provided in the constructor.
Can be awaited on.
```typescript
rcon.connect();
```

### Sending

Executes the provided command on the active connection and returns the response.

```typescript
let response = await rcon.send("[rcon request]");
````
### Disconnecting

Ends the current socket and subsequently signals to any pending request that the connection was disconnected.

```typescript
rcon.disconnect();
````

### Sessions

To simplify the usage, you can use the ```session``` method.

```typescript
// Single command:
rcon
  .session(c => c.send("one")) // connects, sends, and then disconnects.
  .then(()=>console.log("first session complete"), console.error);
  
// Multiple commands:
rcon
  .session(async c => {
    await c.send("two");
    await c.send("three");
  })
  .then(()=>console.log("second session complete"), console.error);
````

Any number of conccurrent sessions can be active on a single connection and once they've all completed the connection will end.

```session``` takes a promise factory as a parameter and passes the current Rcon instance as the first param (optional) to the factory.

## Usage Examples

```typescript
async function sendHelp()
{
  rcon.connect();
  // safe to immediately setup requests without waiting.
  console.log(await rcon.send('/help'));
  rcon.disconnect();
}

sendHelp().finally(() =>
{
  const errors = rcon.errors;
  if(errors.length) console.warn("Errors:",errors);
});
```

Or simply...

```typescript
rcon
  .session(c => c.send('/help'))
  .then(console.log, console.error);
```

### Factorio

#### Setup:

For usage or testing, make sure you are starting the game from command line or connecting to an rcon configured remote instance.

`factorio.exe --start-server [save-name].zip --rcon-port [port] --rcon-password [password]`

#### Verifying it's working:

Try either one of [the examples above](#usage-examples).
