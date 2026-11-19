# HachiOrb example; PowerShell on Windows. No external dependencies.
param(
  [ValidateSet('idle','thinking','working','done','error','sleep')][string]$State='thinking',
  [string]$Task='AI 正在工作',
  [string]$Agent='manual',
  [int]$Port=4173
)
$body = @{ state=$State; task=$Task; agent=$Agent } | ConvertTo-Json -Compress
Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/state" -Method Post -ContentType 'application/json' -Body ([System.Text.Encoding]::UTF8.GetBytes($body))
