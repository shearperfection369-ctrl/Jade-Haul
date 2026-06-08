import React, { useRef, useState } from "react";
import { api } from "@/lib/api";
import PageHeader from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Camera, Upload, ScanLine, FileText, Loader2, CheckCircle } from "lucide-react";
import { toast } from "sonner";

export default function BillScannerPage() {
  const fileRef = useRef(null);
  const [preview, setPreview] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState(null);

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

  const scan = async () => {
    if (!preview) {
      toast.error("Upload a bill image first");
      return;
    }
    setScanning(true);
    try {
      const { data } = await api.post("/bill/scan", {
        image_base64: preview,
        mime_type: preview.split(";")[0].replace("data:", ""),
      });
      setResult(data);
      if (data.parsed) toast.success("Bill parsed");
      else toast("Bill scanned — review raw output");
    } catch (e) {
      toast.error("Scan failed");
    } finally {
      setScanning(false);
    }
  };

  return (
    <div>
      <PageHeader title="Bill / BOL Scanner" subtitle="Driver · GPT-4o Vision OCR" />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card className="jade-panel p-5">
          <div className="aspect-[4/3] rounded-xl overflow-hidden bg-secondary/40 border border-border/70 relative flex items-center justify-center" data-testid="bill-preview">
            {preview ? (
              <img src={preview} alt="" className="w-full h-full object-contain" />
            ) : (
              <div className="text-center text-muted-foreground">
                <Camera className="w-10 h-10 mx-auto mb-3 text-primary" />
                <div className="text-sm">Capture or upload a bill</div>
                <div className="mono text-[10px] mt-1">JPG · PNG · WEBP</div>
              </div>
            )}
            {scanning && (
              <>
                <div className="absolute inset-0 flex items-center justify-center bg-background/40">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
                <div className="absolute inset-0 pointer-events-none">
                  <div className="absolute left-0 right-0 h-[2px] bg-primary"
                    style={{ animation: "orb-fast 1.4s ease-in-out infinite", boxShadow: "0 0 18px hsl(var(--primary))" }} />
                </div>
              </>
            )}
            {/* HUD brackets */}
            {["top-left", "top-right", "bottom-left", "bottom-right"].map((p) => (
              <div key={p} className={`absolute w-7 h-7 border-primary pointer-events-none ${
                p === "top-left" ? "top-3 left-3 border-t-2 border-l-2" :
                p === "top-right" ? "top-3 right-3 border-t-2 border-r-2" :
                p === "bottom-left" ? "bottom-3 left-3 border-b-2 border-l-2" :
                "bottom-3 right-3 border-b-2 border-r-2"
              }`} />
            ))}
          </div>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={onPick} data-testid="bill-file-input" />
          <div className="flex gap-2 mt-4">
            <Button variant="outline" className="flex-1" onClick={() => fileRef.current?.click()} data-testid="bill-upload-btn">
              <Upload className="w-4 h-4 mr-2" /> Upload / Capture
            </Button>
            <Button className="flex-1" disabled={!preview || scanning} onClick={scan} data-testid="bill-scan-btn">
              <ScanLine className="w-4 h-4 mr-2" /> {scanning ? "Scanning…" : "Scan with JADE Vision"}
            </Button>
          </div>
        </Card>

        <Card className="jade-panel p-5 min-h-[420px]">
          <div className="flex items-center justify-between mb-3">
            <div className="font-[Unbounded] text-base flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" /> Parsed BOL
            </div>
            {result?.parsed && (
              <Badge variant="outline" className="border-primary/40 text-primary">
                <CheckCircle className="w-3 h-3 mr-1" /> Parsed
              </Badge>
            )}
          </div>
          {!result && <div className="text-sm text-muted-foreground">Upload a bill to see the structured extraction. Powered by GPT-4o.</div>}
          {result?.parsed && (
            <div className="space-y-3 text-sm" data-testid="bill-parsed">
              <div className="grid grid-cols-2 gap-3">
                <Field k="Broker" v={result.parsed.broker_name} />
                <Field k="Carrier" v={result.parsed.carrier_name} />
                <Field k="BOL #" v={result.parsed.bol_number} />
                <Field k="Pickup" v={result.parsed.pickup_date} />
                <Field k="Delivery" v={result.parsed.delivery_date} />
                <Field k="Weight" v={result.parsed.weight_lbs ? `${result.parsed.weight_lbs.toLocaleString()} lbs` : null} />
                <Field k="Origin" v={result.parsed.origin} />
                <Field k="Destination" v={result.parsed.destination} />
                <Field k="Commodity" v={result.parsed.commodity} />
                <Field k="Total" v={result.parsed.total_amount_usd ? `$${result.parsed.total_amount_usd.toLocaleString()}` : null} highlight />
              </div>
              {result.parsed.line_items?.length > 0 && (
                <div>
                  <div className="mono text-[10px] uppercase text-muted-foreground tracking-widest mb-1">Line items</div>
                  <div className="divide-y divide-border/60 border border-border/60 rounded-lg overflow-hidden">
                    {result.parsed.line_items.map((li, i) => (
                      <div key={i} className="flex items-center justify-between px-3 py-2 text-xs">
                        <span>{li.description}</span>
                        <span className="mono">${li.amount?.toFixed?.(2) ?? li.amount}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          {result?.note && <div className="mt-3 text-[11px] text-muted-foreground mono">{result.note}</div>}
        </Card>
      </div>
    </div>
  );
}

function Field({ k, v, highlight }) {
  return (
    <div className="p-3 rounded-lg bg-secondary/60">
      <div className="mono text-[10px] uppercase text-muted-foreground tracking-widest">{k}</div>
      <div className={`text-sm font-medium mt-0.5 ${highlight ? "text-primary" : ""}`}>{v ?? "—"}</div>
    </div>
  );
}
