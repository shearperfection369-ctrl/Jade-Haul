import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import PageHeader from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import {
  Truck, Activity, Gauge, Video, Briefcase, Boxes, Globe, List, Shield,
  Calculator, CreditCard, Map as MapIcon, Link as LinkIcon, Plug, Trash2,
  ExternalLink, CheckCircle2, Plus
} from "lucide-react";
import { toast } from "sonner";

const ICONS = { Truck, Activity, Gauge, Video, Briefcase, Boxes, Globe, List, Shield, Calculator, CreditCard, Map: MapIcon, Link: LinkIcon };

export default function IntegrationsPage() {
  const nav = useNavigate();
  const [catalog, setCatalog] = useState([]);
  const [connected, setConnected] = useState([]);
  const [picked, setPicked] = useState(null);
  const [url, setUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [name, setName] = useState("");
  const [open, setOpen] = useState(false);

  const refresh = async () => {
    try {
      const [{ data: cat }, { data: conn }] = await Promise.all([
        api.get("/integrations/catalog"),
        api.get("/integrations"),
      ]);
      setCatalog(cat);
      setConnected(conn);
    } catch (e) {
      console.warn("integrations refresh failed:", e?.message || e);
    }
  };
  useEffect(() => { refresh(); }, []);

  const startConnect = (item) => {
    setPicked(item);
    setUrl(item.default_url || "");
    setName(item.name);
    setApiKey("");
    setOpen(true);
  };

  const confirmConnect = async () => {
    if (!picked) return;
    if (!url.startsWith("http")) {
      toast.error("URL must start with http(s)://");
      return;
    }
    try {
      await api.post("/integrations/connect", {
        slug: picked.slug,
        embed_url: url,
        name,
        api_key: apiKey || undefined,
      });
      toast.success(`${picked.name} connected`);
      setOpen(false);
      refresh();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Connection failed");
    }
  };

  const disconnect = async (id) => {
    await api.delete(`/integrations/${id}`);
    toast.success("Disconnected");
    refresh();
  };

  const isConnected = (slug) => connected.some((c) => c.slug === slug);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Integrations · Mirror Apps"
        subtitle="Jade Haul · Widget Framework"
        right={<Badge variant="outline" className="border-primary/40 text-primary mono">{connected.length} CONNECTED</Badge>}
      />

      {/* Connected list */}
      {connected.length > 0 && (
        <Card className="jade-panel p-5">
          <div className="font-[Unbounded] text-base mb-3 flex items-center gap-2">
            <Plug className="w-4 h-4 text-primary" /> Connected widgets
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {connected.map((c) => {
              const Icon = ICONS[c.icon] || LinkIcon;
              return (
                <div key={c.id} className="p-4 rounded-xl bg-secondary/60 border border-border/70 group hover:jade-ring-glow transition-all">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: `${c.color}1A`, color: c.color, border: `1px solid ${c.color}55` }}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="font-medium truncate">{c.name}</div>
                        <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0" />
                      </div>
                      <div className="text-xs text-muted-foreground truncate">{c.embed_url}</div>
                      <Badge variant="outline" className="mt-1 mono text-[10px]">{c.category}</Badge>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <Button
                      size="sm"
                      className="flex-1"
                      onClick={() => nav(`/integrations/${c.id}`)}
                      data-testid={`open-widget-${c.slug}`}
                    >
                      <ExternalLink className="w-3.5 h-3.5 mr-1" /> Open widget
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => disconnect(c.id)}
                      data-testid={`disconnect-${c.slug}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Catalog */}
      <Card className="jade-panel p-5">
        <div className="font-[Unbounded] text-base mb-3">Catalog · Mirror any company app into Jade Haul</div>
        <div className="text-sm text-muted-foreground mb-4 max-w-2xl">
          Connect external trucking and freight platforms. Once connected, they appear as embedded widget panels — your team
          works inside Jade Haul without switching tabs.
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {catalog.map((item) => {
            const Icon = ICONS[item.icon] || LinkIcon;
            const on = isConnected(item.slug);
            return (
              <button
                key={item.slug}
                onClick={() => startConnect(item)}
                data-testid={`connect-${item.slug}`}
                className={`text-left p-4 rounded-xl bg-secondary/40 border border-border/70 hover:border-primary/60 transition-all hover:scale-[1.01] ${on ? "jade-tracing-border" : ""}`}
              >
                <div className="flex items-start justify-between">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center"
                    style={{ background: `${item.color}1A`, color: item.color, border: `1px solid ${item.color}55` }}>
                    <Icon className="w-5 h-5" />
                  </div>
                  {on ? (
                    <Badge className="bg-primary text-primary-foreground"><CheckCircle2 className="w-3 h-3 mr-1" /> Connected</Badge>
                  ) : (
                    <Plus className="w-4 h-4 text-muted-foreground" />
                  )}
                </div>
                <div className="font-medium mt-3">{item.name}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{item.category}</div>
                <div className="text-xs text-muted-foreground mt-2 line-clamp-2">{item.description}</div>
              </button>
            );
          })}
        </div>
      </Card>

      {/* Connect dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="jade-panel">
          <DialogHeader>
            <DialogTitle className="font-[Unbounded]">Connect {picked?.name || "integration"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="mono text-[10px] uppercase tracking-widest text-muted-foreground">Display name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} data-testid="integration-name" />
            </div>
            <div>
              <Label className="mono text-[10px] uppercase tracking-widest text-muted-foreground">Embed URL</Label>
              <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://app.example.com/dashboard" data-testid="integration-url" />
              <div className="text-[11px] text-muted-foreground mt-1">
                Must be an HTTPS URL. Some providers require an embed token in the URL.
              </div>
            </div>
            <div>
              <Label className="mono text-[10px] uppercase tracking-widest text-muted-foreground">API key · optional</Label>
              <Input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-…" data-testid="integration-api-key" />
              <div className="text-[11px] text-muted-foreground mt-1">
                Stored encrypted. Used for server-side data sync once wired (not required to embed).
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={confirmConnect} data-testid="integration-confirm-connect">Connect widget</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
