# HachiOrb example; PowerShell on Windows. No external dependencies.
param(
  [ValidateSet('idle','thinking','working','done','error','sleep')][string]$State='thinking',
  [string]$Task='AI 正在工作',
  [string]$Agent='manual',
  [string]$EmotionId='',
  [ValidateSet('permission','input')][string]$Attention='',
  [int]$Port=4173
)
$payload = @{ state=$State; task=$Task; agent=$Agent }
if($EmotionId) { $payload.emotionId=$EmotionId }
if($Attention) { $payload.attention=$Attention }
$bodyBytes = [System.Text.Encoding]::UTF8.GetBytes(($payload | ConvertTo-Json -Compress))
$request = [System.Net.HttpWebRequest]::Create("http://127.0.0.1:$Port/api/state")
$request.Proxy = $null
$request.Method = 'POST'
$request.ContentType = 'application/json'
$request.Timeout = 2000
$request.ReadWriteTimeout = 2000
$request.ContentLength = $bodyBytes.Length
$stream = $request.GetRequestStream()
try { $stream.Write($bodyBytes,0,$bodyBytes.Length) } finally { $stream.Dispose() }
$response = $request.GetResponse()
try {
  $reader = New-Object System.IO.StreamReader($response.GetResponseStream())
  try {
    $result = $reader.ReadToEnd()
    if($result) { ConvertFrom-Json -InputObject $result }
  } finally { $reader.Dispose() }
} finally { $response.Dispose() }
