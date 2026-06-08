import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import PageHeader from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, RefreshCw, ExternalLink, ShieldAlert } from "lucide-react";

export default function IntegrationViewerPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const [iframeKey, setIframeKey] = useState(0);

  useEffect(() => {
    api.get(`/integrations/${id}`).then((r) => setData(r.data));
  }, [id]);

  if (!data) return <div className="p-6 text-muted-foreground">Loading widget…</div>;

  return (
    <div className="h-full flex flex-col">
      <PageHeader
        title={data.name}
        subtitle={`Widget · ${data.category}`}
        right={
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="border-primary/40 text-primary mono">{data.status}</Badge>
            <Button variant="ghost" size="sm" onClick={() => setIframeKey((k) => k + 1)} data-testid="widget-refresh">
              <RefreshCw className="w-4 h-4 mr-1" /> Reload
            </Button>
            <Button variant="ghost" size="sm" onClick={() => window.open(data.embed_url, "_blank")} data-testid="widget-open-tab">
              <ExternalLink className="w-4 h-4 mr-1" /> New tab
            </Button>
            <Button variant="ghost" size="sm" onClick={() => nav(-1)} data-testid="widget-back">
              <ArrowLeft className="w-4 h-4 mr-1" /> Back
            </Button>
          </div>
        }
      />

      <Card className="jade-panel p-0 flex-1 overflow-hidden relative jade-tracing-border">
        {/* HUD brackets */}
        {["top-left", "top-right", "bottom-left", "bottom-right"].map((p) => (
          <div key={p} className={`absolute w-6 h-6 border-primary z-10 pointer-events-none ${
            p === "top-left" ? "top-2 left-2 border-t-2 border-l-2" :
            p === "top-right" ? "top-2 right-2 border-t-2 border-r-2" :
            p === "bottom-left" ? "bottom-2 left-2 border-b-2 border-l-2" :
            "bottom-2 right-2 border-b-2 border-r-2"
          }`} />
        ))}

        <div className="px-3 py-2 flex items-center justify-between border-b border-border/60 bg-secondary/40">
          <div className="flex items-center gap-2 mono text-[11px] text-muted-foreground">
            <span className="w-2 h-2 rounded-full bg-primary jade-ring-glow" />
            <span className="truncate max-w-[480px]">{data.embed_url}</span>
          </div>
          <div className="mono text-[10px] text-muted-foreground tracking-widest">JADE HAUL · MIRRORED WIDGET</div>
        </div>

        <iframe
          key={iframeKey}
          src={data.embed_url}
          title={data.name}
          className="w-full h-[calc(100%-37px)] bg-white"
          sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-pointer-lock allow-presentation"
          referrerPolicy="no-referrer"
          data-testid="widget-iframe"
        />

        {/* Frame-block notice (some sites send X-Frame-Options DENY) */}
        <div className="absolute bottom-3 left-3 right-3 pointer-events-none">
          <div className="jade-glass px-3 py-2 inline-flex items-center gap-2 text-[11px] text-muted-foreground pointer-events-auto">
            <ShieldAlert className="w-3.5 h-3.5 text-primary" />
            If the widget appears blank, the provider blocks iframe embedding —
            <button onClick={() => window.open(data.embed_url, "_blank")} className="text-primary underline ml-1">open in a new tab</button>.
          </div>
        </div>
      </Card>
    </div>
  );
}
