#requires -Version 5.1
#requires -RunAsAdministrator
<#
.SYNOPSIS
  Instala o helper nativo do InfraHub TV e registra a máquina com código de uso único.
.DESCRIPTION
  Execute via Atera em contexto SYSTEM/administrador, com um usuário de TV conectado.
  Não define API_URL padrão: informe explicitamente o ambiente pretendido.
  Este script não instala nem atualiza a extensão do navegador.
.EXAMPLE
  .\Install-InfraHubTV.ps1 -EnrollmentCode $env:INFRAHUB_TV_ENROLLMENT_CODE -ApiUrl "https://SEU-AMBIENTE-API"
#>
[CmdletBinding()]
param(
    [string]$EnrollmentCode,
    [string]$ApiUrl,
    [string[]]$ExtensionIds = @("iofcmgndaojikokpjlimbocgnblpnko")
)

$ErrorActionPreference = "Stop"
$Root = Join-Path $env:ProgramData "InfraHubTV"
$IdentityPath = Join-Path $Root "identity.json"
$HostExe = Join-Path $Root "InfraHubTvNativeHost.exe"
$HostManifest = Join-Path $Root "com.infrahub.tv.identity.json"
$HostName = "com.infrahub.tv.identity"
$LogPath = Join-Path $Root "install.log"

function Write-Log([string]$Message) {
    $line = "$(Get-Date -Format o) $Message"
    Add-Content -LiteralPath $LogPath -Value $line -Encoding UTF8
    Write-Output $line
}

function Set-NativeHostRegistry([string]$Browser, [string]$ManifestPath) {
    $subKey = "SOFTWARE\$Browser\NativeMessagingHosts\$HostName"
    foreach ($view in @([Microsoft.Win32.RegistryView]::Registry64, [Microsoft.Win32.RegistryView]::Registry32)) {
        $base = [Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::LocalMachine, $view)
        try {
            $key = $base.CreateSubKey($subKey)
            try { $key.SetValue("", $ManifestPath, [Microsoft.Win32.RegistryValueKind]::String) }
            finally { $key.Dispose() }
        } finally { $base.Dispose() }
    }
}

