[English](../SPEC.md) | [日本語](SPEC.ja.md) | [中文(简体)](SPEC.zh-CN.md) | [中文(繁體)](SPEC.zh-TW.md) | [한국어](SPEC.ko.md) | [Français](SPEC.fr.md) | [Deutsch](SPEC.de.md) | [Español](SPEC.es.md)

# SPEC: Anthro Bridge

## Aperçu

Un outil léger de proxy + gestion GUI qui route les requêtes API de Claude Desktop / Claude Code vers les points de terminaison compatibles Anthropic de plusieurs fournisseurs.

### Architecture

```
Claude Desktop / Claude Code
       |
       v
proxy.rs (127.0.0.1:4000)  <- Intégré dans l'app Tauri (axum 0.7 + reqwest)
       |
       | Routage par champ model -> résout le bon fournisseur upstream
       | Réécrit uniquement le model en nom upstream
       | Injecte thinking disabled pour les variantes non-thinking
       | Vérification du support média par modèle
       v
Provider Anthropic-compatible APIs
(DeepSeek / MiniMax / Kimi / MiMo)
```

#### Principes de conception

- **Modèle coquille + sélection de fournisseur** : Claude Desktop voit toujours `claude-sonnet-4-6` / `claude-haiku-4-5`. Le LLM réel est sélectionné dans la GUI (DeepSeek / MiniMax / Kimi / MiMo). Le mappage de modèles du fournisseur actif est utilisé pour le routage.
- **Seul le fournisseur actif a besoin d'une clé API** : Depuis v0.5.0, seuls les fournisseurs référencés par la table de routage sont vérifiés au démarrage. Les clés des fournisseurs inactifs ne sont pas requises.
- **Proxy léger** : Rien n'est modifié sauf le champ `model`. Le SSE est transféré octet par octet.
- **Transfert sans perte** : Les corps de messages, les appels d'outils, les blocs thinking transitent intacts.
- **GUI native Windows** : Tauri v2 + React 19 + TypeScript. Backend Rust, frontend Vite + React 19.
- **Zéro dépendance externe** : Proxy intégré dans le binaire Tauri depuis v0.3.0. Python non requis.
- **Multilingue** : 8 langues supportées depuis v0.9.1 (en, ja, zh-CN, zh-TW, ko, fr, de, es). Ajoutez de nouvelles langues en déposant des fichiers dans `lang/`. Sélecteur de langue au premier lancement.

### Outil de gestion GUI

Tauri v2 + React 19 + TypeScript. Disposition à deux panneaux : Tableau de bord + Paramètres.

```
+------------------------------------------+
|  Anthro Bridge                   |
|  [Démarrer/Arrêter passerelle] [État] [=]|
+------------------------------------------+
|  Tableau de bord                         |
|  +- Choisir le fournisseur LLM --------+|
|  | [DeepSeek] [MiniMax] [Kimi] [MiMo]   ||
|  +- État --------------------------------+
|  | Port 4000 | Clé API | URL passerelle ||
|  | Table de routage des modèles         ||
|  +- Dernier journal ---------------------+
|  | Visionneuse avec compteurs Pro/Flash  ||
|  +---------------------------------------+
+------------------------------------------+

Paramètres (=):
  +- Langue -----------------------------+
  | Menu déroulant pour changement immédiat|
  +- Clé API ----------------------------+
  | Gestion de clé API par fournisseur    |
  +- Configuration Claude Desktop --------+
  | Génération JSON de config, copie,     |
  | détection de fichier de config        |
  +- Configuration de la passerelle ------+
  | Éditeur config.json (avancé)          |
  +---------------------------------------+
```

### Commandes Tauri

