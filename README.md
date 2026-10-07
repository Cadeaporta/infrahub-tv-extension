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
