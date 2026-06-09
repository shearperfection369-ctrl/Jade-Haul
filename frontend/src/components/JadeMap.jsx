import React from "react";
import { MapContainer, TileLayer, Marker, Polyline, CircleMarker, Tooltip } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Phone, Clock, MapPin, Star, ExternalLink } from "lucide-react";

L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

/**
 * Compact map panel that Jade uses to visually back up her recommendations.
 * Props.visual = { origin:{lat,lng,name}, primary:{...POI}, others:[...], categories[] }
 */
export default function JadeMap({ visual }) {
  if (!visual || !visual.primary) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground text-sm p-6 text-center">
        Ask Jade about a mechanic, truck stop, parking, or your delivery — she&apos;ll pin it here.
      </div>
    );
  }

  const { origin, primary, others = [], categories = [] } = visual;
  const center = [(origin.lat + primary.lat) / 2, (origin.lng + primary.lng) / 2];

  return (
    <div className="h-full flex flex-col" data-testid="jade-visual-map">
      <div className="relative flex-1 min-h-[240px]">
        <MapContainer center={center} zoom={9} style={{ height: "100%", width: "100%" }}>
          <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png"
            attribution='&copy; OSM, &copy; Carto' />
          <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png" />

          {/* Glow line from driver to recommended POI */}
          <Polyline positions={[[origin.lat, origin.lng], [primary.lat, primary.lng]]}
            pathOptions={{ color: "rgba(0,250,154,0.25)", weight: 10 }} />
          <Polyline positions={[[origin.lat, origin.lng], [primary.lat, primary.lng]]}
            pathOptions={{ color: "#00FA9A", weight: 2.5, dashArray: "6 6" }} />

          {/* Driver */}
          <CircleMarker center={[origin.lat, origin.lng]} radius={9}
            pathOptions={{ color: "#fff", fillColor: "#00FA9A", fillOpacity: 1, weight: 3 }}>
            <Tooltip permanent direction="top" offset={[0, -10]}>You · RIG-77</Tooltip>
          </CircleMarker>

          {/* Recommended POI */}
          <Marker position={[primary.lat, primary.lng]}>
            <Tooltip permanent direction="top" offset={[0, -12]}>{primary.name}</Tooltip>
          </Marker>

          {/* Other nearby POIs */}
          {others.map((p) => (
            <CircleMarker key={p.id} center={[p.lat, p.lng]} radius={5}
              pathOptions={{ color: "#00FA9A", fillOpacity: 0.4, weight: 1 }}>
              <Tooltip>{p.name} · {p.distance_mi} mi</Tooltip>
            </CircleMarker>
          ))}
        </MapContainer>

        {/* HUD corners */}
        {["tl", "tr", "bl", "br"].map((p) => (
          <div key={p} className={`absolute w-5 h-5 border-primary z-[10] pointer-events-none ${
            p === "tl" ? "top-2 left-2 border-t-2 border-l-2" :
            p === "tr" ? "top-2 right-2 border-t-2 border-r-2" :
            p === "bl" ? "bottom-2 left-2 border-b-2 border-l-2" :
            "bottom-2 right-2 border-b-2 border-r-2"
          }`} />
        ))}

        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-[10]">
          <Badge variant="outline" className="border-primary/40 text-primary mono text-[10px]">
            JADE VISUAL · {categories.join(" · ").toUpperCase()}
          </Badge>
        </div>
      </div>

      {/* Detail card */}
      <div className="border-t border-border/70 p-3 bg-card/60">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="font-[Unbounded] text-sm truncate">{primary.name}</div>
            <div className="mono text-[10px] text-muted-foreground uppercase">
              {primary.category} · {primary.city}, {primary.state} · {primary.distance_mi} mi
            </div>
          </div>
          {primary.rating ? (
            <Badge variant="outline" className="border-primary/40 text-primary mono text-[10px]">
              <Star className="w-3 h-3 mr-1" /> {primary.rating}
            </Badge>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-2 mt-2 text-xs">
          <div className="flex items-start gap-1.5">
            <Clock className="w-3 h-3 text-primary mt-0.5 shrink-0" />
            <span className="text-muted-foreground leading-snug">{primary.hours}</span>
          </div>
          {primary.phone ? (
            <div className="flex items-start gap-1.5">
              <Phone className="w-3 h-3 text-primary mt-0.5 shrink-0" />
              <a href={`tel:${primary.phone}`} className="text-foreground/80 hover:text-primary">
                {primary.phone}
              </a>
            </div>
          ) : null}
          <div className="col-span-2 flex items-start gap-1.5">
            <MapPin className="w-3 h-3 text-primary mt-0.5 shrink-0" />
            <span className="text-muted-foreground leading-snug">{primary.address}</span>
          </div>
        </div>

        {primary.services?.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {primary.services.slice(0, 5).map((s) => (
              <span key={s} className="mono text-[9px] uppercase tracking-widest px-1.5 py-0.5 rounded border border-border text-muted-foreground">{s}</span>
            ))}
          </div>
        )}

        <Button size="sm" variant="outline" className="w-full mt-2"
          onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${primary.lat},${primary.lng}`, "_blank")}
          data-testid="jade-visual-open-maps">
          <ExternalLink className="w-3.5 h-3.5 mr-2" /> Open in maps
        </Button>
      </div>
    </div>
  );
}
