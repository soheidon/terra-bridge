# SPEC: Anthropic Proxy Gateway / 仕様書

## 日本語

### 概要

複数プロバイダーの Anthropic 互換 API を Claude Desktop / Claude Code Desktop から利用するための薄型プロキシ + GUI 管理ツール。

### 背景

Claude Desktop / Claude Code Desktop は Anthropic Messages API (`/v1/messages`) に直接リクエストを送る。これを各プロバイダーの Anthropic 互換エンドポイントに振り向けることで、複数プロバイダーのモデルを Anthropic クライアントから透過的に利用可能にする。

#### 解決する問題

- Claude Desktop 側のモデル名バリデーション
- LiteLLM の Anthropic→OpenAI 変換による情報ロス
- `claude-haiku-4-5-20251001` などの未登録モデル名問題
- 複数プロバイダー・複数モデルを単一エンドポイントから利用可能

#### 既知の制限

- DeepSeek Anthropic 互換 API が thinking block を完全に扱えない場合がある
- `tool_use` / `tool_result` / streaming SSE の互換性が不十分な場合がある

### アーキテクチャ

```
Claude Desktop / Claude Code
       │
       ▼
proxy.rs (127.0.0.1:4000)  ← Tauri アプリに内蔵 (axum 0.7 + reqwest)
       │
       │ リクエストの model フィールドをもとにプロバイダーを自動判別
       │ model を upstream 名に書換え、他は完全透過転送
       │ thinking 注入（thinking=disabled のバリアント向け）
       │ モデル単位の画像/動画非対応チェック
       ▼
各プロバイダーの Anthropic-compatible API
(DeepSeek / MiniMax / Kimi)
```

#### 設計方針

- **モデルベースルーティング**: v0.4.0 以降、`active_provider` による手動切替ではなく、リクエストの `model` フィールドを読み取って自動的に正しい upstream へ振り分ける。全プロバイダーの全公開モデルが `/v1/models` に列挙され、Claude Code のモデルピッカーから選択可能。
- **薄型プロキシ**: model フィールドの書換え以外は一切手を加えない。SSE もパースせずバイト単位で透過転送。
- **ロスレス転送**: メッセージ本文やツール呼び出し、thinking block を一切加工しない。
- **Thinking バリアント**: `claude-kimi-k2-6` / `claude-minimax-m3` は thinking 抑制。`*-thinking` はデフォルト動作。
- **Windows ネイティブ GUI**: Tauri v2 + React + TypeScript。バックエンドは Rust、フロントエンドは Vite + React 19。
- **ゼロ外部依存**: v0.3.0 以降、プロキシは Rust に移植され Tauri バイナリに内蔵。Python 不要。

### GUI 管理ツール

Tauri v2 + React + TypeScript 製。4タブ構成。

```
┌──────────────────────────────────────────┐
│  Anthropic Proxy Gateway Manager          │
│  [Gateway: Running] [起動/停止] [EN|JA]  │
├──────────────────────────────────────────┤
│  Dashboard │ Gateway設定 │ Claude設定 │ APIキー │
├──────────────────────────────────────────┤
│  Status      │  最新ログ                 │
│  - Port 4000 │  - ログ切替              │
│  - APIキー   │  - 新規ログ              │
│  - URL       │  - 使用回数              │
│  - モデル    │                           │
│   対応表     │                           │
└──────────────────────────────────────────┘
```

| タブ | 機能 |
|------|------|
| Dashboard | Port 4000 状態、APIキー設定状態、Gateway URL、**モデルルーティング対応表** (Provider / Gateway model / Upstream / Thinking / Vision/Video)、最新ログ表示、使用回数集計 |
| Gateway Settings | config.json の直接編集、UTF-8/Shift-JIS エンコード切替、保存/再読込 |
| Claude Desktop Setup | 設定JSONの表示とクリップボードコピー、設定ファイル自動検出、手動フォルダ参照 |
| API Key | 各プロバイダー API キーの設定（Windows ユーザー環境変数に setx で永続保存） |

#### モデルルーティング対応表

ダッシュボードに表示されるモデル対応表:

