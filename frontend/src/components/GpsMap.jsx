import React, { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Polyline, CircleMarker, Tooltip } from "react-leaflet";
import L from "leaflet";

// fix default leaflet icon paths
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

/** Dark HUD-style 3D-feeling GPS map (leaflet w/ Carto Dark Matter). */
export default function GpsMap({ load, stations = [], height = "100%", tilt3d = false, animateDriver = true }) {
  const [progress, setProgress] = useState(0.35);
  useEffect(() => {
    if (!animateDriver) return;
    const id = setInterval(() => {
      setProgress((p) => (p + 0.0025) % 1);
    }, 800);
    return () => clearInterval(id);
  }, [animateDriver]);

  if (!load) return null;
  const route = [
    [load.origin.lat, load.origin.lng],
    ...load.stops.map((s) => [s.lat, s.lng]),
    [load.destination.lat, load.destination.lng],
  ];
  const center = [
    (load.origin.lat + load.destination.lat) / 2,
    (load.origin.lng + load.destination.lng) / 2,
  ];
  // Interpolate driver position along straight-line segments
  const driverLat = load.origin.lat + (load.destination.lat - load.origin.lat) * progress;
  const driverLng = load.origin.lng + (load.destination.lng - load.origin.lng) * progress;

  return (
    <div className={`relative w-full ${tilt3d ? "map-3d-tilt" : ""}`} style={{ height }} data-testid="gps-map">
      <div className={`${tilt3d ? "map-3d-inner" : ""} w-full h-full`}>
        <MapContainer
          center={center}
          zoom={5}
          style={{ width: "100%", height: "100%", borderRadius: "var(--radius)" }}
          zoomControl
          attributionControl
        >
          <TileLayer
            attribution='&copy; OpenStreetMap, &copy; CartoDB'
            url="https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png"
          />
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png"
          />

          {/* Glow underlay */}
          <Polyline positions={route} pathOptions={{ color: "rgba(0,250,154,0.25)", weight: 12 }} />
          <Polyline positions={route} pathOptions={{ color: "rgba(0,250,154,0.55)", weight: 6 }} />
          <Polyline positions={route} pathOptions={{ color: "#00FA9A", weight: 2.5 }} />

          <Marker position={[load.origin.lat, load.origin.lng]}>
            <Tooltip permanent direction="top" offset={[0, -10]}>{load.origin.name}</Tooltip>
          </Marker>
          <Marker position={[load.destination.lat, load.destination.lng]}>
            <Tooltip permanent direction="top" offset={[0, -10]}>{load.destination.name}</Tooltip>
          </Marker>
          {load.stops.map((s, i) => (
            <CircleMarker
              key={i}
              center={[s.lat, s.lng]}
              radius={6}
              pathOptions={{ color: "#00FA9A", fillColor: "#00FA9A", fillOpacity: 0.5 }}
            >
              <Tooltip>{s.name}</Tooltip>
            </CircleMarker>
          ))}
          {stations.map((st, i) => {
            const lat = load.origin.lat + (load.destination.lat - load.origin.lat) * (st.miles_ahead / load.miles_total);
            const lng = load.origin.lng + (load.destination.lng - load.origin.lng) * (st.miles_ahead / load.miles_total);
            const bypass = st.status === "BYPASS";
            return (
              <CircleMarker key={`s${i}`} center={[lat, lng]} radius={9}
                pathOptions={{ color: bypass ? "#00FA9A" : "#FF5252", fillOpacity: 0.8, weight: 2 }}>
                <Tooltip>{st.name} · {st.status}</Tooltip>
              </CircleMarker>
            );
          })}
          {/* Animated driver position */}
          <CircleMarker
            center={[driverLat, driverLng]}
            radius={11}
            pathOptions={{ color: "#fff", fillColor: "#00FA9A", fillOpacity: 1, weight: 3 }}
          >
            <Tooltip permanent direction="top" offset={[0, -12]}>RIG-77 · {Math.round(progress * 100)}%</Tooltip>
          </CircleMarker>
          <CircleMarker
            center={[driverLat, driverLng]}
            radius={22}
            pathOptions={{ color: "#00FA9A", fillOpacity: 0.08, weight: 1 }}
          />
        </MapContainer>
      </div>

      {/* HUD overlay corners */}
      {["top-left", "top-right", "bottom-left", "bottom-right"].map((pos) => (
        <div key={pos} className={`absolute w-6 h-6 border-primary pointer-events-none z-[5] ${
          pos === "top-left" ? "top-2 left-2 border-t-2 border-l-2" :
          pos === "top-right" ? "top-2 right-2 border-t-2 border-r-2" :
          pos === "bottom-left" ? "bottom-2 left-2 border-b-2 border-l-2" :
          "bottom-2 right-2 border-b-2 border-r-2"
        }`} />
      ))}
      {tilt3d && (
        <div className="absolute top-2 left-2 z-[6] mono text-[10px] tracking-widest text-primary bg-background/70 px-2 py-1 rounded border border-primary/40">
          3D · HUD MODE
        </div>
      )}
    </div>
  );
}
