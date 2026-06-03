import { useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "../i18n";
import type { ClaudeConfigCandidate } from "../types";

const CLAUDE_DESKTOP_MODELS = [
  { name: "claude-sonnet-4-6", labelOverride: "Gateway Pro" },
  { name: "claude-haiku-4-5",  labelOverride: "Gateway Flash" },
];

function buildClaudeConfig(): object {
  return {
    inferenceProvider: "gateway",
    inferenceGatewayBaseUrl: "http://127.0.0.1:4000",
    inferenceGatewayApiKey: "sk-local-gateway",
    inferenceGatewayAuthScheme: "bearer",
    inferenceModels: CLAUDE_DESKTOP_MODELS.map((m) => ({
      name: m.name,
      labelOverride: m.labelOverride,
    })),
  };
}

const CLAUDE_JSON = JSON.stringify(buildClaudeConfig(), null, 2);

export function ClaudeConfigPanelContent() {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const [foundConfigs, setFoundConfigs] = useState<ClaudeConfigCandidate[] | null>(null);
  const [searching, setSearching] = useState(true);
  const [showJson, setShowJson] = useState(false);

  useEffect(() => {
    invoke<ClaudeConfigCandidate[]>("find_claude_configs")
      .then((results) => { setFoundConfigs(results); setSearching(false); })
      .catch((e) => { console.error(e); setSearching(false); });
  }, []);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(CLAUDE_JSON).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, []);

  const hasConfigs = foundConfigs && foundConfigs.filter((f) => f.likely_config).length > 0;
  const likelyConfig = hasConfigs ? foundConfigs!.filter((f) => f.likely_config)[0] : null;

  return (
    <div className="settings-tile">
      <h3>{t("claudeConfig.header")}</h3>
      <p className="tile-desc">{t("claudeConfig.dashboardNote")}</p>

      {/* Detected config file */}
      {searching ? (
        <div className="loading" />
      ) : likelyConfig ? (
        <div className="tile-path">{likelyConfig.path}</div>
      ) : (
        <p className="empty-state" style={{ fontSize: 11 }}>{t("claudeConfig.noFilesFound")}</p>
      )}

      <div className="tile-actions">
        <button className="btn btn-success btn-small" onClick={handleCopy}>
          {copied ? t("claudeConfig.copied") : t("claudeConfig.copy")}
        </button>
        {likelyConfig && (
          <>
            <button className="btn btn-small" onClick={() => invoke("open_path", { path: likelyConfig.path }).catch(console.error)}>
              {t("claudeConfig.openFile")}
            </button>
            <button className="btn btn-small" onClick={() => {
              const lastSep = Math.max(likelyConfig.path.lastIndexOf("\\"), likelyConfig.path.lastIndexOf("/"));
              const dir = lastSep >= 0 ? likelyConfig.path.substring(0, lastSep) : likelyConfig.path;
              invoke("open_path", { path: dir }).catch(console.error);
            }}>
              {t("claudeConfig.openFolder")}
            </button>
          </>
        )}
        <button
          className="btn btn-small"
          onClick={() => setShowJson(!showJson)}
        >
          {showJson ? t("apiKeyPanel.collapse") : "Show JSON"}
        </button>
      </div>

      {showJson && (
        <pre className="json-block" style={{ marginTop: 10, maxHeight: 200 }}>
          {CLAUDE_JSON}
        </pre>
      )}
    </div>
  );
}

export default function ClaudeConfigPanel() {
  return <ClaudeConfigPanelContent />;
}