```text
Provider        Gateway model                  Upstream                  Thinking   Vision/Video
DeepSeek        claude-deepseek-v4             deepseek-v4-pro           default    no
DeepSeek        claude-deepseek-flash          deepseek-v4-flash         default    no
Kimi/Moonshot   claude-kimi-k2-6               kimi-k2.6                 disabled   yes
Kimi/Moonshot   claude-kimi-k2-6-thinking      kimi-k2.6                 default    yes
MiniMax         claude-minimax-m3              MiniMax-M3                disabled   yes
MiniMax         claude-minimax-m3-thinking     MiniMax-M3                default    yes
MiniMax         claude-minimax-m2-7-highspeed  MiniMax-M2.7-highspeed    default    no
```

#### プロキシプロセス管理

- **起動**: `start_proxy` コマンドが `proxy::resolve_proxy_config()` で設定を解決し、`tauri::async_runtime::spawn` で axum サーバーを非同期タスクとして起動。起動後ポート 4000 を最大 5 秒間 150ms 間隔でポーリングし、listen を確認。
- **停止**: `stop_proxy` コマンドが oneshot チャネルで graceful shutdown を送信し、mpsc チャネルでタスクの終了を待機。停止後ポート 4000 の開放を確認。
- **状態監視**: `check_gateway_status` で TCP ポート到達性 + tokio task の生存確認。

### Tauri コマンド一覧

| # | コマンド名 | 種別 | 説明 |
|---|-----------|------|------|
| 1 | `check_health` | async | `GET http://127.0.0.1:4000/health` でプロキシ死活確認 |
| 2 | `check_gateway_status` | sync | ポート 4000 の listen 状態 + tokio task の生存確認 |
| 3 | `check_api_key` | sync | 現在の active_provider の API キー環境変数の設定有無を返す |
| 4 | `set_env_api_key` | sync | `setx` コマンドで API キーをユーザー環境変数に永続保存 |
| 5 | `get_port_4000_process` | sync | `netstat` でポート 4000 を listen しているプロセスの PID を取得 |
| 6 | `read_config` | sync | `config.json` をパースして返す |
| 7 | `read_config_raw` | sync | `config.json` を生テキストで読み取り、エンコーディング自動判定 |
| 8 | `write_config` | sync | `config.json` を指定エンコーディング（UTF-8 / Shift-JIS）で保存 |
| 9 | `read_latest_log` | sync | `Communication-Logs/` 内の最新ログファイルを読み取り |
| 10 | `read_log` | sync | 指定ログファイルを読み取り（パストラバーサル対策あり） |
| 11 | `list_logs` | sync | `Communication-Logs/` 内のログファイル一覧を返す |
| 12 | `create_new_log` | sync | 新しい空ログファイルを作成 |
| 13 | `open_logs_folder` | sync | `Communication-Logs/` をエクスプローラで開く |
| 14 | `open_path` | sync | 任意パスをエクスプローラで開く（`%ENV_VAR%` 展開対応） |
| 15 | `find_claude_configs` | sync | Claude Desktop 設定ファイルを既知のパスから自動検出 |
| 16 | `start_proxy` | sync | 設定解決 → axum を tauri::async_runtime::spawn → ポート確認 |
| 17 | `stop_proxy` | sync | oneshot シグナル送信 → mpsc で graceful shutdown → ポート開放確認 |
| 18 | `proxy_status` | sync | JoinHandle の完了状態でタスクの生存確認 |
| 19 | `check_all_api_keys` | sync | 全プロバイダーの API キー設定状態を一括返す |
| 20 | `update_active_provider` | sync | `active_provider` を config.json に保存 |
| 21 | `update_provider_api_key_env` | sync | プロバイダーの `api_key_env` を config.json に保存 |

### プロキシサーバー (proxy.rs)

v0.3.0 で Python (FastAPI/httpx) から Rust (axum 0.7/reqwest) に完全移植。

#### エンドポイント

| Method | Path | 動作 |
|--------|------|------|
| GET | `/health` | 死活確認、`{"status": "ok", "routing": "model-based", "models": [...], "providers": [...]}` を返す |
| GET | `/v1/models` | 全プロバイダーの公開モデル（`visible: true`）を列挙して返す |
| POST | `/v1/messages` | `model` フィールドから upstream を解決 → thinking 注入（要時）→ メディアチェック → 転送。stream/non-stream 両対応 |
| POST | `/v1/messages/count_tokens` | `supports_count_tokens=false` 時は 501。対応時は `model` を書換え後 upstream へ転送 |

#### モデルベースルーティング

