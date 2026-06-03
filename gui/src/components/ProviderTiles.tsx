import { useEffect, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "../i18n";
import type { TranslationKey } from "../i18n/translations";
import type { GatewayStatus, GatewayConfig } from "../types";

interface ProviderTilesProps {
  health: GatewayStatus | null;
  onConfigChanged?: () => void;
}

const TILE_META: Record<string, { descKey: TranslationKey }> = {
  deepseek: { descKey: "statusPanel.tileDeepseekDesc" },
  minimax:  { descKey: "statusPanel.tileMinimaxDesc" },
  kimi:     { descKey: "statusPanel.tileKimiDesc" },
};

interface TileData {
  providerId: string;
  displayName: string;
  descKey: TranslationKey;
  proUpstream: string;
  flashUpstream: string;
  proVision: boolean;
  proVideo: boolean;
  isActive: boolean;
}

function buildTiles(config: GatewayConfig | null): TileData[] {
  if (!config) return [];
  const activeId = config.active_provider ?? "deepseek";
  return Object.entries(config.providers).map(([pid, p]) => {
    const pro = p.models?.["claude-sonnet-4-6"];
    const flash = p.models?.["claude-haiku-4-5"];
    return {
      providerId: pid,
      displayName: p.display_name,
      descKey: TILE_META[pid]?.descKey ?? "",
      proUpstream: pro?.upstream_model ?? "—",
      flashUpstream: flash?.upstream_model ?? "—",
      proVision: pro?.supports_vision ?? p.supports_vision,
      proVideo: pro?.supports_video ?? p.supports_video,
      isActive: pid === activeId,
    };
  });
}

export default function ProviderTiles({ health, onConfigChanged }: ProviderTilesProps) {
  const { t } = useTranslation();
  const [config, setConfig] = useState<GatewayConfig | null>(null);
  const [switching, setSwitching] = useState(false);
  const [switchMessage, setSwitchMessage] = useState<string | null>(null);

  const refresh = useCallback(() => {
    invoke<GatewayConfig>("read_config")
      .then(setConfig)
      .catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const tiles = buildTiles(config);
  const activeProviderId = config?.active_provider ?? "deepseek";
  const gatewayRunning = health?.port_listening ?? false;

  const handleTileClick = useCallback(async (providerId: string) => {
    if (switching) return;
    if (providerId === activeProviderId) return;
    setSwitching(true);
    setSwitchMessage(null);
    try {
      if (gatewayRunning) {
        setSwitchMessage(t("statusPanel.restarting"));
        await invoke("stop_proxy");
        await invoke("update_active_provider", { providerId });
        await invoke("start_proxy");
        setSwitchMessage(t("statusPanel.restarted"));
      } else {
        await invoke("update_active_provider", { providerId });
        setSwitchMessage(t("statusPanel.savedNextStart"));
      }
      refresh();
      onConfigChanged?.();
    } catch (e) {
      console.error(e);
      setSwitchMessage(String(e));
    } finally {
      setSwitching(false);
      setTimeout(() => setSwitchMessage(null), 5000);
    }
  }, [switching, activeProviderId, gatewayRunning, refresh, onConfigChanged, t]);

  const capLabel = (val: boolean) =>
    val ? t("statusPanel.tileCapYes") : t("statusPanel.tileCapNo");

  return (
    <div className="dashboard-section">
      <h3>{t("statusPanel.tileSelectProvider")}</h3>
      <p className="section-desc">{t("statusPanel.tileHint")}</p>

      <div className="provider-tile-grid">
        {tiles.map((tile) => (
          <div
            key={tile.providerId}
            className={`provider-tile${tile.isActive ? " selected" : ""}`}
            style={switching ? { opacity: 0.6, pointerEvents: "none" } : undefined}
            onClick={() => handleTileClick(tile.providerId)}
          >
              <div className="provider-tile-name">{tile.displayName}</div>
              <div className="provider-tile-desc">{t(tile.descKey)}</div>
              <div className="provider-tile-routes">
                <div>{t("statusPanel.tilePro")} <span className="up">{tile.proUpstream}</span></div>
                <div>{t("statusPanel.tileFlash")} <span className="up">{tile.flashUpstream}</span></div>
              </div>
              <div className="provider-tile-caps">
                <span className={`provider-tile-cap ${tile.proVision ? "cap-yes" : "cap-no"}`}>
                  {t("statusPanel.tileCapVision", { val: capLabel(tile.proVision) })}
                </span>
                <span className={`provider-tile-cap ${tile.proVideo ? "cap-yes" : "cap-no"}`}>
                  {t("statusPanel.tileCapVideo", { val: capLabel(tile.proVideo) })}
                </span>
              </div>
              <div className="provider-tile-badge">{t("statusPanel.tileActive")}</div>
            </div>
          ))}
        </div>

      <div className="provider-switch-msg">
        {switching && <div className="loading" />}
        {switchMessage && !switching && <span>{switchMessage}</span>}
      </div>
    </div>
  );
}
