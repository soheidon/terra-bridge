[English](../SPEC.md) | [日本語](SPEC.ja.md) | [中文(简体)](SPEC.zh-CN.md) | [中文(繁體)](SPEC.zh-TW.md) | [한국어](SPEC.ko.md) | [Français](SPEC.fr.md) | [Deutsch](SPEC.de.md) | [Español](SPEC.es.md)

# SPEC: Anthro Bridge

## Resumen

Una herramienta ligera de proxy + gestión con GUI que enruta solicitudes API de Claude Desktop / Claude Code a través de múltiples proveedores con endpoints compatibles con Anthropic.

### Arquitectura

```
Claude Desktop / Claude Code
       |
       v
proxy.rs (127.0.0.1:4000)  <- Incrustada en la app Tauri (axum 0.7 + reqwest)
       |
       | Enruta por campo model -> resuelve el proveedor upstream correcto
       | Solo reescribe el model al nombre upstream
       | Inyecta thinking disabled para variantes sin thinking
       | Verificación de soporte multimedia por modelo
       v
Provider Anthropic-compatible APIs
(DeepSeek / MiniMax / Kimi / MiMo)
```

#### Principios de diseño

- **Modelo shell + selección de proveedor**: Claude Desktop siempre ve `claude-sonnet-4-6` / `claude-haiku-4-5`. El LLM real se selecciona en la GUI (DeepSeek / MiniMax / Kimi / MiMo). El mapeo de modelos del proveedor activo se usa para el enrutamiento.
- **Solo el proveedor activo necesita API key**: Desde v0.5.0, solo se verifican los proveedores referenciados por la tabla de enrutamiento al iniciar. Las claves de proveedores inactivos no son requeridas.
- **Proxy delgado**: Nada se modifica excepto el campo `model`. SSE se reenvía byte por byte.
- **Reenvío sin pérdidas**: Cuerpos de mensajes, tool calls, bloques thinking pasan sin modificaciones.
- **GUI nativa de Windows**: Tauri v2 + React 19 + TypeScript. Backend en Rust, frontend Vite + React 19.
- **Cero dependencias externas**: Proxy incrustado en el binario de Tauri desde v0.3.0. Python no es necesario.
- **Multilingüe**: 8 idiomas desde v0.9.1 (en, ja, zh-CN, zh-TW, ko, fr, de, es). Agregue nuevos idiomas colocando archivos en `lang/`. Selector de idioma en el primer inicio.

### Herramienta de gestión con GUI

Tauri v2 + React 19 + TypeScript. Diseño de dos paneles: Panel principal + Configuración.

```
+------------------------------------------+
|  Anthro Bridge                   |
|  [Iniciar/Detener pasarela] [Estado] [=] |
+------------------------------------------+
|  Panel principal                         |
|  +- Seleccionar proveedor LLM ----------+|
|  | [DeepSeek] [MiniMax] [Kimi] [MiMo]   ||
|  +- Estado ------------------------------+
|  | Puerto 4000 | API Key | URL pasarela  ||
|  | Tabla de enrutamiento de modelos      ||
|  +- Último registro ---------------------+
|  | Visor de registros con contadores     ||
|  +---------------------------------------+
+------------------------------------------+

Configuración (=):
  +- Idioma -------------------------------+
  | Desplegable para cambio instantáneo    |
  +- API Key ------------------------------+
  | Gestión de API key por proveedor       |
  +- Configuración Claude Desktop ---------+
  | Generación de JSON de configuración,   |
  | copia, detección de archivo de config  |
  +- Configuración de la pasarela ---------+
  | Editor de config.json (avanzado)       |
  +---------------------------------------+
```

### Comandos Tauri

