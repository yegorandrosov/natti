# Fragenkatalog Medizin – Hundemedizin Quiz

Ein kleines Node/Express-Quiz zum Üben des veterinärmedizinischen Fragenkatalogs (Hundemedizin). Fragen werden bei jedem Start neu gemischt. **Keine Speicherung** von Fragen oder Ergebnissen.

## Funktionen

- **4 Fragetypen**: Multiple Choice (eine/mehrere Antworten), Reihenfolge (Drag & Drop bzw. ▲▼), Zahlen- und offene Fragen (Selbstbewertung mit Musterlösung).
- **2 Modi**:
  - *Antwort nach jeder Frage* – sofortiges Feedback (richtig/falsch) je Frage.
  - *Antworten am Ende* – Auswertung erst nach Abschluss des Tests.
- **Timer** (Stoppuhr) während des gesamten Tests.
- **Ergebnis** mit Prozent-Score, Zeit und Durchsicht der falschen Antworten inkl. korrekter Lösungen.
- Responsives Design, Light-/Dark-Mode, keine Authentifizierung.

## Lokal starten

```bash
npm install
npm start
# -> http://localhost:3000
```

## Fragen neu aus init.html erzeugen

Die Fragen liegen in `public/questions.json` und werden aus `init.html` generiert:

```bash
npm run parse
```

## Deployment auf GitHub Pages (statisch, kostenlos)

Die App ist rein clientseitig – `public/` enthält alles (inkl. `questions.json`). Ein Server ist für Pages **nicht** nötig.

1. Repo zu GitHub pushen (Branch `main`).
2. Auf GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Der mitgelieferte Workflow `.github/workflows/pages.yml` veröffentlicht den Ordner `public/` bei jedem Push automatisch.
4. Die URL erscheint danach unter **Settings → Pages** (z. B. `https://<user>.github.io/<repo>/`).

## Deployment auf Render (Node-Server)

Diese App ist als Render-Web-Service vorbereitet (`render.yaml`):

1. Repository zu GitHub pushen.
2. Auf [render.com](https://render.com) → **New +** → **Web Service** → Repo auswählen.
3. Render erkennt `render.yaml` (Blueprint). Alternativ manuell:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Environment:** Node
4. Deploy. Die App lauscht automatisch auf `process.env.PORT`.

## Projektstruktur

```
init.html               Quelle des Fragenkatalogs (Original-HTML)
parse.js                Parser: init.html -> public/questions.json
public/                 Statische Web-App (alles was Pages braucht)
  index.html
  style.css
  app.js
  questions.json        Generierte Fragen (55)
server.js               Optionaler Express-Server (für Render)
render.yaml             Render-Blueprint
.github/workflows/      GitHub-Pages-Deploy-Workflow
```
