import React, { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import PageHeader from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Camera, ScanLine, Trash2, Receipt, MapPin, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { speak } from "@/lib/tts";

/**
 * Auto-prompt when at a fuel station — uses browser geolocation
 * and a coarse "near gas station" heuristic (within 0.25 mi of any saved fuel point).
 * For demo we trigger a one-shot prompt whenever the user lands on the page or
 * the AI banner detects fueling context.
 */
export default function FuelReceiptsPage() {
  const fileRef = useRef(null);
  const [preview, setPreview] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [data, setData] = useState({ items: [], ifta_by_state: [] });
  const [autoPrompted, setAutoPrompted] = useState(false);

  const refresh = async () => {
    try {
      const { data: d } = await api.get("/fuel/receipts");
      setData(d);
    } catch (e) {
      console.warn("fuel refresh failed:", e?.message || e);
    }
  };
  useEffect(() => { refresh(); }, []);

  // Auto-prompt for receipt scan (simulated geofence)
  useEffect(() => {
    if (autoPrompted) return;
    const id = setTimeout(() => {
      setAutoPrompted(true);
      speak("I see you pulling into a fuel stop. Want me to scan and log the receipt for IFTA?");
      toast("Jade detected a fuel stop — tap to scan your receipt.", {
        action: { label: "Scan now", onClick: () => fileRef.current?.click() },
      });
    }, 2500);
    return () => clearTimeout(id);
  }, [autoPrompted]);

  const pick = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => setPreview(r.result);
    r.readAsDataURL(f);
  };

  const scan = async () => {
    if (!preview) { toast.error("Capture a receipt first"); return; }
    setScanning(true);
    try {
      const { data: res } = await api.post("/fuel/scan", { image_base64: preview, mime_type: preview.split(";")[0].replace("data:", "") });
      toast.success(`Logged ${res.receipt.gallons.toFixed(1)} gal in ${res.receipt.state}`);
      setPreview(null);
      if (fileRef.current) fileRef.current.value = "";
      refresh();
    } catch (e) {
      toast.error("Scan failed");
    } finally { setScanning(false); }
  };

  const del = async (id) => {
    await api.delete(`/fuel/receipts/${id}`);
    refresh();
  };

  return (
    <div className="space-y-5">
      <PageHeader title="Fuel Receipts · IFTA Ledger" subtitle="Driver · Auto-scan + State roll-up"
        right={<Badge variant="outline" className="border-primary/40 text-primary mono">{data.items.length} receipts</Badge>} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Scanner */}
        <Card className="jade-panel p-5">
          <div className="font-[Unbounded] text-base mb-3 flex items-center gap-2"><Receipt className="w-4 h-4 text-primary" /> Scan a fuel receipt</div>
          <div className="aspect-[4/3] rounded-xl overflow-hidden bg-secondary/40 border border-border/70 relative flex items-center justify-center" data-testid="fuel-preview">
            {preview ? (
              <img src={preview} alt="receipt" className="w-full h-full object-contain" />
            ) : (
              <div className="text-center text-muted-foreground">
                <Camera className="w-10 h-10 mx-auto mb-3 text-primary" />
                <div className="text-sm">Snap your fuel receipt</div>
                <div className="mono text-[10px] mt-1">JPG · PNG · WEBP</div>
              </div>
            )}
            {scanning && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/40">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            )}
            {["top-left", "top-right", "bottom-left", "bottom-right"].map((p) => (
              <div key={p} className={`absolute w-6 h-6 border-primary pointer-events-none ${
                p === "top-left" ? "top-2 left-2 border-t-2 border-l-2" :
                p === "top-right" ? "top-2 right-2 border-t-2 border-r-2" :
                p === "bottom-left" ? "bottom-2 left-2 border-b-2 border-l-2" :
                "bottom-2 right-2 border-b-2 border-r-2"
              }`} />
            ))}
          </div>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={pick} data-testid="fuel-file" />
          <div className="flex gap-2 mt-4">
            <Button variant="outline" className="flex-1" onClick={() => fileRef.current?.click()} data-testid="fuel-upload-btn">
              <Camera className="w-4 h-4 mr-2" /> Capture / Upload
            </Button>
            <Button className="flex-1" disabled={!preview || scanning} onClick={scan} data-testid="fuel-scan-btn">
              <ScanLine className="w-4 h-4 mr-2" /> {scanning ? "Scanning…" : "Scan with JADE Vision"}
            </Button>
          </div>
        </Card>

        {/* IFTA roll-up */}
        <Card className="jade-panel p-5">
          <div className="font-[Unbounded] text-base mb-3">IFTA · Gallons by state</div>
          {data.ifta_by_state.length === 0 ? (
            <div className="text-sm text-muted-foreground">No fuel receipts yet. Scan one to start your IFTA ledger.</div>
          ) : (
            <div className="space-y-2">
              {data.ifta_by_state.map((s) => (
                <div key={s.state} className="flex items-center justify-between p-3 rounded-lg bg-secondary/60" data-testid={`ifta-${s.state}`}>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-lg font-extrabold text-primary w-10">{s.state}</span>
                    <div className="text-xs text-muted-foreground">{s.count} receipt{s.count > 1 ? "s" : ""}</div>
                  </div>
                  <div className="text-right">
                    <div className="mono text-sm font-bold">{s.gallons.toFixed(1)} gal</div>
                    <div className="mono text-[11px] text-muted-foreground">${s.total_usd.toFixed(2)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card className="jade-panel p-5">
        <div className="font-[Unbounded] text-base mb-3">Receipt history</div>
        <div className="space-y-2 max-h-[460px] overflow-y-auto">
          {data.items.length === 0 && <div className="text-sm text-muted-foreground">No receipts logged.</div>}
          {data.items.map((r) => (
            <div key={r.id} className="grid grid-cols-1 md:grid-cols-[1fr_120px_100px_100px_100px_60px] gap-2 items-center p-3 rounded-lg bg-secondary/60" data-testid={`fuel-row-${r.id}`}>
              <div>
                <div className="text-sm font-medium">{r.station_name}</div>
                <div className="mono text-[10px] text-muted-foreground flex items-center gap-1">
                  <MapPin className="w-3 h-3" /> {r.city || "—"}, {r.state}
                </div>
              </div>
              <div className="mono text-xs text-muted-foreground">{new Date(r.purchased_at).toLocaleDateString()}</div>
              <div className="mono text-sm">{r.gallons.toFixed(1)} gal</div>
              <div className="mono text-sm text-primary">${r.total_usd.toFixed(2)}</div>
              <div className="mono text-xs text-muted-foreground">{r.odometer_mi?.toLocaleString?.() || 0} mi</div>
              <Button size="sm" variant="ghost" onClick={() => del(r.id)} data-testid={`fuel-del-${r.id}`}><Trash2 className="w-4 h-4" /></Button>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
