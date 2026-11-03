# Stops the game server and the public tunnel.
$ErrorActionPreference = 'SilentlyContinue'

foreach ($port in 5173) {
  Get-NetTCPConnection -LocalPort $port -State Listen |
    Select-Object -ExpandProperty OwningProcess -Unique |
    ForEach-Object { Stop-Process -Id $_ -Force }
}

Get-Process cloudflared | Stop-Process -Force
Write-Host "Server and tunnel stopped." -ForegroundColor Yellow
