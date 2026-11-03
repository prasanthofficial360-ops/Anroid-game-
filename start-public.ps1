# Temple Run 3D - server + public tunnel supervisor.
#
#   npm run public
#   powershell -ExecutionPolicy Bypass -File start-public.ps1
#
# Starts Vite, starts a Cloudflare tunnel, writes the public URL to
# public-url.txt, and keeps both alive until this script is stopped.
# A Windows scheduled task (TempleRun3D) runs this hidden at logon.

param([switch]$Hidden)

$ErrorActionPreference = 'SilentlyContinue'
$root = $PSScriptRoot
Set-Location $root

$port = 5173
$cloudflared = Join-Path $root '.tools\cloudflared.exe'
$urlFile = Join-Path $root 'public-url.txt'
$tunnelLog = Join-Path $root 'tunnel.log'
$tunnelErr = Join-Path $root 'tunnel.err.log'

function Get-LanIp {
  (Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254*' } |
    Select-Object -First 1).IPAddress
}

function Test-Server {
  [bool](Get-NetTCPConnection -LocalPort $port -State Listen)
}

function Start-DevServer {
  Write-Host 'Starting Vite dev server...' -ForegroundColor Yellow
  Start-Process -FilePath 'cmd.exe' `
    -ArgumentList '/c', "npm run dev > `"$root\dev.log`" 2>&1" `
    -WorkingDirectory $root -WindowStyle Hidden
  for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep -Milliseconds 500
    if (Test-Server) { return $true }
  }
  return $false
}

function Get-TunnelUrl {
  $match = Select-String -Path $tunnelLog, $tunnelErr -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' -ErrorAction SilentlyContinue |
    Select-Object -First 1
  if ($match) { return [regex]::Match($match.Line, 'https://[a-z0-9-]+\.trycloudflare\.com').Value }
  return $null
}

function Start-Tunnel {
  Write-Host 'Opening public tunnel...' -ForegroundColor Yellow
  Remove-Item $tunnelLog, $tunnelErr -Force
  Start-Process -FilePath $cloudflared `
    -ArgumentList 'tunnel', '--url', "http://127.0.0.1:$port", '--no-autoupdate' `
    -WorkingDirectory $root -WindowStyle Hidden `
    -RedirectStandardOutput $tunnelLog -RedirectStandardError $tunnelErr

  for ($i = 0; $i -lt 80; $i++) {
    Start-Sleep -Milliseconds 500
    $url = Get-TunnelUrl
    if ($url) {
      Set-Content -Path $urlFile -Value $url -Encoding ascii
      return $url
    }
  }
  return $null
}

if (-not (Test-Path $cloudflared)) {
  Write-Host 'cloudflared.exe is missing from .tools.' -ForegroundColor Red
  exit 1
}

if (-not (Test-Server)) { Start-DevServer | Out-Null }
$tunnelUrl = if (Get-Process cloudflared) { Get-TunnelUrl } else { Start-Tunnel }
if ($tunnelUrl) { Set-Content -Path $urlFile -Value $tunnelUrl -Encoding ascii }

# Supervisor loop: restart either side if it dies.
$announced = $false
while ($true) {
  if (-not (Test-Server)) {
    Start-DevServer | Out-Null
    $announced = $false
  }

  if (-not (Get-Process cloudflared)) {
    $tunnelUrl = Start-Tunnel
    $announced = $false
  }

  if (-not $announced) {
    $lan = Get-LanIp
    Write-Host ''
    Write-Host '  Temple Run 3D is live' -ForegroundColor Green
    Write-Host "  This PC : http://localhost:$port/"
    if ($lan) { Write-Host "  Same Wi-Fi / phone : http://${lan}:$port/" }
    if ($tunnelUrl) {
      Write-Host "  Anywhere : $tunnelUrl" -ForegroundColor Cyan
      Write-Host "  (also saved in public-url.txt)"
    }
    Write-Host ''
    $announced = $true
  }

  Start-Sleep -Seconds 20
}