| # | Commande | Type | Description |
|---|----------|------|-------------|
| 1 | `check_health` | async | Vérification de santé du proxy |
| 2 | `check_gateway_status` | sync | Port 4000 + vivacité de tâche tokio |
| 3 | `check_api_key` | sync | État de la clé API du fournisseur actif |
| 4 | `set_env_api_key` | sync | Persister la clé API via setx |
| 5 | `get_port_4000_process` | sync | Obtenir le PID du port 4000 via netstat |
| 6 | `read_config` | sync | Lire config.json |
| 7 | `read_config_raw` | sync | Texte brut config.json + détection d'encodage |
| 8 | `write_config` | sync | Enregistrer config.json (UTF-8 / Shift-JIS) |
| 9 | `read_latest_log` | sync | Lire le dernier journal |
| 10 | `read_log` | sync | Lire le fichier journal spécifié |
| 11 | `list_logs` | sync | Lister les fichiers journaux |
| 12 | `create_new_log` | sync | Créer un nouveau fichier journal |
| 13 | `open_logs_folder` | sync | Ouvrir le dossier des journaux |
| 14 | `open_path` | sync | Ouvrir un chemin arbitraire |
| 15 | `find_claude_configs` | sync | Détecter automatiquement les fichiers de config Claude Desktop |
| 16 | `start_proxy` | sync | Démarrer le proxy (résoudre config -> lancer -> vérifier port) |
| 17 | `stop_proxy` | sync | Arrêter le proxy (arrêt gracieux) |
| 18 | `proxy_status` | sync | Vérifier la vivacité de la tâche |
| 19 | `check_all_api_keys` | sync | État des clés API de tous les fournisseurs |
| 20 | `update_active_provider` | sync | Enregistrer active_provider |
| 21 | `update_provider_api_key_env` | sync | Enregistrer provider api_key_env |
| 22 | `get_user_language` | sync | Obtenir la préférence de langue enregistrée |
| 23 | `set_user_language` | sync | Enregistrer la préférence de langue |
| 24 | `is_first_run` | sync | Déterminer le premier lancement (existence de user_prefs.json) |

### Serveur Proxy (proxy.rs)

Porté de Python vers Rust (axum 0.7/reqwest) en v0.3.0.

#### Points de terminaison

| Méthode | Chemin | Comportement |
|---------|--------|--------------|
| GET | `/health` | Vérification de santé |
| GET | `/v1/models` | Liste publique des modèles (uniquement `visible: true`) |
| POST | `/v1/messages` | Résolution de modèle -> injection thinking -> vérification média -> transfert (stream/non-stream) |
| POST | `/v1/messages/count_tokens` | Transférer à l'upstream si supporté |

#### Routage des modèles

Construit une table de recherche inverse de modèle gateway -> (fournisseur, modèle upstream) en utilisant la section `models` de chaque fournisseur. Comme tous les fournisseurs utilisent les mêmes noms de modèles gateway, `active_provider` gagne en cas de collision. Effectivement, seuls les modèles du fournisseur actif se retrouvent dans la table de routage.

#### Validation de clé API (depuis v0.5.0)

Étape 1 : Construire la table de routage des modèles (pas de clé API requise)
Étape 2 : Vérifier uniquement les clés API des fournisseurs référencés par la table de routage

#### Injection de thinking

Pour les modèles avec `thinking: "disabled"` dans leur entrée de configuration, injecte `{"type": "disabled"}` uniquement lorsque l'utilisateur n'a pas explicitement défini le thinking.

#### Vérification média / Sanitisation d'images

Les indicateurs `supports_vision` / `supports_video` par modèle déterminent le comportement. Pour les modèles non-vision recevant des images, `non_vision_image_policy` s'applique :
- `replace` (défaut) : Remplacer les blocs image par du texte de substitution
- `drop` : Supprimer les blocs image (insérer un substitut si le contenu devient vide)
- `reject` : Retourner une erreur 400

Les blocs vidéo retournent toujours 400. `non_vision_image_policy` est visible via `/health`.

### Multilingue

Architecture fichier-par-langue avec auto-découverte `import.meta.glob` :

```
gui/src/i18n/lang/
  en.ts      Anglais (canonique — définit le type TranslationKey)
  ja.ts      Japonais
  zh-CN.ts   Chinois simplifié
  zh-TW.ts   Chinois traditionnel
  ko.ts      Coréen
  fr.ts      Français
  de.ts      Allemand
  es.ts      Espagnol
```

Pour ajouter une langue : copiez `en.ts`, traduisez, reconstruisez. Aucune modification de code requise.

### Référence config.json

```json
{
  "active_provider": "deepseek",
  "providers": {
    "<provider_id>": {
      "display_name": "Nom d'affichage",
      "upstream_url": "URL de base de l'API compatible Anthropic",
      "api_key_env": "Nom de la variable d'environnement de la clé API",
      "default_model": "Nom du modèle de secours",
      "force_anthropic_version": null,
      "supports_count_tokens": false,
      "supports_vision": false,
      "supports_video": false,
      "model_map": { "claude-sonnet-4-6": "nom-réel-du-modèle" },
      "visible_models": ["nom-public-du-modèle"],
      "models": {
        "claude-sonnet-4-6": {
          "upstream_model": "nom-réel-du-modèle",
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
