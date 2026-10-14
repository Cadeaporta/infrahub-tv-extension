# InfraHub TV Monitor - extensão

Extensão Chrome/Chromium Manifest V3 para as TVs do InfraHub.

## Configuração

1. Gere um código de cadastro de uso único no painel autenticado.
2. Execute `scripts/Install-InfraHubTV.ps1` pelo Atera com o código e uma URL de API explícita do ambiente correto.
3. O helper registra hostname + UUID persistente, instala o host nativo para Chrome/Edge e guarda o token com ACL restrita.
4. Carregue esta pasta como extensão descompactada nos navegadores autorizados. A extensão sincroniza a identidade pelo Native Messaging, sem digitar o token nas opções.
5. Aprove a máquina no painel. Até lá, a API bloqueia heartbeat e comandos.
6. Consulte `docs/ATERA_NATIVE_HELPER.md` para pré-requisitos, parâmetros e segurança.

A `SUPABASE_SERVICE_ROLE_KEY` nunca é usada pela extensão. O segredo de cadastro de dispositivos também não deve ser embutido nesta extensão; ele deve ficar em um helper local instalado e gerenciado pelo Atera.

## Frequência e comandos

- Heartbeat a cada 60 segundos.
- Consulta de comandos a cada 30 segundos.
- Comandos suportados: `reload`, `navigate`, `navegar`, `abrir_url`, `abrir_urls`.
- A extensão informa recebimento, execução, conclusão e falha de comandos pela API.

## Instalação no Chrome e Edge

Chrome: `chrome://extensions` → habilite **Modo do desenvolvedor** → **Carregar sem compactação** → selecione esta pasta.

Edge: `edge://extensions` → habilite **Modo do desenvolvedor** → **Carregar sem compactação** → selecione esta pasta.

O ID da extensão precisa constar em `allowed_origins` do host nativo. Confira os IDs dos dois navegadores e passe-os ao script do Atera caso sejam diferentes.

## Diagnóstico

A extensão mantém até 300 eventos recentes em `chrome.storage.local`. Quando a API está disponível, envia lotes de até 50 eventos e mantém os logs locais para consulta/exportação. Quando a API fica indisponível, os logs permanecem armazenados localmente e serão reenviados na próxima tentativa. O identificador local evita reenviar repetidamente os mesmos eventos durante a vida útil do buffer.

A versão 1.0.8 adiciona sincronização dos diagnósticos e ciclo de status de comandos. Esta versão depende dos endpoints de lifecycle da API e da migração de banco correspondentes; não distribua às TVs antes do piloto validado.
