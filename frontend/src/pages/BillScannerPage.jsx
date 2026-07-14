import React, { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import PageHeader from "@/components/layout/PageHeader";
import GpsMap from "@/components/GpsMap";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Camera, Upload, ScanLine, FileText, Loader2, CheckCircle,
  Truck, MapPin, Package, Thermometer, Snowflake, AlertTriangle,
  Building2, User, Phone, Calendar, DollarSign, Hash, ArrowRight,
  Sparkles, ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";
import TripControls from "@/components/TripControls";
import { speak } from "@/lib/tts";

/* -------- helpers -------- */
const Field = ({ k, v, highlight, mono, icon: Icon }) => (
  <div className="p-3 rounded-lg bg-secondary/60 border border-border/50">
    <div className="mono text-[10px] uppercase text-muted-foreground tracking-widest flex items-center gap-1.5">
      {Icon && <Icon className="w-3 h-3" />}
      {k}
    </div>
    <div className={`text-sm font-medium mt-0.5 ${highlight ? "text-primary" : ""} ${mono ? "mono" : ""}`}>
      {v ?? "—"}
    </div>
  </div>
);

const Section = ({ title, icon: Icon, children }) => (
  <div className="space-y-2">
    <div className="mono text-[10px] uppercase tracking-widest text-primary flex items-center gap-1.5">
      {Icon && <Icon className="w-3 h-3" />} {title}
    </div>
    <div className="grid grid-cols-2 gap-2">{children}</div>
  </div>
);

export default function BillScannerPage() {
  const nav = useNavigate();
  const fileRef = useRef(null);
  const [preview, setPreview] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [activating, setActivating] = useState(false);
  const [result, setResult] = useState(null); // { shipment, parsed, activated, fallback, confidence }

  const onPick = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      setPreview(r.result);
      setResult(null);
    };
    r.readAsDataURL(f);
  };

  const scan = async ({ autoActivate = false } = {}) => {
    if (!preview) {
      toast.error("Capture or upload a BOL image first");
      return;
    }
    setScanning(true);
    try {
      const { data } = await api.post("/shipments/scan-bol", {
        image_base64: preview,
        mime_type: preview.split(";")[0].replace("data:", ""),
        auto_activate: autoActivate,
      });
      setResult(data);
      if (data.fallback) {
        toast("BOL parsed (demo fallback used)", { icon: "⚠️" });
      } else {
        toast.success(`BOL parsed · ${Math.round((data.confidence || 0) * 100)}% confidence`);
      }
      if (autoActivate) {
        toast.success("Load activated — start your trip when ready");
      }
      // JADE post-scan voice prompt: quick chime OR full first-of-day briefing.
      try {
        const { data: brief } = await api.post("/shipments/briefing", { shipment_id: data.shipment.id });
        if (brief?.text) speak(brief.text);
      } catch (_) { /* voice is best-effort */ }
    } catch (e) {
      toast.error("Scan failed — try again");
    } finally {
      setScanning(false);
    }
  };

  const activate = async () => {
    if (!result?.shipment?.id) return;
    setActivating(true);
    try {
      await api.post("/shipments/activate", { shipment_id: result.shipment.id });
      toast.success("Load set as active — good haul, driver");
      setTimeout(() => nav("/driver"), 700);
    } catch (e) {
      toast.error("Could not activate — try again");
    } finally {
      setActivating(false);
    }
  };

  const s = result?.shipment;
  const p = result?.parsed;

  // Build a minimal "load" object for the map preview
  const mapLoad = s ? {
    origin: s.origin,
    destination: s.destination,
    stops: s.stops || [],
    miles_total: s.miles_total,
    miles_remaining: s.miles_total,
  } : null;

  return (
    <div className="pb-10">
      <PageHeader
        title="Scan BOL · Pick Up Load"
        subtitle="Driver · JADE Vision (GPT-4o) will auto-create the shipment from origin to destination"
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        {/* Left: scanner */}
        <Card className="jade-panel p-5 lg:col-span-5">
          <div className="aspect-[4/3] rounded-xl overflow-hidden bg-secondary/40 border border-border/70 relative flex items-center justify-center" data-testid="bill-preview">
            {preview ? (
              <img src={preview} alt="BOL" className="w-full h-full object-contain" />
            ) : (
              <div className="text-center text-muted-foreground px-6">
                <Camera className="w-10 h-10 mx-auto mb-3 text-primary" />
                <div className="text-sm">Capture or upload your BOL</div>
                <div className="mono text-[10px] mt-1">JPG · PNG · WEBP · Full document in frame</div>
              </div>
            )}
            {scanning && (
              <>
                <div className="absolute inset-0 flex items-center justify-center bg-background/50">
                  <div className="text-center">
                    <Loader2 className="w-9 h-9 animate-spin text-primary mx-auto" />
                    <div className="mono text-[11px] mt-2 text-primary tracking-widest">JADE VISION · READING</div>
                  </div>
                </div>
                <div className="absolute inset-0 pointer-events-none">
                  <div
                    className="absolute left-0 right-0 h-[2px] bg-primary"
                    style={{ animation: "orb-fast 1.4s ease-in-out infinite", boxShadow: "0 0 18px hsl(var(--primary))" }}
                  />
                </div>
              </>
            )}
            {["top-left", "top-right", "bottom-left", "bottom-right"].map((pos) => (
              <div key={pos} className={`absolute w-7 h-7 border-primary pointer-events-none ${
                pos === "top-left" ? "top-3 left-3 border-t-2 border-l-2" :
                pos === "top-right" ? "top-3 right-3 border-t-2 border-r-2" :
                pos === "bottom-left" ? "bottom-3 left-3 border-b-2 border-l-2" :
                "bottom-3 right-3 border-b-2 border-r-2"
              }`} />
            ))}
          </div>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={onPick} data-testid="bill-file-input" />
          <div className="flex gap-2 mt-4">
            <Button variant="outline" className="flex-1" onClick={() => fileRef.current?.click()} data-testid="bill-upload-btn">
              <Upload className="w-4 h-4 mr-2" /> Upload / Capture
            </Button>
            <Button className="flex-1" disabled={!preview || scanning} onClick={() => scan({ autoActivate: false })} data-testid="bill-scan-btn">
              <ScanLine className="w-4 h-4 mr-2" /> {scanning ? "Scanning…" : "Scan BOL"}
            </Button>
          </div>
          <Button
            className="w-full mt-2"
            variant="secondary"
            disabled={!preview || scanning}
            onClick={() => scan({ autoActivate: true })}
            data-testid="bill-scan-activate-btn"
          >
            <Sparkles className="w-4 h-4 mr-2" />
            {scanning ? "Working…" : "Scan & Auto-Start Load"}
          </Button>

          <div className="mt-4 text-[11px] text-muted-foreground leading-relaxed">
            <div className="flex items-center gap-1.5 mono uppercase text-[10px] tracking-widest text-primary mb-1">
              <Sparkles className="w-3 h-3" /> What JADE will do
            </div>
            Read every field on your BOL — shipper, consignee, PO, weight, temp, hazmat, rate — build the full shipment
            from origin to destination, and set it as your active load for GPS routing and dispatch.
          </div>
        </Card>

        {/* Right: parsed shipment */}
        <Card className="jade-panel p-5 min-h-[520px] lg:col-span-7">
          <div className="flex items-center justify-between mb-3">
            <div className="font-[Unbounded] text-base flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" /> Auto-Populated Shipment
            </div>
            <div className="flex items-center gap-2">
              {result?.fallback && (
                <Badge variant="outline" className="border-amber-500/40 text-amber-400">
                  <AlertTriangle className="w-3 h-3 mr-1" /> Demo Fallback
                </Badge>
              )}
              {s && (
                <Badge variant="outline" className="border-primary/40 text-primary">
                  <CheckCircle className="w-3 h-3 mr-1" /> {Math.round((result?.confidence || 0) * 100)}% Parsed
                </Badge>
              )}
            </div>
          </div>

          {!s && (
            <div className="text-sm text-muted-foreground py-8 text-center">
              Scan a BOL — JADE will populate every field automatically. Powered by GPT-4o Vision.
            </div>
          )}

          {s && (
            <div className="space-y-4" data-testid="bol-shipment">
              {/* Route summary hero */}
              <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="mono text-[10px] uppercase text-muted-foreground tracking-widest">Origin</div>
                    <div className="font-[Unbounded] text-lg truncate">{s.origin?.name || "—"}</div>
                    {s.shipper?.name && <div className="text-xs text-muted-foreground truncate">{s.shipper.name}</div>}
                  </div>
                  <div className="flex flex-col items-center px-2">
                    <ArrowRight className="w-6 h-6 text-primary" />
                    <div className="mono text-[10px] text-primary">{s.miles_total ? `${s.miles_total} mi` : "—"}</div>
                  </div>
                  <div className="flex-1 min-w-0 text-right">
                    <div className="mono text-[10px] uppercase text-muted-foreground tracking-widest">Destination</div>
                    <div className="font-[Unbounded] text-lg truncate">{s.destination?.name || "—"}</div>
                    {s.consignee?.name && <div className="text-xs text-muted-foreground truncate">{s.consignee.name}</div>}
                  </div>
                </div>

                {/* Mini route map */}
                {mapLoad && s.origin?.lat && s.destination?.lat && (
                  <div className="mt-3 h-[180px] rounded-lg overflow-hidden border border-border/60">
                    <GpsMap load={mapLoad} stations={[]} animateDriver={false} />
                  </div>
                )}

                <div className="grid grid-cols-4 gap-2 mt-3 text-xs">
                  <div className="jade-glass px-3 py-2 flex items-center gap-2">
                    <DollarSign className="w-3.5 h-3.5 text-primary" />
                    ${(s.rate_usd || 0).toLocaleString()}
                  </div>
                  <div className="jade-glass px-3 py-2 flex items-center gap-2">
                    <Package className="w-3.5 h-3.5 text-primary" />
                    {(s.weight_lbs || 0).toLocaleString()} lbs
                  </div>
                  <div className="jade-glass px-3 py-2 flex items-center gap-2">
                    {s.temperature_f != null ? <Snowflake className="w-3.5 h-3.5 text-primary" /> : <Truck className="w-3.5 h-3.5 text-primary" />}
                    {s.temperature_f != null ? `${s.temperature_f}°F` : "Dry"}
                  </div>
                  <div className="jade-glass px-3 py-2 flex items-center gap-2">
                    {s.hazmat ? <ShieldAlert className="w-3.5 h-3.5 text-destructive" /> : <ShieldAlert className="w-3.5 h-3.5 text-muted-foreground" />}
                    {s.hazmat ? "HAZMAT" : "Non-haz"}
                  </div>
                </div>
              </div>

              {/* Trip start / pause prompt — appears the moment BOL is scanned */}
              <TripControls
                shipment={s}
                onChange={(updated) => setResult((prev) => ({ ...prev, shipment: { ...prev.shipment, ...updated }, activated: true }))}
              />

              {/* IDs */}
              <Section title="Document IDs" icon={Hash}>
                <Field k="Load #" v={s.load_id} mono highlight />
                <Field k="BOL #" v={s.bol_number} mono />
                <Field k="PRO #" v={s.pro_number} mono />
                <Field k="PO #" v={s.po_number} mono />
                <Field k="Pickup #" v={s.pickup_number} mono />
                <Field k="Delivery #" v={s.delivery_number} mono />
                <Field k="Seal #" v={s.seal_number} mono />
                <Field k="Trailer" v={s.trailer_number} mono />
              </Section>

              {/* Parties */}
              <Section title="Shipper" icon={Building2}>
                <Field k="Name" v={s.shipper?.name} />
                <Field k="Contact" v={s.shipper?.contact} icon={User} />
                <Field k="Address" v={s.shipper?.address} />
                <Field k="City / State / Zip" v={[s.shipper?.city, s.shipper?.state, s.shipper?.zip].filter(Boolean).join(", ")} />
                <Field k="Phone" v={s.shipper?.phone} icon={Phone} />
                <Field k="Pickup" v={[s.pickup_date, s.pickup_time_window].filter(Boolean).join(" · ")} icon={Calendar} />
              </Section>

              <Section title="Consignee" icon={MapPin}>
                <Field k="Name" v={s.consignee?.name} />
                <Field k="Contact" v={s.consignee?.contact} icon={User} />
                <Field k="Address" v={s.consignee?.address} />
                <Field k="City / State / Zip" v={[s.consignee?.city, s.consignee?.state, s.consignee?.zip].filter(Boolean).join(", ")} />
                <Field k="Phone" v={s.consignee?.phone} icon={Phone} />
                <Field k="Delivery" v={[s.delivery_date, s.delivery_time_window].filter(Boolean).join(" · ")} icon={Calendar} />
              </Section>

              <Section title="Broker / Carrier" icon={Truck}>
                <Field k="Broker" v={s.broker} />
                <Field k="Carrier" v={s.carrier} />
                <Field k="SCAC" v={s.carrier_scac} mono />
                <Field k="Payment Terms" v={s.payment_terms} />
              </Section>

              <Section title="Freight" icon={Package}>
                <Field k="Commodity" v={s.commodity} />
                <Field k="Pieces" v={s.pieces} />
                <Field k="Pallets" v={s.pallets} />
                <Field k="Weight" v={s.weight_lbs ? `${s.weight_lbs.toLocaleString()} lbs` : null} />
                <Field k="Dimensions" v={s.dimensions} />
                <Field k="Class" v={s.freight_class} />
                <Field k="NMFC" v={s.nmfc} mono />
                <Field k="Temp / Reefer" v={s.temperature_f != null ? `${s.temperature_f}°F · ${s.reefer_setting || ""}` : null} icon={Thermometer} />
              </Section>

              {(s.hazmat || s.special_instructions) && (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-xs space-y-1">
                  {s.hazmat && (
                    <div className="flex items-center gap-2 text-amber-400 font-medium">
                      <ShieldAlert className="w-4 h-4" /> HAZMAT · UN {s.hazmat_un_number || "—"}
                    </div>
                  )}
                  {s.special_instructions && (
                    <div className="text-muted-foreground leading-relaxed">
                      <span className="text-primary mono uppercase text-[10px] tracking-widest">Special Instructions · </span>
                      {s.special_instructions}
                    </div>
                  )}
                </div>
              )}

              <Section title="Rate Breakdown" icon={DollarSign}>
                <Field k="Linehaul / Rate" v={s.rate_usd ? `$${s.rate_usd.toLocaleString()}` : null} highlight />
                <Field k="Rate / Mile" v={s.rate_per_mile ? `$${s.rate_per_mile}/mi` : null} />
                <Field k="Fuel Surcharge" v={s.fuel_surcharge_usd ? `$${s.fuel_surcharge_usd.toLocaleString()}` : null} />
                <Field k="Accessorials" v={s.accessorials_usd ? `$${s.accessorials_usd.toLocaleString()}` : null} />
                <Field k="Declared Value" v={s.declared_value_usd ? `$${s.declared_value_usd.toLocaleString()}` : null} />
              </Section>

              {p?.line_items?.length > 0 && (
                <div>
                  <div className="mono text-[10px] uppercase text-primary tracking-widest mb-1 flex items-center gap-1.5">
                    <FileText className="w-3 h-3" /> Line Items
                  </div>
                  <div className="divide-y divide-border/60 border border-border/60 rounded-lg overflow-hidden">
                    {p.line_items.map((li, i) => (
                      <div key={i} className="flex items-center justify-between px-3 py-2 text-xs">
                        <span>{li.description}</span>
                        <span className="mono text-muted-foreground">
                          {li.qty ? `${li.qty} × ` : ""}{li.weight_lbs ? `${li.weight_lbs} lbs` : ""}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 pt-2 sticky bottom-0 pb-1">
                <Button
                  className="flex-1"
                  size="lg"
                  onClick={activate}
                  disabled={activating || result?.activated}
                  data-testid="activate-shipment-btn"
                >
                  {activating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Truck className="w-4 h-4 mr-2" />}
                  {result?.activated ? "Load Active" : "Set as Active Load"}
                </Button>
                <Button variant="outline" onClick={() => { setResult(null); setPreview(null); }} data-testid="scan-another-btn">
                  Scan Another
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
