param(
  [Parameter(Mandatory = $true)]
  [string]$ExtensionPath,
  [string]$Repository = "Cadeaporta/infrahub-tv-extension"
)

$ErrorActionPreference = "Stop"
$apiHeaders = @{ "Accept" = "application/vnd.github+json"; "User-Agent" = "InfraHub-TV-Updater" }

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
  foreach ($candidate in $candidates) { if (Test-Path $candidate) { return $candidate } }
  $command = Get-Command chrome.exe -ErrorAction SilentlyContinue
  if ($command) { return $command.Source }
  return $null
}

try {
  if (-not (Test-Path $ExtensionPath)) { throw "Pasta da extensao nao encontrada: $ExtensionPath" }
  $installedVersion = Get-VersionFromManifest -Path $ExtensionPath
  $latest = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repository/releases/latest" -Headers $apiHeaders -Method Get
  if (-not $latest.tag_name -or $latest.draft -or $latest.prerelease) { throw "Nao foi possivel identificar uma release estavel." }
  $latestVersionText = $latest.tag_name -replace "^v", ""
  $latestVersion = [version]$latestVersionText
  Write-Host "InfraHub TV - instalada: $installedVersion | disponivel: $latestVersion"
  if ($latestVersion -le $installedVersion) { Write-Host "Nenhuma atualizacao necessaria."; exit 0 }
  $asset = $latest.assets | Where-Object { $_.name -eq "InfraHub-TV-Extension-$latestVersionText.zip" } | Select-Object -First 1
  if (-not $asset) { throw "Asset da release $latestVersionText nao encontrado." }
  $tempRoot = Join-Path $env:TEMP ("InfraHubTVUpdate-" + [guid]::NewGuid().ToString("N"))
  $zipPath = Join-Path $tempRoot $asset.name
  $extractPath = Join-Path $tempRoot "package"
  $backupPath = "$ExtensionPath.backup"
  New-Item -ItemType Directory -Path $tempRoot -Force | Out-Null
  try {
    Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $zipPath -Headers $apiHeaders
    Expand-Archive -Path $zipPath -DestinationPath $extractPath -Force
    $packageVersion = Get-VersionFromManifest -Path $extractPath
    if ($packageVersion -ne $latestVersion) { throw "A release baixada declara $packageVersion, mas a release informa $latestVersion." }
    $chromeWasRunning = Get-Process chrome -ErrorAction SilentlyContinue
    $chromePath = Get-ChromePath
    if ($chromeWasRunning) { Write-Host "Fechando Chrome para substituir a extensao..."; $chromeWasRunning | Stop-Process -Force; Start-Sleep -Seconds 2 }
    if (Test-Path $backupPath) { Remove-Item $backupPath -Recurse -Force }
    Move-Item -Path $ExtensionPath -Destination $backupPath
    New-Item -ItemType Directory -Path $ExtensionPath -Force | Out-Null
    Get-ChildItem -Path $extractPath -Force | ForEach-Object { Copy-Item -Path $_.FullName -Destination $ExtensionPath -Recurse -Force }
    $installedAfter = Get-VersionFromManifest -Path $ExtensionPath
    if ($installedAfter -ne $latestVersion) { throw "Falha na validacao da instalacao. Versao encontrada: $installedAfter" }
    Remove-Item $backupPath -Recurse -Force
    Write-Host "Extensao atualizada para $installedAfter."
    if ($chromeWasRunning -and $chromePath) { Start-Process -FilePath $chromePath -ArgumentList "--restore-last-session"; Write-Host "Chrome reiniciado com a ultima sessao." }
  } catch {
    if (Test-Path $backupPath) { if (Test-Path $ExtensionPath) { Remove-Item $ExtensionPath -Recurse -Force }; Move-Item -Path $backupPath -Destination $ExtensionPath }
    throw
  } finally { if (Test-Path $tempRoot) { Remove-Item $tempRoot -Recurse -Force } }
} catch { Write-Error $_; exit 1 }
