import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

export function AiTerminalOutput({ output, visible, onResize }: { output: string; visible: boolean; onResize(cols: number, rows: number): void }) {
  const host = useRef<HTMLDivElement>(null);
  const term = useRef<Terminal | undefined>(undefined);
  const fit = useRef<FitAddon | undefined>(undefined);
  const previous = useRef('');
  const resize = useRef(onResize);
  resize.current = onResize;
  useEffect(() => {
    if (!host.current) return;
    const terminal = new Terminal({ fontSize: 12, fontFamily: 'Consolas, "Microsoft YaHei UI", monospace', convertEol: true, disableStdin: true, scrollback: 4000, theme: { background: '#0f1218', foreground: '#d9dde8' } });
    const addon = new FitAddon(); terminal.loadAddon(addon); terminal.open(host.current);
    term.current = terminal; fit.current = addon; previous.current = '';
    const observer = new ResizeObserver(() => { if (host.current?.offsetWidth) { addon.fit(); resize.current(terminal.cols, terminal.rows); } });
    observer.observe(host.current);
    return () => { observer.disconnect(); terminal.dispose(); term.current = undefined; };
  }, []);
  useEffect(() => {
    if (!term.current) return;
    if (output.startsWith(previous.current)) term.current.write(output.slice(previous.current.length));
    else { term.current.reset(); term.current.write(output); }
    previous.current = output;
  }, [output]);
  useEffect(() => { if (visible && host.current?.offsetWidth) { fit.current?.fit(); if (term.current) resize.current(term.current.cols, term.current.rows); } }, [visible]);
  return <div className="ai-terminal-output" ref={host} aria-label="终端输出" />;
}
