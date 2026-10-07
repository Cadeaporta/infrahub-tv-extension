# Atualizacao automatica da extensao

O Chrome nao atualiza automaticamente uma extensao carregada como "Load unpacked". Para as TVs, este repositorio inclui um updater externo que verifica a ultima Release no GitHub e, quando encontra uma versao maior, baixa o ZIP, substitui a pasta da extensao e reinicia o Chrome.

## Instalar em uma TV

1. Baixe o repositorio ou a Release mais recente.
2. Deixe estes dois arquivos juntos: `tools/Update-InfraHubTvExtension.ps1` e `tools/Install-InfraHubTvUpdater.ps1`.
3. Execute no PowerShell:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\tools\Install-InfraHubTvUpdater.ps1 -ExtensionPath "C:\CAMINHO\DA\EXTENSAO"
```

O updater fica em `%LOCALAPPDATA%\InfraHubTV\` e cria a tarefa agendada **InfraHub TV Extension Updater**, verificando a cada 15 minutos.

## Importante

- A extensao continua sendo carregada como descompactada.
- O updater precisa saber o caminho da pasta da extensao.
- Quando houver uma versao nova, o updater fecha o Chrome, atualiza os arquivos e usa `--restore-last-session` para abrir novamente a sessao.
- A release precisa ter uma versao maior no `manifest.json`.
- O updater usa apenas releases publicas do repositorio, sem token do GitHub.
