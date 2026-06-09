import React, { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import PageHeader from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { FileText, Upload, Trash2, Eye, Folder } from "lucide-react";
import { toast } from "sonner";

const CATS = ["BOL", "CDL", "INSURANCE", "PERMIT", "INSPECTION", "RECEIPT", "OTHER"];

export default function DocumentsPage() {
  const fileRef = useRef(null);
  const [docs, setDocs] = useState([]);
  const [name, setName] = useState("");
  const [cat, setCat] = useState("BOL");
  const [data, setData] = useState(null);
  const [mime, setMime] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    try {
      const { data: list } = await api.get("/documents");
      setDocs(list);
    } catch (e) {
      console.warn("documents refresh failed:", e?.message || e);
    }
  };
  useEffect(() => { refresh(); }, []);

  const pick = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setName(f.name);
    setMime(f.type || "application/octet-stream");
    const r = new FileReader();
    r.onload = () => setData(r.result);
    r.readAsDataURL(f);
  };

  const upload = async () => {
    if (!data) { toast.error("Pick a file first"); return; }
    setBusy(true);
    try {
      await api.post("/documents", {
        name: name || "Untitled",
        category: cat,
        mime_type: mime,
        data_base64: data,
      });
      toast.success("Document stored");
      setData(null); setName(""); setMime("");
      if (fileRef.current) fileRef.current.value = "";
      refresh();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Upload failed");
    } finally { setBusy(false); }
  };

  const view = async (id) => {
    const { data: doc } = await api.get(`/documents/${id}`);
    const blob = await (await fetch(`data:${doc.mime_type};base64,${doc.data_base64}`)).blob();
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
  };

  const del = async (id) => {
    await api.delete(`/documents/${id}`);
    refresh();
  };

  return (
    <div className="space-y-5">
      <PageHeader title="Documents Vault" subtitle="Driver · Compliance + Records" />

      <Card className="jade-panel p-5">
        <div className="font-[Unbounded] text-base mb-3 flex items-center gap-2"><Upload className="w-4 h-4 text-primary" /> Upload document</div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="md:col-span-2">
            <Label className="mono text-[10px] uppercase tracking-widest text-muted-foreground">File</Label>
            <Input ref={fileRef} type="file" onChange={pick} data-testid="doc-file" />
          </div>
          <div>
            <Label className="mono text-[10px] uppercase tracking-widest text-muted-foreground">Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Insurance card 2026" data-testid="doc-name" />
          </div>
          <div>
            <Label className="mono text-[10px] uppercase tracking-widest text-muted-foreground">Category</Label>
            <Select value={cat} onValueChange={setCat}>
              <SelectTrigger data-testid="doc-cat"><SelectValue /></SelectTrigger>
              <SelectContent>{CATS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Button className="md:col-span-4 h-10" disabled={!data || busy} onClick={upload} data-testid="doc-upload">
            <Upload className="w-4 h-4 mr-2" /> {busy ? "Uploading…" : "Upload to vault"}
          </Button>
        </div>
      </Card>

      <Card className="jade-panel p-5">
        <div className="font-[Unbounded] text-base mb-3 flex items-center gap-2"><Folder className="w-4 h-4 text-primary" /> {docs.length} stored documents</div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {docs.length === 0 && <div className="text-sm text-muted-foreground">Vault is empty. Upload BOLs, CDLs, insurance cards, permits, inspections.</div>}
          {docs.map((d) => (
            <div key={d.id} className="p-3 rounded-lg bg-secondary/60 border border-border/70" data-testid={`doc-row-${d.id}`}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/15 border border-primary/40 flex items-center justify-center">
                  <FileText className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{d.name}</div>
                  <div className="mono text-[10px] text-muted-foreground">
                    {d.category} · {(d.size_bytes / 1024).toFixed(1)} KB
                  </div>
                </div>
              </div>
              <div className="flex gap-2 mt-3">
                <Button size="sm" className="flex-1" onClick={() => view(d.id)} data-testid={`doc-view-${d.id}`}>
                  <Eye className="w-4 h-4 mr-1" /> View
                </Button>
                <Button size="sm" variant="ghost" onClick={() => del(d.id)} data-testid={`doc-del-${d.id}`}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
