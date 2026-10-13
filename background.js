const DEFAULT_API_URL =
  "https://infrahub-monitor-api.vercel.app";

const HEARTBEAT_ALARM = "infrahub-heartbeat";
const COMMANDS_ALARM = "infrahub-commands";
const TAB_TURNER_ALARM = "infrahub-tab-turner";
const HEARTBEAT_MINUTES = 1;
const COMMANDS_POLL_MINUTES = 0.5;
const MAX_LOCAL_LOGS = 300;

let logQueue = Promise.resolve();

function registrarEvento(nivel, mensagem, detalhes = {}) {
  const evento = {
    eventId: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    nivel,
    mensagem: String(mensagem || '').slice(0, 500),
    detalhes
  };

  logQueue = logQueue.then(async () => {
    const { diagnosticLogs = [] } = await chrome.storage.local.get({ diagnosticLogs: [] });
    const logs = Array.isArray(diagnosticLogs) ? diagnosticLogs : [];
    await chrome.storage.local.set({
      diagnosticLogs: [...logs, evento].slice(-MAX_LOCAL_LOGS)
    });
  }).catch((error) => {
    console.error('[InfraHub] não foi possível salvar log local:', error);
  });

  return logQueue;
}

async function getConfig() {
  const cfg = await chrome.storage.local.get({
    apiUrl: DEFAULT_API_URL,
    maquinaId: "",
    token: ""
  });

  return {
    apiUrl: String(cfg.apiUrl || DEFAULT_API_URL).replace(/\/+$/, ""),
    maquinaId: String(cfg.maquinaId || ""),
    token: String(cfg.token || "")
  };
}

async function getCurrentTab() {
  const tabs = await chrome.tabs.query({
    active: true
  });

  if (tabs[0]) return tabs[0];

  const allTabs = await chrome.tabs.query({});
  return allTabs[0] || null;
}

async function heartbeat(comandoId = "") {
  const cfg = await getConfig();
  if (!cfg.maquinaId || !cfg.token) return;

  const tab = await getCurrentTab();
  const urlAtual = tab?.url || "";

  try {
    const response = await fetch(`${cfg.apiUrl}/api/heartbeat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        maquina_id: cfg.maquinaId,
        token: cfg.token,
        url_atual: urlAtual,
        ...(comandoId ? { comando_id: comandoId } : {})
      }),
      cache: "no-store"
    });

    if (!response.ok) {
      console.warn("[InfraHub] heartbeat:", response.status);
      await registrarEvento("error", "Heartbeat recusado pela API", { status: response.status });
    } else {
      await registrarEvento("info", "Heartbeat confirmado", { urlAtual });
    }

    await syncDiagnosticLogs();
    return response.ok;
  } catch (error) {
    console.warn("[InfraHub] falha no heartbeat:", error);
    await registrarEvento("error", "Falha de comunicação no heartbeat", { erro: String(error?.message || error) });
    return false;
  }
}

async function acknowledgeCommand(comandoId) {
  if (!comandoId) return false;
  return heartbeat(String(comandoId));
}

async function reportCommandStatus(comandoId, status, erro = "") {
  const cfg = await getConfig();
  if (!cfg.maquinaId || !cfg.token || !comandoId) return false;
  try {
    const response = await fetch(`${cfg.apiUrl}/api/tv/comando-status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        maquina_id: cfg.maquinaId,
        token: cfg.token,
        comando_id: String(comandoId),
        status,
        ...(erro ? { erro: String(erro).slice(0, 2000) } : {})
      }),
      cache: "no-store"
    });
    if (!response.ok) {
      await registrarEvento("error", "API recusou atualização do status do comando", { comandoId, status, httpStatus: response.status });
    }
    return response.ok;
  } catch (error) {
    await registrarEvento("error", "Falha ao reportar status do comando", { comandoId, status, erro: String(error?.message || error) });
    return false;
  }
}