`config.json` の各プロバイダーの `models` セクション（または `model_map`）から gateway model → upstream model の逆引きテーブルを構築。リクエストの `model` フィールドを読み取り、対応するプロバイダーと upstream model に振り分ける。

#### Thinking 注入

`models` エントリに `thinking: "disabled"` が指定されている gateway model に対して、ユーザーが `thinking` パラメータを明示的に設定していない場合のみ `{"type": "disabled"}` を注入する。

#### メディアチェック

モデル単位の `supports_vision` / `supports_video` フラグで判定。`models` セクションで明示されていればそれを使い、なければプロバイダー既定値にフォールバック。非対応モデルに画像/動画が送られた場合は 400 エラーを返す。

#### SSE 透過転送

reqwest の `bytes_stream()` で upstream から SSE イベントをバイト単位で受信し、`axum::body::Body::from_stream()` でそのまま返す。パース・再構築は行わない。

#### HTTP クライアント

`reqwest::Client`（プロセス共有）:
- 接続タイムアウト: 30 秒
- 全体タイムアウト: 300 秒

#### CORS

`tower-http::cors::CorsLayer` を使用。`server.enable_cors` が true の場合のみ有効。

### 公開モデル一覧

`/v1/models` が返すモデル（全7モデル）:

| Gateway model | Upstream | Provider | Thinking | Vision/Video |
|---|---|---|---|---|
| `claude-deepseek-v4` | `deepseek-v4-pro` | DeepSeek | default | no |
| `claude-deepseek-flash` | `deepseek-v4-flash` | DeepSeek | default | no |
| `claude-minimax-m3` | `MiniMax-M3` | MiniMax | disabled | yes |
| `claude-minimax-m3-thinking` | `MiniMax-M3` | MiniMax | default | yes |
| `claude-minimax-m2-7-highspeed` | `MiniMax-M2.7-highspeed` | MiniMax | default | no |
| `claude-kimi-k2-6` | `kimi-k2.6` | Kimi | disabled | yes |
| `claude-kimi-k2-6-thinking` | `kimi-k2.6` | Kimi | default | yes |

旧 Claude 名（`claude-opus-4-7`, `claude-sonnet-4-6`, `claude-haiku-4-5-20251001` など）と upstream 生名（`deepseek-v4-pro`, `MiniMax-M3`, `kimi-k2.6`）は `visible: false` により `/v1/models` とダッシュボードから隠蔽される。内部ルーティングは有効。

### プロバイダー別機能マトリクス

| プロバイダー | モデル | count_tokens | vision | video | thinking |
|-------------|--------|-------------|--------|-------|----------|
| DeepSeek | deepseek-v4-pro / deepseek-v4-flash | ✗ | ✗ | ✗ | ✓ (default) |
| MiniMax | MiniMax-M3 | ✓ | ✓ | ✓ | ✓ (default / disabled) |
| MiniMax | MiniMax-M2.7-highspeed | ✗ | ✗ | ✗ | ✓ (default) |
| Kimi | kimi-k2.6 | ✗ | ✓ | ✓ | ✓ (default / disabled) |

### config.json リファレンス

```json
{
  "active_provider": "deepseek",
  "providers": {
    "<provider_id>": {
      "display_name": "表示名",
      "upstream_url": "Anthropic互換APIのベースURL",
      "api_key_env": "APIキー環境変数名",
      "default_model": "フォールバックモデル名",
      "force_anthropic_version": null,
      "supports_count_tokens": false,
      "supports_vision": false,
      "supports_video": false,
      "supports_thinking": true,
      "model_map": {
        "claude-sonnet-4-5": "実モデル名"
      },
      "visible_models": [
        "claude-公開モデル名"
      ],
      "models": {
        "claude-公開モデル名": {
          "upstream_model": "実モデル名",
          "thinking": "disabled",
          "supports_vision": true,
          "supports_video": true,
          "visible": true
        }
      }
    }
  },
  "server": {
    "host": "127.0.0.1",
    "port": 4000,
    "enable_cors": false
  }
}
```

