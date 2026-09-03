"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  ArrowLeft,
  Cable,
  Clock3,
  CloudCog,
  DatabaseBackup,
  Cpu,
  EthernetPort,
  FileWarning,
  Gauge,
  Globe2,
  HardDrive,
  ListTree,
  Loader2,
  Network,
  RadioTower,
  RefreshCw,
  RotateCw,
  Route,
  SearchCheck,
  ShieldCheck,
  TerminalSquare,
  Thermometer,
  UsersRound,
  Wifi,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DeviceManagement } from "./device-management";
import { DiagnosticResult } from "./diagnostic-result";
import type { Company, Device } from "./remote-dashboard";

type Overview = {
  model: string;
  uptime: string;
  cpuLoad: string;
  temperature: string | null;
  version: string;
  architecture: string;
  cpu: string;
  totalMemory: string;
  freeMemory: string;
};

type Status = {
  online: boolean;
  latencyMs: number | null;
  error: string | null;
} | undefined;

const commands = [
  { id: "internet-test", label: "Testar internet", description: "Conectividade IP e resolução DNS", icon: Globe2, category: "Rede" },
  { id: "ping", label: "Ping", description: "Latência e perda até 1.1.1.1", icon: RadioTower, category: "Rede" },
  { id: "traceroute", label: "Traceroute", description: "Caminho até a internet", icon: Route, category: "Rede" },
  { id: "dns", label: "Verificar DNS", description: "Servidores e teste de resolução", icon: SearchCheck, category: "Rede" },
  { id: "interfaces", label: "Interfaces", description: "Portas, túneis e estados", icon: EthernetPort, category: "Rede" },
  { id: "routes", label: "Rotas ativas", description: "Destinos e gateways em uso", icon: Cable, category: "Rede" },
  { id: "ip-addresses", label: "Endereços IP", description: "IPs configurados na RB", icon: Network, category: "Rede" },
  { id: "dhcp-leases", label: "Clientes DHCP", description: "Dispositivos e concessões", icon: UsersRound, category: "Clientes" },
  { id: "ppp-sessions", label: "Sessões PPP", description: "Usuários conectados agora", icon: Wifi, category: "Clientes" },
  { id: "neighbors", label: "Vizinhos", description: "Equipamentos descobertos", icon: ListTree, category: "Clientes" },
  { id: "connections", label: "Conexões", description: "Total no connection tracking", icon: Activity, category: "Segurança" },
  { id: "firewall", label: "Firewall", description: "Filtros e contadores", icon: ShieldCheck, category: "Segurança" },
  { id: "logs", label: "Logs recentes", description: "Alertas, erros e eventos críticos", icon: FileWarning, category: "Segurança" },
  { id: "sstp", label: "VPN SSTP", description: "Estado do túnel com a C3", icon: CloudCog, category: "Segurança" },
  { id: "run-backup", label: "Gerar backup", description: "Executa a rotina backup_ftp", icon: DatabaseBackup, category: "Ações", action: true },
  { id: "restart-sstp", label: "Reiniciar VPN", description: "Reinicia a interface sstp-c3support", icon: RotateCw, category: "Ações", action: true },
] as const;

type Command = (typeof commands)[number];

