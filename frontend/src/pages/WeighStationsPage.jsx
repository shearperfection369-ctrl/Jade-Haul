import React, { useEffect, useState } from "react";
import useSWR from "swr";
import { api } from "@/lib/api";
import PageHeader from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapContainer, TileLayer, CircleMarker, Tooltip, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { CheckCircle, XCircle, Gauge } from "lucide-react";

const fetcher = (url) => api.get(url).then((r) => r.data);

export default function WeighStationsPage() {
  const { data } = useSWR("/weigh-stations/us", fetcher);
  const stations = data || [];
  const [selected, setSelected] = useState(null);

  return (
    <div className="space-y-3 h-full flex flex-col">
      <PageHeader
        title="Weigh Stations · Interactive US Map"
        subtitle="Drivewyze-style bypass network"
        right={
          <div className="flex items-center gap-2">
            <Badge className="bg-primary text-primary-foreground"><CheckCircle className="w-3 h-3 mr-1" /> {stations.filter(s => s.status === "BYPASS").length} Bypass</Badge>
            <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" /> {stations.filter(s => s.status === "PULL_IN").length} Pull-in</Badge>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-3 flex-1 min-h-0">
        {/* Map */}
        <Card className="jade-panel p-0 overflow-hidden relative jade-tracing-border min-h-[420px]">
          {["top-left", "top-right", "bottom-left", "bottom-right"].map((p) => (
            <div key={p} className={`absolute w-6 h-6 border-primary pointer-events-none z-[10] ${
              p === "top-left" ? "top-2 left-2 border-t-2 border-l-2" :
              p === "top-right" ? "top-2 right-2 border-t-2 border-r-2" :
              p === "bottom-left" ? "bottom-2 left-2 border-b-2 border-l-2" :
              "bottom-2 right-2 border-b-2 border-r-2"
            }`} />
          ))}
          <MapContainer center={[39, -98]} zoom={4} style={{ height: "100%", width: "100%" }} data-testid="us-weigh-map">
            <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png"
              attribution='&copy; OpenStreetMap, &copy; CartoDB' />
            <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png" />
            {stations.map((s) => {
              const bypass = s.status === "BYPASS";
              return (
                <CircleMarker
                  key={s.id}
                  center={[s.lat, s.lng]}
                  radius={9}
                  pathOptions={{
                    color: bypass ? "#00FA9A" : "#FF5252",
                    fillColor: bypass ? "#00FA9A" : "#FF5252",
                    fillOpacity: 0.6,
                    weight: 2,
                  }}
                  eventHandlers={{ click: () => setSelected(s) }}
                >
                  <Tooltip>{s.name} · {s.state} · {s.status}</Tooltip>
                </CircleMarker>
              );
            })}
          </MapContainer>
        </Card>

        {/* List */}
        <Card className="jade-panel p-4 overflow-y-auto">
          <div className="font-[Unbounded] text-base mb-3">Stations · {stations.length}</div>
          <div className="space-y-2">
            {stations.map((s) => {
              const bypass = s.status === "BYPASS";
              return (
                <button
                  key={s.id}
                  onClick={() => setSelected(s)}
                  className={`w-full text-left p-3 rounded-lg bg-secondary/60 hover:bg-secondary border ${selected?.id === s.id ? "border-primary" : "border-border/70"} transition`}
                  data-testid={`ws-${s.id}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium truncate">{s.name}</div>
                    <Badge variant={bypass ? "default" : "destructive"} className={bypass ? "bg-primary text-primary-foreground" : ""}>
                      {bypass ? "BYPASS" : "PULL-IN"}
                    </Badge>
                  </div>
                  <div className="mono text-[10px] text-muted-foreground mt-1">
                    {s.state} · score {s.score} {s.reason ? `· ${s.reason}` : ""}
                  </div>
                </button>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}
