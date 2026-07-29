# CutG Studio

Interner Generator für TikTok-Vorher/Nachher-Templates. Zugang nur mit Account —
jede Generierung wird einem Clipper zugeordnet und dauerhaft protokolliert.

## Start

```bash
npm install
npm run dev
```

Öffne http://localhost:5173

## Zugänge

- **Clipper** melden sich mit Benutzername + Passwort an. Accounts legt
  ausschließlich der Admin an; es gibt keine Selbstregistrierung.
- **Admin** sieht unter `#admin` alle Accounts, den Verbrauch und den
  vollständigen Verlauf inklusive Vorher-/Nachher-Bildern.
- **Ersteinrichtung:** auf dem Login-Screen „Ersteinrichtung mit Setup-Code“ —
  der Code steht in `marketing.setup` und funktioniert genau einmal.

## Features

- **Template 1** — bis zu 5 Bilder, je eine Frisur pro Bild
- **Template 2** — ein Bild, viele Frisuren (erstes Ergebnis als Vorher/Nachher-
  Template, der Rest als einzelne Nachher-Bilder)
- **Verschieben & Zoomen** jedes Bildes in der Live-Vorschau; beim Rauszoomen
  entsteht ein unscharfer Blur-Hintergrund
- **Männer- & Frauen-Bibliothek** — ein Umschalter (💈 Men / 💇‍♀️ Women) steuert
  beide Templates
  - Männer (33 Styles), Frauen (83 Styles, inkl. Color & Balayage mit ◐ markiert)
  - Farb-Styles nutzen einen eigenen Prompt: nur die Haarfarbe ändert sich
- Generierung läuft im Hintergrund — die Seite darf geschlossen werden
- Export in 2× Auflösung

## Tracking & Überwachung

| Was | Wo |
| --- | --- |
| Generierungen pro Clipper (gesamt / Monat / 7 Tage / Fehler) | `#admin` → Clipper & Verbrauch |
| Vollständiger Verlauf mit Vorher-/Nachher-Bild | `#admin` → Verlauf |
| Downloads und Anmeldungen | `#admin` → Aktivität |
| Eigener Verlauf des Clippers (nur lesend) | `#verlauf` |

Der Verlauf ist für Clipper **nicht löschbar**: es gibt serverseitig keine
Lösch-Funktion für sie, und die Archivbilder liegen im privaten Bucket
`clipper-history`, in den nur der Worker (service_role) schreibt.

Optional lässt sich pro Clipper ein **Monatslimit** setzen. Ist es erreicht,
lehnt der Server weitere Aufträge ab — nicht erst das Frontend.

## Backend (Supabase-Projekt „HairLab")

- `marketing.clippers` — Accounts, Rolle, aktiv/gesperrt, Monatslimit
- `marketing.gen_jobs` / `gen_items` — Aufträge, an `auth.users` gebunden
- `marketing.usage_events` — Downloads und Anmeldungen
- Storage-Bucket `clipper-history` — Vorher-/Nachher-Archiv, privat
- Edge Function `hairlab-worker` — arbeitet die Queue ab und archiviert Bilder
- Edge Function `clipper-admin` — legt Accounts an, setzt Passwörter zurück

Alle `mkt_*`-RPCs sind für `anon` gesperrt und brauchen ein gültiges Login.
Der OpenAI-Key liegt nur als Edge-Function-Secret, nie im Browser-Bundle.

## Workflow

1. Vorher-Foto hochladen, Frisuren wählen, generieren lassen
2. Ergebnisse positionieren & zoomen
3. Template herunterladen — der Download wird mitprotokolliert
