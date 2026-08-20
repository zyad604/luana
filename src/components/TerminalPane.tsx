import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

export function TerminalPane({ workspace }: { workspace: string | null }) {
  const host = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const idRef = useRef<string | null>(null);

  useEffect(() => {
    if (!host.current) return;
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 12,
      fontFamily: "Cascadia Code, Consolas, monospace",
      theme: { background: "#09090b", foreground: "#e4e4e7" },
      convertEol: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host.current);
    fit.fit();
    termRef.current = term;
    const offData = window.luda.on("shell:data", (raw) => {
      const d = raw as { id: string; data: string };
      if (d.id === idRef.current) term.write(d.data);
    });
    term.onData((data) => {
      if (idRef.current) window.luda.invoke("shell:write", { id: idRef.current, data });
    });
    const ro = new ResizeObserver(() => fit.fit());
    ro.observe(host.current);
    return () => {
      offData();
      ro.disconnect();
      term.dispose();
    };
  }, []);

  useEffect(() => {
    let dead = false;
    (async () => {
      if (idRef.current) await window.luda.invoke("shell:kill", idRef.current);
      const rec = await window.luda.invoke("shell:start", workspace);
      if (!dead) idRef.current = rec.id;
    })();
    return () => {
      dead = true;
    };
  }, [workspace]);

  return <div ref={host} className="h-full w-full p-2" />;
}
