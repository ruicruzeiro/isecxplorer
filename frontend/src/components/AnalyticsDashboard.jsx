import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.heat";

const ISEC_CENTER = [40.19255, -8.41115];

const BADGE_LABELS = {
  speedrunner: "⚡ ISEC Speedrunner",
  explorer: "🧭 Explorador",
  quiz_master: "🧠 Mestre do Quiz",
  snail: "🐌 Lesma",
  rookie: "🎒 Caloiro",
  unranked: "—",
};

function formatTime(seconds) {
  if (!seconds && seconds !== 0) return "—";

  const min = Math.floor(seconds / 60);
  const sec = seconds % 60;

  return `${min}m ${String(sec).padStart(2, "0")}s`;
}

function formatAccuracy(correct, total) {
  if (!total) return "—";

  return `${Math.round((correct / total) * 100)}%`;
}

export default function AnalyticsDashboard() {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const heatLayerRef = useRef(null);
  const hotspotLayerRef = useRef(null);
  const routeLayerRef = useRef(null);

  const [activeLayer, setActiveLayer] = useState("heatmap");

  const [gridM, setGridM] = useState(5);
  const [heatLimit, setHeatLimit] = useState(1000);

  const [epsM, setEpsM] = useState(8);
  const [minPoints, setMinPoints] = useState(5);

  const [nClusters, setNClusters] = useState(4);

  const [heatmapData, setHeatmapData] = useState(null);
  const [hotspotsData, setHotspotsData] = useState(null);
  const [segmentsData, setSegmentsData] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [clusterResult, setClusterResult] = useState(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const heatmapPoints = heatmapData?.points ?? [];
  const hotspots = hotspotsData?.clusters ?? [];

  const summary = useMemo(() => {
    const sessions = leaderboard.length;

    if (!sessions) {
      return {
        sessions: 0,
        avgScore: 0,
        avgDuration: 0,
        avgDistance: 0,
      };
    }

    const totalScore = leaderboard.reduce((sum, e) => sum + Number(e.score || 0), 0);
    const totalDuration = leaderboard.reduce((sum, e) => sum + Number(e.duration_s || 0), 0);
    const totalDistance = leaderboard.reduce((sum, e) => sum + Number(e.distance_m || 0), 0);

    return {
      sessions,
      avgScore: Math.round(totalScore / sessions),
      avgDuration: Math.round(totalDuration / sessions),
      avgDistance: Math.round(totalDistance / sessions),
    };
  }, [leaderboard]);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: ISEC_CENTER,
      zoom: 17,
      zoomSnap: 0.25,
      zoomDelta: 0.5,
      zoomControl: true,
      scrollWheelZoom: "center",
      wheelPxPerZoomLevel: 90,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 21,
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);

    mapRef.current = map;
    const container = map.getContainer();
    const preventPageZoom = (event) => {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
      }
    };
    container.addEventListener("wheel", preventPageZoom, { passive: false });

    return () => {
      container.removeEventListener("wheel", preventPageZoom);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  function zoomMap(delta) {
    const map = mapRef.current;
    if (!map) return;

    map.setZoom(map.getZoom() + delta);
  }

  function resetMapView() {
    const map = mapRef.current;
    if (!map) return;

    map.setView(ISEC_CENTER, 17.5);
  }

  async function loadHeatmap() {
    const response = await fetch(
      `/api/v1/analytics/heatmap?grid_m=${gridM}&limit=${heatLimit}`,
    );

    if (!response.ok) {
      throw new Error("Erro ao carregar heatmap.");
    }

    const data = await response.json();
    setHeatmapData(data);
    return data;
  }

  async function loadHotspots() {
    const response = await fetch(
      `/api/v1/analytics/hotspots?eps_m=${epsM}&min_points=${minPoints}`,
    );

    if (!response.ok) {
      throw new Error("Erro ao carregar hotspots.");
    }

    const data = await response.json();
    setHotspotsData(data);
    return data;
  }

  async function loadSegments() {
    const response = await fetch("/api/v1/analytics/route-segments?limit=3000");

    if (!response.ok) {
      throw new Error("Erro ao carregar segmentos de rota.");
    }

    const data = await response.json();
    setSegmentsData(data);
    return data;
  }

  async function loadLeaderboard() {
    const response = await fetch("/api/v1/leaderboard");

    if (!response.ok) {
      throw new Error("Erro ao carregar leaderboard.");
    }

    const data = await response.json();
    setLeaderboard(data.entries ?? []);
    return data;
  }

  async function loadAll() {
    try {
      setLoading(true);
      setError("");

      await Promise.all([
        loadHeatmap(),
        loadHotspots(),
        loadSegments(),
        loadLeaderboard(),
      ]);
    } catch (err) {
      console.error(err);
      setError(err.message || "Erro ao carregar dados analíticos.");
    } finally {
      setLoading(false);
    }
  }

  async function recomputeClusters() {
    try {
      setLoading(true);
      setError("");

      const response = await fetch(
        `/api/v1/ml/recompute-clusters?n_clusters=${nClusters}`,
        {
          method: "POST",
        },
      );

      if (!response.ok) {
        throw new Error("Erro ao recalcular K-Means.");
      }

      const data = await response.json();
      setClusterResult(data);

      await loadLeaderboard();
    } catch (err) {
      console.error(err);
      setError(err.message || "Erro ao recalcular clusters.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadAll();
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (heatLayerRef.current) {
      map.removeLayer(heatLayerRef.current);
      heatLayerRef.current = null;
    }

    if (hotspotLayerRef.current) {
      map.removeLayer(hotspotLayerRef.current);
      hotspotLayerRef.current = null;
    }

    if (routeLayerRef.current) {
      map.removeLayer(routeLayerRef.current);
      routeLayerRef.current = null;
    }

    if (activeLayer === "heatmap" && heatmapPoints.length > 0) {
      const maxWeight = Math.max(
        ...heatmapPoints.map((p) => Number(p.weight || 1)),
        1,
      );
      const heatPoints = heatmapPoints.map((p) => [
        Number(p.lat),
        Number(p.lon),
        Math.sqrt(Number(p.weight || 1) / maxWeight),
      ]);

      heatLayerRef.current = L.heatLayer(heatPoints, {
        radius: 13,
        blur: 10,
        maxZoom: 19,
        minOpacity: 0.28,
        gradient: {
          0.15: "#2563eb",
          0.35: "#22c55e",
          0.55: "#facc15",
          0.78: "#f97316",
          1.0: "#ef4444",
        },
      }).addTo(map);

      const bounds = L.latLngBounds(heatPoints.map((p) => [p[0], p[1]]));
      map.fitBounds(bounds, { padding: [14, 14], maxZoom: 18.25 });
    }

    if (activeLayer === "hotspots" && hotspots.length > 0) {
      const group = L.layerGroup();

      hotspots.forEach((cluster) => {
        const pointsCount = Number(cluster.points_count || 0);
        const radius = Math.min(36, 8 + pointsCount / 2);

        L.circleMarker([Number(cluster.lat), Number(cluster.lon)], {
          radius,
          weight: 2,
          opacity: 0.9,
          fillOpacity: 0.35,
        })
          .bindPopup(
            `<strong>Cluster ${cluster.cluster_id}</strong><br/>` +
              `${pointsCount} pontos GPS`,
          )
          .addTo(group);
      });

      hotspotLayerRef.current = group.addTo(map);

      const bounds = L.latLngBounds(
        hotspots.map((c) => [Number(c.lat), Number(c.lon)]),
      );

      map.fitBounds(bounds, { padding: [30, 30] });
    }

    if (activeLayer === "routes" && segmentsData?.features?.length > 0) {
      routeLayerRef.current = L.geoJSON(segmentsData, {
        style: {
          weight: 3,
          opacity: 0.35,
        },
      }).addTo(map);

      map.fitBounds(routeLayerRef.current.getBounds(), {
        padding: [30, 30],
        maxZoom: 17,
      });
    }
  }, [activeLayer, heatmapData, hotspotsData, segmentsData]);

  return (
    <main className="l-page">
      <header className="analytics-header">
        <div>
          <p className="eyebrow">ISECxplorer Analytics</p>
          <h1>Dashboard de trajetos, hotspots e clusters</h1>
          <p>
            Visualização dos dados recolhidos durante os percursos: heatmap,
            hotspots DBSCAN, rotas e perfis de desempenho.
          </p>
        </div>

        <div className="analytics-header-actions">
          <a href="/" className="secondary-button">
            Voltar ao jogo
          </a>

          <button onClick={loadAll} disabled={loading} className="primary-button">
            {loading ? "A carregar..." : "Atualizar dados"}
          </button>
        </div>
      </header>

      {error && <div className="analytics-error">{error}</div>}

      <section className="analytics-kpis">
        <article className="analytics-card">
          <span>Sessões</span>
          <strong>{summary.sessions}</strong>
        </article>

        <article className="analytics-card">
          <span>Pontuação média</span>
          <strong>{summary.avgScore}</strong>
        </article>

        <article className="analytics-card">
          <span>Tempo médio</span>
          <strong>{formatTime(summary.avgDuration)}</strong>
        </article>

        <article className="analytics-card">
          <span>Distância média</span>
          <strong>{Math.round(summary.avgDistance)} m</strong>
        </article>
      </section>

      <section className="analytics-layout">
        <aside className="analytics-panel">
          <h2>Camadas do mapa</h2>

          <div className="layer-buttons">
            <button
              className={activeLayer === "heatmap" ? "active" : ""}
              onClick={() => setActiveLayer("heatmap")}
            >
              Heatmap
            </button>

            <button
              className={activeLayer === "hotspots" ? "active" : ""}
              onClick={() => setActiveLayer("hotspots")}
            >
              Hotspots
            </button>

            <button
              className={activeLayer === "routes" ? "active" : ""}
              onClick={() => setActiveLayer("routes")}
            >
              Rotas
            </button>
          </div>

          <div className="control-group">
            <h3>Heatmap</h3>

            <label>
              Grelha, em metros
              <input
                type="number"
                min="1"
                max="50"
                value={gridM}
                onChange={(e) => setGridM(Number(e.target.value))}
              />
            </label>

            <label>
              Limite de pontos
              <input
                type="number"
                min="50"
                max="10000"
                value={heatLimit}
                onChange={(e) => setHeatLimit(Number(e.target.value))}
              />
            </label>

            <button
              onClick={async () => {
                await loadHeatmap();
                setActiveLayer("heatmap");
              }}
            >
              Recarregar heatmap
            </button>

            <small>{heatmapData?.total ?? 0} células agregadas</small>
          </div>

          <div className="control-group">
            <h3>DBSCAN</h3>

            <label>
              eps, em metros
              <input
                type="number"
                min="1"
                max="50"
                value={epsM}
                onChange={(e) => setEpsM(Number(e.target.value))}
              />
            </label>

            <label>
              min_points
              <input
                type="number"
                min="2"
                max="50"
                value={minPoints}
                onChange={(e) => setMinPoints(Number(e.target.value))}
              />
            </label>

            <button
              onClick={async () => {
                await loadHotspots();
                setActiveLayer("hotspots");
              }}
            >
              Recarregar hotspots
            </button>

            <small>{hotspotsData?.total ?? 0} clusters espaciais</small>
          </div>

          <div className="control-group">
            <h3>K-Means</h3>

            <label>
              Número de clusters
              <input
                type="number"
                min="2"
                max="8"
                value={nClusters}
                onChange={(e) => setNClusters(Number(e.target.value))}
              />
            </label>

            <button onClick={recomputeClusters}>
              Recalcular clusters de performance
            </button>

            {clusterResult && (
              <pre className="cluster-result">
                {JSON.stringify(clusterResult, null, 2)}
              </pre>
            )}
          </div>
        </aside>

        <section className="analytics-map-section">
          <div ref={mapContainerRef} className="analytics-map" />

          <div className="analytics-map-tools" aria-label="Controlos do mapa">
            <button type="button" onClick={() => zoomMap(0.5)} title="Ampliar mapa">
              +
            </button>
            <button type="button" onClick={() => zoomMap(-0.5)} title="Desampliar mapa">
              -
            </button>
            <button type="button" onClick={resetMapView} title="Centrar no ISEC">
              ⌖
            </button>
          </div>

          <div className="map-legend">
            {activeLayer === "heatmap" && (
              <span>Heatmap: concentração normalizada de pontos GPS.</span>
            )}

            {activeLayer === "hotspots" && (
              <span>Hotspots: clusters espaciais calculados por DBSCAN.</span>
            )}

            {activeLayer === "routes" && (
              <span>Rotas: segmentos entre pontos GPS consecutivos.</span>
            )}
          </div>
        </section>
      </section>

      <section className="analytics-table-section">
        <div className="section-title-row">
          <div>
            <h2>Leaderboard e perfis de performance</h2>
            <p>
              Mostra pontuação, tempo, respostas, distância, badge e cluster
              atribuído.
            </p>
          </div>
        </div>

        <div className="analytics-table-wrapper">
          <table className="analytics-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Jogador</th>
                <th>Pontos</th>
                <th>Tempo</th>
                <th>Quiz</th>
                <th>Distância</th>
                <th>Badge</th>
                <th>Cluster</th>
              </tr>
            </thead>

            <tbody>
              {leaderboard.length === 0 && (
                <tr>
                  <td colSpan="8" className="empty-row">
                    Ainda não existem sessões registadas.
                  </td>
                </tr>
              )}

              {leaderboard.map((entry, index) => (
                <tr key={`${entry.player_alias}-${entry.played_at ?? index}`}>
                  <td>{index + 1}</td>
                  <td>{entry.player_alias}</td>
                  <td>{entry.score}</td>
                  <td>{formatTime(Number(entry.duration_s || 0))}</td>
                  <td>
                    {entry.quiz_correct ?? 0}/{entry.quiz_total ?? 0}{" "}
                    <span className="muted">
                      ({formatAccuracy(entry.quiz_correct, entry.quiz_total)})
                    </span>
                  </td>
                  <td>{Math.round(Number(entry.distance_m || 0))} m</td>
                  <td>{BADGE_LABELS[entry.badge] ?? entry.badge ?? "—"}</td>
                  <td>
                    {entry.cluster_label ? (
                      <span className="cluster-pill">
                        {entry.cluster_label} #{entry.cluster_id}
                      </span>
                    ) : (
                      <span className="muted">Ainda não calculado</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