| キー | 型 | 説明 |
|------|-----|------|
| `active_provider` | string? | デフォルトプロバイダー ID（モデルベースルーティングではフォールバック用） |
| `providers.<id>.display_name` | string | GUI 表示用のプロバイダー名 |
| `providers.<id>.upstream_url` | string | Anthropic 互換 API のベース URL |
| `providers.<id>.api_key_env` | string | API キーを保持する Windows ユーザー環境変数名 |
| `providers.<id>.default_model` | string | model_map にないモデル名のフォールバック先 |
| `providers.<id>.force_anthropic_version` | string\|null | null 時はリクエストの `anthropic-version` ヘッダをそのまま転送。設定時は強制上書き |
| `providers.<id>.supports_count_tokens` | boolean | count_tokens エンドポイントのサポート有無（プロバイダー既定値） |
| `providers.<id>.supports_vision` | boolean | 画像入力のサポート有無（プロバイダー既定値、models で上書き可） |
| `providers.<id>.supports_video` | boolean | 動画入力のサポート有無（プロバイダー既定値、models で上書き可） |
| `providers.<id>.model_map` | object | Claude モデル名 → 実モデル名のマッピング（legacy） |
| `providers.<id>.visible_models` | string[] | models 未使用時の公開モデル名一覧（legacy fallback） |
| `providers.<id>.models` | object? | **新形式**: gateway model → ModelEntry のマップ |
| `providers.<id>.models.<gm>.upstream_model` | string | upstream へ送る実モデル名 |
| `providers.<id>.models.<gm>.thinking` | "disabled"? | "disabled" 時のみ thinking 抑制注入 |
| `providers.<id>.models.<gm>.supports_vision` | boolean? | モデル単位の画像サポート（省略時はプロバイダー既定値） |
| `providers.<id>.models.<gm>.supports_video` | boolean? | モデル単位の動画サポート（省略時はプロバイダー既定値） |
| `providers.<id>.models.<gm>.visible` | boolean | `/v1/models` とダッシュボードに表示するか（デフォルト true） |
| `server.host` | string | プロキシの listen アドレス |
| `server.port` | number | プロキシの listen ポート |
| `server.enable_cors` | boolean | CORS ミドルウェアの有効/無効 |

#### ルーティング優先順位

1. `models` セクションがあれば、それを使用（model_map より優先）
2. `models` がなければ、`model_map` にフォールバック（全エントリがルーティング対象、`visible_models` に含まれるもののみ公開）

#### 後方互換性

v0.3.1 以前の `model_map` のみの設定も引き続き動作する。`models` セクションがない場合は、`model_map` を全ルーティングに使用し、`visible_models` で公開フィルタを行う。

### Claude Desktop 設定

```json
{
  "inferenceProvider": "gateway",
  "inferenceGatewayBaseUrl": "http://127.0.0.1:4000",
  "inferenceGatewayApiKey": "sk-local-gateway",
  "inferenceGatewayAuthScheme": "bearer",
  "inferenceModels": [
    {
      "name": "claude-deepseek-v4",
      "labelOverride": "DeepSeek V4 Pro via Gateway"
    },
    {
      "name": "claude-deepseek-flash",
      "labelOverride": "DeepSeek V4 Flash via Gateway"
    },
    {
      "name": "claude-minimax-m3",
      "labelOverride": "MiniMax M3 via Gateway"
    },
    {
      "name": "claude-minimax-m3-thinking",
      "labelOverride": "MiniMax M3 (Thinking) via Gateway"
    },
    {
      "name": "claude-minimax-m2-7-highspeed",
      "labelOverride": "MiniMax M2.7 Highspeed via Gateway"
    },
    {
      "name": "claude-kimi-k2-6",
      "labelOverride": "Kimi K2.6 via Gateway"
    },
    {
      "name": "claude-kimi-k2-6-thinking",
      "labelOverride": "Kimi K2.6 (Thinking) via Gateway"
    }
  ]
}
```

