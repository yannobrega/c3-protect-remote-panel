"use client";

import { useState } from "react";
import {
  CheckCircle2,
  CircleAlert,
  Clock3,
  Copy,
  Database,
  Gauge,
  ListChecks,
  Route,
  TerminalSquare,
  Wifi,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Props = {
  commandId: string;
  title: string;
  output: string;
  durationMs: number | null;
};

type Row = Record<string, string>;

const tableViews: Record<string, { columns: { key: string; label: string }[]; empty: string }> = {
  interfaces: {
    columns: [
      { key: "name", label: "Interface" },
      { key: "type", label: "Tipo" },
      { key: "running", label: "Estado" },
      { key: "actual-mtu", label: "MTU" },
      { key: "mac-address", label: "MAC" },
    ],
    empty: "Nenhuma interface retornada.",
  },
  routes: {
    columns: [
      { key: "dst-address", label: "Destino" },
      { key: "gateway", label: "Gateway" },
      { key: "distance", label: "Distância" },
      { key: "routing-table", label: "Tabela" },
      { key: "immediate-gw", label: "Saída" },
    ],
    empty: "Nenhuma rota ativa retornada.",
  },
  "dhcp-leases": {
    columns: [
      { key: "address", label: "Endereço" },
      { key: "host-name", label: "Dispositivo" },
      { key: "mac-address", label: "MAC" },
      { key: "status", label: "Estado" },
      { key: "last-seen", label: "Visto há" },
    ],
    empty: "Nenhum cliente DHCP encontrado.",
  },
  "ppp-sessions": {
    columns: [
      { key: "name", label: "Usuário" },
      { key: "service", label: "Serviço" },
      { key: "address", label: "Endereço" },
      { key: "caller-id", label: "Origem" },
      { key: "uptime", label: "Uptime" },
    ],
    empty: "Nenhuma sessão PPP ativa.",
  },
};

function parseTerse(output: string) {
  return output
    .split("\n")
    .map((line) => {
      const row: Row = {};
      const pattern = /([a-z0-9-]+)=("(?:\\.|[^"])*"|\S*)/gi;
      for (const match of line.matchAll(pattern)) {
        row[match[1].toLowerCase()] = match[2].replace(/^"|"$/g, "").replace(/\\"/g, '"');
      }
      return row;
    })
    .filter((row) => Object.keys(row).length > 0);
}

function metric(label: string, value: string, icon: typeof Gauge, tone = "neutral") {
  return { label, value, icon, tone };
}

function readPingSummary(output: string) {
  const values: Row = {};
  for (const match of output.matchAll(/([a-z-]+)=([^\s]+)/gi)) values[match[1]] = match[2];
  return [
    metric("Enviados", values.sent ?? "—", Wifi),
    metric("Recebidos", values.received ?? "—", CheckCircle2, "success"),
    metric("Perda", values["packet-loss"] ?? "—", CircleAlert, values["packet-loss"] === "0%" ? "success" : "danger"),
    metric("Latência média", values["avg-rtt"] ?? "—", Gauge),
  ];
}

function StatusValue({ value }: { value: string }) {
  const positive = /^(true|bound|running|established|yes|ok)$/i.test(value);
  const negative = /^(false|waiting|stopped|no|error|failed)$/i.test(value);
  if (!positive && !negative) return <>{value || "—"}</>;
  return (
    <Badge variant="outline" className={positive
      ? "border-emerald-400/20 bg-emerald-400/[0.08] text-emerald-300"
      : "border-rose-400/20 bg-rose-400/[0.08] text-rose-300"}
    >
      {positive ? "Ativo" : "Inativo"}
    </Badge>
  );
}

function Metrics({ items }: { items: ReturnType<typeof metric>[] }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="rounded-xl border border-white/[0.07] bg-white/[0.018] p-4">
          <div className="flex items-center justify-between gap-3 text-xs text-white/35">
            <span>{item.label}</span>
            <item.icon className={`size-4 ${item.tone === "success" ? "text-emerald-300" : item.tone === "danger" ? "text-rose-300" : "text-white/30"}`} />
          </div>
          <p className="mt-3 text-xl font-semibold tracking-[-0.03em] text-white">{item.value}</p>
        </div>
      ))}
    </div>
  );
}

