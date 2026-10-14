# Instalação do helper InfraHub TV via Atera

## Objetivo

O helper nativo permite que a extensão Chrome/Edge obtenha hostname e UUID persistente do Windows sem tentar descobrir esses dados pelo navegador. A instalação não instala nem atualiza a extensão.

## Arquivos

- `scripts/Install-InfraHubTV.ps1`: instalação e cadastro inicial.
- `native-host/InfraHubTvNativeHost.cs`: código-fonte do host de mensagens nativas.
- O instalador compila o host localmente com o compilador C# do Windows PowerShell/.NET Framework disponível no endpoint.

## Pré-requisitos

- Windows com Windows PowerShell 5.1 e permissões administrativas.
- Sessão interativa da TV aberta para que o helper possa restringir o arquivo de identidade ao usuário do navegador.
- A migração de lifecycle aplicada no ambiente escolhido e os endpoints de API correspondentes implantados nesse mesmo ambiente.
- Extensão carregada no Chrome/Edge.
- IDs exatos das extensões permitidos em `allowed_origins`. O script aceita vários IDs; o valor padrão inclui o ID conhecido `iofcmgndaojikokpjlimbocgnblpnko`. Confira `chrome://extensions` e `edge://extensions` no endpoint e passe ambos se forem diferentes.

## Fluxo

1. No painel autenticado, um administrador gera um código de cadastro de uso único.
2. No Atera, execute o script como administrador/SYSTEM com usuário interativo conectado e passe o código e a URL explícita do ambiente de API.
3. O helper gera UUID persistente, envia hostname + UUID + código para `POST /api/tv/registrar` e salva o token emitido em `C:\ProgramData\InfraHubTV\identity.json`.
4. O helper instala o executável de Native Messaging e registra o host no Windows para Chrome e Edge.
5. A extensão consulta `com.infrahub.tv.identity` e sincroniza `maquinaId`, token e URL de API em `chrome.storage.local`.
6. A máquina permanece pendente e a API recusa heartbeats/comandos até aprovação administrativa.

## Parâmetros

```powershell
$code = $env:INFRAHUB_TV_ENROLLMENT_CODE
.Install-InfraHubTV.ps1 -EnrollmentCode $code -ApiUrl "https://URL-EXPLICITA-DO-AMBIENTE" -ExtensionIds @("ID_CHROME", "ID_EDGE")
```

Não salve o código no repositório, em uma política de grupo ou em um script reutilizável. Prefira uma variável protegida do job Atera e execute o script apenas no endpoint pretendido. A URL da API é obrigatória no primeiro cadastro para evitar apontar silenciosamente para produção.

Se o arquivo de identidade já existir e contiver token, o script preserva o cadastro existente e reinstala o host sem consumir um novo código. Para trocar de ambiente ou substituir uma identidade revogada, faça um procedimento de re-enrollment explícito; não apague o arquivo automaticamente.

## Segurança e limites

- O token é um segredo de máquina. O arquivo recebe ACL restrita a SYSTEM, Administradores e usuário interativo identificado no momento da instalação.
- O código é de uso único; a API armazena somente seu hash.
- A extensão não recebe o código de cadastro, a chave de serviço Supabase nem o segredo administrativo.
- O hostname é obtido pelo helper executado no Windows, não pelo JavaScript da extensão.
- A revogação no servidor bloqueia o token. A revogação não depende de o navegador estar conectado.
- O script não instala, atualiza nem fecha navegadores e não executa rollout de extensão.
- O helper ainda precisa de teste real em um Windows de laboratório. Não execute em TVs de produção até a migração, API e extensão compatíveis estarem validadas.
