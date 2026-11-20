# Send a synthetic local event and confirm it reached the running desktop app.
$ErrorActionPreference = 'Stop'
$body = '{"agent":"manual","state":"thinking","task":"HachiOrb local connection test"}'
foreach($port in @(4173,4174,4175)) {
    try {
        $result = Invoke-RestMethod -Uri "http://127.0.0.1:$port/api/state" -Method Post -ContentType 'application/json' -Body $body -TimeoutSec 2
        Write-Host "[OK] Desktop bridge responded on localhost:$port" -ForegroundColor Green
        Write-Host 'The ball should now show its thinking expression.'
        exit 0
    } catch { continue }
}
Write-Host '[ERROR] No HachiOrb bridge is responding on ports 4173-4175.' -ForegroundColor Red
Write-Host 'Start HachiOrb.exe first, and check the actual bridge port in its tray menu.'
exit 1
