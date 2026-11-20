# Portable, Node-free HachiOrb hook handler for Windows PowerShell 5.1+.
# Codex notify passes JSON as an argument; lifecycle hooks, Cursor, and WorkBuddy use stdin.
# Never transmits prompts, assistant text, thinking text, files, or credentials.
param([string]$Event = '', [string]$Payload = '')
$ErrorActionPreference = 'Stop'
    $reply = if($Event -eq 'beforeSubmitPrompt') { '{"continue":true}' } else { '{}' }
try {
    $isCodexHook = $Event.StartsWith('codex:',[System.StringComparison]::OrdinalIgnoreCase)
    $json = if($Event -eq 'codex') {
        if($Payload) { $Payload } elseif($args.Count) { [string]$args[0] } else { '' }
    } elseif($isCodexHook) {
        # Codex lifecycle JSON can contain prompts and tool arguments; drain but never parse it.
        [Console]::In.ReadToEnd() | Out-Null
        ''
    } else { [Console]::In.ReadToEnd() }
    $info = if($isCodexHook -or [string]::IsNullOrWhiteSpace($json)) { [pscustomobject]@{} } else { ConvertFrom-Json -InputObject $json }
    $workbuddy = $Event.StartsWith('workbuddy:',[System.StringComparison]::OrdinalIgnoreCase)
    $agent = if($Event -eq 'codex' -or $isCodexHook) { 'codex' } elseif($workbuddy) { 'workbuddy' } else { 'cursor' }
    $state = $null
    $emotionId = $null
    $attention = $null
    $task = ''
    if($isCodexHook) {
        $eventName = $Event.Substring(6)
        switch($eventName) {
            'UserPromptSubmit' { $state='thinking'; $task='Codex thinking'; break }
            'PreToolUse' { $state='working'; $task='Codex using a tool'; break }
            'PostToolUse' { $state='thinking'; $task='Codex thinking'; break }
            'PermissionRequest' { $state='idle'; $emotionId='35'; $attention='permission'; $task='Codex awaiting permission'; break }
            'SubagentStart' { $state='working'; $task='Codex running a subagent'; break }
            'SubagentStop' { $state='thinking'; $task='Codex reviewing subagent results'; break }
            'Stop' { $state='done'; $task='Codex turn completed'; break }
            'Interrupt' { $state='idle'; $task='Codex turn interrupted'; break }
            'SessionEnd' { $state='idle'; $task='Codex session ended'; break }
            default { break }
        }
    } elseif($Event -eq 'codex') {
        if($info.type -ne 'agent-turn-complete') { return }
        $state = 'done'; $task = 'Codex turn completed'
    } elseif($workbuddy) {
        $eventName = $Event.Substring(10)
        switch($eventName) {
            'SessionStart' { $state='idle'; $task='WorkBuddy session started'; break }
            'UserPromptSubmit' { $state='thinking'; $task='WorkBuddy thinking'; break }
            'PreToolUse' { $state='working'; $task='WorkBuddy using a tool'; break }
            'PostToolUse' { $state='thinking'; $task='WorkBuddy reviewing tool results'; break }
            'PermissionRequest' { $state='idle'; $emotionId='35'; $attention='permission'; $task='WorkBuddy awaiting permission'; break }
            'Notification' {
                if($info.notification_type -eq 'permission_prompt') {
                    $state='idle'; $emotionId='35'; $attention='permission'; $task='WorkBuddy awaiting permission'
                } elseif($info.notification_type -eq 'idle_prompt') {
                    $state='idle'; $emotionId='35'; $attention='input'; $task='WorkBuddy awaiting answer'
                }
                break
            }
            'Stop' { $state='done'; $task='WorkBuddy turn completed'; break }
            'SessionEnd' { $state='idle'; $task='WorkBuddy session ended'; break }
            default { break }
        }
    } else {
        switch($Event) {
            'beforeSubmitPrompt' { $state='thinking'; $task='Cursor thinking'; break }
            'afterAgentThought' { $state='working'; $task='Cursor working'; break }
            'afterFileEdit' { $state='working'; $task='Cursor edited file'; break }
            'stop' {
                if($info.status -eq 'error') { $state='error'; $task='Cursor error' }
                elseif($info.status -eq 'aborted') { $state='idle'; $task='Cursor stopped' }
                else { $state='done'; $task='Cursor turn completed' }
                break
            }
            'sessionEnd' { $state='idle'; $task='Cursor session ended'; break }
            default { break }
        }
    }
    if(-not $state) { return }
    # PowerShell variable names are case-insensitive. Keep this separate from
    # the -Payload string parameter used by the legacy Codex notify adapter.
    $statusPayload = @{ agent=$agent; state=$state; task=$task }
    if($emotionId) { $statusPayload.emotionId=$emotionId }
    if($attention) { $statusPayload.attention=$attention }
    $body = $statusPayload | ConvertTo-Json -Compress
    $bodyBytes = [System.Text.Encoding]::UTF8.GetBytes($body)
    foreach($port in @(4173,4174,4175)) {
        $request = $null
        $stream = $null
        $response = $null
        try {
            # PowerShell's default web proxy can route loopback traffic through
            # HTTP_PROXY (for example Clash), so explicitly bypass all proxies.
            $request = [System.Net.HttpWebRequest]::Create("http://127.0.0.1:$port/api/state")
            $request.Proxy = $null
            $request.Method = 'POST'
            $request.ContentType = 'application/json'
            $request.Timeout = 1000
            $request.ReadWriteTimeout = 1000
            $request.ContentLength = $bodyBytes.Length
            $stream = $request.GetRequestStream()
            $stream.Write($bodyBytes,0,$bodyBytes.Length)
            $stream.Dispose()
            $stream = $null
            $response = $request.GetResponse()
            break
        } catch { continue }
        finally {
            if($stream) { $stream.Dispose() }
            if($response) { $response.Dispose() }
        }
    }
} catch {
    # Observational hooks must never block or reveal private agent payloads.
} finally {
    # Cursor requires valid JSON on stdout; Codex does not.
    if($Event -ne 'codex') { [Console]::Out.WriteLine($reply) }
}
