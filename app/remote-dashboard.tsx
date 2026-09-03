"use client";

import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  Building2,
  Check,
  ChevronRight,
  CircleHelp,
  Clipboard,
  Database,
  Download,
  FileCode2,
  Gauge,
  KeyRound,
  LayoutDashboard,
  Loader2,
  LogOut,
  LockKeyhole,
  Network,
  Plus,
  RefreshCw,
  Router,
  Search,
  ServerCog,
  Settings,
  ShieldCheck,
  TerminalSquare,
  Users,
  Wifi,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { formatTaxId, onlyDigits } from "@/lib/tax-id";
import {
  RemoteTerminal,
  type RemoteSession,
} from "./remote-terminal";
import { RouterDetails } from "./router-details";

type View =
  | "overview"
  | "device"
  | "devices"
  | "companies"
  | "sessions"
  | "users"
  | "audit"
  | "settings"
  | "help";

export type Device = {
  id: number;
  companyId: number | null;
  rbName: string;
  clientName: string | null;
  companyLegalName: string | null;
  companyTaxId: string | null;
  companyHasContract: boolean | null;
  managementIp: string;
  sstpUser: string;
  sshUsername: string;
  status: string;
  createdAt: string;
  updatedAt?: string;
  lastConnectionAt?: string | null;
  hasPendingSshRotation?: boolean;
  pendingSshPasswordCreatedAt?: string | null;
};

export type Company = {
  id: number;
  legalName: string;
  tradeName: string;
  taxId: string;
  hasContract: boolean;
  createdAt: string;
};

type SessionHistory = {
  id: number;
  gatewaySessionId: string;
  deviceId: number | null;
  deviceName: string;
  clientName: string;
  managementIp: string;
  actorEmail: string;
  status: string;
  connectedAt: string | null;
  endedAt: string | null;
  endedReason: string | null;
  createdAt: string;
};

type DeviceStatus = {
  online: boolean;
  latencyMs: number | null;
  error: string | null;
};

type DeviceForm = {
  rbName: string;
  companyId: string;
  managementIp: string;
  sstpUser: string;
};

const emptyForm: DeviceForm = {
  rbName: "",
  companyId: "",
  managementIp: "",
  sstpUser: "",
};

type CompanyForm = {
  legalName: string;
  tradeName: string;
  taxId: string;
  hasContract: boolean;
};

const emptyCompanyForm: CompanyForm = {
  legalName: "",
  tradeName: "",
  taxId: "",
  hasContract: false,
};

const navItems: Array<{ id: View; label: string; icon: LucideIcon }> = [
  { id: "overview", label: "Visão geral", icon: LayoutDashboard },
  { id: "devices", label: "MikroTiks", icon: Router },
  { id: "companies", label: "Empresas", icon: Building2 },
  { id: "sessions", label: "Sessões", icon: Activity },
  { id: "users", label: "Usuários", icon: Users },
  { id: "audit", label: "Auditoria", icon: ShieldCheck },
];

const viewCopy: Record<View, { eyebrow: string; title: string; description: string }> = {
  overview: {
    eyebrow: "Central de acesso",
    title: "Visão geral",
    description: "Controle os MikroTiks que chegam pelo concentrador SSTP da C3.",
  },
  device: {
    eyebrow: "Equipamento",
    title: "Detalhes do MikroTik",
    description: "Diagnóstico, informações do RouterOS e acesso seguro ao terminal.",
  },
  devices: {
    eyebrow: "Inventário",
    title: "MikroTiks",
    description: "Cadastre o IP alcançável pela VPN e gere o script individual da RB.",
  },
  companies: {
    eyebrow: "Organização",
    title: "Empresas",
    description: "Cadastre a empresa antes de atribuir qualquer MikroTik.",
  },
  sessions: {
    eyebrow: "Acesso remoto",
    title: "Sessões",
    description: "As sessões SSH aparecerão aqui assim que o gateway estiver conectado.",
  },
  users: {
    eyebrow: "Controle de acesso",
    title: "Usuários",
    description: "Operadores autorizados a utilizar o C3 Protect Remote.",
  },
  audit: {
    eyebrow: "Rastreabilidade",
    title: "Auditoria",
    description: "Histórico das ações realizadas dentro da plataforma.",
  },
  settings: {
    eyebrow: "Infraestrutura",
    title: "Configurações",
    description: "Estado da ligação entre o sistema e o concentrador da C3.",
  },
  help: {
    eyebrow: "Documentação",
    title: "Ajuda",
    description: "Entenda o fluxo de cadastro e acesso remoto.",
  },
};

