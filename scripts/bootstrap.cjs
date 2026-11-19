'use strict';
/** Download *exact upstream* Grok Ball JS and verify its Git blob SHA-1. MIT. */
const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const {createHash} = require('node:crypto');
const target = path.resolve(__dirname, '../vendor/grok-ball.js');
const commit = 'de368ce3acdc5a70e871ee46ebbe8f60b11d3d6a';
const expectedBlob = '9628dfce2cd35722dc472adde4defa24291b377f';
const urls = [
 `https://raw.githubusercontent.com/TyCoding/grok-ball/${commit}/src/grok-ball.js`,
 `https://cdn.jsdelivr.net/gh/TyCoding/grok-ball@${commit}/src/grok-ball.js`
];
function gitBlobHash(bytes) {
 return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
}
function verified(bytes) {return bytes.length>80000 && gitBlobHash(bytes)===expectedBlob;}
function get(url, redirects=0) {
 if (redirects>4) return Promise.reject(Error('Too many redirects'));
 return new Promise((resolve,reject)=>{
  const req = https.get(url,{headers:{'User-Agent':'HachiOrb/1.0','Accept':'application/javascript'}},res=>{
   if(res.statusCode>=300 && res.statusCode<400 && res.headers.location){
    res.resume(); get(new URL(res.headers.location,url).href,redirects+1).then(resolve,reject);return;
   }
   if(res.statusCode!==200){res.resume();reject(Error('HTTP '+res.statusCode));return;}
   let n=0; const chunks=[];
   res.on('data',b=>{n+=b.length;if(n>500000){req.destroy(Error('File size limit exceeded'));return;}chunks.push(b);});
   res.on('end',()=>resolve(Buffer.concat(chunks)));res.on('error',reject);
  });
  req.setTimeout(20000,()=>req.destroy(Error('Download timeout')));
  req.on('error',reject);
 });
}
async function bootstrap(){
 if(fs.existsSync(target) && verified(fs.readFileSync(target))){console.log('✔ Original Grok Ball runtime verified (offline ready).');return;}
 fs.mkdirSync(path.dirname(target),{recursive:true});
 for(const url of urls){
  try{
   console.log('Downloading verified original from',new URL(url).hostname,'…');
   const buf=await get(url);
   if(!verified(buf)) throw Error('Git blob checksum mismatch: refusing unverified script');
   fs.writeFileSync(target+'.tmp',buf);fs.renameSync(target+'.tmp',target);
   console.log('✔ Exact original Grok Ball engine verified and saved locally.');return;
  }catch(e){console.error('  '+e.message);}
 }
 throw Error('Original engine download failed. Connect to the internet and try again. Nothing unverified was installed.');
}
if(require.main===module)bootstrap().catch(e=>{console.error(e.message);process.exitCode=1});
module.exports={gitBlobHash,verified,bootstrap};
