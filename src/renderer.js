'use strict';
(() => {
 const mount=document.getElementById('orb');
 const label=document.getElementById('label');
 const load=document.getElementById('loading');
 if(!window.GrokBall){load.textContent='原版 Grok Ball 未安装';return;}
 let ball;
 try{ball=window.GrokBall.create(mount,{emotion:'02'});}catch(e){load.textContent='动画初始化失败';console.error(e);return;}
 load.remove();
 let current={state:'idle',emotionId:'02',task:'等待新任务',agent:'manual'};
 let gazeEnabled=true,locked=false,dragging=false,moved=false,downX=0,downY=0,lastMove=0;
 function updateStatus(status){
  if(!status||typeof status.emotionId!=='string')return;
  current=status;ball.setEmotion(status.emotionId);
  const descriptions={idle:'待机',thinking:'思考中',working:'工作中',done:'完成',error:'出错',sleep:'休息'};
  label.textContent=`${descriptions[status.state]||'AI'} · ${status.task||''}`;
  label.hidden=false;
 }
 window.hachi.onState(updateStatus);
 window.hachi.onCursor(point=>{
  if(!gazeEnabled || dragging || !point || typeof point.nx!=='number')return;
  ball.setGaze(point.nx,point.ny);
 });
 window.hachi.onSettings(settings=>{
  gazeEnabled=!!settings.followCursor;
  locked=!!settings.locked;
  if(!gazeEnabled)ball.clearGaze();
 });
 window.hachi.ready().then(({state,settings})=>{updateStatus(state);gazeEnabled=settings.followCursor;locked=settings.locked;});
 mount.addEventListener('pointerdown',e=>{
  if(e.button!==0 || locked)return;
  downX=e.screenX;downY=e.screenY;moved=false;dragging=true;lastMove=0;
  mount.classList.add('dragging');mount.setPointerCapture(e.pointerId);
  window.hachi.moveBegin();
 });
 mount.addEventListener('pointermove',e=>{
  if(!dragging)return;
  if(Math.abs(e.screenX-downX)+Math.abs(e.screenY-downY)>6)moved=true;
  if(moved && performance.now()-lastMove>16){lastMove=performance.now();window.hachi.moveTick();}
 });
 function endDrag(e){
  if(!dragging)return;
  dragging=false;mount.classList.remove('dragging');window.hachi.moveEnd();
  if(e && e.pointerId!=null && mount.hasPointerCapture(e.pointerId))mount.releasePointerCapture(e.pointerId);
  if(!moved){ball.spin(1);}
 }
 mount.addEventListener('pointerup',endDrag);
 mount.addEventListener('pointercancel',()=>endDrag(null));
 mount.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();ball.spin(1);}});
 mount.addEventListener('contextmenu',e=>{e.preventDefault();window.hachi.showMenu();});
 mount.addEventListener('dblclick',e=>e.preventDefault());
})();