export function RemoteDashboard({
  operatorName,
  operatorEmail,
  operatorRole,
}: {
  operatorName: string;
  operatorEmail: string;
  operatorRole: "admin" | "operator" | "viewer";
}) {
  const [activeView, setActiveView] = useState<View>("overview");
  const [devices, setDevices] = useState<Device[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [sessions, setSessions] = useState<SessionHistory[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [deviceStatuses, setDeviceStatuses] = useState<Record<string, DeviceStatus>>({});
  const [statusLoading, setStatusLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [companyOpen, setCompanyOpen] = useState(false);
  const [accessDevice, setAccessDevice] = useState<Device | null>(null);
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [remoteSession, setRemoteSession] = useState<RemoteSession | null>(null);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [sessionError, setSessionError] = useState("");
  const [gatewayOnline, setGatewayOnline] = useState<boolean | null>(null);
  const firstName = operatorName.split(" ")[0];
  const canManage = operatorRole === "admin" || operatorRole === "operator";
  const canRemote = operatorRole === "admin" || operatorRole === "operator";

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.assign("/login");
  }

  async function loadDevices() {
    setLoading(true);
    setLoadError("");
    try {
      const response = await fetch("/api/devices", { cache: "no-store" });
      const data = (await response.json()) as {
        devices?: Device[];
        error?: string;
      };
      if (!response.ok) throw new Error(data.error ?? "Falha ao carregar");
      setDevices(data.devices ?? []);
    } catch {
      setLoadError("Não foi possível carregar os MikroTiks.");
    } finally {
      setLoading(false);
    }
  }

  async function loadCompanies() {
    const response = await fetch("/api/companies", { cache: "no-store" });
    const data = (await response.json()) as {
      companies?: Company[];
      error?: string;
    };
    if (!response.ok) throw new Error(data.error ?? "Falha ao carregar empresas");
    setCompanies(data.companies ?? []);
  }

  async function loadSessions() {
    setSessionsLoading(true);
    try {
      const response = await fetch("/api/remote/sessions", { cache: "no-store" });
      const data = (await response.json()) as {
        sessions?: SessionHistory[];
        error?: string;
      };
      if (!response.ok) throw new Error(data.error ?? "Falha ao carregar sessões");
      setSessions(data.sessions ?? []);
    } finally {
      setSessionsLoading(false);
    }
  }

  async function loadDeviceStatuses() {
    setStatusLoading(true);
    try {
      const response = await fetch("/api/remote/statuses", { cache: "no-store" });
      const data = (await response.json()) as {
        statuses?: Record<string, DeviceStatus>;
        error?: string;
      };
      if (!response.ok || !data.statuses) {
        throw new Error(data.error ?? "Falha ao verificar MikroTiks");
      }
      setDeviceStatuses(data.statuses);
    } finally {
      setStatusLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void Promise.all([loadDevices(), loadCompanies(), loadSessions()]).catch(() => {
        setLoadError("Não foi possível carregar os dados.");
      });
      void fetch("/api/remote/health", { cache: "no-store" })
        .then((response) => response.json())
        .then((data: { online?: boolean }) => setGatewayOnline(data.online === true))
        .catch(() => setGatewayOnline(false));
      void loadDeviceStatuses().catch(() => {});
    }, 0);
    const statusTimer = window.setInterval(() => {
      void loadDeviceStatuses().catch(() => {});
    }, 30_000);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(statusTimer);
    };
  }, []);

  async function startRemoteSession() {
    if (!accessDevice) return;
    setSessionLoading(true);
    setSessionError("");
    try {
      const response = await fetch("/api/remote/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ deviceId: accessDevice.id, cols: 120, rows: 32 }),
      });
      const data = (await response.json()) as Partial<RemoteSession> & {
        error?: string;
      };
      if (
        !response.ok ||
        !data.recordId ||
        !data.sessionId ||
        !data.token ||
        !data.websocketUrl ||
        !data.expiresAt
      ) {
        throw new Error(data.error ?? "Não foi possível iniciar a sessão.");
      }
      setRemoteSession(data as RemoteSession);
      void loadSessions();
    } catch (cause) {
      setSessionError(
        cause instanceof Error ? cause.message : "Não foi possível iniciar a sessão.",
      );
    } finally {
      setSessionLoading(false);
    }
  }

  async function updateRemoteSession(
    recordId: number,
    status: "connected" | "ended" | "failed",
    reason = "",
  ) {
    try {
      await fetch("/api/remote/sessions", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: recordId, status, reason }),
        keepalive: true,
      });
    } finally {
      void loadSessions();
    }
  }

  function closeRemoteAccess() {
    setAccessDevice(null);
    setRemoteSession(null);
    setSessionError("");
    setSessionLoading(false);
  }

  function openDevice(device: Device) {
    setSelectedDevice(device);
    setActiveView("device");
  }

  function updateDevice(updated: Device) {
    setDevices((current) =>
      current.map((device) =>
        device.id === updated.id ? { ...device, ...updated } : device,
      ),
    );
    setSelectedDevice((current) =>
      current?.id === updated.id ? { ...current, ...updated } : updated,
    );
  }

  function deleteDevice(id: number) {
    setDevices((current) => current.filter((device) => device.id !== id));
    setDeviceStatuses((current) => {
      const next = { ...current };
      delete next[String(id)];
      return next;
    });
    setSelectedDevice(null);
    setActiveView("overview");
  }

  const filteredDevices = useMemo(() => {
    const query = search.trim().toLowerCase();
    const matches = query
      ? devices.filter((device) =>
          [
            device.rbName,
            device.clientName ?? "",
            device.managementIp,
            device.sstpUser,
          ]
            .join(" ")
            .toLowerCase()
            .includes(query),
        )
      : [...devices];
    return matches.sort((first, second) => {
      const firstStatus = deviceStatuses[String(first.id)];
      const secondStatus = deviceStatuses[String(second.id)];
      const rank = (status?: DeviceStatus) =>
        status?.online === false ? 0 : status?.online === true ? 2 : 1;
      return rank(firstStatus) - rank(secondStatus) ||
        first.rbName.localeCompare(second.rbName, "pt-BR", { sensitivity: "base" });
    });
  }, [deviceStatuses, devices, search]);

  const activeSessionCount = sessions.filter((session) =>
    session.status === "pending" || session.status === "connected",
  ).length;

  const copy = viewCopy[activeView];

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon" className="border-r border-white/[0.075]">
        <SidebarHeader className="h-20 justify-center overflow-hidden border-b border-white/[0.075] bg-[#0b0d0c] px-3">
          <div className="relative h-14 w-[220px] shrink-0 overflow-hidden group-data-[collapsible=icon]:hidden">
            {/* O PNG oficial possui área transparente; o enquadramento preserva a arte e amplia a marca. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/c3-protect.png"
              alt="C3 Protect, powered by C3 Support"
              className="absolute -top-[27px] left-0 w-[225px] max-w-none"
            />
          </div>
          <div className="relative hidden size-10 shrink-0 overflow-hidden group-data-[collapsible=icon]:block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/c3-protect.png"
              alt="C3 Protect"
              className="absolute -left-[5px] -top-[18px] w-[118px] max-w-none"
            />
          </div>
        </SidebarHeader>

        <SidebarContent className="px-2 py-4">
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu className="gap-1.5">
                {navItems
                  .filter((item) => item.id !== "users" || operatorRole === "admin")
                  .map((item) => (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton
                      isActive={activeView === item.id}
                      tooltip={item.label}
                      onClick={() => setActiveView(item.id)}
                      className="h-10 rounded-lg border border-transparent text-white/50 hover:bg-white/[0.035] hover:text-white data-[active=true]:border-white/[0.07] data-[active=true]:bg-white/[0.055] data-[active=true]:text-[#55dca4] data-[active=true]:shadow-[inset_2px_0_0_#41d69a]"
                    >
                      <item.icon />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter className="border-t border-white/[0.07] p-2">
          <SidebarMenu>
            {operatorRole === "admin" && <SidebarMenuItem>
              <SidebarMenuButton
                isActive={activeView === "settings"}
                tooltip="Configurações"
                onClick={() => setActiveView("settings")}
                className="h-10 rounded-lg border border-transparent text-white/50 hover:bg-white/[0.035] hover:text-white data-[active=true]:border-white/[0.07] data-[active=true]:bg-white/[0.055] data-[active=true]:text-[#55dca4]"
              >
                <Settings />
                <span>Configurações</span>
              </SidebarMenuButton>
            </SidebarMenuItem>}
            <SidebarMenuItem>
              <SidebarMenuButton
                isActive={activeView === "help"}
                tooltip="Ajuda"
                onClick={() => setActiveView("help")}
                className="h-10 rounded-lg border border-transparent text-white/50 hover:bg-white/[0.035] hover:text-white data-[active=true]:border-white/[0.07] data-[active=true]:bg-white/[0.055] data-[active=true]:text-[#55dca4]"
              >
                <CircleHelp />
                <span>Ajuda</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                tooltip="Sair"
                onClick={() => void logout()}
                className="h-10 rounded-lg border border-transparent text-white/50 hover:bg-rose-400/[0.06] hover:text-rose-200"
              >
                <LogOut />
                <span>Sair</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset className="c3-workspace min-w-0">
        <header className="sticky top-0 z-20 flex h-20 items-center justify-between border-b border-white/[0.075] bg-[#080a09]/95 px-4 backdrop-blur-md sm:px-7">
          <div className="flex items-center gap-3">
            <SidebarTrigger className="text-white/60 hover:bg-white/[0.06] hover:text-white" />
            <div className="hidden h-5 w-px bg-white/10 sm:block" />
            <div>
              <p className="text-sm font-medium text-white">Olá, {firstName}</p>
              <p className="hidden text-xs text-white/30 sm:block">
                Suporte que conecta
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className={`hidden items-center gap-2 rounded-full border px-3 py-1.5 text-xs sm:flex ${gatewayOnline ? "border-emerald-400/15 bg-emerald-400/[0.06] text-emerald-300" : "border-amber-400/15 bg-amber-400/[0.06] text-amber-300"}`}>
              <span className={`size-1.5 rounded-full ${gatewayOnline ? "bg-emerald-400" : "bg-amber-400"}`} />
              {gatewayOnline === null
                ? "Verificando gateway"
                : gatewayOnline
                  ? "Gateway conectado"
                  : "Gateway indisponível"}
            </div>
            <div className="grid size-9 place-items-center rounded-full border border-white/10 bg-white/[0.05] text-xs font-semibold text-white/80">
              {firstName.slice(0, 2).toUpperCase()}
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1440px] px-4 py-7 sm:px-7 lg:py-9">
          <div className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#55dca4]/75">
                {copy.eyebrow}
              </p>
              <h1 className="text-2xl font-semibold tracking-[-0.035em] text-white sm:text-3xl">
                {copy.title}
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-white/40">
                {copy.description}
              </p>
              <div className="c3-title-accent mt-4 h-px w-10" />
            </div>
            {activeView === "companies" && canManage && (
              <AddCompanyDialog
                open={companyOpen}
                onOpenChange={setCompanyOpen}
                onCreated={(company) =>
                  setCompanies((current) => [company, ...current])
                }
              />
            )}
            {(activeView === "overview" || activeView === "devices") && canManage && (
              <AddDeviceDialog
                open={addOpen}
                onOpenChange={setAddOpen}
                companies={companies}
                onCompanyCreated={(company) =>
                  setCompanies((current) => [company, ...current])
                }
                onCreated={(device) => {
                  setDevices((current) => [device, ...current]);
                  window.setTimeout(() => void loadDeviceStatuses().catch(() => {}), 250);
                }}
              />
            )}
          </div>

          {activeView === "overview" && (
            <Overview
              devices={devices}
              displayedDevices={filteredDevices}
              companies={companies}
              search={search}
              onSearch={setSearch}
              loading={loading}
              error={loadError}
              onRetry={loadDevices}
              onRefreshStatuses={loadDeviceStatuses}
              onOpenDevices={() => setActiveView("devices")}
              onAccess={openDevice}
              gatewayOnline={gatewayOnline === true}
              activeSessionCount={activeSessionCount}
              statuses={deviceStatuses}
              statusLoading={statusLoading}
            />
          )}
          {activeView === "devices" && (
            <DevicesView
              devices={filteredDevices}
              total={devices.length}
              search={search}
              onSearch={setSearch}
              loading={loading}
              error={loadError}
              onRetry={loadDevices}
              onRefreshStatuses={loadDeviceStatuses}
              onAccess={openDevice}
              gatewayOnline={gatewayOnline === true}
              statuses={deviceStatuses}
              statusLoading={statusLoading}
            />
          )}
          {activeView === "companies" && (
            <CompaniesView companies={companies} devices={devices} />
          )}
          {activeView === "device" && selectedDevice && (
            <RouterDetails
              device={selectedDevice}
              companies={companies}
              status={deviceStatuses[String(selectedDevice.id)]}
              gatewayOnline={gatewayOnline === true}
              onBack={() => setActiveView("overview")}
              onOpenTerminal={() => setAccessDevice(selectedDevice)}
              canManage={canManage}
              canRemote={canRemote}
              onUpdated={updateDevice}
              onDeleted={deleteDevice}
            />
          )}
          {activeView === "sessions" && (
            <SessionsView
              sessions={sessions}
              loading={sessionsLoading}
              gatewayOnline={gatewayOnline === true}
              onRefresh={loadSessions}
            />
          )}
          {activeView === "users" && operatorRole === "admin" && (
            <UsersView currentEmail={operatorEmail} />
          )}
          {activeView === "audit" && <AuditView devices={devices} />}
          {activeView === "settings" && <SettingsView gatewayOnline={gatewayOnline === true} />}
          {activeView === "help" && <HelpView />}
        </main>
      </SidebarInset>

      <Dialog
        open={Boolean(accessDevice)}
        onOpenChange={(open) => !open && closeRemoteAccess()}
      >
        <DialogContent className={`border-white/10 bg-[#101412] text-white ${remoteSession ? "sm:max-w-6xl" : "sm:max-w-lg"}`}>
          <DialogHeader>
            <DialogTitle>Acesso a {accessDevice?.rbName}</DialogTitle>
            <DialogDescription className="text-white/45">
              {remoteSession
                ? `${accessDevice?.clientName ?? "Cliente"} · ${accessDevice?.managementIp}`
                : "Abra uma sessão SSH protegida pelo Gateway C3 Remote."}
            </DialogDescription>
          </DialogHeader>
          {remoteSession ? (
            <RemoteTerminal
              session={remoteSession}
              onConnected={() =>
                void updateRemoteSession(remoteSession.recordId, "connected")
              }
              onEnded={(reason, failed) =>
                void updateRemoteSession(
                  remoteSession.recordId,
                  failed ? "failed" : "ended",
                  reason,
                )
              }
            />
          ) : (
            <>
              <div className="grid gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4 text-sm">
                <InfoRow label="IP via SSTP" value={accessDevice?.managementIp ?? ""} />
                <InfoRow label="Porta SSH" value="22333" />
                <InfoRow label="Usuário" value={accessDevice?.sshUsername ?? ""} />
                <InfoRow label="Limite da sessão" value="2 horas" />
              </div>
              {sessionError && (
                <p className="rounded-xl border border-rose-400/15 bg-rose-400/[0.06] px-4 py-3 text-sm text-rose-300">
                  {sessionError}
                </p>
              )}
              <DialogFooter>
                <Button
                  onClick={startRemoteSession}
                  disabled={sessionLoading || gatewayOnline !== true}
                  className="bg-emerald-400 text-[#06100d] hover:bg-emerald-300"
                >
                  {sessionLoading ? <Loader2 className="animate-spin" /> : <TerminalSquare />}
                  {sessionLoading
                    ? "Criando sessão…"
                    : gatewayOnline
                      ? "Abrir terminal"
                      : "Gateway indisponível"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  );
}

function AddCompanyDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (company: Company) => void;
}) {
  const [form, setForm] = useState<CompanyForm>(emptyCompanyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function reset() {
    setForm(emptyCompanyForm);
    setError("");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = (await response.json()) as {
        company?: Company;
        error?: string;
      };
      if (!response.ok || !data.company) {
        throw new Error(data.error ?? "Falha ao cadastrar");
      }
      onCreated(data.company);
      onOpenChange(false);
      reset();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao cadastrar");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button className="c3-button-primary h-10 rounded-lg px-4">
          <Plus />
          Adicionar empresa
        </Button>
      </DialogTrigger>
      <DialogContent className="border-white/10 bg-[#101412] text-white sm:max-w-xl">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Cadastrar empresa</DialogTitle>
            <DialogDescription className="text-white/45">
              O cadastro da empresa é obrigatório antes de adicionar uma RB.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-5">
            <FormField
              label="Razão social"
              placeholder="Ex.: Empresa Cliente LTDA"
              value={form.legalName}
              onChange={(value) => setForm({ ...form, legalName: value })}
            />
            <FormField
              label="Nome fantasia"
              placeholder="Ex.: Empresa Cliente"
              value={form.tradeName}
              onChange={(value) => setForm({ ...form, tradeName: value })}
            />
            <FormField
              label="CNPJ ou CPF"
              placeholder="00.000.000/0000-00"
              value={form.taxId}
              onChange={(value) =>
                setForm({
                  ...form,
                  taxId: formatTaxId(onlyDigits(value).slice(0, 14)),
                })
              }
            />
            <label className="flex items-center justify-between rounded-xl border border-white/[0.08] bg-white/[0.025] p-4">
              <span>
                <span className="block text-sm font-medium text-white/75">
                  Possui contrato
                </span>
                <span className="mt-1 block text-xs text-white/35">
                  Identifica clientes com contrato ativo com a C3.
                </span>
              </span>
              <Switch
                checked={form.hasContract}
                onCheckedChange={(checked) =>
                  setForm({ ...form, hasContract: checked })
                }
                aria-label="Possui contrato"
              />
            </label>
          </div>
          {error && (
            <p className="mb-4 rounded-xl border border-rose-400/15 bg-rose-400/[0.06] px-4 py-3 text-sm text-rose-300">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              type="submit"
              disabled={submitting}
              className="bg-emerald-400 text-[#06100d] hover:bg-emerald-300"
            >
              {submitting ? <Loader2 className="animate-spin" /> : <Building2 />}
              Cadastrar empresa
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AddDeviceDialog({
  open,
  onOpenChange,
  companies,
  onCompanyCreated,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companies: Company[];
  onCompanyCreated: (company: Company) => void;
  onCreated: (device: Device) => void;
}) {
  const [form, setForm] = useState<DeviceForm>(emptyForm);
  const [creatingCompany, setCreatingCompany] = useState(false);
  const [companyForm, setCompanyForm] = useState<CompanyForm>(emptyCompanyForm);
  const [companySubmitting, setCompanySubmitting] = useState(false);
  const [companyError, setCompanyError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [script, setScript] = useState("");
  const [copied, setCopied] = useState(false);

  function reset() {
    setForm(emptyForm);
    setError("");
    setScript("");
    setCopied(false);
    setCreatingCompany(false);
    setCompanyForm(emptyCompanyForm);
    setCompanyError("");
  }

  async function createCompany() {
    setCompanySubmitting(true);
    setCompanyError("");
    try {
      const response = await fetch("/api/companies", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(companyForm),
      });
      const data = (await response.json()) as { company?: Company; error?: string };
      if (!response.ok || !data.company) {
        throw new Error(data.error ?? "Não foi possível cadastrar a empresa.");
      }
      onCompanyCreated(data.company);
      setForm((current) => ({ ...current, companyId: String(data.company?.id ?? "") }));
      setCreatingCompany(false);
      setCompanyForm(emptyCompanyForm);
    } catch (cause) {
      setCompanyError(cause instanceof Error ? cause.message : "Falha ao cadastrar empresa");
    } finally {
      setCompanySubmitting(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/devices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = (await response.json()) as {
        device?: Device;
        script?: string;
        error?: string;
      };
      if (!response.ok || !data.device || !data.script) {
        throw new Error(data.error ?? "Falha ao cadastrar");
      }
      onCreated(data.device);
      setScript(data.script);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao cadastrar");
    } finally {
      setSubmitting(false);
    }
  }

  async function copyScript() {
    await navigator.clipboard.writeText(script);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  function downloadScript() {
    const blob = new Blob([script], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${form.rbName || "mikrotik"}-c3-remote.rsc`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button className="c3-button-primary h-10 rounded-lg px-4">
          <Plus />
          Adicionar MikroTik
        </Button>
      </DialogTrigger>
      <DialogContent className="border-white/10 bg-[#101412] text-white sm:max-w-2xl">
        {!script ? (
          <form onSubmit={submit}>
            <DialogHeader>
              <DialogTitle>Cadastrar MikroTik</DialogTitle>
              <DialogDescription className="text-white/45">
                Informe os dados que já existem no concentrador SSTP.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-5 sm:grid-cols-2">
              <FormField
                label="Nome da RB"
                placeholder="Ex.: RB-CLIENTE-MATRIZ"
                value={form.rbName}
                onChange={(value) => setForm({ ...form, rbName: value })}
              />
              <label className="grid gap-2 text-sm text-white/70">
                Empresa
                <Select
                  required
                  value={form.companyId}
                  onValueChange={(value) => {
                    if (value === "__new_company__") {
                      setCreatingCompany(true);
                      setForm({ ...form, companyId: "" });
                      return;
                    }
                    setCreatingCompany(false);
                    setForm({ ...form, companyId: value });
                  }}
                >
                  <SelectTrigger className="w-full border-white/10 bg-white/[0.04] text-white">
                    <SelectValue placeholder="Selecione uma empresa" />
                  </SelectTrigger>
                  <SelectContent className="border-white/10 bg-[#101412] text-white">
                    {companies.map((company) => (
                      <SelectItem key={company.id} value={String(company.id)}>
                        {company.tradeName}
                      </SelectItem>
                    ))}
                    <SelectItem value="__new_company__" className="text-emerald-300">
                      + Cadastrar nova empresa
                    </SelectItem>
                  </SelectContent>
                </Select>
              </label>
              {creatingCompany && (
                <div className="grid gap-4 rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.035] p-4 sm:col-span-2 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <p className="text-sm font-medium text-white/80">Nova empresa</p>
                    <p className="mt-1 text-xs text-white/35">Cadastre sem sair da inclusão do MikroTik.</p>
                  </div>
                  <FormField
                    label="Razão social"
                    placeholder="Ex.: Empresa Cliente LTDA"
                    value={companyForm.legalName}
                    onChange={(value) => setCompanyForm({ ...companyForm, legalName: value })}
                  />
                  <FormField
                    label="Nome fantasia"
                    placeholder="Ex.: Empresa Cliente"
                    value={companyForm.tradeName}
                    onChange={(value) => setCompanyForm({ ...companyForm, tradeName: value })}
                  />
                  <FormField
                    label="CNPJ ou CPF"
                    placeholder="00.000.000/0000-00"
                    value={companyForm.taxId}
                    onChange={(value) => setCompanyForm({
                      ...companyForm,
                      taxId: formatTaxId(onlyDigits(value).slice(0, 14)),
                    })}
                  />
                  <label className="flex items-center justify-between rounded-xl border border-white/[0.08] bg-black/10 px-4 py-3">
                    <span className="text-sm text-white/70">Possui contrato</span>
                    <Switch
                      checked={companyForm.hasContract}
                      onCheckedChange={(checked) =>
                        setCompanyForm({ ...companyForm, hasContract: checked })
                      }
                      aria-label="Nova empresa possui contrato"
                    />
                  </label>
                  {companyError && (
                    <p className="text-sm text-rose-300 sm:col-span-2">{companyError}</p>
                  )}
                  <div className="flex justify-end sm:col-span-2">
                    <Button
                      type="button"
                      onClick={createCompany}
                      disabled={companySubmitting}
                      className="bg-emerald-400 text-[#06100d] hover:bg-emerald-300"
                    >
                      {companySubmitting ? <Loader2 className="animate-spin" /> : <Building2 />}
                      Salvar empresa e continuar
                    </Button>
                  </div>
                </div>
              )}
              <FormField
                label="IP via SSTP"
                placeholder="Ex.: 172.18.18.25"
                value={form.managementIp}
                onChange={(value) => setForm({ ...form, managementIp: value })}
              />
              <FormField
                label="Usuário SSTP"
                placeholder="Ex.: empresa"
                value={form.sstpUser}
                onChange={(value) => setForm({ ...form, sstpUser: value })}
              />
            </div>
            {error && (
              <p className="mb-4 rounded-xl border border-rose-400/15 bg-rose-400/[0.06] px-4 py-3 text-sm text-rose-300">
                {error}
              </p>
            )}
            <div className="mb-5 flex items-start gap-3 rounded-xl border border-emerald-400/15 bg-emerald-400/[0.045] p-4">
              <KeyRound className="mt-0.5 size-4 shrink-0 text-emerald-300" />
              <p className="text-sm leading-6 text-white/50">
                O sistema criará o usuário <strong className="text-white/75">c3.remote</strong> com
                uma senha exclusiva, armazenada cifrada.
              </p>
            </div>
            <DialogFooter>
              <Button
                type="submit"
                disabled={submitting}
                className="bg-emerald-400 text-[#06100d] hover:bg-emerald-300"
              >
                {submitting ? <Loader2 className="animate-spin" /> : <FileCode2 />}
                Cadastrar e gerar script
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Script gerado com sucesso</DialogTitle>
              <DialogDescription className="text-white/45">
                Cole no terminal do RouterOS ou baixe o arquivo .rsc. A senha
                exclusiva já está incluída.
              </DialogDescription>
            </DialogHeader>
            <pre className="max-h-[52vh] overflow-auto rounded-xl border border-white/[0.08] bg-[#070908] p-4 text-xs leading-5 text-emerald-100/75">
              <code>{script}</code>
            </pre>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={downloadScript}
                className="border-white/10 bg-transparent text-white hover:bg-white/[0.06] hover:text-white"
              >
                <Download />
                Baixar .rsc
              </Button>
              <Button
                onClick={copyScript}
                className="bg-emerald-400 text-[#06100d] hover:bg-emerald-300"
              >
                {copied ? <Check /> : <Clipboard />}
                {copied ? "Copiado" : "Copiar script"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Overview({
  devices,
  displayedDevices,
  companies,
  search,
  onSearch,
  loading,
  error,
  onRetry,
  onRefreshStatuses,
  onOpenDevices,
  onAccess,
  gatewayOnline,
  activeSessionCount,
  statuses,
  statusLoading,
}: {
  devices: Device[];
  displayedDevices: Device[];
  companies: Company[];
  search: string;
  onSearch: (value: string) => void;
  loading: boolean;
  error: string;
  onRetry: () => void;
  onRefreshStatuses: () => void;
  onOpenDevices: () => void;
  onAccess: (device: Device) => void;
  gatewayOnline: boolean;
  activeSessionCount: number;
  statuses: Record<string, DeviceStatus>;
  statusLoading: boolean;
}) {
  const onlineCount = devices.filter((device) => statuses[String(device.id)]?.online).length;
  const offlineCount = devices.filter((device) => statuses[String(device.id)]?.online === false).length;
  return (
    <>
      <section className="mb-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="MikroTiks cadastrados" value={String(devices.length)} detail={`${onlineCount} online · ${offlineCount} offline`} icon={Router} accent={offlineCount === 0} />
        <MetricCard label="Empresas" value={String(companies.length)} detail="cadastradas na plataforma" icon={Building2} />
        <MetricCard label="Sessões ativas" value={String(activeSessionCount)} detail={activeSessionCount === 1 ? "1 conexão em andamento" : `${activeSessionCount} conexões em andamento`} icon={TerminalSquare} accent={activeSessionCount > 0} />
        <MetricCard label="Gateway" value={gatewayOnline ? "Online" : "Offline"} detail="WireGuard com concentrador" icon={Gauge} accent={gatewayOnline} />
      </section>
      <Panel>
        <div className="flex flex-col gap-4 border-b border-white/[0.07] p-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-base font-semibold text-white">MikroTiks monitorados</h2>
            <p className="mt-1 text-sm text-white/35">Offline primeiro; os demais em ordem alfabética.</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative w-full sm:w-80">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/25" />
              <Input
                value={search}
                onChange={(event) => onSearch(event.target.value)}
                placeholder="Pesquisar por RB ou empresa..."
                aria-label="Pesquisar MikroTik por nome ou empresa"
                className="h-10 rounded-lg border-white/[0.08] bg-[#0b0e0c] pl-9 text-white placeholder:text-white/25"
              />
            </div>
            <Button size="icon" variant="outline" onClick={onRefreshStatuses} disabled={statusLoading} aria-label="Atualizar status" className="border-white/10 bg-transparent text-white hover:bg-white/[0.06] hover:text-white">
              <RefreshCw className={statusLoading ? "animate-spin" : ""} />
            </Button>
            <Button variant="outline" onClick={onOpenDevices} className="border-white/10 bg-transparent text-white hover:bg-white/[0.06] hover:text-white">
              Ver todos <ChevronRight />
            </Button>
          </div>
        </div>
        <DeviceRows
          devices={search ? displayedDevices : displayedDevices.slice(0, 10)}
          loading={loading}
          error={error}
          onRetry={onRetry}
          compact
          onAccess={onAccess}
          gatewayOnline={gatewayOnline}
          statuses={statuses}
          statusLoading={statusLoading}
        />
      </Panel>
    </>
  );
}

function DevicesView({
  devices,
  total,
  search,
  onSearch,
  loading,
  error,
  onRetry,
  onRefreshStatuses,
  onAccess,
  gatewayOnline,
  statuses,
  statusLoading,
}: {
  devices: Device[];
  total: number;
  search: string;
  onSearch: (value: string) => void;
  loading: boolean;
  error: string;
  onRetry: () => void;
  onRefreshStatuses: () => void;
  onAccess: (device: Device) => void;
  gatewayOnline: boolean;
  statuses: Record<string, DeviceStatus>;
  statusLoading: boolean;
}) {
  return (
    <Panel>
      <div className="flex flex-col gap-4 border-b border-white/[0.07] p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-white">Inventário</h2>
          <p className="mt-1 text-sm text-white/35">{total} MikroTiks cadastrados</p>
        </div>
        <div className="flex gap-2">
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/25" />
            <Input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Buscar RB, cliente ou IP..." aria-label="Buscar MikroTik" className="h-10 rounded-lg border-white/[0.08] bg-[#0b0e0c] pl-9 text-white placeholder:text-white/25" />
          </div>
          <Button size="icon" variant="outline" onClick={() => { onRetry(); onRefreshStatuses(); }} disabled={statusLoading} aria-label="Atualizar lista e status" className="border-white/10 bg-transparent text-white hover:bg-white/[0.06] hover:text-white">
            <RefreshCw className={statusLoading ? "animate-spin" : ""} />
          </Button>
        </div>
      </div>
      <DeviceRows devices={devices} loading={loading} error={error} onRetry={onRetry} onAccess={onAccess} gatewayOnline={gatewayOnline} statuses={statuses} statusLoading={statusLoading} />
    </Panel>
  );
}

function DeviceRows({
  devices,
  loading,
  error,
  onRetry,
  onAccess,
  compact = false,
  gatewayOnline = false,
  statuses = {},
  statusLoading = false,
}: {
  devices: Device[];
  loading: boolean;
  error: string;
  onRetry: () => void;
  onAccess?: (device: Device) => void;
  compact?: boolean;
  gatewayOnline?: boolean;
  statuses?: Record<string, DeviceStatus>;
  statusLoading?: boolean;
}) {
  if (loading) return <StatePanel icon={Loader2} title="Carregando MikroTiks" description="Buscando o inventário seguro..." spinning />;
  if (error) return <StatePanel icon={RefreshCw} title="Falha ao carregar" description={error} action="Tentar novamente" onAction={onRetry} />;
  if (!devices.length) return <StatePanel icon={Router} title="Nenhum MikroTik cadastrado" description="Use “Adicionar MikroTik” para gerar o primeiro script." />;

  return (
    <Table>
      <TableHeader>
        <TableRow className="border-white/[0.07] hover:bg-transparent">
          <TableHead className="h-12 pl-5 text-xs text-white/35">RB / Cliente</TableHead>
          <TableHead className="hidden text-xs text-white/35 md:table-cell">IP via SSTP</TableHead>
          <TableHead className="hidden text-xs text-white/35 lg:table-cell">Usuário SSTP</TableHead>
          <TableHead className="text-xs text-white/35">Estado</TableHead>
          {onAccess && <TableHead className="pr-5 text-right text-xs text-white/35">{compact ? "Acesso rápido" : "Acesso"}</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {devices.map((device) => {
          const status = statuses[String(device.id)];
          return (
          <TableRow key={device.id} className={status?.online === false ? "group border-rose-400/[0.09] bg-rose-400/[0.018] hover:bg-rose-400/[0.035]" : "group border-white/[0.055] hover:bg-white/[0.025]"}>
            <TableCell className="py-4 pl-5">
              <div className="flex items-center gap-3">
                <div className={`grid size-9 shrink-0 place-items-center rounded-lg border transition ${status?.online === true ? "border-emerald-400/15 bg-emerald-400/[0.065] text-emerald-300" : status?.online === false ? "border-rose-400/15 bg-rose-400/[0.06] text-rose-300" : "border-white/[0.08] bg-white/[0.025] text-white/45"}`}><Network className="size-4" /></div>
                <div><p className="text-sm font-medium text-white/90">{device.rbName}</p><p className="mt-0.5 text-xs text-white/35">{device.clientName}</p></div>
              </div>
            </TableCell>
            <TableCell className="hidden py-4 font-mono text-sm text-white/60 md:table-cell">{device.managementIp}</TableCell>
            <TableCell className="hidden py-4 text-sm text-white/55 lg:table-cell">{device.sstpUser}</TableCell>
            <TableCell className="py-4">
              {status ? (
                <Badge variant="outline" className={status.online ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-300" : "border-rose-400/20 bg-rose-400/10 text-rose-300"}>
                  <span className={`size-1.5 rounded-full ${status.online ? "bg-emerald-400" : "bg-rose-400"}`} />
                  {status.online ? `Online${status.latencyMs ? ` · ${status.latencyMs}ms` : ""}` : "Offline"}
                </Badge>
              ) : (
                <Badge variant="outline" className="border-amber-400/20 bg-amber-400/[0.07] text-amber-300">
                  <span className={`size-1.5 rounded-full bg-amber-300 ${statusLoading ? "animate-pulse" : ""}`} />
                  {statusLoading ? "Verificando" : gatewayOnline ? "Não verificado" : "Gateway offline"}
                </Badge>
              )}
            </TableCell>
            {onAccess && (
              <TableCell className="py-4 pr-5 text-right">
                <Button size="sm" onClick={() => onAccess(device)} className="rounded-lg border border-white/[0.09] bg-white/[0.045] text-white/75 hover:border-emerald-400/25 hover:bg-emerald-400/[0.09] hover:text-emerald-200">
                  <Router className="size-3.5" /> Abrir painel
                </Button>
              </TableCell>
            )}
          </TableRow>
        )})}
      </TableBody>
    </Table>
  );
}

function CompaniesView({
  companies,
  devices,
}: {
  companies: Company[];
  devices: Device[];
}) {
  if (!companies.length) return <StatePanel icon={Building2} title="Nenhuma empresa cadastrada" description="Cadastre a primeira empresa para liberar a inclusão de MikroTiks." />;
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {companies.map((company) => {
        const companyDevices = devices.filter(
          (device) => device.companyId === company.id,
        );
        return (
        <Panel key={company.id}>
          <div className="p-5">
            <div className="mb-5 flex items-start justify-between">
              <div className="grid size-10 place-items-center rounded-xl bg-emerald-400/10 text-emerald-300"><Building2 className="size-5" /></div>
              <Badge
                variant="outline"
                className={
                  company.hasContract
                    ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-300"
                    : "border-white/10 text-white/45"
                }
              >
                {company.hasContract ? "Com contrato" : "Sem contrato"}
              </Badge>
            </div>
            <h2 className="font-semibold text-white">{company.tradeName}</h2>
            <p className="mt-1 text-sm text-white/35">{company.legalName}</p>
            <p className="mt-2 font-mono text-xs text-white/30">
              {formatTaxId(company.taxId)}
            </p>
            <div className="mt-4 grid gap-2">
              {companyDevices.length ? (
                companyDevices.map((device) => <div key={device.id} className="flex items-center justify-between rounded-lg bg-white/[0.025] px-3 py-2 text-sm"><span className="text-white/60">{device.rbName}</span><span className="font-mono text-xs text-white/30">{device.managementIp}</span></div>)
              ) : (
                <div className="rounded-lg border border-dashed border-white/[0.08] px-3 py-3 text-center text-xs text-white/25">
                  Nenhum MikroTik atribuído
                </div>
              )}
            </div>
          </div>
        </Panel>
      )})}
    </div>
  );
}

function sessionStatus(session: SessionHistory) {
  if (session.status === "connected") return { label: "Conectada", active: true, failed: false };
  if (session.status === "pending") return { label: "Conectando", active: true, failed: false };
  if (session.status === "failed") return { label: "Falhou", active: false, failed: true };
  return { label: "Encerrada", active: false, failed: false };
}

function sessionDuration(session: SessionHistory) {
  if (!session.endedAt) return "Em andamento";
  const start = new Date(session.connectedAt ?? session.createdAt).getTime();
  const end = new Date(session.endedAt).getTime();
  const seconds = Math.max(0, Math.floor((end - start) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}min`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}min`;
}

function SessionsView({
  sessions,
  loading,
  gatewayOnline,
  onRefresh,
}: {
  sessions: SessionHistory[];
  loading: boolean;
  gatewayOnline: boolean;
  onRefresh: () => void;
}) {
  if (loading) {
    return <StatePanel icon={Loader2} title="Carregando sessões" description="Buscando o histórico de acessos SSH..." spinning />;
  }
  if (!sessions.length) {
    return <StatePanel icon={TerminalSquare} title="Nenhuma sessão registrada" description={gatewayOnline ? "Abra um MikroTik no inventário para iniciar o primeiro acesso." : "O Gateway está indisponível no momento."} />;
  }
  return (
    <Panel>
      <div className="flex items-center justify-between border-b border-white/[0.07] p-5">
        <div>
          <h2 className="font-semibold text-white">Histórico de sessões</h2>
          <p className="mt-1 text-sm text-white/35">Últimos 100 acessos realizados pelo painel.</p>
        </div>
        <Button size="icon" variant="outline" onClick={onRefresh} aria-label="Atualizar sessões" className="border-white/10 bg-transparent text-white hover:bg-white/[0.06] hover:text-white">
          <RefreshCw />
        </Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow className="border-white/[0.07] hover:bg-transparent">
            <TableHead className="pl-5 text-xs text-white/35">MikroTik</TableHead>
            <TableHead className="hidden text-xs text-white/35 md:table-cell">Operador</TableHead>
            <TableHead className="hidden text-xs text-white/35 lg:table-cell">Início</TableHead>
            <TableHead className="text-xs text-white/35">Duração</TableHead>
            <TableHead className="pr-5 text-right text-xs text-white/35">Estado</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sessions.map((session) => {
            const status = sessionStatus(session);
            return (
              <TableRow key={session.id} className="border-white/[0.055] hover:bg-white/[0.025]">
                <TableCell className="py-4 pl-5">
                  <p className="text-sm font-medium text-white/85">{session.deviceName}</p>
                  <p className="mt-1 text-xs text-white/35">{session.clientName} · {session.managementIp}</p>
                </TableCell>
                <TableCell className="hidden py-4 text-sm text-white/55 md:table-cell">{session.actorEmail}</TableCell>
                <TableCell className="hidden py-4 text-sm text-white/55 lg:table-cell">{new Date(session.createdAt).toLocaleString("pt-BR")}</TableCell>
                <TableCell className="py-4 font-mono text-xs text-white/55">{sessionDuration(session)}</TableCell>
                <TableCell className="py-4 pr-5 text-right">
                  <div className="flex flex-col items-end gap-1.5">
                    <Badge variant="outline" className={status.active ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-300" : status.failed ? "border-rose-400/20 bg-rose-400/10 text-rose-300" : "border-white/10 bg-white/[0.035] text-white/45"}>
                      <span className={`size-1.5 rounded-full ${status.active ? "bg-emerald-400" : status.failed ? "bg-rose-400" : "bg-white/35"}`} />
                      {status.label}
                    </Badge>
                    {session.endedReason && (
                      <span className="max-w-48 truncate text-xs text-white/25" title={session.endedReason}>{session.endedReason}</span>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Panel>
  );
}

type AppUserRecord = {
  id: number;
  name: string;
  email: string;
  role: "admin" | "operator" | "viewer";
  active: boolean;
  lastLoginAt: string | null;
  createdAt: string;
};

const roleLabels = {
  admin: "Administrador",
  operator: "Operador",
  viewer: "Somente leitura",
};

function UsersView({ currentEmail }: { currentEmail: string }) {
  const [users, setUsers] = useState<AppUserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "operator" | "viewer">("operator");

  async function loadUsers() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/users", { cache: "no-store" });
      const data = (await response.json()) as { users?: AppUserRecord[]; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Falha ao carregar usuários.");
      setUsers(data.users ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao carregar usuários.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void loadUsers(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function createUser(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, email, password, role }),
      });
      const data = (await response.json()) as { user?: AppUserRecord; error?: string };
      if (!response.ok || !data.user) throw new Error(data.error ?? "Falha ao criar usuário.");
      setUsers((current) => [...current, data.user!].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")));
      setName(""); setEmail(""); setPassword(""); setRole("operator"); setOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao criar usuário.");
    } finally {
      setSubmitting(false);
    }
  }

  async function updateUser(id: number, changes: { role?: string; active?: boolean }) {
    setError("");
    const response = await fetch("/api/users", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, ...changes }),
    });
    const data = (await response.json()) as { user?: AppUserRecord; error?: string };
    if (!response.ok || !data.user) {
      setError(data.error ?? "Não foi possível atualizar o usuário.");
      return;
    }
    setUsers((current) => current.map((user) => user.id === id ? data.user! : user));
  }

  return (
    <div className="grid gap-5">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button className="c3-button-primary"><Plus /> Novo usuário</Button></DialogTrigger>
          <DialogContent className="border-white/10 bg-[#101412] text-white sm:max-w-lg">
            <form onSubmit={createUser}>
              <DialogHeader>
                <DialogTitle>Criar usuário</DialogTitle>
                <DialogDescription className="text-white/45">Defina a credencial e o nível de acesso ao C3 Protect Remote.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-5">
                <Input required minLength={2} maxLength={100} value={name} onChange={(event) => setName(event.target.value)} placeholder="Nome completo" className="border-white/10 bg-white/[0.04] text-white" />
                <Input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="email@c3support.com.br" className="border-white/10 bg-white/[0.04] text-white" />
                <Input required type="password" minLength={12} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Senha inicial (mínimo 12 caracteres)" className="border-white/10 bg-white/[0.04] text-white" />
                <Select value={role} onValueChange={(value) => setRole(value as typeof role)}>
                  <SelectTrigger className="w-full border-white/10 bg-white/[0.04] text-white"><SelectValue /></SelectTrigger>
                  <SelectContent className="border-white/10 bg-[#101412] text-white">
                    <SelectItem value="admin">Administrador</SelectItem>
                    <SelectItem value="operator">Operador</SelectItem>
                    <SelectItem value="viewer">Somente leitura</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {error && <p className="mb-4 text-sm text-rose-300">{error}</p>}
              <DialogFooter><Button type="submit" disabled={submitting} className="c3-button-primary">{submitting ? <Loader2 className="animate-spin" /> : <Plus />} Criar usuário</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      {error && !open && <p className="rounded-xl border border-rose-400/15 bg-rose-400/[0.05] p-4 text-sm text-rose-200">{error}</p>}
      <Panel>
        {loading ? (
          <div className="grid min-h-40 place-items-center text-white/40"><Loader2 className="animate-spin" /></div>
        ) : (
          <Table>
            <TableHeader><TableRow className="border-white/[0.06]"><TableHead className="pl-5">Usuário</TableHead><TableHead>Perfil</TableHead><TableHead className="hidden md:table-cell">Último acesso</TableHead><TableHead className="pr-5 text-right">Ativo</TableHead></TableRow></TableHeader>
            <TableBody>{users.map((user) => (
              <TableRow key={user.id} className="border-white/[0.055] hover:bg-white/[0.025]">
                <TableCell className="py-4 pl-5"><p className="font-medium text-white/85">{user.name}{user.email === currentEmail ? " · você" : ""}</p><p className="mt-1 text-xs text-white/35">{user.email}</p></TableCell>
                <TableCell>
                  <Select value={user.role} onValueChange={(value) => void updateUser(user.id, { role: value })} disabled={user.email === currentEmail}>
                    <SelectTrigger className="w-44 border-white/10 bg-white/[0.03] text-white"><SelectValue /></SelectTrigger>
                    <SelectContent className="border-white/10 bg-[#101412] text-white">{Object.entries(roleLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="hidden text-sm text-white/40 md:table-cell">{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString("pt-BR") : "Nunca"}</TableCell>
                <TableCell className="pr-5 text-right"><Switch checked={user.active} disabled={user.email === currentEmail} onCheckedChange={(active) => void updateUser(user.id, { active })} /></TableCell>
              </TableRow>
            ))}</TableBody>
          </Table>
        )}
      </Panel>
    </div>
  );
}

function AuditView({ devices }: { devices: Device[] }) {
  if (!devices.length) return <StatePanel icon={ShieldCheck} title="Nenhum evento registrado" description="Os cadastros e acessos serão registrados aqui." />;
  return (
    <Panel>
      <div className="divide-y divide-white/[0.06]">
        {devices.map((device) => (
          <div key={device.id} className="flex items-start gap-3 p-5">
            <div className="mt-0.5 grid size-8 place-items-center rounded-lg bg-emerald-400/10 text-emerald-300"><Plus className="size-4" /></div>
            <div><p className="text-sm text-white/75">MikroTik <strong className="text-white">{device.rbName}</strong> cadastrado</p><p className="mt-1 text-xs text-white/30">{device.clientName} · {new Date(device.createdAt).toLocaleString("pt-BR")}</p></div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function SettingsView({ gatewayOnline }: { gatewayOnline: boolean }) {
  const [copying, setCopying] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copyGatewayKey() {
    setCopying(true);
    try {
      const response = await fetch("/api/remote/setup-key", { cache: "no-store" });
      const data = (await response.json()) as { key?: string; error?: string };
      if (!response.ok || !data.key) throw new Error(data.error ?? "Falha");
      await navigator.clipboard.writeText(data.key);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } finally {
      setCopying(false);
    }
  }

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-2">
        <SettingsCard icon={ServerCog} title="Gateway C3 Remote" status={gatewayOnline ? "Online" : "Offline"} description="Serviço que executa SSH e publica as sessões para o painel." active={gatewayOnline} />
        <SettingsCard icon={Wifi} title="WireGuard com concentrador" status={gatewayOnline ? "Ativo" : "Indisponível"} description="VPN entre a VPS do sistema e o MikroTik concentrador." active={gatewayOnline} />
        <SettingsCard icon={Database} title="Banco de equipamentos" status="Ativo" description="Cadastros e credenciais cifradas persistidos na plataforma." active />
        <SettingsCard icon={LockKeyhole} title="Credenciais individuais" status="Ativo" description="Cada MikroTik recebe uma senha SSH exclusiva para o usuário c3.remote." active />
      </div>
      <Panel>
        <div className="mt-4 flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-medium text-white">Chave de integração</h2>
            <p className="mt-1 text-sm text-white/40">Copie a chave derivada para configurar GATEWAY_API_KEY no EasyPanel.</p>
          </div>
          <Button onClick={copyGatewayKey} disabled={copying} variant="outline" className="border-white/10 bg-transparent text-white hover:bg-white/[0.06] hover:text-white">
            {copying ? <Loader2 className="animate-spin" /> : copied ? <Check /> : <KeyRound />}
            {copied ? "Chave copiada" : "Copiar chave"}
          </Button>
        </div>
      </Panel>
    </>
  );
}

function HelpView() {
  const steps = [
    ["Cadastre a empresa", "Informe razão social, nome fantasia, CNPJ ou CPF e o status do contrato."],
    ["Cadastre a RB", "Selecione a empresa e informe nome, IP acessível pela SSTP e usuário SSTP."],
    ["Execute o script", "Cole o script completo no RouterOS. Ele mantém o padrão C3 e cria a credencial SSH individual."],
    ["Acesse com segurança", "Clique em Acessar para abrir o terminal SSH da RB diretamente no navegador."],
  ];
  return (
    <Panel>
      <div className="grid gap-0 divide-y divide-white/[0.06]">
        {steps.map(([title, description], index) => (
          <div key={title} className="flex gap-4 p-5">
            <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-emerald-400/10 text-sm font-semibold text-emerald-300">{index + 1}</div>
            <div><h2 className="font-medium text-white">{title}</h2><p className="mt-1 text-sm leading-6 text-white/40">{description}</p></div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function FormField({ label, placeholder, value, onChange }: { label: string; placeholder: string; value: string; onChange: (value: string) => void }) {
  return <label className="grid gap-2 text-sm text-white/70">{label}<Input required value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="border-white/10 bg-white/[0.04] text-white placeholder:text-white/25" /></label>;
}

function MetricCard({ label, value, detail, icon: Icon, accent = false }: { label: string; value: string; detail: string; icon: LucideIcon; accent?: boolean }) {
  return <article className={`c3-surface group relative overflow-hidden rounded-xl p-5 transition-colors ${accent ? "border-emerald-400/15" : "hover:border-white/[0.12]"}`}><span className={`absolute inset-y-5 left-0 w-0.5 ${accent ? "bg-[#41d69a]" : "bg-transparent"}`} /><div className="flex items-start justify-between"><div><p className="text-xs font-medium text-white/38">{label}</p><p className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-white">{value}</p><p className="mt-1 text-xs text-white/28">{detail}</p></div><div className={`grid size-10 place-items-center rounded-lg border ${accent ? "border-emerald-400/12 bg-emerald-400/[0.07] text-emerald-300" : "border-white/[0.06] bg-white/[0.025] text-white/40"}`}><Icon className="size-4" /></div></div></article>;
}

function SettingsCard({ icon: Icon, title, status, description, active = false }: { icon: LucideIcon; title: string; status: string; description: string; active?: boolean }) {
  return <Panel><div className="p-5"><div className="mb-5 flex items-start justify-between"><div className={`grid size-10 place-items-center rounded-xl ${active ? "bg-emerald-400/10 text-emerald-300" : "bg-amber-400/10 text-amber-300"}`}><Icon className="size-5" /></div><Badge variant="outline" className={active ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-300" : "border-amber-400/20 bg-amber-400/10 text-amber-300"}>{status}</Badge></div><h2 className="font-medium text-white">{title}</h2><p className="mt-2 text-sm leading-6 text-white/40">{description}</p></div></Panel>;
}

function StatePanel({ icon: Icon, title, description, action, onAction, spinning = false }: { icon: LucideIcon; title: string; description: string; action?: string; onAction?: () => void; spinning?: boolean }) {
  return <div className="grid min-h-64 place-items-center rounded-xl border border-white/[0.07] bg-[#0e110f] px-6 py-16 text-center"><div><Icon className={`mx-auto mb-4 size-7 text-white/20 ${spinning ? "animate-spin" : ""}`} /><p className="font-medium text-white/70">{title}</p><p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-white/35">{description}</p>{action && <Button onClick={onAction} variant="outline" className="mt-5 border-white/10 bg-transparent text-white hover:bg-white/[0.06] hover:text-white">{action}</Button>}</div></div>;
}

function Panel({ children }: { children: ReactNode }) {
  return <section className="c3-surface relative overflow-hidden rounded-xl">{children}</section>;
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-4"><span className="text-white/35">{label}</span><span className="font-mono text-white/75">{value}</span></div>;
}
