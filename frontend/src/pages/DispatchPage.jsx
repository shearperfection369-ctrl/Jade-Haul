import React, { useEffect, useRef, useState } from "react";
import PageHeader from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/context/AuthContext";
import { Send, Radio } from "lucide-react";

const WS_URL = (() => {
  const base = process.env.REACT_APP_BACKEND_URL || "";
  return base.replace(/^http/, "ws") + "/api/ws/dispatch";
})();

export default function DispatchPage() {
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [connected, setConnected] = useState(false);
  const wsRef = useRef(null);
  const endRef = useRef(null);

  useEffect(() => {
    const token = localStorage.getItem("jadeos.token") || "";
    const ws = new WebSocket(`${WS_URL}?token=${token}`);
    wsRef.current = ws;
    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);
    ws.onmessage = (ev) => {
      try {
        const m = JSON.parse(ev.data);
        setMessages((prev) => [...prev, m]);
      } catch {/* noop */}
    };
    return () => ws.close();
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = () => {
    const t = text.trim();
    if (!t || wsRef.current?.readyState !== 1) return;
    wsRef.current.send(JSON.stringify({ text: t }));
    setText("");
  };

  return (
    <div className="h-full flex flex-col">
      <PageHeader
        title="Live Dispatch · Realtime"
        subtitle="Jade Haul · WebSocket Comms"
        right={
          <Badge variant="outline" className={`mono ${connected ? "border-primary/40 text-primary" : "border-destructive/40 text-destructive"}`}>
            <Radio className="w-3 h-3 mr-1" /> {connected ? "ON-AIR" : "OFFLINE"}
          </Badge>
        }
      />

      <Card className="jade-panel p-0 flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto p-5 space-y-2" data-testid="dispatch-stream">
          {messages.length === 0 && (
            <div className="text-sm text-muted-foreground text-center py-10">
              Dispatch is open. Drop a message — every connected driver and broker sees it instantly.
            </div>
          )}
          {messages.map((m) => {
            if (m.kind === "system") {
              return (
                <div key={m.id} className="text-center mono text-[10px] text-muted-foreground tracking-widest py-1">
                  ▸ {m.text}
                </div>
              );
            }
            const mine = m.from === user?.name;
            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[70%] px-3 py-2 rounded-2xl ${mine ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-secondary/70 rounded-bl-sm"}`}>
                  <div className="mono text-[10px] opacity-70 mb-0.5 tracking-widest">{m.from} · {m.role}</div>
                  <div className="text-sm leading-snug">{m.text}</div>
                </div>
              </div>
            );
          })}
          <div ref={endRef} />
        </div>
        <div className="p-3 border-t border-border/70 flex gap-2">
          <Input
            placeholder="Type to dispatch…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            data-testid="dispatch-input"
          />
          <Button onClick={send} disabled={!connected || !text.trim()} data-testid="dispatch-send">
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </Card>
    </div>
  );
}
