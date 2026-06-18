[English](../SPEC.md) | [日本語](SPEC.ja.md) | [中文(简体)](SPEC.zh-CN.md) | [中文(繁體)](SPEC.zh-TW.md) | [한국어](SPEC.ko.md) | [Français](SPEC.fr.md) | [Deutsch](SPEC.de.md) | [Español](SPEC.es.md)

# SPEC: Anthro Bridge

## Überblick

Ein leichtes Proxy- + GUI-Verwaltungstool, das Claude Desktop / Claude Code API-Anfragen über mehrere Anbieter-Antwortpunkte mit Anthropic-Kompatibilität weiterleitet.

### Architektur

```
Claude Desktop / Claude Code
       |
       v
proxy.rs (127.0.0.1:4000)  <- Eingebettet in Tauri-App (axum 0.7 + reqwest)
       |
       | Routing per Modellfeld -> löst korrekten Upstream-Anbieter auf
       | Überschreibt nur Modell auf Upstream-Namen
       | Injiziert Thinking-disabled für Nicht-Thinking-Varianten
       | Medienunterstützung prüfung pro Modell
       v
Provider Anthropic-compatible APIs
(DeepSeek / MiniMax / Kimi / MiMo)
```

#### Designprinzipien

- **Shell-Modell + Anbieterauswahl**: Claude Desktop sieht immer `claude-sonnet-4-6` / `claude-haiku-4-5`. Das eigentliche LLM wird in der GUI ausgewählt (DeepSeek / MiniMax / Kimi / MiMo). Das Modellmapping des aktiven Anbieters wird für das Routing verwendet.
- **Nur aktiver Anbieter benötigt API-Schlüssel**: Seit v0.5.0 werden nur Anbieter, auf die die Routing-Tabelle verweist, beim Start überprüft. Nicht-aktive Anbieter-Schlüssel sind nicht erforderlich.
- **Dünnes Proxy**: Nichts wird geändert außer dem `model`-Feld. SSE wird Byte-für-Byte weitergeleitet.
- **Verlustfreie Weiterleitung**: Nachrichten-Body, Tool-Calls, Thinking-Blöcke werden unverändert weitergeleitet.
- **Windows-natives GUI**: Tauri v2 + React 19 + TypeScript. Rust-Backend, Vite + React 19 Frontend.
- **Keine externen Abhängigkeiten**: Proxy seit v0.3.0 in die Tauri-Binary eingebettet. Python nicht erforderlich.
- **Mehrsprachig**: 8 Sprachen seit v0.9.1 (en, ja, zh-CN, zh-TW, ko, fr, de, es). Neue Sprachen hinzufügen durch Ablegen von Dateien in `lang/`. Sprachauswahl beim ersten Start.

### GUI-Verwaltungstool

Tauri v2 + React 19 + TypeScript. Zwei-Bereiche-Layout: Dashboard + Einstellungen.

```
+------------------------------------------+
|  Anthro Bridge                   |
|  [Gateway starten/stoppen] [Status] [=]  |
+------------------------------------------+
|  Dashboard                                |
|  +- LLM-Anbieter wählen ----------------+|
|  | [DeepSeek] [MiniMax] [Kimi] [MiMo]   ||
|  +- Status ------------------------------+
|  | Port 4000 | API-Schlüssel | Gateway-URL||
|  | Modell-Routing-Tabelle                ||
|  +- Neuestes Log ------------------------+
|  | Log-Anzeige mit Pro/Flash-Zählern     ||
|  +---------------------------------------+
+------------------------------------------+

Einstellungen (=):
  +- Sprache ------------------------------+
  | Dropdown zum sofortigen Wechsel        |
  +- API-Schlüssel ------------------------+
  | Anbieterbezogene API-Schlüsselverwaltung|
  +- Claude Desktop Einrichtung -----------+
  | Config-JSON generieren, kopieren,      |
  | Konfigurationsdatei-Erkennung          |
  +- Gateway-Konfiguration ----------------+
  | config.json-Editor (erweitert)         |
  +---------------------------------------+
```

### Tauri-Befehle

