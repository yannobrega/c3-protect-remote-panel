"use client";
import { FormEvent, useState } from "react";
import { Loader2, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function LoginPage() {
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [loading, setLoading] = useState(false); const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault(); setLoading(true); setError("");
    try { const response = await fetch("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }) }); const data = await response.json() as { error?: string }; if (!response.ok) throw new Error(data.error ?? "Falha ao entrar."); window.location.replace("/"); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao entrar."); setLoading(false); }
  }
  return <main className="c3-workspace grid min-h-screen place-items-center px-5 py-10">
    <section className="w-full max-w-md rounded-2xl border border-white/[0.09] bg-[#101412] p-7 shadow-2xl shadow-black/30 sm:p-9">
      <div className="mb-8 flex justify-center"><img src="/c3-protect.png" alt="C3 Protect" className="h-24 w-auto object-contain" /></div>
      <div className="mb-7"><div className="mb-4 grid size-11 place-items-center rounded-xl border border-emerald-400/15 bg-emerald-400/[0.07] text-emerald-300"><LockKeyhole className="size-5" /></div><h1 className="text-2xl font-semibold tracking-[-0.035em] text-white">Acesso ao Remote</h1><p className="mt-2 text-sm leading-6 text-white/40">Entre com sua credencial da C3 Support.</p></div>
      <form onSubmit={submit} className="space-y-4"><label className="grid gap-2 text-sm text-white/65">E-mail<Input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-11 border-white/10 bg-white/[0.035] text-white" /></label><label className="grid gap-2 text-sm text-white/65">Senha<Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className="h-11 border-white/10 bg-white/[0.035] text-white" /></label>{error && <p className="rounded-lg border border-rose-400/15 bg-rose-400/[0.05] p-3 text-sm text-rose-200">{error}</p>}<Button type="submit" disabled={loading} className="c3-button-primary h-11 w-full">{loading && <Loader2 className="animate-spin" />}{loading ? "Entrando…" : "Entrar"}</Button></form>
    </section>
  </main>;
}
