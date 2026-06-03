import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "../i18n";
import type { ApiKeyStatus, GatewayConfig, ProviderConfig, AllApiKeyStatus } from "../types";

const COL_STYLE: React.CSSProperties = {
  padding: "6px 10px",
  fontSize: 12,
  color: "#1f2937",
  whiteSpace: "nowrap",
};

function ProviderRow({
  providerId,
  provider,
  active,
  keyStatus,
  onActivate,
  onRefresh,
  switching,
}: {
  providerId: string;
  provider: ProviderConfig;
  active: boolean;
  keyStatus: ApiKeyStatus | null;
  onActivate: () => void;
  onRefresh: () => void;
  switching: boolean;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [keyText, setKeyText] = useState("");
  const [keySaving, setKeySaving] = useState(false);
  const [keySaved, setKeySaved] = useState(false);
  const [envVarName, setEnvVarName] = useState(provider.api_key_env);
  const [envVarSaving, setEnvVarSaving] = useState(false);
  const [envVarSaved, setEnvVarSaved] = useState(false);
  const [envVarError, setEnvVarError] = useState<string | null>(null);

  useEffect(() => {
    setEnvVarName(provider.api_key_env);
  }, [provider.api_key_env]);

  const handleSaveKey = async () => {
    if (!keyText.trim() || !keyStatus) return;
    setKeySaving(true);
    setKeySaved(false);
    try {
      await invoke("set_env_api_key", { key: keyText, envVarName: keyStatus.env_var });
      setKeySaving(false);
      setKeySaved(true);
      setKeyText("");
      setTimeout(() => setKeySaved(false), 2000);
      onRefresh();
    } catch (e) {
      setKeySaving(false);
      console.error(e);
    }
  };

  const handleSaveEnvVar = async () => {
    const trimmed = envVarName.trim();
    if (!trimmed) {
      setEnvVarError(t("apiKeyPanel.envVarErrorEmpty"));
      return;
    }
    if (!/^[A-Z][A-Z0-9_]*$/.test(trimmed)) {
      setEnvVarError(t("apiKeyPanel.envVarErrorFormat"));
      return;
    }
    setEnvVarError(null);
    setEnvVarSaving(true);
    setEnvVarSaved(false);
    try {
      await invoke("update_provider_api_key_env", { providerId, apiKeyEnv: trimmed });
      setEnvVarSaving(false);
      setEnvVarSaved(true);
      setTimeout(() => setEnvVarSaved(false), 2000);
      onRefresh();
    } catch (e) {
      setEnvVarSaving(false);
      setEnvVarError(String(e));
    }
  };

  const cell = (content: React.ReactNode, style?: React.CSSProperties) => (
    <div style={{ ...COL_STYLE, ...style }}>{content}</div>
  );

  const btnSmall = (label: string, onClick: () => void, disabled?: boolean) => (
    <button
      className="btn btn-small"
      onClick={onClick}
      disabled={disabled}
      style={{ fontSize: 11, padding: "2px 8px" }}
    >
      {label}
    </button>
  );

  const btnPrimarySmall = (label: string, onClick: () => void, disabled?: boolean) => (
    <button
      className="btn btn-primary btn-small"
      onClick={onClick}
      disabled={disabled}
      style={{ fontSize: 11, padding: "2px 8px" }}
    >
      {label}
    </button>
  );

  const rowBg = active ? "#eef6ff" : "#ffffff";
  const rowBorder = active ? "2px solid #e0edf9" : "1px solid #e5e7eb";
  const leftBar = active ? "4px solid #0078d4" : "4px solid transparent";

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {/* Main row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          background: rowBg,
          borderTop: rowBorder,
          borderBottom: rowBorder,
          borderLeft: leftBar,
          borderRight: rowBorder,
          marginBottom: expanded ? 0 : 0,
        }}
      >
        {/* Provider name */}
        <div style={{ ...COL_STYLE, fontWeight: 700, minWidth: 130, fontSize: 13 }}>
          {provider.display_name}
        </div>

        {/* Status badge */}
        <div style={{ minWidth: 80 }}>
          {active ? (
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                padding: "2px 10px",
                borderRadius: 4,
                background: "#0078d4",
                color: "#fff",
              }}
            >
              {t("apiKeyPanel.badgeActive")}
            </span>
          ) : (
            <span style={{ fontSize: 11, color: "#6b7280" }}>Inactive</span>
          )}
        </div>

        {/* Env var name */}
        <div style={{ ...COL_STYLE, fontFamily: "var(--font-mono)", fontSize: 11, minWidth: 150, color: "#374151" }}>
          {provider.api_key_env}
        </div>

        {/* Key status */}
        <div style={{ minWidth: 70 }}>
          {keyStatus === null ? (
            <span style={{ fontSize: 11, color: "#6b7280" }}>...</span>
          ) : keyStatus.set ? (
            <span style={{ fontSize: 11, color: "#107c10", fontWeight: 600 }}>
              {t("apiKeyPanel.set")}
            </span>
          ) : (
            <span style={{ fontSize: 11, color: "var(--error)", fontWeight: 600 }}>
              {t("apiKeyPanel.notSet")}
            </span>
          )}
        </div>

        {/* Vision capability */}
        <div style={{ minWidth: 80 }}>
          <span
            style={{
              fontSize: 10,
              padding: "2px 8px",
              borderRadius: 4,
              fontWeight: 500,
              background: provider.supports_vision ? "#e6f4ea" : "#f3f4f6",
              color: provider.supports_vision ? "#137333" : "#6b7280",
              border: provider.supports_vision ? "1px solid #b7dfc0" : "1px solid #d1d5db",
            }}
          >
            {provider.supports_vision ? t("apiKeyPanel.capVision") : t("apiKeyPanel.noVision")}
          </span>
        </div>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Actions */}
        <div style={{ display: "flex", gap: 6, padding: "4px 10px" }}>
          {!active && btnPrimarySmall(t("apiKeyPanel.setActive"), onActivate, switching)}
          {btnSmall(expanded ? t("apiKeyPanel.collapse") : t("apiKeyPanel.edit"), () => setExpanded(!expanded))}
        </div>
      </div>

      {/* Expandable edit area */}
      {expanded && (
        <div
          style={{
            background: "#fafafa",
            borderLeft: leftBar,
            borderRight: "1px solid #e5e7eb",
            borderBottom: "1px solid #e5e7eb",
            padding: "10px 16px 10px 24px",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {/* Env var name edit */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "#1f2937", minWidth: 90 }}>
              {t("apiKeyPanel.envVarLabel")}
            </span>
            <input
              style={{
                width: 260,
                padding: "4px 8px",
                fontSize: 11,
                fontFamily: "var(--font-mono)",
                background: "#fff",
                color: "#1f2937",
                border: envVarError ? "1px solid var(--error)" : "1px solid #d0d7de",
                borderRadius: 4,
                outline: "none",
              }}
              value={envVarName}
              onChange={(e) => {
                setEnvVarName(e.target.value.toUpperCase());
                setEnvVarError(null);
              }}
              placeholder="MOONSHOT_API_KEY"
              spellCheck={false}
            />
            <button
              className="btn btn-primary btn-small"
              onClick={handleSaveEnvVar}
              disabled={envVarSaving || !envVarName.trim() || envVarName === provider.api_key_env}
            >
              {envVarSaving ? "..." : t("apiKeyPanel.envVarSave")}
            </button>
            {envVarSaved && <span className="saved-toast">{t("apiKeyPanel.envVarSaved")}</span>}
            {envVarError && (
              <span style={{ fontSize: 10, color: "var(--error)" }}>{envVarError}</span>
            )}
          </div>

          {/* API key input */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "#1f2937", minWidth: 90 }}>
              {t("apiKeyPanel.header")}
            </span>
            <input
              type="password"
              style={{
                width: 340,
                padding: "4px 8px",
                fontSize: 11,
                fontFamily: "var(--font-mono)",
                background: "#fff",
                color: "#1f2937",
                border: "1px solid #d0d7de",
                borderRadius: 4,
                outline: "none",
              }}
              value={keyText}
              onChange={(e) => setKeyText(e.target.value)}
              placeholder="sk-..."
              spellCheck={false}
            />
            <button
              className="btn btn-primary btn-small"
              onClick={handleSaveKey}
              disabled={keySaving || !keyText.trim()}
            >
              {keySaving ? "..." : t("apiKeyPanel.saveKey")}
            </button>
            {keySaved && <span className="saved-toast">{t("apiKeyPanel.saved")}</span>}
          </div>

          {/* Extra capabilities shown on expand */}
          <div style={{ display: "flex", gap: 16, marginLeft: 100 }}>
            <span style={{ fontSize: 10, color: provider.supports_video ? "#137333" : "#6b7280" }}>
              {t("apiKeyPanel.capVideo")}: {provider.supports_video ? "Yes" : "No"}
            </span>
            <span style={{ fontSize: 10, color: provider.supports_thinking ? "#137333" : "#6b7280" }}>
              {t("apiKeyPanel.capThinking")}: {provider.supports_thinking ? "Yes" : "No"}
            </span>
            <span style={{ fontSize: 10, color: provider.supports_count_tokens ? "#137333" : "#6b7280" }}>
              {t("apiKeyPanel.capCountTokens")}: {provider.supports_count_tokens ? "Yes" : "No"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ApiKeyPanel() {
  const { t } = useTranslation();
  const [config, setConfig] = useState<GatewayConfig | null>(null);
  const [allKeyStatus, setAllKeyStatus] = useState<AllApiKeyStatus | null>(null);
  const [switchingProvider, setSwitchingProvider] = useState(false);

  const refresh = useCallback(() => {
    invoke<AllApiKeyStatus>("check_all_api_keys")
      .then(setAllKeyStatus)
      .catch(() => setAllKeyStatus(null));
    invoke<GatewayConfig>("read_config")
      .then(setConfig)
      .catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleActivate = useCallback(
    async (providerId: string) => {
      setSwitchingProvider(true);
      try {
        await invoke("update_active_provider", { providerId });
        await refresh();
      } catch (e) {
        console.error(e);
      } finally {
        setSwitchingProvider(false);
      }
    },
    [refresh]
  );

  if (!config) {
    return <div className="loading" />;
  }

  const activeProvider = config.providers[config.active_provider];
  const providerEntries = Object.entries(config.providers);

  return (
    <>
      {/* Help text */}
      <div className="claude-config-help" style={{ marginBottom: 10 }}>
        <p>{t("apiKeyPanel.helpText")}</p>
      </div>

      {/* Active provider info + vision warning */}
      {activeProvider && (
        <div
          style={{
            padding: "8px 14px",
            background: activeProvider.supports_vision ? "#f0fdf4" : "#fefce8",
            border: activeProvider.supports_vision ? "1px solid #bbf7d0" : "1px solid #fde68a",
            borderRadius: 6,
            marginBottom: 12,
            fontSize: 12,
            color: "#1f2937",
            lineHeight: 1.5,
          }}
        >
          <strong>{t("apiKeyPanel.currentActive", { name: activeProvider.display_name })}</strong>
          &ensp;
          {activeProvider.supports_vision
            ? t("apiKeyPanel.visionSupported")
            : t("apiKeyPanel.visionNotSupported")}
        </div>
      )}

      {/* Column headers */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "4px 10px",
          marginBottom: 4,
        }}
      >
        <div style={{ ...COL_STYLE, fontWeight: 600, fontSize: 10, color: "#6b7280", minWidth: 130 }}>
          Provider
        </div>
        <div style={{ minWidth: 80, fontSize: 10, fontWeight: 600, color: "#6b7280" }}>Status</div>
        <div style={{ ...COL_STYLE, fontWeight: 600, fontSize: 10, color: "#6b7280", minWidth: 150 }}>
          Env Var
        </div>
        <div style={{ minWidth: 70, fontSize: 10, fontWeight: 600, color: "#6b7280" }}>Key</div>
        <div style={{ minWidth: 80, fontSize: 10, fontWeight: 600, color: "#6b7280" }}>Vision</div>
        <div style={{ flex: 1 }} />
        <div style={{ width: 160, fontSize: 10, fontWeight: 600, color: "#6b7280" }}>Actions</div>
      </div>

      {/* Provider rows */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          border: "1px solid #e5e7eb",
          borderRadius: 6,
          overflow: "hidden",
        }}
      >
        {providerEntries.map(([id, provider]) => (
          <ProviderRow
            key={id}
            providerId={id}
            provider={provider}
            active={id === config.active_provider}
            keyStatus={allKeyStatus?.[id] ?? null}
            onActivate={() => handleActivate(id)}
            onRefresh={refresh}
            switching={switchingProvider}
          />
        ))}
      </div>
    </>
  );
}
