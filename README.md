# InfraHub TV Monitor - extensão

Extensão Chrome/Chromium Manifest V3 para as TVs do InfraHub.

## Configuração

1. Cadastre a TV na API usando `/api/admin/cadastrar-maquina`.
2. Copie o `token` retornado. Ele aparece uma única vez.
3. Instale esta pasta como extensão descompactada.
4. Abra as opções da extensão e informe:
   - API URL
   - ID da máquina
   - Token
5. A extensão envia `POST /api/heartbeat` a cada ~30 segundos e consulta
   `GET /api/comandos` no mesmo intervalo.

A `SUPABASE_SERVICE_ROLE_KEY` nunca é usada pela extensão.

## Comandos suportados

- `reload`
- `navigate` / `navegar`, com `payload.url`

## Instalação no Chrome/Chromium

`chrome://extensions` → habilite **Modo do desenvolvedor** →
**Carregar sem compactação** → selecione esta pasta.

## Diagnóstico local

A extensão mantém até 300 eventos recentes em `chrome.storage.local`, incluindo falhas de comunicação, comandos recebidos/executados e confirmações. Os logs permanecem na TV quando a API fica indisponível e não são enviados automaticamente. Abra as opções da extensão para consultar os eventos recentes ou exportar o arquivo JSON para diagnóstico.

A versão 1.0.7 ajusta o heartbeat para 60 segundos e adiciona o registro local de eventos. A navegação das abas continua sob controle do navegador mesmo quando a API não responde.
