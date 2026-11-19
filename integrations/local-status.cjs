'use strict';
/** Fast best-effort localhost status sender. No remote requests, API keys or dependencies. */
const http=require('node:http');
const PORTS=[4173,4174,4175];
function postPort(port,payload,timeout=400){
 return new Promise((resolve,reject)=>{
  const body=Buffer.from(JSON.stringify(payload));
  const req=http.request({hostname:'127.0.0.1',port,path:'/api/state',method:'POST',timeout,
    headers:{'Content-Type':'application/json','Content-Length':body.length}},res=>{
   const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>{
    if(res.statusCode===200)resolve(true);
    else reject(Error('HTTP '+res.statusCode+': '+Buffer.concat(chunks).toString().slice(0,160)));
   });
  });
  req.on('timeout',()=>req.destroy(Error('Timeout')));req.on('error',reject);req.end(body);
 });
}
async function send(payload,{ports=PORTS,timeout=400}={}){
 for(const port of ports){try{await postPort(port,payload,timeout);return true;}catch{/* local app may be offline or using another port */}}
 return false;
}
module.exports={send,PORTS};
