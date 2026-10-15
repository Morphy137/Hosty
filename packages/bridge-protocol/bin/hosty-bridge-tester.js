#!/usr/bin/env node
'use strict';
// hosty-bridge-tester: pretends to be the Hosty daemon so a bridge implementation can be developed and
// validated without Hosty. Every frame the bridge sends is checked against the v1 JSON Schema.
//
//   hosty-bridge-tester --dir ./my-server --instance dev --port 4000 [--action heal:Steve] [--seconds 20]

const path = require('node:path');
const { createTesterServer, writeBridgeConfig, validateMessage } = require('../lib');

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

if (args.includes('--help') || args.includes('-h')) {
  console.log(`Usage: hosty-bridge-tester [options]

  --dir <folder>      Server folder; writes <folder>/.hosty/bridge.json for the bridge to read
  --instance <id>     Instance id the bridge must announce (default: dev)
  --port <number>     Port to listen on (default: 4000)
  --action <a:Name>   After the handshake, send action "a" to player "Name" once (e.g. heal:Steve)
  --seconds <number>  How long to listen before printing the report (default: 15)
  --validate <file>   Validate a JSON file containing one frame (or an array) and exit`);
  process.exit(0);
}

const fileToValidate = option('validate');
if (fileToValidate) {
  const content = JSON.parse(require('node:fs').readFileSync(path.resolve(fileToValidate), 'utf8'));
  let failures = 0;
  for (const frame of Array.isArray(content) ? content : [content]) {
    const result = validateMessage(frame);
    console.log(`${result.ok ? 'OK  ' : 'FAIL'} ${frame.type ?? '(no type)'}${result.ok ? '' : ': ' + result.errors.join('; ')}`);
    if (!result.ok) failures += 1;
  }
  process.exit(failures === 0 ? 0 : 1);
}

const instanceId = option('instance', 'dev');
const port = Number(option('port', '4000'));
const seconds = Number(option('seconds', '15'));
const dir = option('dir');
const actionSpec = option('action');

const url = `ws://127.0.0.1:${port}/telemetry/bridge`;
const config = dir ? writeBridgeConfig(path.resolve(dir), { instanceId, url }) : { token: undefined };
const server = createTesterServer({
  port,
  instanceId,
  token: config.token,
  onEvent(event) {
    if (event.kind === 'hello') {
      const impl = event.hello.implementation;
      console.log(`HELLO  ${event.accepted ? 'accepted' : 'REJECTED'}  ${impl.name} ${impl.version}`);
      console.log(`       capabilities: ${event.hello.capabilities.join(', ') || '(none)'}`);
      if (event.accepted && actionSpec) {
        const [action, player] = actionSpec.split(':');
        const sent = server.sendAction(action, player || 'Player');
        console.log(`ACTION sent: ${JSON.stringify(sent)}`);
      }
    } else if (event.kind === 'frame') {
      console.log(`frame  ${event.message.type} ok`);
    } else if (event.kind === 'invalid') {
      console.log(`INVALID ${event.type ?? ''}: ${(event.errors || [event.error]).join('; ')}`);
    }
  }
});

console.log(`Listening on ${url}${dir ? `  (wrote ${path.join(dir, '.hosty', 'bridge.json')})` : ''}`);
if (config.token) console.log(`Token: ${config.token}`);

setTimeout(async () => {
  const { report } = server;
  const counts = report.frames.reduce((acc, frame) => ({ ...acc, [frame.type]: (acc[frame.type] || 0) + 1 }), {});
  console.log('\n--- report ---');
  console.log('handshake:', report.handshake ? (report.handshake.accepted ? 'accepted' : 'rejected') : 'no HELLO received');
  console.log('frames:', JSON.stringify(counts));
  console.log('invalid frames:', report.invalid);
  await server.close();
  process.exit(report.handshake?.accepted && report.invalid === 0 ? 0 : 1);
}, seconds * 1000);
