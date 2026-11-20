'use strict';
/** Codex lifecycle adapter. Drain stdin without parsing or retaining its private payload. */
const {codexHookEvent}=require('./agent-events.cjs');
const {send}=require('./local-status.cjs');
const kind=process.argv[2]||'';
const status=codexHookEvent(kind);
// Start reporting immediately. Some asynchronous hook runners keep stdin open
// while the child is running, so waiting for EOF can suppress the event entirely.
if(status)send(status).catch(()=>{});
// Consume input without parsing, retaining, or forwarding its potentially private contents.
// The deadline also prevents a detached hook from hanging if the runner leaves stdin open.
const drainDeadline=setTimeout(()=>process.stdin.destroy(),2500);
process.stdin.on('data',()=>{});
process.stdin.once('end',()=>clearTimeout(drainDeadline));
process.stdin.resume();