設定ファイルの場所（Windows）:
- `%APPDATA%\Claude\claude_desktop_config.json`
- `%USERPROFILE%\.claude\settings.json`
- `%LOCALAPPDATA%\Claude-3p\configLibrary\`

GUI の Claude Desktop Setup タブで自動検出・クリップボードコピーが可能。

### 実地テスト結果

| 経路 | モデル | stream | tools | msgs | 結果 |
|------|--------|--------|-------|------|------|
| Pro | claude-sonnet-4-5 → deepseek-v4-pro | ✓ | ✓ | 43 | PASS |
| Flash | claude-haiku-4-5-20251001 → deepseek-v4-flash | ✓ | ✓ | 17 | PASS |

両経路ともツール利用を含む長めの会話が最後まで完了。`reasoning_content` エラー・`Invalid model name` エラーは発生していない。

### 事前検証

DeepSeek Anthropic 互換 API の互換性を実装前に検証。全項目 PASS。

| # | 項目 | 結果 | 詳細 |
|---|------|------|------|
| 1 | non-stream `/v1/messages` | PASS | 200, "hello" |
| 2 | stream=true SSE 形式 | PASS | Anthropic SSE 形式, 全 7 種 event type |
| 3 | thinking block | PASS | ['thinking', 'text'], reasoning_content 混入なし |
| 4 | 2nd turn pass-back | PASS | reasoning_content エラーなし |
| 5 | tool_use block | PASS | ['thinking', 'tool_use'], stop_reason=tool_use |
| 6 | tool_result 2nd turn | PASS | tool_result 使用応答成功 |
| 7 | count_tokens | PASS | input_tokens=10 |
| 8 | header handling | PASS | anthropic-beta 未知値も 200 |

---

## English

### Overview

A thin proxy + GUI management tool that routes Claude Desktop / Claude Code API requests through multiple providers' Anthropic-compatible endpoints.

### Background

Claude Desktop / Claude Code sends requests directly to the Anthropic Messages API (`/v1/messages`). By routing these through each provider's Anthropic-compatible endpoint, models from multiple providers can be used transparently from Anthropic clients.

#### Problems Solved

- Claude Desktop model name validation
- Information loss from LiteLLM Anthropic→OpenAI conversion
- Unregistered model names such as `claude-haiku-4-5-20251001`
- Multi-provider, multi-model access from a single endpoint

#### Known Limitations

- DeepSeek Anthropic-compatible API may not fully support thinking blocks in all cases
- `tool_use` / `tool_result` / streaming SSE compatibility may be incomplete in edge cases

### Architecture

```
Claude Desktop / Claude Code
       │
       ▼
proxy.rs (127.0.0.1:4000)  ← Embedded in Tauri app (axum 0.7 + reqwest)
       │
       │ Routes by model field → resolves correct upstream provider
       │ Rewrites only model to upstream name
       │ Injects thinking disabled for non-thinking variants
       │ Per-model media support checking
       ▼
