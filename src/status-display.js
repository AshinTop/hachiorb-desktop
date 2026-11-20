/* Compact agent/status names shared between Electron main and browser renderer. */
(function(root){
  'use strict';
  const NAMES=Object.freeze({codex:'Codex',cursor:'Cursor',workbuddy:'WorkBuddy','grok-bot':'Grok Bot',manual:'手动',custom:'自定义'});
  const STATES=Object.freeze({idle:'待机',thinking:'思考中',working:'工作中',done:'本轮完成',error:'出错',sleep:'休息'});
  function agentName(id){return NAMES[id] || (typeof id==='string' ? id.slice(0,40) : '未知 Agent');}
  function stateName(status){
    if(status?.attention==='permission')return '等待授权';
    if(status?.attention==='input')return '等待回答';
    return STATES[status?.state] || '待机';
  }
  const api=Object.freeze({agentName,stateName});
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(root)root.HachiStatus=api;
})(typeof window!=='undefined'?window:null);
