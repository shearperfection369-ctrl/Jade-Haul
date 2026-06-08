import React from "react";
import useSWR from "swr";
import { api } from "@/lib/api";
import PageHeader from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const fetcher = (url) => api.get(url).then((r) => r.data);

export default function BrokerCarriersPage() {
  const { data } = useSWR("/broker/carriers", fetcher);
  return (
    <div>
      <PageHeader title="Carrier Risk · Live Scoring" subtitle="Broker · Reliability Intelligence" />
      <Card className="jade-panel p-0 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Carrier</TableHead>
              <TableHead>Lanes</TableHead>
              <TableHead>On-time %</TableHead>
              <TableHead>Rate compliance</TableHead>
              <TableHead>Risk score</TableHead>
              <TableHead>Risk</TableHead>
              <TableHead>Owner</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(data || []).map((c) => (
              <TableRow key={c.id} data-testid={`carrier-row-${c.id}`}>
                <TableCell className="font-medium">{c.name}</TableCell>
                <TableCell className="mono">{c.lanes}</TableCell>
                <TableCell className="mono">{c.on_time_pct}%</TableCell>
                <TableCell className="mono">{c.rate_compliance}%</TableCell>
                <TableCell className="mono">{c.risk_score}</TableCell>
                <TableCell>
                  <Badge
                    className={
                      c.risk === "LOW" ? "bg-primary text-primary-foreground" :
                      c.risk === "MEDIUM" ? "bg-amber-500/80 text-black" :
                      "bg-destructive text-destructive-foreground"
                    }
                  >
                    {c.risk}
                  </Badge>
                </TableCell>
                <TableCell>{c.dispatcher}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
