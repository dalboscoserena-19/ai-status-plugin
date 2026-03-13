/**
 * AI Status Widget — Plugin embeddabile
 * ========================================
 * Versione: 1.2.0
 *
 * UTILIZZO:
 *   <script
 *     src="./ai-status-widget.js"
 *     data-json="./ai-updates.json"
 *     data-providers="anthropic,openai,google"
 *     data-lang="it"
 *     data-position="bottom-right"
 *   ></script>
 *
 * OPZIONI (attributi data-*):
 *   data-json        Percorso al file ai-updates.json  [default: ./ai-updates.json]
 *   data-providers   Provider da mostrare, separati da virgola  [default: tutti]
 *   data-lang        Lingua UI: "it" | "en"  [default: it]
 *   data-position    Posizione badge: "bottom-right" | "bottom-left" | "top-right" | "top-left"
 *   data-max-items   Max update nel pannello  [default: 10]
 *   data-target      ID elemento in cui iniettare (alternativa al badge fisso)
 */

(function () {
  "use strict";

  // ─── Config da attributi script ─────────────────────────────────────────────
  const scriptTag =
    document.currentScript ||
    document.querySelector('script[src*="ai-status-widget"]');

  const CONFIG = {
    jsonUrl: scriptTag?.dataset.json || "./ai-updates.json",
    providers: scriptTag?.dataset.providers
      ? scriptTag.dataset.providers.split(",").map((s) => s.trim())
      : null,
    lang: scriptTag?.dataset.lang || "it",
    position: scriptTag?.dataset.position || "bottom-right",
    maxItems: parseInt(scriptTag?.dataset.maxItems || "10", 10),
    target: scriptTag?.dataset.target || null,
    refreshMs: 6 * 60 * 60 * 1000, // 6 ore
  };

  // ─── Traduzioni ──────────────────────────────────────────────────────────────
  const STRINGS = {
    it: {
      title: "Stato AI",
      subtitle_updates: (n) => `${n} aggiornament${n === 1 ? "o" : "i"} recenti`,
      subtitle_ok: "Nessuna modifica rilevante",
      panel_title: "Aggiornamenti AI",
      filter_all: "Tutti",
      footer: "Aggiornato automaticamente dai changelog ufficiali",
      last_updated: "Ultimo aggiornamento:",
      severity: {
        high: "⚠ Critico",
        medium: "● Comportamento",
        low: "↑ Miglioramento",
        info: "· Info",
      },
      close: "Chiudi",
      no_items: "Nessun aggiornamento trovato.",
    },
    en: {
      title: "AI Status",
      subtitle_updates: (n) => `${n} recent update${n === 1 ? "" : "s"}`,
      subtitle_ok: "No relevant changes",
      panel_title: "AI Updates",
      filter_all: "All",
      footer: "Auto-updated from official changelogs",
      last_updated: "Last updated:",
      severity: {
        high: "⚠ Critical",
        medium: "● Behavior",
        low: "↑ Improvement",
        info: "· Info",
      },
      close: "Close",
      no_items: "No updates found.",
    },
  };
  const T = STRINGS[CONFIG.lang] || STRINGS.it;

  // ─── Severity helpers ────────────────────────────────────────────────────────
  const SEVERITY_COLOR = {
    high:   { bg: "#FEF2F2", text: "#DC2626", border: "#FCA5A5", dot: "#DC2626" },
    medium: { bg: "#FFFBEB", text: "#D97706", border: "#FCD34D", dot: "#D97706" },
    low:    { bg: "#F0FDF4", text: "#059669", border: "#86EFAC", dot: "#059669" },
    info:   { bg: "#F9FAFB", text: "#6B7280", border: "#E5E7EB", dot: "#9CA3AF" },
  };

  const STATUS_COLOR = {
    high:   { bg: "#DC2626", pulse: "rgba(220,38,38,0.3)" },
    medium: { bg: "#D97706", pulse: "rgba(217,119,6,0.3)" },
    low:    { bg: "#059669", pulse: "rgba(5,150,105,0.3)" },
    ok:     { bg: "#6B7280", pulse: "rgba(107,114,128,0.2)" },
  };

  // ─── Stato interno ───────────────────────────────────────────────────────────
  let _data = null;
  let _panelOpen = false;
  let _activeFilter = "all";
  let _widget = null;

  // ─── Fetch dati ──────────────────────────────────────────────────────────────
  async function loadData() {
    try {
      const res = await fetch(CONFIG.jsonUrl + "?t=" + Date.now());
      if (!res.ok) throw new Error("HTTP " + res.status);
      _data = await res.json();
      render();
    } catch (err) {
      console.warn("[ai-status-widget] Impossibile caricare", CONFIG.jsonUrl, err);
    }
  }

  // ─── CSS iniettato ────────────────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById("aisw-styles")) return;
    const style = document.createElement("style");
    style.id = "aisw-styles";
    style.textContent = `
      #aisw-root { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }

      /* Badge fisso */
      #aisw-badge {
        position: fixed;
        z-index: 99999;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 14px 8px 10px;
        background: #1a1a2e;
        color: #fff;
        border-radius: 100px;
        font-size: 13px;
        font-weight: 500;
        box-shadow: 0 4px 20px rgba(0,0,0,0.25);
        transition: transform 0.15s, box-shadow 0.15s;
        user-select: none;
        border: 1px solid rgba(255,255,255,0.08);
      }
      #aisw-badge:hover { transform: translateY(-2px); box-shadow: 0 6px 24px rgba(0,0,0,0.35); }
      #aisw-badge.pos-br { bottom: 24px; right: 24px; }
      #aisw-badge.pos-bl { bottom: 24px; left: 24px; }
      #aisw-badge.pos-tr { top: 24px; right: 24px; }
      #aisw-badge.pos-tl { top: 24px; left: 24px; }

      .aisw-dot {
        width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
        animation: aisw-pulse 2s ease-in-out infinite;
      }
      @keyframes aisw-pulse {
        0%,100% { box-shadow: 0 0 0 0 var(--pulse-color, rgba(217,119,6,0.4)); }
        50%      { box-shadow: 0 0 0 5px transparent; }
      }

      .aisw-badge-count {
        background: rgba(255,255,255,0.15);
        border-radius: 20px;
        padding: 1px 7px;
        font-size: 11px;
        font-weight: 600;
      }

      /* Panel */
      #aisw-panel {
        position: fixed;
        z-index: 99998;
        width: 360px;
        max-height: 70vh;
        background: #fff;
        border-radius: 16px;
        box-shadow: 0 8px 40px rgba(0,0,0,0.18);
        border: 1px solid #e5e7eb;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        transition: opacity 0.2s, transform 0.2s;
        font-size: 13px;
      }
      #aisw-panel.hidden { opacity: 0; pointer-events: none; transform: translateY(8px) scale(0.98); }
      #aisw-panel.pos-br { bottom: 72px; right: 24px; }
      #aisw-panel.pos-bl { bottom: 72px; left: 24px; }
      #aisw-panel.pos-tr { top: 72px; right: 24px; }
      #aisw-panel.pos-tl { top: 72px; left: 24px; }

      /* Dark mode */
      @media (prefers-color-scheme: dark) {
        #aisw-panel { background: #1f2937; border-color: #374151; color: #f9fafb; }
        .aisw-panel-header { background: #111827 !important; border-color: #374151 !important; }
        .aisw-item { border-color: #374151 !important; }
        .aisw-item-text { color: #e5e7eb !important; }
        .aisw-item-meta { color: #9ca3af !important; }
        .aisw-filters { background: #111827 !important; border-color: #374151 !important; }
        .aisw-filter-btn { color: #9ca3af !important; }
        .aisw-filter-btn.active { background: #374151 !important; color: #f9fafb !important; }
        .aisw-footer { background: #111827 !important; border-color: #374151 !important; color: #6b7280 !important; }
        .aisw-sev-badge { opacity: 0.85; }
      }

      .aisw-panel-header {
        padding: 14px 16px 12px;
        background: #f9fafb;
        border-bottom: 1px solid #e5e7eb;
        flex-shrink: 0;
      }
      .aisw-panel-title {
        font-size: 14px; font-weight: 600; color: #111827; margin: 0 0 2px;
      }
      .aisw-panel-meta { font-size: 11px; color: #9ca3af; }

      .aisw-filters {
        display: flex; gap: 6px; padding: 10px 16px;
        background: #f9fafb; border-bottom: 1px solid #e5e7eb;
        flex-shrink: 0; flex-wrap: wrap;
      }
      .aisw-filter-btn {
        padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 500;
        border: 1px solid #e5e7eb; background: transparent;
        color: #6b7280; cursor: pointer; transition: all 0.12s;
      }
      .aisw-filter-btn:hover, .aisw-filter-btn.active {
        background: #1a1a2e; color: #fff; border-color: #1a1a2e;
      }

      .aisw-items { overflow-y: auto; flex: 1; padding: 0; }

      .aisw-item {
        padding: 12px 16px; border-bottom: 1px solid #f3f4f6;
        display: flex; gap: 10px; align-items: flex-start;
      }
      .aisw-item:last-child { border-bottom: none; }
      .aisw-item-dot {
        width: 6px; height: 6px; border-radius: 50%;
        margin-top: 5px; flex-shrink: 0;
      }
      .aisw-item-body { flex: 1; min-width: 0; }
      .aisw-item-text {
        font-size: 12px; line-height: 1.55; color: #374151;
        margin: 0 0 5px; word-break: break-word;
      }
      .aisw-item-bottom { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
      .aisw-item-meta { font-size: 11px; color: #9ca3af; }
      .aisw-sev-badge {
        font-size: 10px; font-weight: 600; padding: 1px 6px;
        border-radius: 4px; flex-shrink: 0;
      }
      .aisw-empty { padding: 24px 16px; text-align: center; color: #9ca3af; font-size: 12px; }

      .aisw-footer {
        padding: 8px 16px; background: #f9fafb;
        border-top: 1px solid #e5e7eb;
        font-size: 10px; color: #9ca3af;
        flex-shrink: 0; text-align: center; line-height: 1.4;
      }

      /* Inline mode (target) */
      .aisw-inline { border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden; font-family: inherit; }
      .aisw-inline #aisw-panel {
        position: static; width: 100%; max-height: none;
        box-shadow: none; border: none; border-radius: 0;
      }
    `;
    document.head.appendChild(style);
  }

  // ─── Build badge ──────────────────────────────────────────────────────────────
  function buildBadge() {
    const status = _data?.globalStatus || { level: "ok" };
    const sc = STATUS_COLOR[status.level] || STATUS_COLOR.ok;
    const recentCount = getFilteredItems("all").filter((i) => {
      const d = new Date(i.date);
      const week = new Date(); week.setDate(week.getDate() - 7);
      return d >= week;
    }).length;

    const posClass = "pos-" + CONFIG.position.replace("-", "").replace("bottom", "b").replace("top", "t").replace("right", "r").replace("left", "l");

    const badge = document.createElement("div");
    badge.id = "aisw-badge";
    badge.className = posClass;
    badge.setAttribute("role", "button");
    badge.setAttribute("aria-label", T.title);
    badge.innerHTML = `
      <div class="aisw-dot" style="background:${sc.bg};--pulse-color:${sc.pulse}"></div>
      <span>${T.title}</span>
      ${recentCount > 0 ? `<span class="aisw-badge-count">${recentCount}</span>` : ""}
    `;
    badge.addEventListener("click", togglePanel);
    return badge;
  }

  // ─── Build panel ─────────────────────────────────────────────────────────────
  function buildPanel() {
    const posClass = "pos-" + CONFIG.position.replace("-", "").replace("bottom", "b").replace("top", "t").replace("right", "r").replace("left", "l");
    const meta = _data?._meta;
    const lastUpdated = meta?.lastUpdated ? new Date(meta.lastUpdated).toLocaleString(CONFIG.lang === "it" ? "it-IT" : "en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";

    const panel = document.createElement("div");
    panel.id = "aisw-panel";
    panel.className = `${posClass} hidden`;

    // Header
    const header = document.createElement("div");
    header.className = "aisw-panel-header";
    header.innerHTML = `
      <div class="aisw-panel-title">${T.panel_title}</div>
      <div class="aisw-panel-meta">${T.last_updated} ${lastUpdated}</div>
    `;
    panel.appendChild(header);

    // Filters
    const providers = _data?.providers || [];
    const filtersEl = document.createElement("div");
    filtersEl.className = "aisw-filters";
    filtersEl.innerHTML = `<button class="aisw-filter-btn active" data-filter="all">${T.filter_all}</button>` +
      providers
        .filter((p) => !CONFIG.providers || CONFIG.providers.includes(p.id))
        .map((p) => `<button class="aisw-filter-btn" data-filter="${p.id}">${p.name.split(" ")[0]}</button>`)
        .join("");
    filtersEl.addEventListener("click", (e) => {
      const btn = e.target.closest(".aisw-filter-btn");
      if (!btn) return;
      filtersEl.querySelectorAll(".aisw-filter-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      _activeFilter = btn.dataset.filter;
      renderItems(itemsContainer);
    });
    panel.appendChild(filtersEl);

    // Items
    const itemsContainer = document.createElement("div");
    itemsContainer.className = "aisw-items";
    renderItems(itemsContainer);
    panel.appendChild(itemsContainer);

    // Footer
    const footer = document.createElement("div");
    footer.className = "aisw-footer";
    footer.textContent = T.footer;
    panel.appendChild(footer);

    // Click outside to close
    setTimeout(() => {
      document.addEventListener("click", outsideClickHandler);
    }, 50);

    return panel;
  }

  function renderItems(container) {
    const items = getFilteredItems(_activeFilter).slice(0, CONFIG.maxItems);
    if (items.length === 0) {
      container.innerHTML = `<div class="aisw-empty">${T.no_items}</div>`;
      return;
    }
    container.innerHTML = items.map((item) => {
      const sc = SEVERITY_COLOR[item.severity] || SEVERITY_COLOR.info;
      const label = T.severity[item.severity] || item.severityLabel || "";
      const date = new Date(item.date).toLocaleDateString(CONFIG.lang === "it" ? "it-IT" : "en-GB", { day: "2-digit", month: "short", year: "numeric" });
      return `
        <div class="aisw-item">
          <div class="aisw-item-dot" style="background:${sc.dot}"></div>
          <div class="aisw-item-body">
            <p class="aisw-item-text">${escapeHtml(item.text)}</p>
            <div class="aisw-item-bottom">
              <span class="aisw-sev-badge" style="background:${sc.bg};color:${sc.text};border:1px solid ${sc.border}">${label}</span>
              <span class="aisw-item-meta">${escapeHtml(item.providerName)} · ${date}</span>
            </div>
          </div>
        </div>
      `;
    }).join("");
  }

  function getFilteredItems(filter) {
    if (!_data?.updates) return [];
    return _data.updates.filter((item) => {
      if (filter !== "all" && item.provider !== filter) return false;
      if (CONFIG.providers && !CONFIG.providers.includes(item.provider)) return false;
      return true;
    });
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // ─── Toggle panel ─────────────────────────────────────────────────────────────
  function togglePanel(e) {
    e.stopPropagation();
    _panelOpen = !_panelOpen;

    if (_panelOpen) {
      const panel = buildPanel();
      document.body.appendChild(panel);
      requestAnimationFrame(() => panel.classList.remove("hidden"));
    } else {
      closePanelEl();
    }
  }

  function closePanelEl() {
    const panel = document.getElementById("aisw-panel");
    if (panel) {
      panel.classList.add("hidden");
      setTimeout(() => panel.remove(), 200);
    }
    _panelOpen = false;
    document.removeEventListener("click", outsideClickHandler);
  }

  function outsideClickHandler(e) {
    const panel = document.getElementById("aisw-panel");
    const badge = document.getElementById("aisw-badge");
    if (panel && !panel.contains(e.target) && badge && !badge.contains(e.target)) {
      closePanelEl();
    }
  }

  // ─── Render principale ───────────────────────────────────────────────────────
  function render() {
    const root = document.getElementById("aisw-root");
    if (!root) return;

    // Aggiorna badge
    const existingBadge = document.getElementById("aisw-badge");
    const newBadge = buildBadge();
    if (existingBadge) existingBadge.replaceWith(newBadge);
    else root.appendChild(newBadge);

    // Aggiorna panel se aperto
    if (_panelOpen) {
      closePanelEl();
      _panelOpen = false;
    }
  }

  // ─── Init ────────────────────────────────────────────────────────────────────
  function init() {
    injectStyles();

    // Crea root
    const root = document.createElement("div");
    root.id = "aisw-root";
    document.body.appendChild(root);

    // Badge placeholder loading
    const placeholder = document.createElement("div");
    placeholder.id = "aisw-badge";
    placeholder.className = "pos-" + CONFIG.position.replace("-", "").replace("bottom","b").replace("top","t").replace("right","r").replace("left","l");
    placeholder.style.opacity = "0.5";
    placeholder.innerHTML = `<div class="aisw-dot" style="background:#9ca3af;--pulse-color:rgba(156,163,175,0.3)"></div><span>${T.title}</span>`;
    root.appendChild(placeholder);

    // Carica dati
    loadData();

    // Auto-refresh ogni 6 ore
    setInterval(loadData, CONFIG.refreshMs);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
