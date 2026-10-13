# InfraHub TV Monitor - extensão

Extensão Chrome/Chromium Manifest V3 para as TVs do InfraHub.

## Configuração

1. Cadastre a TV pelo fluxo de registro aprovado da API.
2. Instale esta pasta como extensão descompactada.
3. Abra as opções da extensão e informe API URL, ID da máquina e token emitido para esse dispositivo.
4. O token só é aceito pela API quando o dispositivo está aprovado no painel.

A `SUPABASE_SERVICE_ROLE_KEY` nunca é usada pela extensão. O segredo de cadastro de dispositivos também não deve ser embutido nesta extensão; ele deve ficar em um helper local instalado e gerenciado pelo Atera.

## Frequência e comandos

- Heartbeat a cada 60 segundos.
- Consulta de comandos a cada 30 segundos.
- Comandos suportados: `reload`, `navigate`, `navegar`, `abrir_url`, `abrir_urls`.
- A extensão informa recebimento, execução, conclusão e falha de comandos pela API.

## Instalação no Chrome/Chromium

`chrome://extensions` → habilite **Modo do desenvolvedor** → **Carregar sem compactação** → selecione esta pasta.

## Diagnóstico

A extensão mantém até 300 eventos recentes em `chrome.storage.local`. Quando a API está disponível, envia lotes de até 50 eventos e mantém os logs locais para consulta/exportação. Quando a API fica indisponível, os logs permanecem armazenados localmente e serão reenviados na próxima tentativa. O identificador local evita reenviar repetidamente os mesmos eventos durante a vida útil do buffer.

A versão 1.0.8 adiciona sincronização dos diagnósticos e ciclo de status de comandos. Esta versão depende dos endpoints de lifecycle da API e da migração de banco correspondentes; não distribua às TVs antes do piloto validado.
