'use strict';
/** Codex lifecycle adapter. Drain stdin without parsing or retaining its private payload. */
const {codexHookEvent}=require('./agent-events.cjs');
const {send}=require('./local-status.cjs');
const kind=process.argv[2]||'';
process.stdin.resume();
process.stdin.on('end',async()=>{
 const status=codexHookEvent(kind);
 if(!status)return;
 try{await send(status)}catch{/* Best-effort local status; never affect Codex. */}
});
