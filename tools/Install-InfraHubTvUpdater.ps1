param(
  [Parameter(Mandatory = $true)]
  [string]$ExtensionPath,
  [int]$IntervalMinutes = 15
)

$ErrorActionPreference = "Stop"
$installDir = Join-Path $env:LOCALAPPDATA "InfraHubTV"
$updaterPath = Join-Path $installDir "Update-InfraHubTvExtension.ps1"
$sourceUpdater = Join-Path $PSScriptRoot "Update-InfraHubTvExtension.ps1"
$taskName = "InfraHub TV Extension Updater"

if (-not (Test-Path $sourceUpdater)) { throw "Nao encontrei $sourceUpdater" }
if ($IntervalMinutes -lt 5) { throw "IntervalMinutes deve ser >= 5." }
New-Item -ItemType Directory -Path $installDir -Force | Out-Null
Copy-Item $sourceUpdater $updaterPath -Force
$actionArgs = '-NoProfile -ExecutionPolicy Bypass -File "' + $updaterPath + '" -ExtensionPath "' + $ExtensionPath + '"'
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $actionArgs
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes $IntervalMinutes) -RepetitionDuration (New-TimeSpan -Days 3650)
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
Write-Host "Updater instalado."
Write-Host "Pasta da extensao: $ExtensionPath"
Write-Host "Intervalo: $IntervalMinutes minutos"
Write-Host "Tarefa: $taskName"
