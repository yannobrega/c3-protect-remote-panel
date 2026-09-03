"use client";

import { type FormEvent, useState } from "react";
import {
  AlertTriangle,
  Check,
  Clipboard,
  Download,
  FileCode2,
  KeyRound,
  Loader2,
  Pencil,
  RotateCcwKey,
  Trash2,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
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
import type { Company, Device } from "./remote-dashboard";

export function DeviceManagement({
  device,
  companies,
  gatewayOnline,
  onUpdated,
  onDeleted,
}: {
  device: Device;
  companies: Company[];
  gatewayOnline: boolean;
  onUpdated: (device: Device) => void;
  onDeleted: (id: number) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <EditDeviceDialog device={device} companies={companies} onUpdated={onUpdated} />
      <RegenerateScriptDialog device={device} />
      <RotatePasswordDialog
        device={device}
        gatewayOnline={gatewayOnline}
        onUpdated={onUpdated}
      />
      <DeleteDeviceDialog device={device} onDeleted={onDeleted} />
    </div>
  );
}

function EditDeviceDialog({
  device,
  companies,
  onUpdated,
}: {
  device: Device;
  companies: Company[];
  onUpdated: (device: Device) => void;
}) {
  const [open, setOpen] = useState(false);
  const [rbName, setRbName] = useState(device.rbName);
  const [companyId, setCompanyId] = useState(String(device.companyId ?? ""));
  const [managementIp, setManagementIp] = useState(device.managementIp);
  const [sstpUser, setSstpUser] = useState(device.sstpUser);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [syncScript, setSyncScript] = useState("");
  const [copied, setCopied] = useState(false);

  function reset() {
    setRbName(device.rbName);
    setCompanyId(String(device.companyId ?? ""));
    setManagementIp(device.managementIp);
    setSstpUser(device.sstpUser);
    setError("");
    setSyncScript("");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/devices/manage", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: device.id,
          rbName,
          companyId,
          managementIp,
          sstpUser,
        }),
      });
      const data = (await response.json()) as {
        device?: Device;
        syncScript?: string | null;
        error?: string;
      };
      if (!response.ok || !data.device) {
        throw new Error(data.error ?? "Não foi possível salvar as alterações.");
      }
      onUpdated(data.device);
      if (data.syncScript) setSyncScript(data.syncScript);
      else setOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível salvar.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) reset(); }}>
      <DialogTrigger asChild>
        <Button variant="outline" className="border-white/10 bg-white/[0.025] text-white hover:bg-white/[0.07] hover:text-white">
          <Pencil /> Editar
        </Button>
      </DialogTrigger>
      <DialogContent className="border-white/10 bg-[#101412] text-white sm:max-w-xl">
        {!syncScript ? (
          <form onSubmit={submit}>
            <DialogHeader>
              <DialogTitle>Editar {device.rbName}</DialogTitle>
              <DialogDescription className="text-white/45">
                Atualize o cadastro e, quando necessário, sincronize a identidade com a RB.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-5 sm:grid-cols-2">
              <Field label="Nome da RB" value={rbName} onChange={setRbName} />
              <label className="grid gap-2 text-sm text-white/70">
                Empresa
                <Select value={companyId} onValueChange={setCompanyId}>
                  <SelectTrigger className="w-full border-white/10 bg-white/[0.04] text-white">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent className="border-white/10 bg-[#101412] text-white">
                    {companies.map((company) => (
                      <SelectItem key={company.id} value={String(company.id)}>
                        {company.tradeName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <Field label="IP via SSTP" value={managementIp} onChange={setManagementIp} />
              <Field label="Usuário SSTP" value={sstpUser} onChange={setSstpUser} />
            </div>
            {error && <ErrorBox>{error}</ErrorBox>}
            <DialogFooter>
              <Button type="submit" disabled={submitting} className="bg-emerald-400 text-[#06100d] hover:bg-emerald-300">
                {submitting ? <Loader2 className="animate-spin" /> : <Check />}
                Salvar alterações
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <ScriptResult
            title="Cadastro atualizado"
            description="O painel já foi atualizado. Cole este pequeno script na RB para sincronizar o nome e o usuário SSTP."
            script={syncScript}
            filename={`${rbName}-atualizacao.rsc`}
            copied={copied}
            onCopy={() => copyScript(syncScript, setCopied)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function RegenerateScriptDialog({ device }: { device: Device }) {
  const [open, setOpen] = useState(false);
  const [script, setScript] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  async function loadScript() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/devices/manage", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: device.id, action: "regenerate-script" }),
      });
      const data = (await response.json()) as { script?: string; error?: string };
      if (!response.ok || !data.script) throw new Error(data.error ?? "Falha ao gerar script.");
      setScript(data.script);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao gerar script.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) { setScript(""); setError(""); } }}>
      <DialogTrigger asChild>
        <Button onClick={() => void loadScript()} variant="outline" className="border-white/10 bg-white/[0.025] text-white hover:bg-white/[0.07] hover:text-white">
          <FileCode2 /> Regenerar script
        </Button>
      </DialogTrigger>
      <DialogContent className="border-white/10 bg-[#101412] text-white sm:max-w-3xl">
        {loading ? <LoadingState text="Gerando o script completo…" /> : error ? <ErrorBox>{error}</ErrorBox> : script ? (
          <ScriptResult
            title="Script completo regenerado"
            description="Use em recuperação ou nova configuração. Em uma RB já configurada, reaplicar o script completo pode duplicar regras."
            script={script}
            filename={`${device.rbName}-c3-remote.rsc`}
            copied={copied}
            onCopy={() => copyScript(script, setCopied)}
            warning
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function RotatePasswordDialog({
  device,
  gatewayOnline,
  onUpdated,
}: {
  device: Device;
  gatewayOnline: boolean;
  onUpdated: (device: Device) => void;
}) {
  const [open, setOpen] = useState(false);
  const [script, setScript] = useState("");
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [success, setSuccess] = useState(false);

  async function generate() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/devices/manage", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: device.id, action: "rotate-ssh" }),
      });
      const data = (await response.json()) as { script?: string; pendingSince?: string; error?: string };
      if (!response.ok || !data.script) throw new Error(data.error ?? "Falha ao gerar a senha.");
      setScript(data.script);
      onUpdated({
        ...device,
        hasPendingSshRotation: true,
        pendingSshPasswordCreatedAt: data.pendingSince ?? new Date().toISOString(),
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao gerar a senha.");
    } finally {
      setLoading(false);
    }
  }

  async function validate() {
    setValidating(true);
    setError("");
    try {
      const response = await fetch("/api/devices/manage", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: device.id, action: "confirm-rotation" }),
      });
      const data = (await response.json()) as { activated?: boolean; error?: string };
      if (!response.ok || !data.activated) {
        throw new Error(data.error ?? "A nova senha ainda não foi validada.");
      }
      setSuccess(true);
      onUpdated({
        ...device,
        hasPendingSshRotation: false,
        pendingSshPasswordCreatedAt: null,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "A nova senha não foi validada.");
    } finally {
      setValidating(false);
    }
  }

  function handleOpen(next: boolean) {
    setOpen(next);
    if (next && device.hasPendingSshRotation && !script) void generate();
    if (!next) {
      setError("");
      setSuccess(false);
      setScript("");
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className={device.hasPendingSshRotation ? "border-amber-400/20 bg-amber-400/[0.07] text-amber-200 hover:bg-amber-400/10 hover:text-amber-100" : "border-white/10 bg-white/[0.025] text-white hover:bg-white/[0.07] hover:text-white"}>
          <RotateCcwKey /> {device.hasPendingSshRotation ? "Rotação pendente" : "Trocar senha"}
        </Button>
      </DialogTrigger>
      <DialogContent className="border-white/10 bg-[#101412] text-white sm:max-w-3xl">
        {success ? (
          <div className="py-8 text-center">
            <div className="mx-auto mb-4 grid size-12 place-items-center rounded-full bg-emerald-400/10 text-emerald-300"><Check /></div>
            <DialogTitle>Nova senha ativada</DialogTitle>
            <DialogDescription className="mt-2 text-white/45">A conexão foi validada e a credencial anterior foi substituída.</DialogDescription>
          </div>
        ) : loading ? <LoadingState text="Preparando a nova credencial…" /> : script ? (
          <>
            <ScriptResult
              title="Rotação de senha SSH"
              description="Copie e execute este script na RB. Depois volte aqui e valide a nova conexão."
              script={script}
              filename={`${device.rbName}-rotacao-ssh.rsc`}
              copied={copied}
              onCopy={() => copyScript(script, setCopied)}
            />
            {error && <ErrorBox>{error}</ErrorBox>}
            <DialogFooter>
              <Button onClick={() => void validate()} disabled={validating || !gatewayOnline} className="bg-emerald-400 text-[#06100d] hover:bg-emerald-300">
                {validating ? <Loader2 className="animate-spin" /> : <KeyRound />}
                {validating ? "Validando na RB…" : gatewayOnline ? "Já apliquei — validar e ativar" : "Gateway indisponível"}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Trocar senha do {device.sshUsername}</DialogTitle>
              <DialogDescription className="text-white/45">A senha atual continuará ativa no sistema até a nova credencial ser testada com sucesso.</DialogDescription>
            </DialogHeader>
            <div className="my-5 rounded-xl border border-white/[0.08] bg-white/[0.025] p-4 text-sm leading-6 text-white/55">
              O sistema criará uma senha única, entregará um script curto para aplicar na RB e manterá a rotação pendente até a validação.
            </div>
            {error && <ErrorBox>{error}</ErrorBox>}
            <DialogFooter>
              <Button onClick={() => void generate()} className="bg-emerald-400 text-[#06100d] hover:bg-emerald-300">
                <KeyRound /> Gerar nova senha
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DeleteDeviceDialog({ device, onDeleted }: { device: Device; onDeleted: (id: number) => void }) {
  const [confirmation, setConfirmation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function remove() {
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/devices/manage", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: device.id, confirmation }),
      });
      const data = (await response.json()) as { deleted?: boolean; error?: string };
      if (!response.ok || !data.deleted) throw new Error(data.error ?? "Falha ao excluir.");
      onDeleted(device.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao excluir.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AlertDialog onOpenChange={(open) => { if (!open) { setConfirmation(""); setError(""); } }}>
      <AlertDialogTrigger asChild>
        <Button size="icon" variant="outline" aria-label={`Excluir ${device.rbName}`} className="border-rose-400/15 bg-rose-400/[0.035] text-rose-300 hover:bg-rose-400/10 hover:text-rose-200">
          <Trash2 />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="border-white/10 bg-[#101412] text-white">
        <AlertDialogHeader>
          <div className="mb-2 grid size-11 place-items-center rounded-2xl bg-rose-400/10 text-rose-300"><AlertTriangle /></div>
          <AlertDialogTitle>Excluir {device.rbName}?</AlertDialogTitle>
          <AlertDialogDescription className="text-white/45">O histórico de sessões será preservado, mas o equipamento e sua credencial serão removidos. Essa ação não pode ser desfeita.</AlertDialogDescription>
        </AlertDialogHeader>
        <label className="grid gap-2 py-3 text-sm text-white/65">
          Digite <strong className="font-mono text-white">{device.rbName}</strong> para confirmar
          <Input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="border-white/10 bg-white/[0.04] text-white" />
        </label>
        {error && <ErrorBox>{error}</ErrorBox>}
        <AlertDialogFooter>
          <AlertDialogCancel className="border-white/10 bg-transparent text-white hover:bg-white/[0.06] hover:text-white">Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={(event) => { event.preventDefault(); void remove(); }} disabled={confirmation !== device.rbName || submitting} className="bg-rose-500 text-white hover:bg-rose-400">
            {submitting ? <Loader2 className="animate-spin" /> : <Trash2 />}
            Excluir definitivamente
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ScriptResult({
  title,
  description,
  script,
  filename,
  copied,
  onCopy,
  warning = false,
}: {
  title: string;
  description: string;
  script: string;
  filename: string;
  copied: boolean;
  onCopy: () => void;
  warning?: boolean;
}) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription className="text-white/45">{description}</DialogDescription>
      </DialogHeader>
      {warning && <div className="my-4 flex gap-3 rounded-xl border border-amber-400/15 bg-amber-400/[0.055] p-4 text-sm text-amber-100/70"><AlertTriangle className="mt-0.5 size-4 shrink-0" /> Não reaplique em produção sem revisar possíveis regras duplicadas.</div>}
      <pre className="my-5 max-h-[48vh] overflow-auto whitespace-pre-wrap rounded-xl border border-white/[0.08] bg-[#070908] p-4 font-mono text-xs leading-5 text-emerald-100/75">{script}</pre>
      <DialogFooter>
        <Button variant="outline" onClick={() => downloadScript(script, filename)} className="border-white/10 bg-transparent text-white hover:bg-white/[0.06] hover:text-white"><Download /> Baixar .rsc</Button>
        <Button onClick={onCopy} className="bg-emerald-400 text-[#06100d] hover:bg-emerald-300">{copied ? <Check /> : <Clipboard />} {copied ? "Copiado" : "Copiar script"}</Button>
      </DialogFooter>
    </>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="grid gap-2 text-sm text-white/70">{label}<Input required value={value} onChange={(event) => onChange(event.target.value)} className="border-white/10 bg-white/[0.04] text-white" /></label>;
}

function ErrorBox({ children }: { children: string }) {
  return <p className="mb-4 rounded-xl border border-rose-400/15 bg-rose-400/[0.06] px-4 py-3 text-sm text-rose-300">{children}</p>;
}

function LoadingState({ text }: { text: string }) {
  return <div className="flex min-h-56 flex-col items-center justify-center"><Loader2 className="mb-3 size-6 animate-spin text-emerald-300" /><p className="text-sm text-white/45">{text}</p></div>;
}

async function copyScript(script: string, setCopied: (value: boolean) => void) {
  await navigator.clipboard.writeText(script);
  setCopied(true);
  window.setTimeout(() => setCopied(false), 1800);
}

function downloadScript(script: string, filename: string) {
  const blob = new Blob([script], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