| # | Comando | Tipo | Descripción |
|---|---------|------|-------------|
| 1 | `check_health` | async | Verificación de salud del proxy |
| 2 | `check_gateway_status` | sync | Puerto 4000 + vivacidad de tarea tokio |
| 3 | `check_api_key` | sync | Estado de la API key del proveedor activo |
| 4 | `set_env_api_key` | sync | Persistir API key mediante setx |
| 5 | `get_port_4000_process` | sync | Obtener PID del puerto 4000 vía netstat |
| 6 | `read_config` | sync | Leer config.json |
| 7 | `read_config_raw` | sync | Texto raw de config.json + detección de codificación |
| 8 | `write_config` | sync | Guardar config.json (UTF-8 / Shift-JIS) |
| 9 | `read_latest_log` | sync | Leer último registro |
| 10 | `read_log` | sync | Leer archivo de registro especificado |
| 11 | `list_logs` | sync | Listar archivos de registro |
| 12 | `create_new_log` | sync | Crear nuevo archivo de registro |
| 13 | `open_logs_folder` | sync | Abrir carpeta de registros |
| 14 | `open_path` | sync | Abrir ruta arbitraria |
| 15 | `find_claude_configs` | sync | Detectar automáticamente archivos de configuración de Claude Desktop |
| 16 | `start_proxy` | sync | Iniciar proxy (resolver config -> iniciar -> verificar puerto) |
| 17 | `stop_proxy` | sync | Detener proxy (apagado graceful) |
| 18 | `proxy_status` | sync | Verificar vivacidad de tarea |
| 19 | `check_all_api_keys` | sync | Estado de API keys de todos los proveedores |
| 20 | `update_active_provider` | sync | Guardar active_provider |
| 21 | `update_provider_api_key_env` | sync | Guardar provider api_key_env |
| 22 | `get_user_language` | sync | Obtener preferencia de idioma guardada |
| 23 | `set_user_language` | sync | Guardar preferencia de idioma |
| 24 | `is_first_run` | sync | Determinar primer inicio (existencia de user_prefs.json) |

### Servidor Proxy (proxy.rs)

Portado de Python a Rust (axum 0.7/reqwest) en v0.3.0.

#### Endpoints

| Método | Ruta | Comportamiento |
|--------|------|----------------|
| GET | `/health` | Verificación de salud |
| GET | `/v1/models` | Lista pública de modelos (solo `visible: true`) |
| POST | `/v1/messages` | Resolución de modelo -> inyección thinking -> verificación multimedia -> reenvío (stream/non-stream) |
| POST | `/v1/messages/count_tokens` | Reenviar a upstream si es compatible |

#### Enrutamiento de modelos

Construye una tabla de búsqueda inversa de modelo gateway -> (proveedor, modelo upstream) usando la sección `models` de cada proveedor. Como todos los proveedores usan los mismos nombres de modelo gateway, `active_provider` gana en caso de colisión. Efectivamente, solo los modelos del proveedor activo terminan en la tabla de enrutamiento.

#### Validación de API key (desde v0.5.0)

Paso 1: Construir tabla de enrutamiento de modelos (no se necesitan API keys)
Paso 2: Solo verificar API keys de proveedores referenciados por la tabla de enrutamiento

#### Inyección de thinking

Para modelos con `thinking: "disabled"` en su entrada de configuración, inyecta `{"type": "disabled"}` solo cuando el usuario no ha configurado thinking explícitamente.

#### Verificación multimedia / Sanitización de imágenes

Las banderas `supports_vision` / `supports_video` por modelo determinan el comportamiento. Para modelos sin soporte de visión que reciben imágenes, se aplica `non_vision_image_policy`:
- `replace` (predeterminado): Reemplazar bloques de imagen con texto de marcador
- `drop`: Eliminar bloques de imagen (insertar marcador si el contenido queda vacío)
- `reject`: Retornar error 400

Los bloques de video siempre retornan 400. `non_vision_image_policy` es visible a través de `/health`.

### Multilingüe

Arquitectura de archivo-por-idioma con auto-descubrimiento de `import.meta.glob`:

```
gui/src/i18n/lang/
  en.ts      Inglés (canónico — define el tipo TranslationKey)
  ja.ts      Japonés
  zh-CN.ts   Chino (Simplificado)
  zh-TW.ts   Chino (Tradicional)
  ko.ts      Coreano
  fr.ts      Francés
  de.ts      Alemán
  es.ts      Español
```

Para agregar un idioma: copiar `en.ts`, traducir, reconstruir. No se necesitan cambios de código.

### Referencia de config.json

```json
{
  "active_provider": "deepseek",
  "providers": {
    "<provider_id>": {
      "display_name": "Nombre para mostrar",
      "upstream_url": "URL base de la API compatible con Anthropic",
      "api_key_env": "Nombre de variable de entorno de la API key",
      "default_model": "Nombre del modelo de respaldo",
      "force_anthropic_version": null,
      "supports_count_tokens": false,
      "supports_vision": false,
      "supports_video": false,
      "model_map": { "claude-sonnet-4-6": "nombre-real-del-modelo" },
      "visible_models": ["nombre-publico-del-modelo"],
      "models": {
        "claude-sonnet-4-6": {
          "upstream_model": "nombre-real-del-modelo",
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