try {
    New-Item -ItemType Directory -Path $Root -Force | Out-Null
    if (-not (Test-Path -LiteralPath $LogPath)) { New-Item -ItemType File -Path $LogPath -Force | Out-Null }

    $computer = Get-CimInstance Win32_ComputerSystem
    $interactiveUser = [string]$computer.UserName
    if ([string]::IsNullOrWhiteSpace($interactiveUser)) {
        throw "Nenhum usuário interativo detectado. Execute pelo Atera enquanto a sessão da TV estiver aberta."
    }
    $user = New-Object System.Security.Principal.NTAccount($interactiveUser)
    $userSid = $user.Translate([System.Security.Principal.SecurityIdentifier]).Value

    $identity = $null
    if (Test-Path -LiteralPath $IdentityPath) {
        try { $identity = Get-Content -LiteralPath $IdentityPath -Raw | ConvertFrom-Json } catch { $identity = $null }
    }

    if (-not $identity -or -not $identity.maquinaId -or -not $identity.token -or -not $identity.machineUuid) {
        if ([string]::IsNullOrWhiteSpace($EnrollmentCode)) {
            throw "Primeiro cadastro exige -EnrollmentCode com código de uso único gerado no painel."
        }
        if ([string]::IsNullOrWhiteSpace($ApiUrl)) {
            throw "Primeiro cadastro exige -ApiUrl explícita. Nenhum ambiente padrão será escolhido automaticamente."
        }
        $parsedApi = $null
        if (-not [Uri]::TryCreate($ApiUrl, [UriKind]::Absolute, [ref]$parsedApi) -or $parsedApi.Scheme -notin @("http", "https")) {
            throw "ApiUrl inválida. Informe uma URL HTTP/HTTPS explícita."
        }
        $ApiUrl = $ApiUrl.TrimEnd("/")
        $machineUuid = [Guid]::NewGuid().ToString()
        $hostname = $env:COMPUTERNAME
        $body = @{
            codigo_cadastro = $EnrollmentCode.Trim()
            machine_uuid = $machineUuid
            hostname = $hostname
            nome = $hostname
        } | ConvertTo-Json -Depth 5

        Write-Log "Enviando cadastro pendente para $ApiUrl; hostname=$hostname; UUID=$machineUuid"
        $response = Invoke-RestMethod -Uri "$ApiUrl/api/tv/registrar" -Method Post -ContentType "application/json" -Body $body -TimeoutSec 30
        if (-not $response.ok -or -not $response.maquina.id -or -not $response.token) {
            throw "A API não retornou os dados de identidade esperados."
        }
        $identity = [pscustomobject]@{
            ok = $true
            maquinaId = [string]$response.maquina.id
            token = [string]$response.token
            apiUrl = $ApiUrl
            hostname = $hostname
            machineUuid = $machineUuid
            statusAprovacao = [string]$response.maquina.status_aprovacao
            registradoEm = (Get-Date).ToUniversalTime().ToString("o")
        }
        Write-Log "Cadastro concluído com estado '$($identity.statusAprovacao)'. A máquina ainda precisa ser aprovada no painel."
    } else {
        Write-Log "Identidade persistente encontrada; preservando cadastro existente."
    }

    $json = $identity | ConvertTo-Json -Depth 5
    [System.IO.File]::WriteAllText($IdentityPath, $json, (New-Object System.Text.UTF8Encoding($false)))

    # Restrict identity file access to SYSTEM, local administrators, and the interactive TV user.
    & icacls.exe $Root /inheritance:r /grant:r "*S-1-5-18:(OI)(CI)F" "*S-1-5-32-544:(OI)(CI)F" "$($userSid):(OI)(CI)RX" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Não foi possível aplicar ACLs ao diretório InfraHubTV." }
    & icacls.exe $IdentityPath /inheritance:r /grant:r "*S-1-5-18:F" "*S-1-5-32-544:F" "$($userSid):R" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Não foi possível restringir acesso ao arquivo de identidade." }

    $source = @'
using System;
using System.IO;
using System.Text;

internal static class InfraHubTvNativeHost
{
    private const int MaxMessageBytes = 1024 * 1024;
    private static byte[] ReadExact(Stream stream, int count)
    {
        byte[] buffer = new byte[count];
        int offset = 0;
        while (offset < count)
        {
            int read = stream.Read(buffer, offset, count - offset);
            if (read <= 0)
            {
                if (offset == 0) return null;
                throw new EndOfStreamException("Mensagem nativa incompleta.");
            }
            offset += read;
        }
        return buffer;
    }
    private static int Main()
    {
        try
        {
            Stream input = Console.OpenStandardInput();
            byte[] header = ReadExact(input, 4);
            if (header == null) return 0;
            int requestLength = BitConverter.ToInt32(header, 0);
            if (requestLength < 0 || requestLength > MaxMessageBytes)
                throw new InvalidDataException("Tamanho de mensagem inválido.");
            byte[] request = ReadExact(input, requestLength);
            if (request == null) throw new EndOfStreamException("Requisição vazia.");
            string identityPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "InfraHubTV", "identity.json");
            if (!File.Exists(identityPath)) throw new FileNotFoundException("Identidade InfraHub TV não encontrada.");
            string json = File.ReadAllText(identityPath, Encoding.UTF8);
            byte[] payload = new UTF8Encoding(false).GetBytes(json);
            if (payload.Length > MaxMessageBytes) throw new InvalidDataException("Resposta de identidade muito grande.");
            Stream output = Console.OpenStandardOutput();
            byte[] responseHeader = BitConverter.GetBytes(payload.Length);
            output.Write(responseHeader, 0, responseHeader.Length);
            output.Write(payload, 0, payload.Length);
            output.Flush();
            return 0;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine("[InfraHub TV Native Host] " + ex.Message);
            return 1;
        }
    }
}
'@
    Add-Type -TypeDefinition $source -Language CSharp -OutputAssembly $HostExe -OutputType ConsoleApplication
    if (-not (Test-Path -LiteralPath $HostExe)) { throw "A compilação do helper nativo não produziu o executável." }

    $origins = @($ExtensionIds | ForEach-Object {
        $id = ([string]$_).Trim()
        if ($id -notmatch '^[a-p]{32}$') { throw "ID de extensão inválido: $id" }
        "chrome-extension://$id/"
    } | Select-Object -Unique)
    if (-not $origins.Count) { throw "Informe pelo menos um ID de extensão válido para Chrome/Edge." }

    $manifest = @{
        name = $HostName
        description = "InfraHub TV local identity helper"
        path = $HostExe
        type = "stdio"
        allowed_origins = $origins
    } | ConvertTo-Json -Depth 5
    [System.IO.File]::WriteAllText($HostManifest, $manifest, (New-Object System.Text.UTF8Encoding($false)))

    Set-NativeHostRegistry "Google\Chrome" $HostManifest
    Set-NativeHostRegistry "Microsoft\Edge" $HostManifest

    Write-Log "Helper nativo instalado para Chrome e Edge. Identidade=$($identity.maquinaId); hostname=$($identity.hostname); status=$($identity.statusAprovacao)."
    Write-Log "A extensão deve estar instalada e ter um ID listado em allowed_origins. Reinicie o navegador após a instalação."
    Write-Output "InfraHub TV helper instalado. Cadastro: $($identity.statusAprovacao). Nenhuma extensão foi atualizada."
    exit 0
}
catch {
    try { Write-Log "ERRO: $($_.Exception.Message)" } catch {}
    Write-Error $_.Exception.Message
    exit 1
}