function TerseTable({ commandId, output }: { commandId: string; output: string }) {
  const view = tableViews[commandId];
  const rows = parseTerse(output);
  if (!rows.length) return <EmptyResult text={view.empty} />;
  return (
    <div className="overflow-hidden rounded-xl border border-white/[0.07]">
      <Table>
        <TableHeader className="bg-white/[0.025]">
          <TableRow className="border-white/[0.07] hover:bg-transparent">
            {view.columns.map((column) => <TableHead key={column.key} className="px-4 text-xs text-white/35">{column.label}</TableHead>)}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, index) => (
            <TableRow key={`${row.name ?? row.address ?? index}-${index}`} className="border-white/[0.055] hover:bg-white/[0.025]">
              {view.columns.map((column) => (
                <TableCell key={column.key} className="max-w-64 px-4 py-3 font-mono text-xs text-white/65">
                  {column.key === "running" || column.key === "status"
                    ? <StatusValue value={row[column.key] ?? "—"} />
                    : <span className="block truncate" title={row[column.key]}>{row[column.key] || "—"}</span>}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function LogTimeline({ output }: { output: string }) {
  const lines = output.split("\n").map((line) => line.trim()).filter(Boolean).slice(-80).reverse();
  if (!lines.length) return <EmptyResult text="Nenhum alerta recente encontrado." />;
  return (
    <div className="space-y-2">
      {lines.map((line, index) => {
        const critical = /critical|error/i.test(line);
        return (
          <div key={`${line}-${index}`} className={`flex gap-3 rounded-xl border p-3 ${critical ? "border-rose-400/15 bg-rose-400/[0.04]" : "border-amber-400/15 bg-amber-400/[0.035]"}`}>
            <span className={`mt-1.5 size-1.5 shrink-0 rounded-full ${critical ? "bg-rose-400" : "bg-amber-300"}`} />
            <p className="min-w-0 break-words font-mono text-xs leading-5 text-white/60">{line}</p>
          </div>
        );
      })}
    </div>
  );
}

function TracerouteView({ output }: { output: string }) {
  const hops = output.split("\n").map((line) => line.trim()).filter((line) => /^\d+\s+/.test(line));
  if (!hops.length) return <TechnicalOutput output={output} />;
  return (
    <div className="space-y-2">
      {hops.map((line, index) => {
        const parts = line.split(/\s+/);
        return (
          <div key={`${line}-${index}`} className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.018] p-3">
            <span className="grid size-7 place-items-center rounded-full border border-emerald-400/15 bg-emerald-400/[0.06] font-mono text-xs text-emerald-300">{parts[0]}</span>
            <div className="min-w-0">
              <p className="truncate font-mono text-sm text-white/75">{parts[1] ?? "Sem resposta"}</p>
              <p className="mt-0.5 text-xs text-white/25">Hop {parts[0]}</p>
            </div>
            <span className="font-mono text-xs text-white/45">{parts.find((part) => /ms$/i.test(part)) ?? parts[3] ?? "—"}</span>
          </div>
        );
      })}
    </div>
  );
}

function ActionResult({ commandId }: { commandId: string }) {
  const backup = commandId === "run-backup";
  return (
    <div className="rounded-xl border border-emerald-400/15 bg-emerald-400/[0.05] p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-emerald-400/[0.1] text-emerald-300"><CheckCircle2 className="size-5" /></span>
        <div>
          <p className="font-medium text-emerald-200">{backup ? "Rotina de backup iniciada" : "Reinício da VPN solicitado"}</p>
          <p className="mt-1 text-sm leading-6 text-white/40">{backup
            ? "O MikroTik continuará o processo em segundo plano, incluindo o envio configurado no script backup_ftp."
            : "A interface sstp-c3support será desativada e reativada. A RB pode ficar indisponível por alguns segundos."}</p>
        </div>
      </div>
    </div>
  );
}

function EmptyResult({ text }: { text: string }) {
  return <div className="grid min-h-40 place-items-center rounded-xl border border-dashed border-white/[0.08] text-sm text-white/30">{text}</div>;
}

function TechnicalOutput({ output }: { output: string }) {
  return <pre className="max-h-[520px] overflow-auto whitespace-pre-wrap break-words rounded-xl border border-white/[0.07] bg-black/20 p-4 font-mono text-xs leading-5 text-emerald-100/65">{output}</pre>;
}

export function DiagnosticResult({ commandId, title, output, durationMs }: Props) {
  const [showRaw, setShowRaw] = useState(false);
  const [copied, setCopied] = useState(false);
  const table = tableViews[commandId];
  const connectionCount = commandId === "connections" ? output.match(/count=(\d+)/)?.[1] ?? output.match(/\d+/)?.[0] : null;
  const dnsLine = output.split("\n").find((line) => line.includes("status="));
  const dnsValues = dnsLine ? parseTerse(dnsLine)[0] ?? {} : {};

  async function copyOutput() {
    await navigator.clipboard.writeText(output);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  let content;
  if (showRaw) content = <TechnicalOutput output={output} />;
  else if (table) content = <TerseTable commandId={commandId} output={output} />;
  else if (commandId === "ping") content = <Metrics items={readPingSummary(output)} />;
  else if (commandId === "traceroute") content = <TracerouteView output={output} />;
  else if (commandId === "connections") content = <Metrics items={[metric("Conexões rastreadas", connectionCount ?? "—", Database)]} />;
  else if (commandId === "dns") content = <Metrics items={[
    metric("Resolução DNS", dnsValues.status === "ok" ? "Funcionando" : "Falhou", dnsValues.status === "ok" ? CheckCircle2 : CircleAlert, dnsValues.status === "ok" ? "success" : "danger"),
    metric("Domínio testado", dnsValues.domain ?? "brasil.c3support.com.br", ListChecks),
    metric("Endereço resolvido", dnsValues.address ?? "—", Route),
  ]} />;
  else if (commandId === "internet-test") {
    const dnsOk = /status=ok/.test(output);
    content = <><Metrics items={[...readPingSummary(output), metric("DNS", dnsOk ? "Resolvido" : "Falhou", dnsOk ? CheckCircle2 : CircleAlert, dnsOk ? "success" : "danger")]} /></>;
  } else if (commandId === "logs") content = <LogTimeline output={output} />;
  else if (commandId === "run-backup" || commandId === "restart-sstp") content = <ActionResult commandId={commandId} />;
  else content = <TechnicalOutput output={output} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-emerald-400" />
            <p className="text-sm font-medium text-white/80">{title}</p>
          </div>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-white/30"><Clock3 className="size-3" /> Concluído{durationMs !== null ? ` em ${(durationMs / 1000).toFixed(1)}s` : ""}</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => setShowRaw((value) => !value)} className="text-white/40 hover:bg-white/[0.05] hover:text-white">
            <TerminalSquare /> {showRaw ? "Ver painel" : "Saída técnica"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void copyOutput()} className="text-white/40 hover:bg-white/[0.05] hover:text-white">
            <Copy /> {copied ? "Copiado" : "Copiar"}
          </Button>
        </div>
      </div>
      {content}
    </div>
  );
}
