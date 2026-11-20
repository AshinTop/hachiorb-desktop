# Windows PowerShell 5.1+ fallback for Windows without Node.js.
# Original notify runs first, then HachiOrb. One JSON payload, no shell interpolation.
param([string]$Payload = '')
$ErrorActionPreference = 'Stop'
if(-not $Payload -and $args.Count -gt 0) { $Payload = [string]$args[0] }
if(-not $Payload) { exit 0 }
$originalPath = Join-Path $PSScriptRoot 'codex-original-notify.json'
try {
    $config = Get-Content -LiteralPath $originalPath -Raw -Encoding UTF8 | ConvertFrom-Json
    if($null -eq $config -or $config.version -ne 1) { throw 'Invalid original notify manifest' }
    $original = @($config.originalNotify | Where-Object { $null -ne $_ })
    if($original.Count -gt 0) {
        if($original[0] -isnot [string] -or [string]::IsNullOrWhiteSpace($original[0])) { throw 'Invalid executable' }
        if(@($original | Where-Object { [string]$_ -match 'codex-notify-dispatcher\.(?:cjs|ps1)' }).Count -gt 0) {
            throw 'Recursive dispatcher detected'
        }
        $exe = [string]$original[0]
        $fixedArgs = @()
        if($original.Count -gt 1) { $fixedArgs = @($original[1..($original.Count-1)] | ForEach-Object { [string]$_ }) }
        try { & $exe @fixedArgs $Payload | Out-Null }
        catch { [Console]::Error.WriteLine('[HachiOrb] Previous Codex notification failed: ' + $_.Exception.GetType().Name) }
    }
} catch {
    # No original config or unsupported config must never prevent the HachiOrb notification.
    [Console]::Error.WriteLine('[HachiOrb] Original notification config unavailable: ' + $_.Exception.GetType().Name)
}
try {
    & powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'agent-status.ps1') -Event codex -Payload $Payload | Out-Null
} catch {
    [Console]::Error.WriteLine('[HachiOrb] Local notification failed: ' + $_.Exception.GetType().Name)
}
exit 0