| # | Befehl | Typ | Beschreibung |
|---|--------|-----|--------------|
| 1 | `check_health` | async | Proxy-Gesundheitscheck |
| 2 | `check_gateway_status` | sync | Port 4000 + tokio-Task-Lebendigkeit |
| 3 | `check_api_key` | sync | API-Schlüssel-Status des aktiven Anbieters |
| 4 | `set_env_api_key` | sync | API-Schlüssel über setx speichern |
| 5 | `get_port_4000_process` | sync | PID von Port 4000 via netstat abrufen |
| 6 | `read_config` | sync | config.json lesen |
| 7 | `read_config_raw` | sync | Unformatierter config.json-Text + Kodierungserkennung |
| 8 | `write_config` | sync | config.json speichern (UTF-8 / Shift-JIS) |
| 9 | `read_latest_log` | sync | Neuestes Log lesen |
| 10 | `read_log` | sync | Angegebene Log-Datei lesen |
| 11 | `list_logs` | sync | Log-Dateien auflisten |
| 12 | `create_new_log` | sync | Neue Log-Datei erstellen |
| 13 | `open_logs_folder` | sync | Log-Ordner öffnen |
| 14 | `open_path` | sync | Beliebigen Pfad öffnen |
| 15 | `find_claude_configs` | sync | Claude Desktop Konfigurationsdateien automatisch erkennen |
| 16 | `start_proxy` | sync | Proxy starten (Config auflösen -> starten -> Port prüfen) |
| 17 | `stop_proxy` | sync | Proxy stoppen (sauberes Herunterfahren) |
| 18 | `proxy_status` | sync | Task-Lebendigkeit prüfen |
| 19 | `check_all_api_keys` | sync | API-Schlüssel-Status aller Anbieter |
| 20 | `update_active_provider` | sync | active_provider speichern |
| 21 | `update_provider_api_key_env` | sync | provider api_key_env speichern |
| 22 | `get_user_language` | sync | Gespeicherte Spracheinstellung abrufen |
| 23 | `set_user_language` | sync | Spracheinstellung speichern |
| 24 | `is_first_run` | sync | Ersten Start erkennen (Vorhandensein von user_prefs.json) |

### Proxy-Server (proxy.rs)

Von Python nach Rust (axum 0.7/reqwest) portiert in v0.3.0.

#### Endpunkte

| Methode | Pfad | Verhalten |
|---------|------|-----------|
| GET | `/health` | Gesundheitscheck |
| GET | `/v1/models` | Öffentliche Modelliste (nur `visible: true`) |
| POST | `/v1/messages` | Modellaufösung -> Thinking-Injektion -> Medienprüfung -> Weiterleitung (stream/non-stream) |
| POST | `/v1/messages/count_tokens` | An Upstream weiterleiten, wenn unterstützt |

#### Modell-Routing

Erstellt eine Rückwärtssuche-Tabelle von Gateway-Modell -> (Anbieter, Upstream-Modell) unter Verwendung des `models`-Abschnitts jedes Anbieters. Da alle Anbieter die gleichen Gateway-Modellnamen verwenden, gewinnt `active_provider` bei Kollisionen. Effektiv landen nur die Modelle des aktiven Anbieters in der Routing-Tabelle.

#### API-Schlüssel-Validierung (seit v0.5.0)

Schritt 1: Modell-Routing-Tabelle erstellen (keine API-Schlüssel benötigt)
Schritt 2: Nur API-Schlüssel für Anbieter prüfen, auf die die Routing-Tabelle verweist

#### Thinking-Injektion

Für Modelle mit `thinking: "disabled"` in ihrem Konfigurationseintrag wird `{"type": "disabled"}` nur injiziert, wenn der Benutzer Thinking nicht explizit gesetzt hat.

#### Medienprüfung / Bild-Sanitization

Modellspezifische `supports_vision` / `supports_video`-Flags bestimmen das Verhalten. Bei Nicht-Vision-Modellen, die Bilder empfangen, gilt `non_vision_image_policy`:
- `replace` (Standard): Bildblöcke durch Platzhaltertext ersetzen
- `drop`: Bildblöcke entfernen (Platzhalter einfügen, wenn Inhalt leer wird)
- `reject`: 400-Fehler zurückgeben

Video-Blöcke geben immer 400 zurück. `non_vision_image_policy` ist über `/health` sichtbar.

### Mehrsprachigkeit

Datei-pro-Sprache-Architektur mit `import.meta.glob` Auto-Discovery:

```
gui/src/i18n/lang/
  en.ts      Englisch (kanonisch — definiert den TranslationKey-Typ)
  ja.ts      Japanisch
  zh-CN.ts   Chinesisch (Vereinfacht)
  zh-TW.ts   Chinesisch (Traditionell)
  ko.ts      Koreanisch
  fr.ts      Französisch
  de.ts      Deutsch
  es.ts      Spanisch
```

Um eine Sprache hinzuzufügen: `en.ts` kopieren, übersetzen, neu bauen. Keine Code-Änderungen erforderlich.

### config.json Referenz

```json
{
  "active_provider": "deepseek",
  "providers": {
    "<provider_id>": {
      "display_name": "Anzeigename",
      "upstream_url": "Anthropic-kompatible API-Basis-URL",
      "api_key_env": "API-Schlüssel-Umgebungsvariablen-Name",
      "default_model": "Fallback-Modellname",
      "force_anthropic_version": null,
      "supports_count_tokens": false,
      "supports_vision": false,
      "supports_video": false,
      "model_map": { "claude-sonnet-4-6": "echter-modellname" },
      "visible_models": ["claude-oeffentlicher-modellname"],
      "models": {
        "claude-sonnet-4-6": {
          "upstream_model": "echter-modellname",
          "thinking_mode": "thinking",
          "supports_vision": true,
          "supports_video": true,
          "visible": true
        }
      }
    }
  },
  "non_vision_image_policy": "replace",
  "server": { "host": "127.0.0.1", "port": 4000, "enable_cors": false }
}
```
