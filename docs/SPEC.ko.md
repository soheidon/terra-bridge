[English](../SPEC.md) | [日本語](SPEC.ja.md) | [中文(简体)](SPEC.zh-CN.md) | [中文(繁體)](SPEC.zh-TW.md) | [한국어](SPEC.ko.md) | [Français](SPEC.fr.md) | [Deutsch](SPEC.de.md) | [Español](SPEC.es.md)

# SPEC: Anthro Bridge

## 개요

여러 제공자의 Anthropic 호환 엔드포인트를 통해 Claude Desktop / Claude Code API 요청을 라우팅하는 가벼운 프록시 + GUI 관리 도구입니다.

### 아키텍처

```
Claude Desktop / Claude Code
       |
       v
proxy.rs (127.0.0.1:4000)  <- Tauri 앱에 내장 (axum 0.7 + reqwest)
       |
       | 모델 필드별 라우팅 -> 올바른 업스트림 제공자 확인
       | 모델을 업스트림 이름으로만 다시 쓰기
       | 비-thinking 변형에 thinking disabled 주입
       | 모델별 미디어 지원 확인
       v
Provider Anthropic-compatible APIs
(DeepSeek / MiniMax / Kimi / MiMo)
```

#### 설계 원칙

- **쉘 모델 + 제공자 선택**: Claude Desktop은 항상 `claude-sonnet-4-6` / `claude-haiku-4-5`를 봅니다. 실제 LLM은 GUI에서 선택합니다(DeepSeek / MiniMax / Kimi / MiMo). 활성 제공자의 모델 매핑이 라우팅에 사용됩니다.
- **활성 제공자만 API 키 필요**: v0.5.0부터 라우팅 테이블에서 참조하는 제공자만 확인합니다. 비활성 제공자 키는 필요하지 않습니다.
- **가벼운 프록시**: `model` 필드 외에는 아무것도 수정하지 않습니다. SSE는 바이트별로 전달됩니다.
- **무손실 전달**: 메시지 본문, 도구 호출, thinking 블록이 수정 없이 전달됩니다.
- **Windows 네이티브 GUI**: Tauri v2 + React 19 + TypeScript. Rust 백엔드, Vite + React 19 프론트엔드.
- **외부 의존성 제로**: v0.3.0부터 프록시가 Tauri 바이너리에 내장됩니다. Python이 필요하지 않습니다.
- **다국어**: v0.9.1부터 8개 언어 지원 (en, ja, zh-CN, zh-TW, ko, fr, de, es). `lang/`에 언어 파일을 넣으면 새 언어가 추가됩니다. 첫 실행 시 언어 선택기.

### GUI 관리 도구

Tauri v2 + React 19 + TypeScript. 이중 패널 레이아웃: 대시보드 + 설정.

```
+------------------------------------------+
|  Anthro Bridge                   |
|  [게이트웨이 시작/중지] [상태]    [=]     |
+------------------------------------------+
|  대시보드                                 |
|  +- LLM 제공자 선택 ------------------+|
|  | [DeepSeek] [MiniMax] [Kimi] [MiMo]   ||
|  +- 상태 --------------------------------+
|  | 포트 4000 | API 키 | 게이트웨이 URL   ||
|  | 모델 라우팅 테이블                    ||
|  +- 최신 로그 ---------------------------+
|  | Pro/Flash 카운터가 있는 로그 뷰어     ||
|  +---------------------------------------+
+------------------------------------------+

설정 (=):
  +- 언어 ------------------------------+
  | 드롭다운으로 즉시 전환               |
  +- API 키 -----------------------------+
  | 제공자별 API 키 관리                  |
  +- Claude Desktop 설정 ----------------+
  | 설정 JSON 생성, 복사,                 |
  | 설정 파일 감지                        |
  +- 게이트웨이 설정 -------------------+
  | config.json 편집기 (고급)             |
  +---------------------------------------+
```

### Tauri 명령

