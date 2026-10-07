# Atualizacao da extensao por painel

O Chrome nao atualiza automaticamente uma extensao carregada como "Load unpacked". Por isso, cada TV pode ter um updater externo instalado localmente. O updater fica verificando comandos direcionados para o ID daquela TV. Assim, o botao **Atualizar extensao** do painel web atualiza somente a TV escolhida.

## Instalar em uma TV

Deixe estes dois arquivos juntos:

- `tools/Update-InfraHubTvExtension.ps1`
- `tools/Install-InfraHubTvUpdater.ps1`

Execute no PowerShell da própria TV:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\tools\Install-InfraHubTvUpdater.ps1 `
  -ExtensionPath "C:\CAMINHO\DA\EXTENSAO" `
  -MachineId "tv-recepcao-01" `
  -Token "TOKEN_DA_TV"
```

O instalador cria:

- `%LOCALAPPDATA%\InfraHubTV\updater.json`
- `%LOCALAPPDATA%\InfraHubTV\Update-InfraHubTvExtension.ps1`
- `%LOCALAPPDATA%\InfraHubTV\Run-InfraHubTvUpdater.ps1`
- tarefa agendada **InfraHub TV Extension Updater**

A tarefa verifica o comando a cada minuto por padrão.

## Fluxo de atualização

1. No dashboard, abra o menu `⋮` da TV desejada.
2. Clique em **🔄 Atualizar extensão**.
3. O dashboard cria um comando `atualizar_extensao` para aquele `maquina_id`.
4. O updater instalado naquela TV encontra o comando.
5. Ele compara a versão instalada com o `manifest.json` do repositório.
6. Se houver versão nova, fecha o Chrome, substitui os arquivos da extensão e restaura a última sessão.
7. Depois confirma o comando via heartbeat.

## Importante

- A extensão continua sendo carregada como **Load unpacked**.
- Cada TV precisa ter o updater instalado uma vez.
- O updater não atualiza todas as TVs ao mesmo tempo. Ele só reage ao comando do próprio `maquina_id`.
- O token da TV fica no arquivo local do updater e não é enviado para o dashboard.
- O updater baixa o código público do branch `main`, sem precisar de token do GitHub.