async function syncDiagnosticLogs() {
  const cfg = await getConfig();
  if (!cfg.maquinaId || !cfg.token) return false;
  try {
    const state = await chrome.storage.local.get({
      diagnosticLogs: [],
      remoteUploadedEventIds: []
    });
    const logs = Array.isArray(state.diagnosticLogs) ? state.diagnosticLogs : [];
    const uploaded = new Set(Array.isArray(state.remoteUploadedEventIds) ? state.remoteUploadedEventIds : []);
    const batch = logs.filter((item) => item?.eventId && !uploaded.has(item.eventId)).slice(0, 50);
    if (!batch.length) return true;

    const response = await fetch(`${cfg.apiUrl}/api/tv/eventos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        maquina_id: cfg.maquinaId,
        token: cfg.token,
        eventos: batch.map((item) => ({
          tipo: "extension_log",
          nivel: item.nivel === "error" ? "erro" : item.nivel === "warn" ? "aviso" : item.nivel === "debug" ? "debug" : "info",
          mensagem: item.mensagem,
          detalhes: item.detalhes || {},
          ocorrido_em: item.timestamp
        }))
      }),
      cache: "no-store"
    });
    if (!response.ok) return false;

    const ids = [...uploaded, ...batch.map((item) => item.eventId)].slice(-600);
    await chrome.storage.local.set({ remoteUploadedEventIds: ids });
    return true;
  } catch {
    // Keep local logs intact while the API is unavailable; retry on the next heartbeat/poll.
    return false;
  }
}

async function startTabTurner(urlsInput, intervalInput = 60) {
  const urls = (Array.isArray(urlsInput) ? urlsInput : [])
    .map((item) => typeof item === 'string' ? item : item?.url)
    .map((item) => String(item || '').trim())
    .filter((url) => {
      try { return ['http:', 'https:'].includes(new URL(url).protocol); }
      catch { return false; }
    })
    .slice(0, 20);

  if (!urls.length) return false;
  const intervalSeconds = Math.min(3600, Math.max(30, Number(intervalInput) || 60));
  const currentState = await chrome.storage.local.get({ tabTurner: {} });
  const current = currentState.tabTurner || {};
  const sameConfig = current.enabled &&
    current.intervalSeconds === intervalSeconds &&
    JSON.stringify(current.urls || []) === JSON.stringify(urls);
  if (sameConfig) {
    const existingAlarm = await chrome.alarms.get(TAB_TURNER_ALARM);
    if (!existingAlarm) {
      await chrome.alarms.create(TAB_TURNER_ALARM, {
        periodInMinutes: Math.max(0.5, intervalSeconds / 60)
      });
    }
    return true;
  }
  const tabIds = [];
  for (const url of urls) {
    const matches = await chrome.tabs.query({ url });
    if (matches.length && matches[0].id != null) {
      tabIds.push(matches[0].id);
    } else {
      const tab = await chrome.tabs.create({ url, active: tabIds.length === 0 });
      if (tab?.id != null) tabIds.push(tab.id);
    }
  }

  await chrome.storage.local.set({
    tabTurner: {
      enabled: true,
      urls,
      tabIds,
      intervalSeconds,
      index: 0,
      updatedAt: new Date().toISOString()
    }
  });
  await chrome.alarms.clear(TAB_TURNER_ALARM);
  await chrome.alarms.create(TAB_TURNER_ALARM, {
    periodInMinutes: Math.max(0.5, intervalSeconds / 60)
  });
  await registrarEvento("info", "Tab Turner iniciado", { quantidade: urls.length, intervaloSegundos: intervalSeconds });
  return true;
}

async function stopTabTurner() {
  await chrome.alarms.clear(TAB_TURNER_ALARM);
  const { tabTurner = {} } = await chrome.storage.local.get({ tabTurner: {} });
  await chrome.storage.local.set({ tabTurner: { ...tabTurner, enabled: false, updatedAt: new Date().toISOString() } });
  await registrarEvento("info", "Tab Turner parado");
  return true;
}

async function rotateTabTurner() {
  const { tabTurner = {} } = await chrome.storage.local.get({ tabTurner: {} });
  if (!tabTurner.enabled || !Array.isArray(tabTurner.urls) || !tabTurner.urls.length) return;

  const tabs = await chrome.tabs.query({});
  const tabIds = [];
  for (const url of tabTurner.urls) {
    const existing = tabs.find((tab) => tab.url === url && tab.id != null);
    if (existing) tabIds.push(existing.id);
    else {
      try {
        const created = await chrome.tabs.create({ url, active: false });
        if (created?.id != null) tabIds.push(created.id);
      } catch (error) {
        await registrarEvento("error", "Tab Turner não conseguiu abrir uma URL", { url, erro: String(error?.message || error) });
      }
    }
  }
  if (!tabIds.length) return;

  const index = Number.isInteger(tabTurner.index) ? tabTurner.index : 0;
  const nextIndex = (index + 1) % tabIds.length;
  try {
    await chrome.tabs.update(tabIds[nextIndex], { active: true });
    await chrome.storage.local.set({
      tabTurner: { ...tabTurner, tabIds, index: nextIndex, lastRotationAt: new Date().toISOString() }
    });
  } catch (error) {
    await registrarEvento("error", "Tab Turner falhou ao alternar aba", { erro: String(error?.message || error) });
  }
}

async function syncRemoteConfig() {
  const cfg = await getConfig();
  if (!cfg.maquinaId || !cfg.token) return false;
  try {
    const url = new URL(`${cfg.apiUrl}/api/tv/config`);
    url.searchParams.set("maquina_id", cfg.maquinaId);
    url.searchParams.set("token", cfg.token);
    const response = await fetch(url.toString(), { method: "GET", cache: "no-store" });
    if (!response.ok) return false;
    const data = await response.json();
    const configuracao = data.configuracao && typeof data.configuracao === "object" ? data.configuracao : {};
    const perfil = data.perfil && typeof data.perfil === "object" ? data.perfil : null;
    const previousState = await chrome.storage.local.get({ remoteConfig: {} });
    const previousProfileId = previousState.remoteConfig?.perfil?.id || null;
    await chrome.storage.local.set({ remoteConfig: { configuracao, perfil, syncedAt: new Date().toISOString() } });

    if (perfil && perfil.ativo !== false && Array.isArray(perfil.sites) && perfil.sites.length) {
      await startTabTurner(perfil.sites, perfil.intervalo_segundos);
    } else if (configuracao.tab_turner_enabled === false ||
      (previousProfileId && !perfil && !Array.isArray(configuracao.sites))) {
      await stopTabTurner();
    } else if (configuracao.tab_turner_enabled === true && Array.isArray(configuracao.sites)) {
      await startTabTurner(configuracao.sites, configuracao.intervalo_segundos);
    }
    await registrarEvento("info", "Configuração remota sincronizada", { perfil: perfil?.nome || null });
    return true;
  } catch (error) {
    await registrarEvento("error", "Falha ao sincronizar configuração remota", { erro: String(error?.message || error) });
    return false;
  }
}

async function pollCommands() {
  const cfg = await getConfig();
  if (!cfg.maquinaId || !cfg.token) return;

  try {
    const url = new URL(`${cfg.apiUrl}/api/comandos`);
    url.searchParams.set("maquina_id", cfg.maquinaId);
    url.searchParams.set("token", cfg.token);

    const response = await fetch(url.toString(), {
      method: "GET",
      cache: "no-store"
    });

    if (!response.ok) {
      console.warn("[InfraHub] comandos:", response.status);
      await registrarEvento("error", "Consulta de comandos recusada pela API", { status: response.status });
      return;
    }

    const data = await response.json();
    const comandos = Array.isArray(data.comandos) ? data.comandos : [];

    await syncRemoteConfig();
    if (comandos.length) {
      console.log(`[InfraHub] ${comandos.length} comando(s) recebido(s).`);
      await registrarEvento("info", "Comandos recebidos", { quantidade: comandos.length, ids: comandos.map(c => c?.id).filter(Boolean) });
    }

    for (const comando of comandos) {
      try {
        await reportCommandStatus(comando?.id, "executando");
        const executado = await executeCommand(comando);

        if (executado) {
          await registrarEvento("info", "Comando executado localmente", { comandoId: comando?.id, tipo: comando?.tipo });
          const statusConfirmado = await reportCommandStatus(comando?.id, "concluido");
          const confirmado = statusConfirmado || await acknowledgeCommand(comando?.id);
          if (!confirmado) {
            console.warn("[InfraHub] comando executado, mas não confirmado:", comando?.id);
            await registrarEvento("error", "Comando executado, mas não confirmado pela API", { comandoId: comando?.id, tipo: comando?.tipo });
          } else {
            await registrarEvento("info", "Comando confirmado pela API", { comandoId: comando?.id, tipo: comando?.tipo });
          }
        } else {
          await reportCommandStatus(comando?.id, "falhou", "A extensão não conseguiu executar o comando.");
          await registrarEvento("error", "Comando não executado", { comandoId: comando?.id, tipo: comando?.tipo });
        }
      } catch (error) {
        console.error("[InfraHub] falha ao executar comando:", comando, error);
        await reportCommandStatus(comando?.id, "falhou", String(error?.message || error));
        await registrarEvento("error", "Exceção durante execução do comando", { comandoId: comando?.id, tipo: comando?.tipo, erro: String(error?.message || error) });
      }
    }
    await syncDiagnosticLogs();
  } catch (error) {
    console.warn("[InfraHub] falha ao buscar comandos:", error);
    await registrarEvento("error", "Falha ao consultar comandos", { erro: String(error?.message || error) });
  }
}

async function executeCommand(comando) {
  const tipo = String(comando?.tipo || "").trim().toLowerCase();

  let payload = comando?.payload || {};
  if (typeof payload === "string") {
    try {
      payload = JSON.parse(payload);
    } catch {
      payload = {};
    }
  }

  console.log("[InfraHub] executando comando:", {
    id: comando?.id,
    tipo,
    payload
  });
  await registrarEvento("info", "Iniciando comando", { comandoId: comando?.id, tipo });

  if (tipo === "tab_turner_start") {
    return startTabTurner(payload?.urls || payload?.sites || [], payload?.intervalSeconds || payload?.intervalo_segundos);
  }

  if (tipo === "tab_turner_stop") {
    return stopTabTurner();
  }

  if (tipo === "config_sync") {
    return syncRemoteConfig();
  }

  if (tipo === "reload") {
    const tab = await getCurrentTab();

    if (tab?.id != null) {
      console.log("[InfraHub] recarregando aba:", tab.id, tab.url || "");
      await chrome.tabs.reload(tab.id);
      return true;
    }

    console.warn("[InfraHub] nenhuma aba encontrada para reload.");
    return false;
  }

  if (tipo === "navigate" || tipo === "navegar") {
    const url = payload?.url || payload?.url_atual;

    if (!url) {
      console.warn("[InfraHub] comando navigate sem URL.");
      return false;
    }

    const destino = String(url).trim();

    if (!/^https?:\/\//i.test(destino)) {
      console.warn("[InfraHub] URL inválida para navigate:", destino);
      return false;
    }

    const tab = await getCurrentTab();

    if (tab?.id != null) {
      try {
        console.log("[InfraHub] navegando aba:", {
          tabId: tab.id,
          de: tab.url || "",
          para: destino
        });

        await chrome.tabs.update(tab.id, {
          url: destino,
          active: true
        });

        return true;
      } catch (error) {
        console.warn(
          "[InfraHub] tabs.update rejeitado; tentando nova aba:",
          error
        );
      }
    }

    try {
      const novaAba = await chrome.tabs.create({
        url: destino,
        active: true
      });

      console.log("[InfraHub] navegação realizada em nova aba:", novaAba.id);
      return true;
    } catch (error) {
      console.error("[InfraHub] falha ao navegar para:", destino, error);
      return false;
    }
  }

  if (tipo === "abrir_urls" || tipo === "abrir_url") {
    const urls = Array.isArray(payload?.urls)
      ? payload.urls
      : payload?.url
        ? [payload.url]
        : [];

    const validUrls = urls
      .map(url => String(url || "").trim())
      .filter(url => /^https?:\/\//i.test(url));

    if (!validUrls.length) {
      console.warn("[InfraHub] comando abrir_urls sem URLs HTTP/HTTPS válidas.");
      return false;
    }

    const primeiraUrl = validUrls[0];
    const tabAtual = await getCurrentTab();

    if (tabAtual?.id != null) {
      try {
        await chrome.tabs.update(tabAtual.id, {
          url: primeiraUrl,
          active: true
        });
      } catch (error) {
        console.warn(
          "[InfraHub] tabs.update rejeitado em abrir_urls; usando nova aba:",
          error
        );

        try {
          await chrome.tabs.create({
            url: primeiraUrl,
            active: true
          });
        } catch (createError) {
          console.error(
            "[InfraHub] falha ao abrir primeira URL:",
            primeiraUrl,
            createError
          );
          return false;
        }
      }
    } else {
      try {
        await chrome.tabs.create({ url: primeiraUrl, active: true });
      } catch (error) {
        console.error(
          "[InfraHub] falha ao abrir primeira URL:",
          primeiraUrl,
          error
        );
        return false;
      }
    }

    for (const url of validUrls.slice(1)) {
      await chrome.tabs.create({ url, active: false });
    }

    console.log("[InfraHub] URLs abertas:", validUrls);
    return true;
  }

  console.warn("[InfraHub] comando desconhecido:", comando);
  return false;
}

async function ensureAlarms() {
  await chrome.alarms.create(HEARTBEAT_ALARM, {
    periodInMinutes: HEARTBEAT_MINUTES
  });

  await chrome.alarms.create(COMMANDS_ALARM, {
    periodInMinutes: COMMANDS_POLL_MINUTES
  });
}

chrome.runtime.onInstalled.addListener(async () => {
  await registrarEvento("info", "Extensão instalada ou atualizada", { versao: chrome.runtime.getManifest().version });
  await ensureAlarms();
  await heartbeat();
  await pollCommands();
});

chrome.runtime.onStartup.addListener(async () => {
  await registrarEvento("info", "Navegador iniciado", { versao: chrome.runtime.getManifest().version });
  await ensureAlarms();
  await heartbeat();
  await pollCommands();
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === HEARTBEAT_ALARM) {
    await heartbeat();
  }

  if (alarm.name === COMMANDS_ALARM) {
    await pollCommands();
  }

  if (alarm.name === TAB_TURNER_ALARM) {
    await rotateTabTurner();
  }
});

chrome.storage.onChanged.addListener(async (changes, area) => {
  if (
    area === "local" &&
    (changes.apiUrl || changes.maquinaId || changes.token)
  ) {
    await ensureAlarms();
    await heartbeat();
    await pollCommands();
  }
});

(async () => {
  await ensureAlarms();
})();