Provider Anthropic-compatible APIs
(DeepSeek / MiniMax / Kimi)
```

#### Design Principles

- **Model-based routing**: Since v0.4.0, the proxy reads the request `model` field and automatically routes to the correct upstream. All public models from all providers are listed in `/v1/models` and selectable from Claude Code's model picker. No manual provider switching needed.
- **Thin proxy**: Nothing is modified except the `model` field (and optional thinking injection). SSE events are forwarded byte-for-byte without parsing.
- **Lossless forwarding**: Message bodies, tool calls, and thinking blocks pass through unmodified.
- **Thinking variants**: `claude-kimi-k2-6` / `claude-minimax-m3` disable thinking; `*-thinking` variants preserve default behavior.
- **Windows-native GUI**: Tauri v2 + React + TypeScript. Rust backend, Vite + React 19 frontend.
- **Zero external dependencies**: As of v0.3.0, the proxy is written in Rust and embedded in the Tauri binary. Python is not required.

### GUI Manager

Built with Tauri v2 + React + TypeScript. Four-tab layout.

```
┌──────────────────────────────────────────┐
│  Anthropic Proxy Gateway Manager          │
│  [Gateway: Running] [Start/Stop] [EN|JA] │
├──────────────────────────────────────────┤
│  Dashboard │ Settings │ ClaudeSetup │ API Key │
├──────────────────────────────────────────┤
│  Status      │  Latest Log               │
│  - Port 4000 │  - Log switcher           │
│  - API Key   │  - New log                │
│  - URL       │  - Usage counters         │
│  - Model     │                           │
│    Table     │                           │
└──────────────────────────────────────────┘
```

| Tab | Function |
|-----|----------|
| Dashboard | Port 4000 status, API key status, Gateway URL, **model routing table** (Provider / Gateway model / Upstream / Thinking / Vision/Video), latest log viewer, usage counters |
| Gateway Settings | Raw config.json editor, UTF-8/Shift-JIS encoding toggle, save/reload |
| Claude Desktop Setup | Config JSON display + clipboard copy, auto-detect config files, manual folder browse |
| API Key | Set API keys per provider (persisted via `setx` to Windows user environment variable) |

#### Model Routing Table

The dashboard displays a correspondence table:

```text
Provider        Gateway model                  Upstream                  Thinking   Vision/Video
DeepSeek        claude-deepseek-v4             deepseek-v4-pro           default    no
DeepSeek        claude-deepseek-flash          deepseek-v4-flash         default    no
Kimi/Moonshot   claude-kimi-k2-6               kimi-k2.6                 disabled   yes
Kimi/Moonshot   claude-kimi-k2-6-thinking      kimi-k2.6                 default    yes
MiniMax         claude-minimax-m3              MiniMax-M3                disabled   yes
MiniMax         claude-minimax-m3-thinking     MiniMax-M3                default    yes
MiniMax         claude-minimax-m2-7-highspeed  MiniMax-M2.7-highspeed    default    no
```

#### Proxy Process Management

- **Start**: The `start_proxy` command resolves the config via `proxy::resolve_proxy_config()`, then spawns the axum server via `tauri::async_runtime::spawn`. Port 4000 is polled every 150ms for up to 5 seconds.
- **Stop**: The `stop_proxy` command sends a graceful shutdown signal via a oneshot channel and awaits task completion via an mpsc channel. Port 4000 release is verified.
- **Status monitoring**: `check_gateway_status` checks TCP port reachability + tokio task liveness.

### Tauri Commands

| # | Command | Type | Description |
|---|---------|------|-------------|
| 1 | `check_health` | async | Proxies `GET http://127.0.0.1:4000/health` |
| 2 | `check_gateway_status` | sync | Checks port 4000 listen state + tokio task liveness |
| 3 | `check_api_key` | sync | Returns whether the active provider's API key env var is set |
| 4 | `set_env_api_key` | sync | Persists API key via `setx` to user environment variable |
| 5 | `get_port_4000_process` | sync | Gets PID of process listening on port 4000 via `netstat` |
| 6 | `read_config` | sync | Reads and parses `config.json` |
| 7 | `read_config_raw` | sync | Reads `config.json` as raw text with auto encoding detection |
| 8 | `write_config` | sync | Saves `config.json` with specified encoding (UTF-8 / Shift-JIS) |
| 9 | `read_latest_log` | sync | Reads the latest log file from `Communication-Logs/` |
| 10 | `read_log` | sync | Reads a specific log file by name (path traversal safe) |
| 11 | `list_logs` | sync | Lists all log files in `Communication-Logs/` |
| 12 | `create_new_log` | sync | Creates a new empty log file |
| 13 | `open_logs_folder` | sync | Opens `Communication-Logs/` in Explorer |
| 14 | `open_path` | sync | Opens an arbitrary path in Explorer (supports `%ENV_VAR%` expansion) |
| 15 | `find_claude_configs` | sync | Auto-discovers Claude Desktop config files from known paths |
| 16 | `start_proxy` | sync | Resolves config → spawns axum via tauri::async_runtime::spawn → confirms port |
| 17 | `stop_proxy` | sync | Sends oneshot signal → mpsc graceful shutdown → confirms port release |
| 18 | `proxy_status` | sync | Returns task liveness via JoinHandle status |
| 19 | `check_all_api_keys` | sync | Returns API key status for all providers at once |
| 20 | `update_active_provider` | sync | Saves `active_provider` to config.json |
| 21 | `update_provider_api_key_env` | sync | Saves provider's `api_key_env` to config.json |

### Proxy Server (proxy.rs)

Fully ported from Python (FastAPI/httpx) to Rust (axum 0.7/reqwest) in v0.3.0.

#### Endpoints

| Method | Path | Behavior |
|--------|------|----------|
| GET | `/health` | Health check, returns `{"status": "ok", "routing": "model-based", "models": [...], "providers": [...]}` |
| GET | `/v1/models` | Lists all public models (`visible: true`) from all providers |
| POST | `/v1/messages` | Resolves model → upstream, injects thinking (if needed), checks media support, forwards (stream + non-stream) |
| POST | `/v1/messages/count_tokens` | Returns 501 if `supports_count_tokens=false`. Otherwise rewrites model and forwards |

#### Model-Based Routing

Builds a reverse lookup (gateway model → upstream model + provider) from each provider's `models` section (or legacy `model_map`). The request `model` field determines the target provider and upstream model name.

#### Thinking Injection

