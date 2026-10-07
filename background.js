const DEFAULT_API_URL =
  "https://infrahub-monitor-api.vercel.app";

const HEARTBEAT_ALARM = "infrahub-heartbeat";
const COMMANDS_ALARM = "infrahub-commands";
const POLL_MINUTES = 0.5;

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
    }

    return response.ok;
  } catch (error) {
    console.warn("[InfraHub] falha no heartbeat:", error);
    return false;
  }
}

async function acknowledgeCommand(comandoId) {
  if (!comandoId) return false;
  return heartbeat(String(comandoId));
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
      return;
    }

    const data = await response.json();
    const comandos = Array.isArray(data.comandos) ? data.comandos : [];

    if (comandos.length) {
      console.log(`[InfraHub] ${comandos.length} comando(s) recebido(s).`);
    }

    for (const comando of comandos) {
      try {
        const executado = await executeCommand(comando);

        if (executado) {
          const confirmado = await acknowledgeCommand(comando?.id);
          if (!confirmado) {
            console.warn("[InfraHub] comando executado, mas não confirmado:", comando?.id);
          }
        }
      } catch (error) {
        console.error("[InfraHub] falha ao executar comando:", comando, error);
      }
    }
  } catch (error) {
    console.warn("[InfraHub] falha ao buscar comandos:", error);
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

    const tab = await getCurrentTab();

    if (tab?.id != null) {
      await chrome.tabs.update(tab.id, { url: String(url) });
      return true;
    }

    console.warn("[InfraHub] nenhuma aba encontrada para navigate.");
    return false;
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

    for (const url of validUrls) {
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
    periodInMinutes: POLL_MINUTES
  });

  await chrome.alarms.create(COMMANDS_ALARM, {
    periodInMinutes: POLL_MINUTES
  });
}

chrome.runtime.onInstalled.addListener(async () => {
  await ensureAlarms();
  await heartbeat();
  await pollCommands();
});

chrome.runtime.onStartup.addListener(async () => {
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
