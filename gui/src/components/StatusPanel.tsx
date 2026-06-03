import { useEffect, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "../i18n";
import type { GatewayStatus, AllApiKeyStatus, GatewayConfig } from "../types";

interface StatusPanelProps {
  health: GatewayStatus | null;
  healthError: string | null;
  healthLoading: boolean;
}

export default function StatusPanel({ health, healthError, healthLoading }: StatusPanelProps) {
  const { t } = useTranslation();
  const [allKeyStatus, setAllKeyStatus] = useState<AllApiKeyStatus | null>(null);
  const [config, setConfig] = useState<GatewayConfig | null>(null);

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

  // Build routing table: only the 2 Anthropic official shells for the active provider
  const SHELL_MODELS = [
    { name: "claude-sonnet-4-6", role: "Gateway Pro" },
    { name: "claude-haiku-4-5",  role: "Gateway Flash" },
  ];
  interface RoutedModelRow {
    gateway: string;
    upstream: string;
    role: string;
    thinking: string;
    visionVideo: boolean;
  }
  const routedModels: RoutedModelRow[] = [];
  const activeProviderId = config?.active_provider ?? "deepseek";
  const activeProvider = config?.providers[activeProviderId];
  if (activeProvider?.models) {
    for (const shell of SHELL_MODELS) {
      const entry = activeProvider.models[shell.name];
      if (entry) {
        const visionVideo = entry.supports_vision ?? activeProvider.supports_vision;
        const thinking = entry.thinking === "disabled" ? "disabled" : "default";
        routedModels.push({
          gateway: shell.name,
          upstream: entry.upstream_model,
          role: shell.role,
          thinking,
          visionVideo,
        });
      }
    }
  }

  return (
    <div className="panel status-panel">
      <div className="panel-header">
        <span>{t("statusPanel.header")}</span>
      </div>
      <div className="panel-content">
        <div className="status-grid">
          {/* Port 4000 card */}
          <div className="status-card">
            <div className="status-card-label">{t("statusPanel.port4000")}</div>
            {healthLoading ? (
              <div className="loading" />
            ) : healthError ? (
              <div className="error-text">{healthError}</div>
            ) : health?.port_listening ? (
              <div className="status-card-value green">
                {t("statusPanel.listening")}
              </div>
            ) : (
              <div className="status-card-value muted">{t("statusPanel.notListening")}</div>
            )}
          </div>

          {/* Gateway URL card */}
          <div className="status-card">
            <div className="status-card-label">{t("statusPanel.gatewayUrl")}</div>
            <div className="status-card-value" style={{ fontSize: 12 }}>
              {t("statusPanel.gatewayUrlValue")}
            </div>
          </div>

          {/* Routing mode card */}
          <div className="status-card">
            <div className="status-card-label">{t("statusPanel.routing")}</div>
            <div className="status-card-value green" style={{ fontSize: 11 }}>
              {t("statusPanel.routingModelBased")}
            </div>
          </div>

          {/* API keys card */}
          <div className="status-card" style={{ flex: 1.5 }}>
            <div className="status-card-label">{t("statusPanel.apiKey")}</div>
            {allKeyStatus && config ? (
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 11 }}>
                {Object.entries(allKeyStatus).map(([id, status]) => {
                  const name = config.providers[id]?.display_name ?? id;
                  return (
                    <span key={id} style={{ color: status.set ? "#107c10" : "var(--error)", fontWeight: 600, whiteSpace: "nowrap" }}>
                      {name}: {status.set ? "✓" : "✗"}
                    </span>
                  );
                })}
              </div>
            ) : (
              <div className="loading" />
            )}
          </div>
        </div>

        {/* Routing table: active provider's shell → upstream mapping */}
        {routedModels.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 6 }}>
              {t("statusPanel.availableModels")}
              {" — "}
              {t("statusPanel.activeProvider")}{" "}
              {activeProvider?.display_name ?? activeProviderId}
            </div>
            <div style={{ overflowX: "auto" }}>
              <table className="model-routing-table">
                <thead>
                  <tr>
                    <th>{t("statusPanel.colGateway")}</th>
                    <th>{t("statusPanel.colUpstream")}</th>
                    <th>{t("statusPanel.colRole")}</th>
                    <th>{t("statusPanel.colThinking")}</th>
                    <th>{t("statusPanel.colVision")}</th>
                  </tr>
                </thead>
                <tbody>
                  {routedModels.map(({ gateway, upstream, role, thinking, visionVideo }) => (
                    <tr key={gateway}>
                      <td className="mono">{gateway}</td>
                      <td className="mono" style={{ color: "var(--text-muted)" }}>{upstream}</td>
                      <td style={{ fontWeight: 600 }}>{role}</td>
                      <td>
                        <span className={`badge ${thinking === "disabled" ? "badge-blue" : "badge-gray"}`}>
                          {thinking === "disabled" ? t("statusPanel.thinkingDisabled") : t("statusPanel.thinkingDefault")}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${visionVideo ? "badge-green" : "badge-gray"}`}>
                          {visionVideo ? t("statusPanel.yes") : t("statusPanel.no")}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