For models with `thinking: "disabled"` in their `models` entry, injects `{"type": "disabled"}` into the request body — but only when the user has not already set their own `thinking` field.

#### Media Support Checking

Uses per-model `supports_vision` / `supports_video` flags from the `models` entry. Falls back to provider defaults if not specified. Returns 400 when image/video is sent to an incapable model (e.g., `claude-minimax-m2-7-highspeed` + image).

#### SSE Transparent Forwarding

SSE events are received byte-by-byte from upstream via `reqwest::bytes_stream()` and returned directly via `axum::body::Body::from_stream()` without parsing or reconstruction.

#### HTTP Client

`reqwest::Client` (process-shared):
- Connect timeout: 30s
- Overall timeout: 300s

#### CORS

Uses `tower-http::cors::CorsLayer`. Enabled only when `server.enable_cors` is true.

### Public Model List

Models returned by `/v1/models` (7 models):

| Gateway model | Upstream | Provider | Thinking | Vision/Video |
|---|---|---|---|---|
| `claude-deepseek-v4` | `deepseek-v4-pro` | DeepSeek | default | no |
| `claude-deepseek-flash` | `deepseek-v4-flash` | DeepSeek | default | no |
| `claude-minimax-m3` | `MiniMax-M3` | MiniMax | disabled | yes |
| `claude-minimax-m3-thinking` | `MiniMax-M3` | MiniMax | default | yes |
| `claude-minimax-m2-7-highspeed` | `MiniMax-M2.7-highspeed` | MiniMax | default | no |
| `claude-kimi-k2-6` | `kimi-k2.6` | Kimi | disabled | yes |
| `claude-kimi-k2-6-thinking` | `kimi-k2.6` | Kimi | default | yes |

Legacy Claude names (`claude-opus-4-7`, `claude-sonnet-4-6`, `claude-haiku-4-5-20251001`, etc.) and raw upstream names (`deepseek-v4-pro`, `MiniMax-M3`, `kimi-k2.6`) are hidden from `/v1/models` and the dashboard via `visible: false`. Internal routing for these aliases remains active.

### Provider Capability Matrix

| Provider | Model | count_tokens | vision | video | thinking |
|----------|-------|-------------|--------|-------|----------|
| DeepSeek | deepseek-v4-pro / deepseek-v4-flash | ✗ | ✗ | ✗ | ✓ (default) |
| MiniMax | MiniMax-M3 | ✓ | ✓ | ✓ | ✓ (default / disabled) |
| MiniMax | MiniMax-M2.7-highspeed | ✗ | ✗ | ✗ | ✓ (default) |
| Kimi | kimi-k2.6 | ✗ | ✓ | ✓ | ✓ (default / disabled) |

### config.json Reference

```json
{
  "active_provider": "deepseek",
  "providers": {
    "<provider_id>": {
      "display_name": "Display Name",
      "upstream_url": "Anthropic-compatible API base URL",
      "api_key_env": "API key environment variable name",
      "default_model": "Fallback model name",
      "force_anthropic_version": null,
      "supports_count_tokens": false,
      "supports_vision": false,
      "supports_video": false,
      "supports_thinking": true,
      "model_map": {
        "claude-sonnet-4-5": "actual-model-name"
      },
      "visible_models": [
        "claude-public-model-name"
      ],
      "models": {
        "claude-public-model-name": {
          "upstream_model": "actual-model-name",
          "thinking": "disabled",
          "supports_vision": true,
          "supports_video": true,
          "visible": true
        }
      }
    }
  },
  "server": {
    "host": "127.0.0.1",
    "port": 4000,
    "enable_cors": false
  }
}
```