| # | 명령 | 타입 | 설명 |
|---|------|------|------|
| 1 | `check_health` | async | 프록시 헬스 체크 |
| 2 | `check_gateway_status` | sync | 포트 4000 + tokio 태스크 활성 상태 |
| 3 | `check_api_key` | sync | 활성 제공자 API 키 상태 |
| 4 | `set_env_api_key` | sync | setx로 API 키 영구 저장 |
| 5 | `get_port_4000_process` | sync | netstat으로 포트 4000의 PID 가져오기 |
| 6 | `read_config` | sync | config.json 읽기 |
| 7 | `read_config_raw` | sync | 원시 config.json 텍스트 + 인코딩 감지 |
| 8 | `write_config` | sync | config.json 저장 (UTF-8 / Shift-JIS) |
| 9 | `read_latest_log` | sync | 최신 로그 읽기 |
| 10 | `read_log` | sync | 지정된 로그 파일 읽기 |
| 11 | `list_logs` | sync | 로그 파일 목록 |
| 12 | `create_new_log` | sync | 새 로그 파일 생성 |
| 13 | `open_logs_folder` | sync | 로그 폴더 열기 |
| 14 | `open_path` | sync | 임의 경로 열기 |
| 15 | `find_claude_configs` | sync | Claude Desktop 설정 파일 자동 감지 |
| 16 | `start_proxy` | sync | 프록시 시작 (설정 확인 -> 시작 -> 포트 확인) |
| 17 | `stop_proxy` | sync | 프록시 중지 (우아한 종료) |
| 18 | `proxy_status` | sync | 태스크 활성 상태 확인 |
| 19 | `check_all_api_keys` | sync | 모든 제공자 API 키 상태 |
| 20 | `update_active_provider` | sync | active_provider 저장 |
| 21 | `update_provider_api_key_env` | sync | provider api_key_env 저장 |
| 22 | `get_user_language` | sync | 저장된 언어 환경설정 가져오기 |
| 23 | `set_user_language` | sync | 언어 환경설정 저장 |
| 24 | `is_first_run` | sync | 첫 실행 확인 (user_prefs.json 존재 여부) |

### 프록시 서버 (proxy.rs)

v0.3.0에서 Python에서 Rust (axum 0.7/reqwest)로 포팅됨.

#### 엔드포인트

| 메서드 | 경로 | 동작 |
|--------|------|------|
| GET | `/health` | 헬스 체크 |
| GET | `/v1/models` | 공개 모델 목록 (`visible: true`만) |
| POST | `/v1/messages` | 모델 확인 -> thinking 주입 -> 미디어 확인 -> 전달 (stream/non-stream) |
| POST | `/v1/messages/count_tokens` | 지원되는 경우 업스트림으로 전달 |

#### 모델 라우팅

각 제공자의 `models` 섹션을 사용하여 게이트웨이 모델 -> (제공자, 업스트림 모델)의 역방향 조회 테이블을 구축합니다. 모든 제공자가 동일한 게이트웨이 모델 이름을 사용하므로 충돌 시 `active_provider`가 우선합니다. 실제로 라우팅 테이블에는 활성 제공자의 모델만 들어갑니다.

#### API 키 검증 (v0.5.0부터)

1단계: 모델 라우팅 테이블 구축 (API 키 불필요)
2단계: 라우팅 테이블에서 참조하는 제공자의 API 키만 확인

#### Thinking 주입

구성 항목에 `thinking: "disabled"`가 있는 모델의 경우, 사용자가 thinking을 명시적으로 설정하지 않은 경우에만 `{"type": "disabled"}`를 주입합니다.

#### 미디어 확인 / 이미지 정화

모델별 `supports_vision` / `supports_video` 플래그가 동작을 결정합니다. 이미지를 수신하는 비전 모델의 경우 `non_vision_image_policy`가 적용됩니다:
- `replace` (기본값): 이미지 블록을 플레이스홀더 텍스트로 교체
- `drop`: 이미지 블록 제거 (내용이 비어 있으면 플레이스홀더 삽입)
- `reject`: 400 오류 반환

비디오 블록은 항상 400을 반환합니다. `non_vision_image_policy`는 `/health`를 통해 확인할 수 있습니다.

### 다국어

`import.meta.glob` 자동 탐색이 가능한 언어별 파일 아키텍처:

```
gui/src/i18n/lang/
  en.ts      영어 (정규 — TranslationKey 타입 정의)
  ja.ts      일본어
  zh-CN.ts   중국어(간체)
  zh-TW.ts   중국어(번체)
  ko.ts      한국어
  fr.ts      프랑스어
  de.ts      독일어
  es.ts      스페인어
```

언어 추가: `en.ts`를 복사하고, 번역하고, 다시 빌드하세요. 코드 변경이 필요하지 않습니다.

### config.json 참조

```json
{
  "active_provider": "deepseek",
  "providers": {
    "<provider_id>": {
      "display_name": "표시 이름",
      "upstream_url": "Anthropic 호환 API 기본 URL",
      "api_key_env": "API 키 환경 변수 이름",
      "default_model": "대체 모델 이름",
      "force_anthropic_version": null,
      "supports_count_tokens": false,
      "supports_vision": false,
      "supports_video": false,
      "model_map": { "claude-sonnet-4-6": "실제 모델 이름" },
      "visible_models": ["claude 공개 모델 이름"],
      "models": {
        "claude-sonnet-4-6": {
          "upstream_model": "실제 모델 이름",
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
