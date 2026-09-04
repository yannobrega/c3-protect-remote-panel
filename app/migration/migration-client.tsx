"use client";

import { useState } from "react";
import { ArrowLeft, CheckCircle2, Database, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type Result = {
  companiesImported: number;
  devicesImported: number;
  sessionsImported: number;
};

export function MigrationClient() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);

  async function migrate() {
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const response = await fetch("/api/admin/migration", { method: "POST" });
      const data = await response.json() as Result & { error?: string };
      if (!response.ok) throw new Error(data.error || "Falha na migração.");
      setResult(data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha na migração.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#07100d] px-6 py-12 text-white">
      <div className="mx-auto max-w-2xl">
        <a href="/" className="mb-8 inline-flex items-center gap-2 text-sm text-white/60 hover:text-white">
          <ArrowLeft className="size-4" /> Voltar ao painel
        </a>
        <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-8 shadow-2xl shadow-black/30">
          <div className="mb-6 flex size-12 items-center justify-center rounded-2xl bg-emerald-400/10 text-emerald-300">
            <Database className="size-6" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Migrar dados do painel anterior</h1>
          <p className="mt-3 leading-7 text-white/60">
            Copia empresas, MikroTiks, credenciais SSH e histórico de sessões. As senhas são recriptografadas antes de serem gravadas no PostgreSQL.
          </p>

          {result ? (
            <div className="mt-8 rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.08] p-5 text-emerald-100">
              <div className="flex items-center gap-2 font-medium"><CheckCircle2 className="size-5" /> Migração concluída</div>
              <p className="mt-2 text-sm text-emerald-100/75">
                {result.companiesImported} empresas, {result.devicesImported} MikroTiks e {result.sessionsImported} sessões processados.
              </p>
            </div>
          ) : null}
          {error ? <p className="mt-6 rounded-xl border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-200">{error}</p> : null}

          <Button onClick={migrate} disabled={loading} className="mt-8 h-12 rounded-xl bg-emerald-400 px-6 font-semibold text-[#07100d] hover:bg-emerald-300">
            {loading ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            {loading ? "Migrando…" : result ? "Executar novamente" : "Iniciar migração"}
          </Button>
          <p className="mt-4 text-xs leading-5 text-white/40">A operação pode ser repetida com segurança e não duplica cadastros.</p>
        </section>
      </div>
    </main>
  );
}
