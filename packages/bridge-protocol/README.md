# @hosty/bridge-protocol

JSON Schema, validator and a simulated daemon for the [Hosty bridge protocol](../../docs/bridge-protocol.md).

```bash
# Pretend to be Hosty so your bridge can connect (writes ./my-server/.hosty/bridge.json)
npx hosty-bridge-tester --dir ./my-server --instance dev --port 4000 --seconds 60

# Also send an action once the handshake completes
npx hosty-bridge-tester --dir ./my-server --action heal:Steve

# Validate recorded frames
npx hosty-bridge-tester --validate frames.json
```

```js
const { validateMessage, createTesterServer } = require('@hosty/bridge-protocol');
validateMessage({ type: 'RESULT', success: true }); // { ok: true, errors: [] }
```
