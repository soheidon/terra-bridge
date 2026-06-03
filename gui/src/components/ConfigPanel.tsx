import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useRawConfig } from "../hooks/useRawConfig";
import { useTranslation } from "../i18n";
import type { WriteConfigResponse } from "../types";

type Encoding = "UTF-8" | "Shift-JIS";

// Module-level: survives component remounts
let lastSavedEncoding: Encoding | null = null;

export function ConfigPanelContent() {
  const { t } = useTranslation();
  const { data, error, loading, refresh } = useRawConfig();

  const [text, setText] = useState("");
  const [selectedEncoding, setSelectedEncoding] = useState<Encoding>(lastSavedEncoding ?? "UTF-8");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const currentEncoding: Encoding = lastSavedEncoding ?? (data?.encoding_used as Encoding) ?? "UTF-8";

  useEffect(() => {
    if (data) {
      setText(data.content);
      if (!lastSavedEncoding) {
        setSelectedEncoding(data.encoding_used as Encoding);
      }
    }
  }, [data]);

  const encodingWillChange = selectedEncoding !== currentEncoding;

  const handleSave = useCallback(() => {
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    invoke<WriteConfigResponse>("write_config", { content: text, encoding: selectedEncoding })
      .then((resp) => {
        setSaving(false);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
        lastSavedEncoding = resp.saved_encoding as Encoding;
        setSelectedEncoding(resp.saved_encoding as Encoding);
      })
      .catch((e: unknown) => {
        setSaving(false);
        setSaveError(String(e));
      });
  }, [text, selectedEncoding]);

  const handleReload = useCallback(() => {
    setSaveError(null);
    setSaved(false);
    lastSavedEncoding = null;
    refresh();
  }, [refresh]);

  const openConfigFolder = () => {
    if (data?.config_path) {
      const dir = data.config_path.replace(/[/\\][^/\\]*$/, "");
      invoke("open_path", { path: dir }).catch(console.error);
    }
  };

  const openConfigFile = () => {
    if (data?.config_path) {
      invoke("open_path", { path: data.config_path }).catch(console.error);
    }
  };

  return (
    <div className="settings-tile">
      <h3>{t("configPanel.header")}</h3>
      <p className="tile-desc">{t("configPanel.advancedWarning")}</p>
      {data?.config_path && (
        <div className="tile-path">
          {t("configPanel.configPath")}{" "}
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>{data.config_path}</span>
        </div>
      )}
      <div className="tile-actions">
        <button className="btn btn-small" onClick={openConfigFile}>
          {t("claudeConfig.openFile")}
        </button>
        <button className="btn btn-small" onClick={openConfigFolder}>
          {t("claudeConfig.openFolder")}
        </button>
        <button
          className="btn btn-small"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? t("apiKeyPanel.collapse") : t("configPanel.viewConfig")}
        </button>
      </div>

      {expanded && (
        <div style={{ marginTop: 10 }}>
          {loading ? (
            <div className="loading" />
          ) : error ? (
            <div className="error-text">{error}</div>
          ) : (
            <>
              <div className="config-toolbar">
                <div className="config-encoding-section">
                  <div className="encoding-toggle">
                    <button
                      className={`encoding-option ${selectedEncoding === "UTF-8" ? "encoding-active" : ""}`}
                      onClick={() => setSelectedEncoding("UTF-8")}
                    >
                      UTF-8
                    </button>
                    <button
                      className={`encoding-option ${selectedEncoding === "Shift-JIS" ? "encoding-active" : ""}`}
                      onClick={() => setSelectedEncoding("Shift-JIS")}
                    >
                      Shift-JIS
                    </button>
                  </div>
                  <span className="encoding-label">
                    {t("configPanel.currentEncoding", { enc: currentEncoding })}
                  </span>
                  {encodingWillChange && (
                    <span className="encoding-warning">
                      {t("configPanel.willChangeEncoding", { enc: selectedEncoding })}
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  {saved && <span className="saved-toast">{t("configPanel.saved")}</span>}
                  {saveError && <span className="error-text">{saveError}</span>}
                  <button className="btn btn-small" onClick={handleReload}>
                    {t("configPanel.reload")}
                  </button>
                  <button className="btn btn-primary btn-small" onClick={handleSave} disabled={saving}>
                    {saving ? "..." : t("configPanel.save")}
                  </button>
                </div>
              </div>
              <textarea
                className="config-textarea"
                value={text}
                onChange={(e) => setText(e.target.value)}
                spellCheck={false}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function ConfigPanel() {
  return <ConfigPanelContent />;
}