export function RouterDetails({
  device,
  companies,
  status,
  gatewayOnline,
  onBack,
  onOpenTerminal,
  onUpdated,
  onDeleted,
  canManage,
  canRemote,
}: {
  device: Device;
  companies: Company[];
  status: Status;
  gatewayOnline: boolean;
  onBack: () => void;
  onOpenTerminal: () => void;
  onUpdated: (device: Device) => void;
  onDeleted: (id: number) => void;
  canManage: boolean;
  canRemote: boolean;
}) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [overviewError, setOverviewError] = useState("");
  const [checkedAt, setCheckedAt] = useState("");
  const [activeCommand, setActiveCommand] = useState("");
  const [commandResultId, setCommandResultId] = useState("");
  const [commandTitle, setCommandTitle] = useState("");
  const [commandOutput, setCommandOutput] = useState("");
  const [commandError, setCommandError] = useState("");
  const [commandDurationMs, setCommandDurationMs] = useState<number | null>(null);
  const [commandCategory, setCommandCategory] = useState("Todos");
  const [pendingAction, setPendingAction] = useState<Command | null>(null);
  const [webfigLoading, setWebfigLoading] = useState(false);
  const [webfigError, setWebfigError] = useState("");

  const loadOverview = useCallback(async () => {
    setOverviewLoading(true);
    setOverviewError("");
    try {
      const response = await fetch(
        `/api/remote/diagnostics?deviceId=${device.id}`,
        { cache: "no-store" },
      );
      const data = (await response.json()) as {
        overview?: Overview;
        checkedAt?: string;
        error?: string;
      };
      if (!response.ok || !data.overview) {
        throw new Error(data.error ?? "Não foi possível consultar o MikroTik.");
      }
      setOverview(data.overview);
      setCheckedAt(data.checkedAt ?? new Date().toISOString());
    } catch (cause) {
      setOverviewError(
        cause instanceof Error ? cause.message : "Não foi possível consultar o MikroTik.",
      );
    } finally {
      setOverviewLoading(false);
    }
  }, [device.id]);

  useEffect(() => {
    if (!canRemote) return;
    const timer = window.setTimeout(() => void loadOverview(), 0);
    return () => window.clearTimeout(timer);
  }, [canRemote, loadOverview]);

  async function runCommand(commandId: string, title: string) {
    setActiveCommand(commandId);
    setCommandResultId(commandId);
    setCommandTitle(title);
    setCommandOutput("");
    setCommandError("");
    setCommandDurationMs(null);
    try {
      const response = await fetch("/api/remote/diagnostics", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ deviceId: device.id, commandId }),
      });
      const data = (await response.json()) as { output?: string; durationMs?: number | null; error?: string };
      if (!response.ok || typeof data.output !== "string") {
        throw new Error(data.error ?? "O comando não pôde ser executado.");
      }
      setCommandOutput(data.output.trim() || "Comando concluído sem saída.");
      setCommandDurationMs(data.durationMs ?? null);
    } catch (cause) {
      setCommandError(
        cause instanceof Error ? cause.message : "O comando não pôde ser executado.",
      );
    } finally {
      setActiveCommand("");
    }
  }

  async function openWebfig() {
    const webfigWindow = window.open("about:blank", "_blank");
    if (!webfigWindow) {
      setWebfigError("O navegador bloqueou a nova aba. Libere pop-ups para abrir o WebFig.");
      return;
    }
    webfigWindow.opener = null;
    webfigWindow.document.title = `Abrindo ${device.rbName}…`;
    webfigWindow.document.body.innerHTML = "<p style='font:16px system-ui;padding:32px;background:#080a09;color:#fff;margin:0;min-height:100vh'>Preparando acesso seguro ao WebFig…</p>";
    setWebfigLoading(true);
    setWebfigError("");
    try {
      const response = await fetch("/api/remote/webfig", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ deviceId: device.id }),
      });
      const data = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !data.url) {
        throw new Error(data.error ?? "Não foi possível abrir o WebFig.");
      }
      webfigWindow.location.replace(data.url);
    } catch (cause) {
      webfigWindow.close();
      setWebfigError(
        cause instanceof Error ? cause.message : "Não foi possível abrir o WebFig.",
      );
    } finally {
      setWebfigLoading(false);
    }
  }

  const canConnect = gatewayOnline && status?.online !== false;
  const visibleCommands = commandCategory === "Todos"
    ? commands
    : commands.filter((command) => command.category === commandCategory);

  return (
    <div className="space-y-6">
      <Button
        variant="ghost"
        onClick={onBack}
        className="-ml-3 text-white/50 hover:bg-white/[0.05] hover:text-white"
      >
        <ArrowLeft /> Voltar aos MikroTiks
      </Button>

      <section className="c3-surface relative overflow-hidden rounded-xl border-emerald-400/[0.12] p-6 lg:p-8">
        <div className="absolute inset-y-6 left-0 w-0.5 bg-[#41d69a]" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="grid size-14 shrink-0 place-items-center rounded-xl border border-emerald-400/15 bg-emerald-400/[0.07] text-emerald-300">
              <HardDrive className="size-6" />
            </div>
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <h2 className="text-2xl font-semibold tracking-[-0.035em] text-white">
                  {device.rbName}
                </h2>
                <Badge
                  variant="outline"
                  className={status?.online === true
                    ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-300"
                    : status?.online === false
                      ? "border-rose-400/20 bg-rose-400/10 text-rose-300"
                      : "border-amber-400/20 bg-amber-400/10 text-amber-300"}
                >
                  <span className={`size-1.5 rounded-full ${status?.online === true ? "bg-emerald-400" : status?.online === false ? "bg-rose-400" : "bg-amber-300"}`} />
                  {status?.online === true ? `Online${status.latencyMs ? ` · ${status.latencyMs}ms` : ""}` : status?.online === false ? "Offline" : "Verificando"}
                </Badge>
              </div>
              <p className="text-sm text-white/45">
                {device.clientName ?? "Empresa não informada"} · <span className="font-mono">{device.managementIp}</span>
              </p>
              <p className="mt-2 text-xs text-white/30">
                SSH :22333 · WebFig :1080 · {device.sshUsername}@{device.managementIp}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {canManage && (
              <DeviceManagement
                device={device}
                companies={companies}
                gatewayOnline={gatewayOnline}
                onUpdated={onUpdated}
                onDeleted={onDeleted}
              />
            )}
            <Button
              variant="outline"
              onClick={() => void loadOverview()}
              disabled={overviewLoading || !gatewayOnline || !canRemote}
              className="border-white/10 bg-white/[0.025] text-white hover:bg-white/[0.07] hover:text-white"
            >
              <RefreshCw className={overviewLoading ? "animate-spin" : ""} />
              Atualizar dados
            </Button>
            <Button
              onClick={onOpenTerminal}
              disabled={!canConnect || !canRemote}
              variant="outline"
              className="border-white/10 bg-white/[0.025] text-white hover:bg-white/[0.07] hover:text-white"
            >
              <TerminalSquare /> Acessar SSH
            </Button>
            <Button
              onClick={() => void openWebfig()}
              disabled={!canConnect || webfigLoading || !canRemote}
              className="c3-button-primary"
            >
              {webfigLoading ? <Loader2 className="animate-spin" /> : <Globe2 />}
              {webfigLoading ? "Preparando…" : "Abrir WebFig"}
            </Button>
          </div>
        </div>
      </section>

      {webfigError && (
        <div className="rounded-xl border border-rose-400/15 bg-rose-400/[0.05] px-4 py-3 text-sm text-rose-200">
          {webfigError}
        </div>
      )}

      {overviewError && (
        <div className="flex flex-col gap-3 rounded-2xl border border-rose-400/15 bg-rose-400/[0.055] p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-medium text-rose-200">Diagnóstico indisponível</p>
            <p className="mt-1 text-sm text-rose-200/55">{overviewError}</p>
          </div>
          <Button variant="outline" onClick={() => void loadOverview()} className="border-rose-300/15 bg-transparent text-rose-100 hover:bg-rose-300/10 hover:text-white">
            Tentar novamente
          </Button>
        </div>
      )}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <DiagnosticCard icon={HardDrive} label="Modelo" value={overview?.model} loading={overviewLoading} />
        <DiagnosticCard icon={Clock3} label="Uptime" value={overview?.uptime} loading={overviewLoading} />
        <DiagnosticCard icon={Cpu} label="CPU" value={overview?.cpuLoad} suffix={overview?.cpuLoad && !overview.cpuLoad.includes("%") ? "%" : ""} loading={overviewLoading} />
        <DiagnosticCard icon={Thermometer} label="Temperatura" value={overview?.temperature ?? (overview ? "Sensor não disponível" : undefined)} loading={overviewLoading} muted={Boolean(overview && !overview.temperature)} />
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(380px,.72fr)_minmax(0,1.28fr)]">
        <div className="c3-surface rounded-xl">
          <div className="border-b border-white/[0.07] p-5">
            <h3 className="font-semibold text-white">Central de diagnóstico</h3>
            <p className="mt-1 text-sm text-white/35">Consultas rápidas e ações controladas para RouterOS v7.</p>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {["Todos", "Rede", "Clientes", "Segurança", "Ações"].map((category) => (
                <button
                  key={category}
                  type="button"
                  onClick={() => setCommandCategory(category)}
                  className={`rounded-full border px-3 py-1.5 text-xs transition ${commandCategory === category
                    ? "border-emerald-400/25 bg-emerald-400/[0.09] text-emerald-200"
                    : "border-white/[0.07] bg-white/[0.018] text-white/35 hover:border-white/[0.14] hover:text-white/65"}`}
                >
                  {category}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-2 p-4 sm:grid-cols-2">
            {visibleCommands.map((command) => (
              <button
                key={command.id}
                type="button"
                disabled={!canConnect || Boolean(activeCommand)}
                onClick={() => "action" in command && command.action
                  ? setPendingAction(command)
                  : void runCommand(command.id, command.label)}
                className={`group flex min-h-20 items-center gap-3 rounded-lg border p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-45 ${"action" in command && command.action
                  ? "border-amber-400/[0.12] bg-amber-400/[0.025] hover:border-amber-400/25 hover:bg-amber-400/[0.055]"
                  : "border-white/[0.07] bg-white/[0.018] hover:border-white/[0.13] hover:bg-white/[0.035]"}`}
              >
                <span className={`grid size-10 shrink-0 place-items-center rounded-lg border bg-white/[0.025] transition ${"action" in command && command.action
                  ? "border-amber-400/[0.12] text-amber-200/65 group-hover:text-amber-200"
                  : "border-white/[0.07] text-white/45 group-hover:border-emerald-400/15 group-hover:text-emerald-300"}`}
                >
                  {activeCommand === command.id ? <Loader2 className="size-4 animate-spin" /> : <command.icon className="size-4" />}
                </span>
                <span>
                  <span className="block text-sm font-medium text-white/80">{command.label}</span>
                  <span className="mt-1 block text-xs text-white/30">{command.description}</span>
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="c3-surface min-w-0 rounded-xl bg-[#0b0d0c]">
          <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4">
            <div>
              <h3 className="text-sm font-semibold text-white">Resultado</h3>
              <p className="mt-0.5 text-xs text-white/30">{commandTitle || "Selecione um comando"}</p>
            </div>
            <Gauge className="size-4 text-emerald-300/55" />
          </div>
          <div className="min-h-[28rem] p-5">
            {activeCommand ? (
              <div className="flex min-h-64 flex-col items-center justify-center text-center">
                <Loader2 className="mb-3 size-6 animate-spin text-emerald-300" />
                <p className="text-sm text-white/55">Consultando {device.rbName}…</p>
                <p className="mt-1 text-xs text-white/25">Aguardando a resposta do RouterOS</p>
              </div>
            ) : commandError ? (
              <p className="rounded-xl border border-rose-400/15 bg-rose-400/[0.055] p-4 text-sm text-rose-200">{commandError}</p>
            ) : commandOutput ? (
              <DiagnosticResult
                commandId={commandResultId}
                title={commandTitle}
                output={commandOutput}
                durationMs={commandDurationMs}
              />
            ) : (
              <div className="flex min-h-64 flex-col items-center justify-center text-center">
                <TerminalSquare className="mb-3 size-7 text-white/15" />
                <p className="text-sm text-white/35">A saída aparecerá aqui</p>
                <p className="mt-1 max-w-64 text-xs leading-5 text-white/20">Escolha uma consulta ao lado para buscar informações sem abrir o terminal.</p>
              </div>
            )}
          </div>
        </div>
      </section>

      <AlertDialog open={Boolean(pendingAction)} onOpenChange={(open) => !open && setPendingAction(null)}>
        <AlertDialogContent className="border-white/[0.1] bg-[#111412] text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>{pendingAction?.label}</AlertDialogTitle>
            <AlertDialogDescription className="leading-6 text-white/45">
              {pendingAction?.id === "run-backup"
                ? "Isso executará agora a rotina backup_ftp cadastrada no MikroTik. O envio e a limpeza dos arquivos seguirão o script existente."
                : "Isso reiniciará a interface sstp-c3support. O acesso remoto pode ficar indisponível por alguns segundos enquanto a VPN reconecta."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-white/10 bg-transparent text-white/65 hover:bg-white/[0.05] hover:text-white">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingAction) void runCommand(pendingAction.id, pendingAction.label);
                setPendingAction(null);
              }}
              className="bg-amber-300 text-black hover:bg-amber-200"
            >
              Confirmar ação
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <section className="flex flex-col gap-3 rounded-2xl border border-white/[0.065] bg-white/[0.02] px-5 py-4 text-xs text-white/35 sm:flex-row sm:items-center sm:justify-between">
        <span>RouterOS {overview?.version ?? "—"} · {overview?.architecture ?? "arquitetura não informada"} · {overview?.cpu ?? "CPU não informada"}</span>
        <span>
          Cadastrado em {formatDate(device.createdAt)} · Último acesso {device.lastConnectionAt ? formatDate(device.lastConnectionAt) : "ainda não registrado"}
          {checkedAt ? ` · Diagnóstico às ${new Date(checkedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : ""}
        </span>
      </section>
    </div>
  );
}

function formatDate(value: string) {
  const normalized = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  return new Date(normalized).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function DiagnosticCard({
  icon: Icon,
  label,
  value,
  suffix = "",
  loading,
  muted = false,
}: {
  icon: typeof Cpu;
  label: string;
  value?: string;
  suffix?: string;
  loading: boolean;
  muted?: boolean;
}) {
  return (
    <div className="c3-surface rounded-xl p-5">
      <div className="mb-5 flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-[0.14em] text-white/30">{label}</span>
        <span className="grid size-9 place-items-center rounded-lg border border-white/[0.07] bg-white/[0.025] text-emerald-300/70"><Icon className="size-4" /></span>
      </div>
      {loading ? (
        <div className="h-7 w-28 animate-pulse rounded-lg bg-white/[0.07]" />
      ) : (
        <p className={`truncate text-xl font-semibold tracking-[-0.03em] ${muted ? "text-white/35" : "text-white"}`} title={value}>
          {value ?? "—"}{suffix}
        </p>
      )}
    </div>
  );
}
