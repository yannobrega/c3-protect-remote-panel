"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Square } from "lucide-react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { Button } from "@/components/ui/button";

export type RemoteSession = {
  recordId: number;
  sessionId: string;
  token: string;
  websocketUrl: string;
  expiresAt: string;
};

type TerminalPhase = "connecting" | "authenticating" | "routeros" | "ready" | "ended" | "failed";

const ESCAPE = String.fromCharCode(27);
const ANSI_SEQUENCE = new RegExp(`${ESCAPE}\\[[0-?]*[ -/]*[@-~]`, "g");
const ROUTEROS_PROMPT = /\[[^\]\r\n]+@[^\]\r\n]+\]\s*>\s*$/m;

const phaseCopy: Record<TerminalPhase, { label: string; detail: string }> = {
  connecting: {
    label: "Conectando ao Gateway",
    detail: "Criando o canal protegido até a VPS.",
  },
  authenticating: {
    label: "Autenticando no MikroTik",
    detail: "Validando a credencial SSH exclusiva desta RB.",
  },
  routeros: {
    label: "Carregando o RouterOS",
    detail: "Aguardando o prompt do equipamento ficar disponível.",
  },
  ready: { label: "Conectado", detail: "Terminal pronto para uso." },
  ended: { label: "Sessão encerrada", detail: "A conexão SSH foi finalizada." },
  failed: { label: "Falha na conexão", detail: "Não foi possível abrir o terminal." },
};

export function RemoteTerminal({
  session,
  onConnected,
  onEnded,
}: {
  session: RemoteSession;
  onConnected?: () => void;
  onEnded?: (reason: string, failed?: boolean) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const finishRef = useRef<() => void>(() => {});
  const callbacksRef = useRef({ onConnected, onEnded });
  const [phase, setPhase] = useState<TerminalPhase>("connecting");

  useEffect(() => {
    callbacksRef.current = { onConnected, onEnded };
  }, [onConnected, onEnded]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let disposed = false;
    let endReported = false;
    let connectedReported = false;
    let outputTail = "";
    const reportEnd = (reason: string, failed = false) => {
      if (endReported) return;
      endReported = true;
      callbacksRef.current.onEnded?.(reason, failed);
    };

    const terminal = new Terminal({
      cursorBlink: true,
      cursorStyle: "block",
      convertEol: false,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      fontSize: 14,
      lineHeight: 1.25,
      scrollback: 5000,
      theme: {
        background: "#050706",
        foreground: "#d9e4de",
        cursor: "#34d399",
        cursorAccent: "#06100d",
        selectionBackground: "#34d39945",
        black: "#070908",
        brightBlack: "#59635e",
        green: "#34d399",
        brightGreen: "#6ee7b7",
        cyan: "#38dbf8",
        brightCyan: "#67e8f9",
      },
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(container);
    fit.fit();

    const socket = new WebSocket(session.websocketUrl, ["c3-remote", session.token]);
    finishRef.current = () => {
      if (endReported) return;
      setPhase("ended");
      reportEnd("Finalizada pelo operador");
      socket.close(1000, "Finalizada pelo operador");
    };

    const input = terminal.onData((data) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "input", data }));
      }
    });
    const resize = terminal.onResize(({ cols, rows }) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "resize", cols, rows }));
      }
    });
    const observer = new ResizeObserver(() => fit.fit());
    observer.observe(container);

    socket.onopen = () => {
      setPhase("authenticating");
      socket.send(JSON.stringify({
        type: "resize",
        cols: terminal.cols,
        rows: terminal.rows,
      }));
    };
    const heartbeat = window.setInterval(() => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "heartbeat", timestamp: Date.now() }));
      }
    }, 15_000);
    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(String(event.data)) as {
          type?: string;
          status?: string;
          data?: string;
          message?: string;
        };
        if (message.type === "output" && typeof message.data === "string") {
          terminal.write(message.data);
          outputTail = `${outputTail}${message.data}`.slice(-6000).replace(ANSI_SEQUENCE, "");
          if (!connectedReported && ROUTEROS_PROMPT.test(outputTail)) {
            connectedReported = true;
            setPhase("ready");
            callbacksRef.current.onConnected?.();
            window.setTimeout(() => terminal.focus(), 0);
          }
        } else if (message.type === "status" && message.status === "connected") {
          setPhase("routeros");
        } else if (message.type === "error") {
          setPhase("failed");
          reportEnd(message.message ?? "Erro na sessão", true);
          terminal.writeln(`\r\n\x1b[31m${message.message ?? "Erro na sessão."}\x1b[0m`);
        }
      } catch {
        setPhase("failed");
        reportEnd("Resposta inválida do Gateway", true);
      }
    };
    socket.onerror = () => {
      if (!disposed) {
        setPhase("failed");
        reportEnd("Falha na conexão com o Gateway", true);
      }
    };
    socket.onclose = (event) => {
      if (!disposed) {
        setPhase((current) => current === "failed" ? current : "ended");
        reportEnd(event.reason || "Conexão encerrada");
      }
    };

    return () => {
      disposed = true;
      reportEnd("Janela do terminal fechada");
      observer.disconnect();
      window.clearInterval(heartbeat);
      input.dispose();
      resize.dispose();
      socket.close();
      terminal.dispose();
      finishRef.current = () => {};
    };
  }, [session]);

  const ready = phase === "ready";
  const finished = phase === "ended" || phase === "failed";
  const copy = phaseCopy[phase];

  return (
    <div className="overflow-hidden rounded-lg border border-white/[0.09] bg-[#050706] shadow-[0_20px_60px_rgba(0,0,0,.16)]">
      <div className="flex min-h-11 items-center justify-between gap-3 border-b border-white/[0.07] px-3 text-xs text-white/45">
        <span>Terminal SSH</span>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-2">
            <span className={`size-1.5 rounded-full ${ready ? "bg-emerald-400" : finished ? "bg-rose-400" : "bg-amber-300"}`} />
            {copy.label}
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={finished}
            onClick={() => finishRef.current()}
            className="h-7 border-rose-400/20 bg-rose-400/[0.06] px-2.5 text-xs text-rose-300 hover:bg-rose-400/15 hover:text-rose-200"
          >
            <Square className="size-3" />
            Finalizar sessão
          </Button>
        </div>
      </div>
      <div className="relative">
        <div ref={containerRef} className="h-[58vh] min-h-80 p-2" />
        {!ready && !finished && (
          <div className="absolute inset-0 grid place-items-center bg-[#050706]/95 px-6 backdrop-blur-sm">
            <div className="w-full max-w-sm text-center">
              <div className="mx-auto grid size-12 place-items-center rounded-lg border border-white/[0.08] bg-white/[0.025] text-emerald-300">
                <Loader2 className="size-5 animate-spin" />
              </div>
              <p className="mt-5 font-medium text-white/85">{copy.label}</p>
              <p className="mt-2 text-sm leading-6 text-white/40">{copy.detail}</p>
              <div className="mx-auto mt-5 flex w-40 items-center gap-1.5">
                {["connecting", "authenticating", "routeros"].map((step, index) => {
                  const currentIndex = ["connecting", "authenticating", "routeros"].indexOf(phase);
                  return <span key={step} className={`h-1 flex-1 rounded-full ${index <= currentIndex ? "bg-emerald-400" : "bg-white/10"}`} />;
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
