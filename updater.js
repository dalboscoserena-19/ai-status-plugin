/**
 * AI Status Updater — Cron Job Script
 * =====================================
 * Fetcha i changelog ufficiali di Anthropic, OpenAI, Google e Perplexity,
 * estrae gli aggiornamenti rilevanti e aggiorna ai-updates.json
 *
 * SETUP:
 *   npm install node-fetch cheerio
 *
 * USO MANUALE:
 *   node updater.js
 *
 * CRON (ogni 6 ore):
 *   0 */6 * * * /usr/bin/node /path/to/updater.js >> /var/log/ai-updater.log 2>&1
 *
 * GITHUB ACTIONS (alternativa gratuita, vedere README):
 *   Usa il workflow .github/workflows/update.yml incluso
 */

import fetch from "node-fetch";
import * as cheerio from "cheerio";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_FILE = path.join(__dirname, "ai-updates.json");

// ─── Configurazione provider ──────────────────────────────────────────────────

const PROVIDERS = {
  anthropic: {
    id: "anthropic",
    name: "Claude (Anthropic)",
    color: "#D97706",
    logo: "🟠",
    sources: [
      {
        url: "https://docs.anthropic.com/en/release-notes/overview",
        type: "html",
        selector: ".release-note, article, .changelog-entry, h2, h3",
        dateSelector: "time, .date, .release-date",
      },
    ],
    keywords: {
      breaking: [
        "breaking",
        "deprecated",
        "removed",
        "no longer",
        "discontinu",
      ],
      behavior: [
        "behavior",
        "behaviour",
        "response",
        "output",
        "safety",
        "refusal",
        "instruction",
        "prompt",
        "system prompt",
      ],
      performance: ["faster", "improved", "latency", "speed", "accuracy"],
      model: ["model", "claude", "haiku", "sonnet", "opus"],
    },
  },

  openai: {
    id: "openai",
    name: "OpenAI (GPT)",
    color: "#059669",
    logo: "🟢",
    sources: [
      {
        url: "https://platform.openai.com/docs/changelog",
        type: "html",
        selector: "article, .changelog-item, h2, h3, p",
        dateSelector: "time, .date",
      },
    ],
    keywords: {
      breaking: ["deprecated", "sunset", "removed", "breaking change"],
      behavior: [
        "behavior",
        "model behavior",
        "output",
        "responses",
        "safety",
        "alignment",
      ],
      performance: ["faster", "improved", "latency", "speed"],
      model: ["gpt-4", "gpt-3.5", "o1", "o3", "model"],
    },
  },

  google: {
    id: "google",
    name: "Google (Gemini)",
    color: "#2563EB",
    logo: "🔵",
    sources: [
      {
        url: "https://ai.google.dev/gemini-api/docs/changelog",
        type: "html",
        selector: "h2, h3, p, li, article",
        dateSelector: "time, .date",
      },
    ],
    keywords: {
      breaking: ["deprecated", "breaking", "removed", "discontinu"],
      behavior: ["behavior", "output", "response", "safety", "model card"],
      performance: ["faster", "improved", "latency"],
      model: ["gemini", "pro", "ultra", "flash", "nano"],
    },
  },

  perplexity: {
    id: "perplexity",
    name: "Perplexity AI",
    color: "#7C3AED",
    logo: "🟣",
    sources: [
      {
        // Blog ufficiale — pubblicano update dei modelli e cambi comportamento
        url: "https://www.perplexity.ai/hub/blog",
        type: "html",
        selector: "article, h2, h3, p, .post-title, .blog-post",
        dateSelector: "time, .date, .published",
      },
      {
        // Changelog API su docs ufficiali
        url: "https://docs.perplexity.ai/changelog",
        type: "html",
        selector: "h2, h3, p, li, article, .changelog-entry",
        dateSelector: "time, .date",
      },
    ],
    keywords: {
      breaking: ["deprecated", "breaking", "removed", "discontinu", "sunset", "no longer supported"],
      behavior: [
        "behavior", "behaviour", "output", "response", "search results",
        "citations", "sources", "hallucin", "accuracy", "model update",
        "prompt", "system prompt", "instruction following",
      ],
      performance: ["faster", "improved", "latency", "speed", "context window", "tokens"],
      model: ["sonar", "pplx", "perplexity", "llama", "mistral", "online", "model"],
    },
  },

  copilot: {
    id: "copilot",
    name: "Microsoft Copilot",
    color: "#0078D4",
    logo: "🔷",
    sources: [
      {
        // Release notes ufficiali Microsoft Copilot
        url: "https://learn.microsoft.com/en-us/copilot/microsoft-365/release-notes",
        type: "html",
        selector: "h2, h3, p, li, .release-note, article",
        dateSelector: "time, .date, .ms-date",
      },
      {
        // What's new — aggiornamenti funzionalità e modelli
        url: "https://learn.microsoft.com/en-us/copilot/microsoft-365/whats-new",
        type: "html",
        selector: "h2, h3, p, li, article",
        dateSelector: "time, .date",
      },
      {
        // Blog ufficiale Microsoft AI — annunci principali
        url: "https://blogs.microsoft.com/ai/",
        type: "html",
        selector: "article, h2, h3, .post-title, .entry-title, p",
        dateSelector: "time, .date, .entry-date",
      },
    ],
    keywords: {
      breaking: ["deprecated", "breaking", "removed", "discontinu", "sunset", "retiring", "end of support"],
      behavior: [
        "behavior", "behaviour", "response", "output", "plugin",
        "prompt", "instruction", "safety", "responsible ai",
        "content filter", "grounding", "citation", "web search",
      ],
      performance: ["faster", "improved", "latency", "speed", "accuracy", "context window"],
      model: ["copilot", "gpt-4", "phi", "model", "bing", "azure openai", "microsoft 365"],
    },
  },
};

