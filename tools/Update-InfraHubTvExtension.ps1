param(
  [Parameter(Mandatory = $true)]
  [string]$ExtensionPath,
  [Parameter(Mandatory = $true)]
  [string]$MachineId,
  [Parameter(Mandatory = $true)]
  [string]$Token,
  [string]$ApiUrl = "https://infrahub-monitor-api.vercel.app",
  [string]$Repository = "Cadeaporta/infrahub-tv-extension"
)

$ErrorActionPreference = "Stop"
$apiUrl = $ApiUrl.TrimEnd("/")

function Get-VersionFromManifest {
  param([string]$Path)
  $manifestFile = Join-Path $Path "manifest.json"
  if (-not (Test-Path $manifestFile)) { throw "manifest.json nao encontrado em $Path" }
  $manifest = Get-Content $manifestFile -Raw | ConvertFrom-Json
  return [version]$manifest.version
}

function Get-ChromePath {
  $candidates = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "$env:ProgramFiles(x86)\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
  )
  foreach ($candidate in $candidates) {
    if (Test-Path $candidate) { return $candidate }
  }
  $command = Get-Command chrome.exe -ErrorAction SilentlyContinue
  if ($command) { return $command.Source }
  return $null
}

function Get-PendingCommands {
  $url = "$apiUrl/api/comandos?maquina_id=$([uri]::EscapeDataString($MachineId))&token=$([uri]::EscapeDataString($Token))"
  $response = Invoke-RestMethod -Uri $url -Method Get -Headers @{ "Cache-Control" = "no-cache" }
  return @($response.comandos)
}

function Acknowledge-Command {
  param([string]$CommandId)
  if (-not $CommandId) { return }
  Invoke-RestMethod -Uri "$apiUrl/api/heartbeat" -Method Post -ContentType "application/json" -Body (@{
    maquina_id = $MachineId
    token = $Token
    url_atual = ""
    comando_id = $CommandId
  } | ConvertTo-Json -Compress) | Out-Null
}

function Update-Extension {
  $installedVersion = Get-VersionFromManifest -Path $ExtensionPath
  $headers = @{ "Accept" = "application/vnd.github+json"; "User-Agent" = "InfraHub-TV-Updater" }
  $remoteManifest = Invoke-RestMethod -Uri "https://raw.githubusercontent.com/$Repository/main/manifest.json" -Headers $headers -Method Get
  $latestVersion = [version]$remoteManifest.version

  Write-Host "InfraHub TV - instalada: $installedVersion | disponivel: $latestVersion"

  if ($latestVersion -le $installedVersion) {
    return @{ Updated = $false; Version = $installedVersion }
  }

  $tempRoot = Join-Path $env:TEMP ("InfraHubTVUpdate-" + [guid]::NewGuid().ToString("N"))
  $zipPath = Join-Path $tempRoot "source.zip"
  $extractPath = Join-Path $tempRoot "source"
  $sourceUrl = "https://github.com/$Repository/archive/refs/heads/main.zip"
  $backupPath = "$ExtensionPath.backup"

  New-Item -ItemType Directory -Path $tempRoot -Force | Out-Null

  try {
    Invoke-WebRequest -Uri $sourceUrl -OutFile $zipPath -Headers $headers
    Expand-Archive -Path $zipPath -DestinationPath $extractPath -Force

    $sourceRoot = Get-ChildItem -Path $extractPath -Directory | Select-Object -First 1
    if (-not $sourceRoot) { throw "Nao foi possivel localizar o repositorio baixado." }

    $packageVersion = Get-VersionFromManifest -Path $sourceRoot.FullName
    if ($packageVersion -ne $latestVersion) {
      throw "Codigo baixado declara $packageVersion, mas o manifest remoto declara $latestVersion."
    }

    $chromeWasRunning = [bool](Get-Process chrome -ErrorAction SilentlyContinue)
    $chromePath = Get-ChromePath

    if ($chromeWasRunning) {
      Write-Host "Fechando Chrome para substituir a extensao..."
      Get-Process chrome -ErrorAction SilentlyContinue | Stop-Process -Force
      Start-Sleep -Seconds 2
    }

    if (Test-Path $backupPath) { Remove-Item $backupPath -Recurse -Force }

    Move-Item -Path $ExtensionPath -Destination $backupPath
    New-Item -ItemType Directory -Path $ExtensionPath -Force | Out-Null

    Get-ChildItem -Path $sourceRoot.FullName -Force |
      ForEach-Object { Copy-Item -Path $_.FullName -Destination $ExtensionPath -Recurse -Force }

    $installedAfter = Get-VersionFromManifest -Path $ExtensionPath
    if ($installedAfter -ne $latestVersion) {
      throw "Falha na validacao. Versao instalada: $installedAfter"
    }

    Remove-Item $backupPath -Recurse -Force

    if ($chromeWasRunning -and $chromePath) {
      Start-Process -FilePath $chromePath -ArgumentList "--restore-last-session"
    }

    return @{ Updated = $true; Version = $installedAfter }
  }
  catch {
    if (Test-Path $backupPath) {
      if (Test-Path $ExtensionPath) { Remove-Item $ExtensionPath -Recurse -Force }
      Move-Item -Path $backupPath -Destination $ExtensionPath
    }
    throw
  }
  finally {
    if (Test-Path $tempRoot) { Remove-Item $tempRoot -Recurse -Force }
  }
}

try {
  if (-not (Test-Path $ExtensionPath)) {
    throw "Pasta da extensao nao encontrada: $ExtensionPath"
  }

  $commands = Get-PendingCommands
  foreach ($command in $commands) {
    $tipo = [string]$command.tipo

    if ($tipo -ne "atualizar_extensao") {
      continue
    }

    Write-Host "Comando de atualizacao recebido: $($command.id)"

    try {
      $result = Update-Extension
      Acknowledge-Command -CommandId ([string]$command.id)
      Write-Host "Comando confirmado. Versao: $($result.Version)"
    }
    catch {
      Write-Error "Falha na atualizacao da extensao: $_"
    }
  }
}
catch {
  Write-Error $_
  exit 1
}
