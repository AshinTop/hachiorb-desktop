# Send a synthetic local event and confirm it reached the running desktop app.
$ErrorActionPreference = 'Stop'
$body = '{"agent":"manual","state":"thinking","task":"HachiOrb local connection test"}'
$bodyBytes = [System.Text.Encoding]::UTF8.GetBytes($body)
$connectedPort = $null
foreach($port in @(4173,4174,4175)) {
    $request = $null
    $stream = $null
    $response = $null
    try {
        $request = [System.Net.HttpWebRequest]::Create("http://127.0.0.1:$port/api/state")
        $request.Proxy = $null
        $request.Method = 'POST'
        $request.ContentType = 'application/json'
        $request.Timeout = 2000
        $request.ReadWriteTimeout = 2000
        $request.ContentLength = $bodyBytes.Length
        $stream = $request.GetRequestStream()
        $stream.Write($bodyBytes,0,$bodyBytes.Length)
        $stream.Dispose()
        $stream = $null
        $response = $request.GetResponse()
        $connectedPort = $port
        break
    } catch { continue }
    finally {
        if($stream) { $stream.Dispose() }
        if($response) { $response.Dispose() }
    }
}
if($null -ne $connectedPort) {
    Write-Host "[OK] Desktop bridge responded on localhost:$connectedPort" -ForegroundColor Green
    Write-Host 'The ball should now show its thinking expression.'
    exit 0
}
Write-Host '[ERROR] No HachiOrb bridge is responding on ports 4173-4175.' -ForegroundColor Red
Write-Host 'Start HachiOrb.exe first, and check the actual bridge port in its tray menu.'
exit 1