| Key | Type | Description |
|-----|------|-------------|
| `active_provider` | string? | Default provider ID (fallback for model-based routing) |
| `providers.<id>.display_name` | string | Provider display name for the GUI |
| `providers.<id>.upstream_url` | string | Anthropic-compatible API base URL |
| `providers.<id>.api_key_env` | string | Windows user environment variable holding the API key |
| `providers.<id>.default_model` | string | Fallback when model not in map |
| `providers.<id>.force_anthropic_version` | string\|null | `null` = forward request header; set to override |
| `providers.<id>.supports_count_tokens` | boolean | Provider default for count_tokens support |
| `providers.<id>.supports_vision` | boolean | Provider default for image support (overridable per model) |
| `providers.<id>.supports_video` | boolean | Provider default for video support (overridable per model) |
| `providers.<id>.model_map` | object | Claude model name → actual model name (legacy) |
| `providers.<id>.visible_models` | string[] | Public model names when models section absent (legacy fallback) |
| `providers.<id>.models` | object? | **New format**: gateway model → ModelEntry map |
| `providers.<id>.models.<gm>.upstream_model` | string | Actual model name sent to upstream |
| `providers.<id>.models.<gm>.thinking` | "disabled"? | When "disabled", injects thinking suppression |
| `providers.<id>.models.<gm>.supports_vision` | boolean? | Per-model image support (falls back to provider default) |
| `providers.<id>.models.<gm>.supports_video` | boolean? | Per-model video support (falls back to provider default) |
| `providers.<id>.models.<gm>.visible` | boolean | Whether to expose in `/v1/models` and dashboard (default true) |
| `server.host` | string | Proxy listen address |
| `server.port` | number | Proxy listen port |
| `server.enable_cors` | boolean | Enable/disable CORS middleware |

#### Routing Priority

1. If `models` section exists, it is used (takes precedence over `model_map`)
2. If `models` is absent, falls back to `model_map` (all entries routable; only `visible_models` entries exposed publicly)

#### Backward Compatibility

Pre-v0.4.0 configs using only `model_map` continue to work. When `models` section is absent, `model_map` handles all routing, with `visible_models` filtering public exposure.

### Claude Desktop Configuration

```json
{
  "inferenceProvider": "gateway",
  "inferenceGatewayBaseUrl": "http://127.0.0.1:4000",
  "inferenceGatewayApiKey": "sk-local-gateway",
  "inferenceGatewayAuthScheme": "bearer",
  "inferenceModels": [
    {
      "name": "claude-deepseek-v4",
      "labelOverride": "DeepSeek V4 Pro via Gateway"
    },
    {
      "name": "claude-deepseek-flash",
      "labelOverride": "DeepSeek V4 Flash via Gateway"
    },
    {
      "name": "claude-minimax-m3",
      "labelOverride": "MiniMax M3 via Gateway"
    },
    {
      "name": "claude-minimax-m3-thinking",
      "labelOverride": "MiniMax M3 (Thinking) via Gateway"
    },
    {
      "name": "claude-minimax-m2-7-highspeed",
      "labelOverride": "MiniMax M2.7 Highspeed via Gateway"
    },
    {
      "name": "claude-kimi-k2-6",
      "labelOverride": "Kimi K2.6 via Gateway"
    },
    {
      "name": "claude-kimi-k2-6-thinking",
      "labelOverride": "Kimi K2.6 (Thinking) via Gateway"
    }
  ]
}
```

Config file locations (Windows):
- `%APPDATA%\Claude\claude_desktop_config.json`
- `%USERPROFILE%\.claude\settings.json`
- `%LOCALAPPDATA%\Claude-3p\configLibrary\`

The GUI's Claude Desktop Setup tab provides auto-detection and clipboard copy.

### Field Test Results

| Route | Model | stream | tools | msgs | Result |
|-------|-------|--------|-------|------|--------|
| Pro | claude-sonnet-4-5 → deepseek-v4-pro | ✓ | ✓ | 43 | PASS |
| Flash | claude-haiku-4-5-20251001 → deepseek-v4-flash | ✓ | ✓ | 17 | PASS |

Both routes completed multi-turn tool-use conversations with no `reasoning_content` or `Invalid model name` errors.

### Pre-Implementation Verification

All compatibility probes against DeepSeek's Anthropic-compatible API passed before implementation.

| # | Test | Result | Detail |
|---|------|--------|--------|
| 1 | non-stream `/v1/messages` | PASS | 200, "hello" |
| 2 | stream=true SSE format | PASS | Anthropic SSE format, all 7 event types |
| 3 | thinking block | PASS | ['thinking', 'text'], no reasoning_content leakage |
| 4 | 2nd turn pass-back | PASS | No reasoning_content error |
| 5 | tool_use block | PASS | ['thinking', 'tool_use'], stop_reason=tool_use |
| 6 | tool_result 2nd turn | PASS | tool_result response successful |
| 7 | count_tokens | PASS | input_tokens=10 |
| 8 | header handling | PASS | Unknown anthropic-beta values return 200 |
