'use strict';
/** Translate documented Agent events without copying prompts, reasoning or tool output. */
const path=require('node:path');
function briefProject(d){
 if(typeof d!=='string'||!d.trim())return '';
 return path.basename(d.replace(/[\\/]+$/g,'')).replace(/[\r\n\t]/g,' ').slice(0,38);
}
function codexEvent(input){
 if(!input||input.type!=='agent-turn-complete')return null;
 const proj=briefProject(input.cwd);
 return {agent:'codex',state:'done',task:proj?`Codex · ${proj} 任务完成`:'Codex 任务完成'};
}
function cursorEvent(kind,input={}){
 const project=Array.isArray(input.workspace_roots)?briefProject(input.workspace_roots[0]):briefProject(input.cwd);
 const task=project?`Cursor · ${project}`:'Cursor Agent';
 switch(kind){
  case 'beforeSubmitPrompt': return {agent:'cursor',state:'thinking',task:`${task} 正在思考`};
  case 'afterAgentThought': return {agent:'cursor',state:'working',task:`${task} 正在处理`};
  case 'afterFileEdit': return {agent:'cursor',state:'working',task:`${task} 已修改文件`};
  case 'stop': return {agent:'cursor',state:input.status==='error'?'error':input.status==='aborted'?'idle':'done',task:input.status==='error'?`${task} 出错`:input.status==='aborted'?`${task} 已停止`:`${task} 已完成`};
  case 'sessionEnd': return {agent:'cursor',state:'idle',task:'Cursor 会话已结束'};
  default: return null;
 }
}
/** WorkBuddy Desktop hook adapter: use only event metadata, never prompt/tool payload. */
function workbuddyEvent(kind,input={}){
  const base={agent:'workbuddy'};
  switch(kind){
    case 'SessionStart': return {...base,state:'idle',task:'WorkBuddy 会话已启动'};
    case 'UserPromptSubmit': return {...base,state:'thinking',task:'WorkBuddy 正在思考'};
    case 'PreToolUse':
    case 'PostToolUse': return {...base,state:'working',task:'WorkBuddy 正在执行工具'};
    case 'PermissionRequest': return {...base,state:'idle',emotionId:'35',attention:'permission',task:'WorkBuddy 等待授权'};
    case 'Notification': {
      if(input?.notification_type==='permission_prompt')return {...base,state:'idle',emotionId:'35',attention:'permission',task:'WorkBuddy 等待权限确认'};
      if(input?.notification_type==='idle_prompt')return {...base,state:'idle',emotionId:'35',attention:'input',task:'WorkBuddy 等待回答'};
      return null;
    }
    case 'Stop': return {...base,state:'done',task:'WorkBuddy 本轮任务已结束'};
    case 'SessionEnd': return {...base,state:'idle',task:'WorkBuddy 会话已结束'};
    default: return null;
  }
}
module.exports={codexEvent,cursorEvent,workbuddyEvent,briefProject};
