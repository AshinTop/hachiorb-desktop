'use strict';
/** Electron Packager creates an asar. These files must also be accessible
 * outside of app.asar so Windows users can double-click the installer.
 */
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const dest=path.join(root,'release','HachiOrb-win32-x64');
const files=[
 'setup-agent-hooks-windows.bat',
 'test-agent-connection-windows.bat',
 'scripts/setup-integrations.cjs',
 'scripts/codex-notify-config.cjs',
 'scripts/setup-agent-hooks.ps1',
 'scripts/test-agent-connection.ps1',
 'examples/send-status.ps1',
 'integrations/codex-notify-dispatcher.cjs',
 'integrations/codex-notify-dispatcher.ps1',
 'integrations/codex-notify.cjs',
 'integrations/codex-hook.cjs',
 'integrations/agent-events.cjs',
 'integrations/local-status.cjs',
 'integrations/agent-status.ps1',
 'integrations/workbuddy-hook.cjs'
];
function stagePortable({source=root,output=dest}={}){
 if(!fs.existsSync(output))throw Error('Portable output missing: '+output);
 for(const relative of files){
  const src=path.join(source,relative),target=path.join(output,relative);
  if(!fs.existsSync(src))throw Error('Cannot stage missing file: '+relative);
  fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(src,target);
 }
 return files;
}
if(require.main===module){const added=stagePortable();console.log('Staged '+added.length+' portable Hook files next to HachiOrb.exe');}
module.exports={stagePortable,files};
