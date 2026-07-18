export default function OutputPanel({ state, output }) {
  const hasContent = output && (output.stdout || output.stderr || output.compileOutput);

  return (
    <div className="h-48 shrink-0 bg-gray-900 border-t border-gray-800 flex flex-col">
      <div className="px-4 py-2 border-b border-gray-800 flex items-center justify-between">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Output</h2>
        {state === 'running' && (
          <span className="text-xs text-indigo-300">
            {output?.runningUser ? `${output.runningUser} is running…` : 'Running…'}
          </span>
        )}
        {state === 'idle' && output?.ranBy && (
          <span className="text-xs text-gray-500">last run by {output.ranBy}</span>
        )}
      </div>
      <div className="flex-1 overflow-auto px-4 py-2 font-mono text-xs whitespace-pre-wrap">
        {state === 'running' && !hasContent && <p className="text-gray-500">Waiting for output…</p>}
        {state === 'idle' && !output && <p className="text-gray-500">Click Run to execute your code.</p>}
        {output?.error && <p className="text-red-400">{output.error}</p>}
        {output?.compileOutput && <p className="text-amber-400">{output.compileOutput}</p>}
        {output?.stdout && <p className="text-gray-300">{output.stdout}</p>}
        {output?.stderr && <p className="text-red-400">{output.stderr}</p>}
      </div>
    </div>
  );
}
