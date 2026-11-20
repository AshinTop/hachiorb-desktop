'use strict';
/** Catalog pinned to AshinTop/grok-ball-pro @ 308db672. Matches GrokBall.BODIES. */
const BODIES=Object.freeze([
 {id:'classic',name:'经典白球'},
 {id:'midnight',name:'经典黑球'},
 {id:'encore',name:'阿信粉球'},
 {id:'red',name:'怪兽红球'},
 {id:'sunshine',name:'玛莎黄球'},
 {id:'jade',name:'石头绿球'},
 {id:'backbeat',name:'冠佑眼镜蓝球'},
 {id:'night-seed',name:'蓝色梦想倔强卜卜'},
 {id:'sprout',name:'胡萝卜卜卜'}
].map(Object.freeze));
const ids=new Set(BODIES.map(x=>x.id));
function validBody(id){return typeof id==='string'&&ids.has(id)}
function normalizeBody(id){return validBody(id)?id:'classic'}
function bodyName(id){return BODIES.find(b=>b.id===id)?.name||BODIES[0].name}
module.exports={BODIES,validBody,normalizeBody,bodyName};
