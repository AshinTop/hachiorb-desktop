# PowerShell fallback: preserve existing Codex notify via composite dispatcher.
# Preserves unrelated hooks and backs up existing configuration before changing it.
$ErrorActionPreference = 'Stop'
$repo = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$handlerSource = Join-Path $repo 'integrations\agent-status.ps1'
# Register hooks against a stable user directory, so moving/deleting the ZIP does not break them.
$handler = Join-Path $env:LOCALAPPDATA 'HachiOrb\hooks\agent-status.ps1'
$homeFolder = [Environment]::GetFolderPath('UserProfile')
$utf8 = New-Object System.Text.UTF8Encoding($false)
$failures = 0
if (-not (Test-Path -LiteralPath $handlerSource -PathType Leaf)) {
    Write-Host '[ERROR] Hook handler is missing. Extract the whole repository ZIP first.' -ForegroundColor Red
    exit 1
}
$hookFolder = Split-Path -Parent $handler
if (-not (Test-Path -LiteralPath $hookFolder)) { New-Item -ItemType Directory -Path $hookFolder -Force | Out-Null }
Copy-Item -LiteralPath $handlerSource -Destination $handler -Force
Write-Host "[OK] Hook handler staged: $handler"
function Backup-IfExists([string]$file) {
    if (Test-Path -LiteralPath $file -PathType Leaf) {
        $backup = "$file.hachiorb-backup-$(Get-Date -Format 'yyyyMMdd-HHmmss-fff')"
        Copy-Item -LiteralPath $file -Destination $backup -ErrorAction Stop
        Write-Host "[BACKUP] $backup"
    }
}
function Write-Config([string]$file, [string]$contents) {
    $folder = Split-Path -Parent $file
    if (-not (Test-Path -LiteralPath $folder)) { New-Item -ItemType Directory -Path $folder -Force | Out-Null }
    Backup-IfExists $file
    $tmp = "$file.hachiorb-tmp"
    [System.IO.File]::WriteAllText($tmp, $contents, $utf8)
    Move-Item -LiteralPath $tmp -Destination $file -Force
}
function Quote-Toml([string]$value) {
    return (ConvertTo-Json -InputObject $value -Compress)
}
function Install-Codex {
    $file = Join-Path $homeFolder '.codex\config.toml'
    $content = if(Test-Path -LiteralPath $file -PathType Leaf) { [System.IO.File]::ReadAllText($file) } else { '' }
    # This fallback safely supports one-line, double-quoted TOML string arrays.
    if($content.Contains('"""') -or $content.Contains("'''")) {
        throw 'Codex config contains multiline TOML strings; please merge notify manually.'
    }
    $firstSection = [regex]::Match($content, '(?m)^\s*\[.+$')
    $root = if($firstSection.Success) { $content.Substring(0,$firstSection.Index) } else { $content }
    if([regex]::IsMatch($root,'(?m)^\s*["'']notify["'']\s*=')) { throw 'Quoted notify key requires manual configuration.' }
    $matchesRoot = [regex]::Matches($root, '(?m)^[ \t]*notify[ \t]*=.*(?:\r?\n|$)')
    if($matchesRoot.Count -gt 1) { throw 'Duplicate top-level notify keys; leaving config unchanged.' }
    $original = $null
    $previous = $null
    $manifest = Join-Path $hookFolder 'codex-original-notify.json'
    $dispatcher = Join-Path $hookFolder 'codex-notify-dispatcher.ps1'
    $newCommand = @('powershell.exe','-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',$dispatcher)
    if($matchesRoot.Count -eq 1) {
        $previous = $matchesRoot[0]
        $line = $previous.Value.Trim()
        $parsed = [regex]::Match($line,'^notify\s*=\s*(?<json>\[.*?\])\s*(?:#.*)?$')
        if(-not $parsed.Success) { throw 'Cannot safely parse Codex notify; manually merge the existing config.' }
        try { $existing = @(ConvertFrom-Json -InputObject $parsed.Groups['json'].Value) }
        catch { throw 'Existing Codex notify is not a simple string array; leaving it unchanged.' }
        if($existing.Count -lt 1 -or [string]::IsNullOrWhiteSpace([string]$existing[0])) { throw 'Existing Codex notify has no executable.' }
        foreach($arg in $existing) { if($arg -isnot [string]) { throw 'Existing Codex notify must contain strings only.' } }
        $isDispatcher = @($existing | Where-Object { $_ -match 'codex-notify-dispatcher\.(?:cjs|ps1)' }).Count -gt 0
        if($isDispatcher) {
            if(-not (Test-Path -LiteralPath $manifest -PathType Leaf)) {
                throw 'Dispatcher already configured but original notify manifest is missing; manual recovery needed.'
            }
            $old = Get-Content -LiteralPath $manifest -Raw -Encoding UTF8 | ConvertFrom-Json
            if($old.version -ne 1) { throw 'Unsupported existing dispatcher manifest.' }
            $known = @($existing | Where-Object { $_ -match 'codex-notify-dispatcher\.(?:cjs|ps1)$' })
            $knownExpected = @($known | Where-Object { ([string]$_).ToLowerInvariant() -eq $dispatcher.ToLowerInvariant() -or ([string]$_).ToLowerInvariant() -eq (Join-Path $hookFolder 'codex-notify-dispatcher.cjs').ToLowerInvariant() })
            if($knownExpected.Count -eq 0) { throw 'Unknown dispatcher path; refusing to wrap it recursively.' }
            Write-Host '[OK] Codex composite dispatcher already installed; original notify preserved.'
            return
        }
        $legacy = @($existing | Where-Object { $_ -match 'codex-notify\.cjs$|agent-status\.ps1$' -and $_ -match 'hachiorb' }).Count -gt 0
        if(-not $legacy) { $original = @($existing) }
    }
    foreach($name in @('codex-notify-dispatcher.ps1','codex-notify-dispatcher.cjs','codex-notify.cjs','agent-events.cjs','local-status.cjs')) {
        $source = Join-Path $repo ('integrations\' + $name)
        if(-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw "Missing $name; extract the whole ZIP before installing." }
        Copy-Item -LiteralPath $source -Destination (Join-Path $hookFolder $name) -Force
    }
    $line = 'notify = ' + (ConvertTo-Json -InputObject $newCommand -Compress)
    $replacement = $line + "`r`n"
    if($null -ne $previous) {
        $next = $content.Remove($previous.Index,$previous.Length).Insert($previous.Index,$replacement)
    } else { $next = $replacement + $content }
    # Backup old configuration and existing saved original command first.
    $info = @{ version=1; originalNotify=$original; installedBy='powershell'; createdAt=[DateTime]::UtcNow.ToString('o') }
    Write-Config $manifest ((ConvertTo-Json -InputObject $info -Depth 12) + "`r`n")
    Write-Config $file $next
    Write-Host "[OK] Codex composite dispatcher installed: $file"
    if($null -ne $original) { Write-Host '[OK] Previous Codex notify stored and will run first.' }
}
function Install-Cursor {
    $file = Join-Path $homeFolder '.cursor\hooks.json'
    if(Test-Path -LiteralPath $file -PathType Leaf) {
        $data = Get-Content -LiteralPath $file -Raw -Encoding UTF8 | ConvertFrom-Json
    } else { $data = [pscustomobject]@{ version = 1; hooks = [pscustomobject]@{} } }
    if($null -eq $data -or $data -isnot [pscustomobject]) { throw 'Existing Cursor hooks.json is not a JSON object.' }
    if($data.PSObject.Properties.Name -contains 'version') {
        if([string]$data.version -ne '1') { throw "Unsupported Cursor hooks.json version $($data.version); leaving it unchanged." }
    } else { $data | Add-Member -NotePropertyName version -NotePropertyValue 1 }
    if(-not ($data.PSObject.Properties.Name -contains 'hooks')) {
        $data | Add-Member -NotePropertyName hooks -NotePropertyValue ([pscustomobject]@{})
    }
    if($data.hooks -isnot [pscustomobject]) { throw 'Existing Cursor hooks field is not an object; no changes made.' }
    $changed = $false
    foreach($eventName in @('beforeSubmitPrompt','afterAgentThought','afterFileEdit','stop','sessionEnd')) {
        $command = 'powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "' + $handler + '" -Event ' + $eventName
        $prop = $data.hooks.PSObject.Properties[$eventName]
        if($null -eq $prop) {
            $data.hooks | Add-Member -NotePropertyName $eventName -NotePropertyValue @([pscustomobject]@{ command=$command })
            $changed = $true
        } else {
            if($null -ne $prop.Value -and $prop.Value -isnot [array]) { throw "Cursor $eventName hook is not an array; no changes made." }
            $existingItems = @($prop.Value)
            # Replace only HachiOrb's own legacy Node hook, not other tools' hooks.
            $legacyItems = @($existingItems | Where-Object { $_ -and $_.command -match 'hachiorb[^\"]*cursor-hook\.cjs' })
            if($legacyItems.Count -gt 0) {
                $existingItems = @($existingItems | Where-Object { -not ($_ -and $_.command -match 'hachiorb[^\"]*cursor-hook\.cjs') })
                $changed = $true
            }
            $exists = @($existingItems | Where-Object { $_ -and $_.command -eq $command }).Count -gt 0
            if(-not $exists) {
                $existingItems = @($existingItems) + @([pscustomobject]@{command=$command})
                $changed = $true
            }
            $prop.Value = @($existingItems)
        }
    }
    if($changed) {
        Write-Config $file ((ConvertTo-Json -InputObject $data -Depth 64) + "`r`n")
        Write-Host "[OK] Cursor hooks installed: $file"
    } else { Write-Host '[OK] Cursor hooks already installed.' }
}
function Install-WorkBuddy {
    $file = Join-Path $homeFolder '.workbuddy\settings.json'
    if(Test-Path -LiteralPath $file -PathType Leaf) {
        $data = Get-Content -LiteralPath $file -Raw -Encoding UTF8 | ConvertFrom-Json
    } else { $data = [pscustomobject]@{ hooks = [pscustomobject]@{} } }
    if($null -eq $data -or $data -isnot [pscustomobject]) { throw 'Existing WorkBuddy settings.json is not a JSON object.' }
    if(-not ($data.PSObject.Properties.Name -contains 'hooks')) {
        $data | Add-Member -NotePropertyName hooks -NotePropertyValue ([pscustomobject]@{})
    }
    if($data.hooks -isnot [pscustomobject]) { throw 'Existing WorkBuddy hooks must be an object; unchanged.' }
    $events = @('SessionStart','UserPromptSubmit','PreToolUse','PostToolUse','PermissionRequest','Notification','Stop','SessionEnd')
    # Inspect all targeted groups BEFORE writing the config; unsupported shapes abort safely.
    foreach($eventName in $events) {
        $property = $data.hooks.PSObject.Properties[$eventName]
        if($null -ne $property -and $null -ne $property.Value) {
            if($property.Value -isnot [array]) { throw "WorkBuddy $eventName must be an array; unchanged." }
            foreach($group in $property.Value) {
                if($null -eq $group -or $group -isnot [pscustomobject] -or $group.hooks -isnot [array]) {
                    throw "WorkBuddy $eventName has an unsupported hook group; unchanged."
                }
            }
        }
    }
    $changed = $false
    foreach($eventName in $events) {
        $command = 'powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "' + $handler + '" -Event workbuddy:' + $eventName
        $property = $data.hooks.PSObject.Properties[$eventName]
        $groups = if($null -eq $property -or $null -eq $property.Value) { @() } else { @($property.Value) }
        $exists = $false
        foreach($group in $groups) {
            foreach($h in $group.hooks) { if($h.type -eq 'command' -and $h.command -eq $command) { $exists = $true } }
        }
        if(-not $exists) {
            $groups = @($groups) + @([pscustomobject]@{ hooks = @([pscustomobject]@{type='command';command=$command;timeout=5}) })
            if($null -eq $property) { $data.hooks | Add-Member -NotePropertyName $eventName -NotePropertyValue $groups }
            else { $property.Value = $groups }
            $changed = $true
        }
    }
    if($changed) {
        Write-Config $file ((ConvertTo-Json -InputObject $data -Depth 64) + "`r`n")
        Write-Host "[OK] WorkBuddy Desktop hooks installed: $file"
    } else { Write-Host '[OK] WorkBuddy Desktop hooks already installed.' }
}

try { Install-Codex } catch { $failures++; Write-Host "[ERROR] Codex: $($_.Exception.Message)" -ForegroundColor Red }
try { Install-Cursor } catch { $failures++; Write-Host "[ERROR] Cursor: $($_.Exception.Message)" -ForegroundColor Red }
try { Install-WorkBuddy } catch { $failures++; Write-Host "[ERROR] WorkBuddy: $($_.Exception.Message)" -ForegroundColor Red }
Write-Host ''
Write-Host 'Codex notify fires at turn completion, not on each thinking/edit step.'
Write-Host 'Hook events only update a running HachiOrb on localhost.'
if($failures -gt 0) { exit 1 }
exit 0