// ─── Logica di severity ────────────────────────────────────────────────────────

function computeSeverity(text, providerKeywords) {
  const t = text.toLowerCase();
  if (providerKeywords.breaking.some((k) => t.includes(k))) return "high";
  if (providerKeywords.behavior.some((k) => t.includes(k))) return "medium";
  if (providerKeywords.performance.some((k) => t.includes(k))) return "low";
  return "info";
}

function severityLabel(severity) {
  return { high: "Breaking / Rimozione", medium: "Cambio comportamento", low: "Miglioramento", info: "Info" }[severity] || "Info";
}

// ─── Fetch helpers ─────────────────────────────────────────────────────────────

async function fetchHTML(url) {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; AIStatusBot/1.0)",
        Accept: "text/html,application/xhtml+xml",
      },
      timeout: 15000,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } catch (err) {
    console.warn(`  ⚠ Fetch fallito per ${url}: ${err.message}`);
    return null;
  }
}

function parseDate(str) {
  if (!str) return null;
  const d = new Date(str.trim());
  return isNaN(d) ? null : d.toISOString().split("T")[0];
}

function todayISO() {
  return new Date().toISOString().split("T")[0];
}

// ─── Parser per ogni provider ──────────────────────────────────────────────────

async function scrapeProvider(provider) {
  console.log(`\n🔍 Fetching ${provider.name}...`);
  const items = [];

  for (const source of provider.sources) {
    const html = await fetchHTML(source.url);
    if (!html) continue;

    const $ = cheerio.load(html);
    const seen = new Set();

    // Estrai blocchi di testo significativi
    $(source.selector).each((_, el) => {
      const text = $(el).text().trim().replace(/\s+/g, " ");
      if (text.length < 40 || text.length > 600) return;
      if (seen.has(text)) return;
      seen.add(text);

      // Cerca una data vicina all'elemento
      let dateStr = null;
      const timeEl = $(el).find(source.dateSelector).first();
      if (timeEl.length) {
        dateStr = timeEl.attr("datetime") || timeEl.text();
      }
      if (!dateStr) {
        const prevTime = $(el).prevAll(source.dateSelector).first();
        if (prevTime.length) dateStr = prevTime.attr("datetime") || prevTime.text();
      }

      const severity = computeSeverity(text, provider.keywords);

      // Filtra solo update rilevanti (behavior o breaking, non pure info)
      if (severity === "info" && !provider.keywords.model.some((k) => text.toLowerCase().includes(k))) return;

      items.push({
        id: `${provider.id}-${Date.now()}-${items.length}`,
        provider: provider.id,
        providerName: provider.name,
        providerColor: provider.color,
        date: parseDate(dateStr) || todayISO(),
        text: text.substring(0, 300),
        severity,
        severityLabel: severityLabel(severity),
        source: source.url,
      });
    });

    console.log(`  ✓ Estratti ${items.length} item da ${source.url}`);
  }

  // Ordina per data, prendi i 10 più recenti
  return items
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 10);
}

// ─── Calcolo stato globale ─────────────────────────────────────────────────────

function computeGlobalStatus(allItems) {
  const recent = allItems.filter((i) => {
    const d = new Date(i.date);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 14);
    return d >= cutoff;
  });

  if (recent.some((i) => i.severity === "high")) {
    return { level: "high", label: "Attenzione — modifiche importanti", color: "#DC2626" };
  }
  if (recent.some((i) => i.severity === "medium")) {
    return { level: "medium", label: "Aggiornamenti recenti — verifica consigliata", color: "#D97706" };
  }
  if (recent.some((i) => i.severity === "low")) {
    return { level: "low", label: "Piccoli aggiornamenti in corso", color: "#059669" };
  }
  return { level: "ok", label: "Nessuna modifica rilevante", color: "#6B7280" };
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🚀 AI Status Updater avviato —", new Date().toISOString());

  const allItems = [];

  for (const provider of Object.values(PROVIDERS)) {
    try {
      const items = await scrapeProvider(provider);
      allItems.push(...items);
    } catch (err) {
      console.error(`  ✗ Errore su ${provider.name}:`, err.message);
    }
  }

  // Ordina tutto per data
  allItems.sort((a, b) => new Date(b.date) - new Date(a.date));

  const globalStatus = computeGlobalStatus(allItems);

  const output = {
    _meta: {
      version: "1.0",
      lastUpdated: new Date().toISOString(),
      nextUpdate: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
      totalItems: allItems.length,
    },
    globalStatus,
    providers: Object.values(PROVIDERS).map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      logo: p.logo,
      itemCount: allItems.filter((i) => i.provider === p.id).length,
    })),
    updates: allItems,
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), "utf8");
  console.log(`\n✅ Salvato ${allItems.length} update in ai-updates.json`);
  console.log(`   Stato globale: ${globalStatus.label}`);
}

main().catch((err) => {
  console.error("❌ Errore fatale:", err);
  process.exit(1);
});
