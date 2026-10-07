param(
  [Parameter(Mandatory = $true)]
  [string]$ExtensionPath,
  [Parameter(Mandatory = $true)]
  [string]$MachineId,
  [Parameter(Mandatory = $true)]
  [string]$Token,
  [string]$ApiUrl = "https://infrahub-monitor-api.vercel.app",
  [int]$IntervalMinutes = 1
)

$ErrorActionPreference = "Stop"

if ($IntervalMinutes -lt 1) { throw "IntervalMinutes deve ser >= 1." }
if (-not (Test-Path (Join-Path $ExtensionPath "manifest.json"))) {
  throw "Nao encontrei manifest.json em $ExtensionPath"
}

$installDir = Join-Path $env:LOCALAPPDATA "InfraHubTV"
$updaterPath = Join-Path $installDir "Update-InfraHubTvExtension.ps1"
$configPath = Join-Path $installDir "updater.json"
$sourceUpdater = Join-Path $PSScriptRoot "Update-InfraHubTvExtension.ps1"
$taskName = "InfraHub TV Extension Updater"

New-Item -ItemType Directory -Path $installDir -Force | Out-Null
Copy-Item $sourceUpdater $updaterPath -Force

@{
  ExtensionPath = $ExtensionPath
  MachineId = $MachineId
  Token = $Token
  ApiUrl = $ApiUrl
} | ConvertTo-Json | Set-Content -Path $configPath -Encoding UTF8

$scriptRunner = Join-Path $installDir "Run-InfraHubTvUpdater.ps1"
@'
$config = Get-Content "__CONFIG__" -Raw | ConvertFrom-Json
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File "__UPDATER__" -ExtensionPath $config.ExtensionPath -MachineId $config.MachineId -Token $config.Token -ApiUrl $config.ApiUrl
'@.Replace("__CONFIG__", $configPath).Replace("__UPDATER__", $updaterPath) |
  Set-Content -Path $scriptRunner -Encoding UTF8

$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument ('-NoProfile -ExecutionPolicy Bypass -File "' + $scriptRunner + '"')
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes $IntervalMinutes) -RepetitionDuration (New-TimeSpan -Days 3650)
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null

Write-Host "Updater instalado."
Write-Host "TV: $MachineId"
Write-Host "Pasta da extensao: $ExtensionPath"
Write-Host "Intervalo de verificacao: $IntervalMinutes minuto(s)"
