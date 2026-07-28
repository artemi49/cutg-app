# CutG

Erstellt TikTok-Vorher/Nachher-Templates aus zwei eigenen Bildern – plus fertige KI-Prompts für Frisuren, Bärte & Schnauzer.

## Start

```bash
npm install
npm run dev
```

Öffne http://localhost:5173

## Features

- **Vorher/Nachher-Template** (1080 × 1680 px, TikTok-Format) aus zwei Bildern
- **Verschieben & Zoomen** jedes Bildes direkt in der Live-Vorschau; beim Rauszoomen entsteht ein unscharfer Blur-Hintergrund
- **Männer- & Frauen-Bibliothek** – ein Umschalter (💈 Men / 💇‍♀️ Women) steuert Template 1, 2 und 3 gleichzeitig
  - Männer (33 Styles): Trend 2026, Fades & Classic, Afro-Textured / Curly
  - Frauen (83 Styles): Trend 2026, Bobs & Lobs, Long & Layered, Curly & Coily, Short & Pixie, Braids & Updos sowie Color & Balayage (mit ◐ markiert)
  - Farb-Styles nutzen einen eigenen Prompt: nur die Haarfarbe ändert sich, Schnitt und Länge bleiben
- **Prompt-Bibliothek** zum Kopieren (JSON) für Lumina (GPT Image 2):
  - Bart- & Schnauzer-Styles (inkl. gezwirbelter Moustaches) – nur bei „Men"
  - Jeder Prompt ändert gezielt nur Haare, Farbe bzw. Bart – Gesicht/Identität bleiben
- Sprache, Labels, Akzentfarbe und Branding anpassbar
- Export in 2× Auflösung für scharfe Ergebnisse

## Workflow

1. Vorher-Foto in [Lumina](https://ai.byteplus.com/lumina/en/model/image) öffnen, Frisur/Bart-Prompt aus CutG einfügen → Nachher-Bild erzeugen
2. Beide Bilder in CutG hochladen, positionieren & zoomen
3. Template herunterladen

Kein API-Key nötig – alles läuft lokal im Browser.
