# AI Status Widget 🟠

Plugin embeddabile che mostra in tempo reale gli aggiornamenti e i cambi comportamento delle AI (Claude, OpenAI, Gemini) nelle tue tool/webapp.

---

## File inclusi

| File | Cosa fa |
|------|---------|
| `ai-status-widget.js` | Il plugin — va incluso nelle tue pagine HTML |
| `ai-updates.json` | Il file dati — aggiornato automaticamente |
| `updater.js` | Script Node.js che fetcha i changelog e aggiorna il JSON |
| `demo.html` | Pagina di esempio funzionante |
| `.github/workflows/update.yml` | GitHub Actions per aggiornamento automatico ogni 6h |

---

## Setup rapido (5 minuti)

### 1. Copia i file nella tua project root
```
la-tua-tool/
├── ai-status-widget.js   ← copia qui
├── ai-updates.json       ← copia qui
└── index.html            ← la tua pagina
```

### 2. Incolla questo tag prima di `</body>` in ogni pagina

```html
<script
  src="./ai-status-widget.js"
  data-json="./ai-updates.json"
  data-position="bottom-right"
  data-providers="anthropic,openai,google,perplexity,copilot"
  data-lang="it"
  data-max-items="10">
</script>
```

Fatto. Il badge "Stato AI" appare nell'angolo della pagina.

---

## Opzioni configurabili

| Attributo | Valori possibili | Default |
|-----------|-----------------|---------|
| `data-json` | percorso al file JSON | `./ai-updates.json` |
| `data-position` | `bottom-right` `bottom-left` `top-right` `top-left` | `bottom-right` |
| `data-providers` | `anthropic` `openai` `google` `perplexity` `copilot` (separati da virgola) | tutti |
| `data-lang` | `it` `en` | `it` |
| `data-max-items` | numero intero | `10` |

---

## Aggiornamento automatico dei dati

### Opzione A — GitHub Actions (consigliata, gratuita)

1. Carica tutto il progetto su un repo GitHub
2. Il file `.github/workflows/update.yml` è già configurato
3. GitHub esegue `updater.js` ogni 6 ore, fa commit del JSON aggiornato
4. Punta `data-json` all'URL raw del file su GitHub:

```html
data-json="https://raw.githubusercontent.com/TUO-USERNAME/TUO-REPO/main/ai-updates.json"
```

### Opzione B — Cron job sul tuo server

```bash
# Installa dipendenze (una volta sola)
npm install

# Aggiungi al crontab (esegui crontab -e)
0 */6 * * * /usr/bin/node /percorso/assoluto/updater.js >> /var/log/ai-updater.log 2>&1
```

### Opzione C — Run manuale

```bash
npm install
node updater.js
```

---

## Livelli di severity

| Colore | Livello | Quando scatta |
|--------|---------|---------------|
| 🔴 Rosso | `high` | Breaking change, deprecazione, rimozione funzionalità |
| 🟡 Ambra | `medium` | Cambio di comportamento, output diverso, nuove policy safety |
| 🟢 Verde | `low` | Miglioramenti di performance, ottimizzazioni |
| ⚪ Grigio | `info` | Info generiche, nuovi modelli senza impatti |

---

## Personalizzazione CSS

Il widget inietta stili con l'ID `#aisw-styles`. Puoi sovrascrivere qualsiasi cosa:

```css
/* Esempio: cambia il colore del badge */
#aisw-badge {
  background: #0f172a;
  font-family: 'Il-tuo-font', sans-serif;
}

/* Esempio: sposta il pannello più in alto */
#aisw-panel.pos-br {
  bottom: 90px;
}
```

---

## Domande frequenti

**Il widget funziona senza Node.js?**
Sì — il widget (`ai-status-widget.js`) è puro JS browser-side e legge solo il file JSON. Node.js serve solo per l'updater, non per il widget in sé.

**Posso aggiornare il JSON manualmente?**
Sì. Modifica `ai-updates.json` seguendo la struttura esistente. Il widget lo rilegge ogni 6 ore in automatico.

**Il badge rallenta la mia pagina?**
No. Il widget è asincrono: non blocca il caricamento, non ha dipendenze esterne, pesa ~6kb.

**Posso filtrare solo un provider specifico?**
Sì: `data-providers="anthropic"` mostra solo aggiornamenti Claude.
