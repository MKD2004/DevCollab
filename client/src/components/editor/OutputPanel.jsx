export default function OutputPanel({ state, output }) {
  const hasContent = output && (output.stdout || output.stderr || output.compileOutput);

  return (
    <div className="h-48 shrink-0 bg-card border-t border-border flex flex-col">
      <div className="px-4 py-2 border-b border-border flex items-center justify-between">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Output</h2>
        {state === 'running' && (
          <span className="text-xs text-primary">
            {output?.runningUser ? `${output.runningUser} is running…` : 'Running…'}
          </span>
        )}
        {state === 'idle' && output?.ranBy && (
          <span className="text-xs text-muted-foreground">last run by {output.ranBy}</span>
        )}
      </div>
      <div className="flex-1 overflow-auto px-4 py-2 font-mono text-xs whitespace-pre-wrap">
        {state === 'running' && !hasContent && <p className="text-muted-foreground">Waiting for output…</p>}
        {state === 'idle' && !output && <p className="text-muted-foreground">Click Run to execute your code.</p>}
        {output?.error && <p className="text-destructive">{output.error}</p>}
        {output?.compileOutput && <p className="text-amber-400">{output.compileOutput}</p>}
        {output?.stdout && <p className="text-muted-foreground">{output.stdout}</p>}
        {output?.stderr && <p className="text-destructive">{output.stderr}</p>}
      </div>
    </div>
  );
}
