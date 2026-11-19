'use strict';
// Example: node examples/send-status.cjs working "正在处理报告" codex
const [state='thinking',task='AI 正在思考',agent='manual']=process.argv.slice(2);
const port=Number(process.env.HACHI_PORT||4173);
fetch(`http://127.0.0.1:${port}/api/state`,{
 method:'POST',headers:{'Content-Type':'application/json'},
 body:JSON.stringify({state,task,agent})
}).then(async r=>{const body=await r.json();console.log(JSON.stringify(body,null,2));if(!r.ok)process.exitCode=1})
.catch(e=>{console.error('HachiOrb not running or wrong port:',e.message);process.exitCode=1});
