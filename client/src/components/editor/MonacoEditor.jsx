import { useRef, useEffect } from 'react';
import Editor from '@monaco-editor/react';

const LANGUAGES = ['javascript', 'typescript', 'python', 'cpp', 'java', 'go', 'rust'];

// Hex values matching PresenceList's Tailwind palette (indigo/emerald/rose/amber/sky/violet 500)
const CURSOR_COLORS = ['#6366f1', '#10b981', '#f43f5e', '#f59e0b', '#0ea5e9', '#8b5cf6'];

function colorIdx(username) {
  let h = 0;
  for (const ch of username) h = (h * 31 + ch.charCodeAt(0)) & 0xffffffff;
  return Math.abs(h) % CURSOR_COLORS.length;
}

function injectCursorCSS() {
  if (document.getElementById('rcu-styles')) return;
  const style = document.createElement('style');
  style.id = 'rcu-styles';
  style.textContent = CURSOR_COLORS.map(
    (color, i) => `
    .rcu-c${i} {
      display: inline-block; width: 2px; background: ${color};
      height: 1.15em; vertical-align: text-bottom; margin-right: -1px;
    }
    .rcu-l${i} {
      background: ${color}; color: #fff; font-size: 10px; font-family: sans-serif;
      padding: 1px 4px; border-radius: 3px; margin-left: 2px;
      white-space: nowrap; pointer-events: none; line-height: 1.4;
    }`,
  ).join('');
  document.head.appendChild(style);
}

export const DEFAULT_CODE = `// Welcome to DevCollab
function greet(name) {
  return \`Hello, \${name}! Ready to collaborate?\`;
}

const message = greet('World');
console.log(message);

// Try editing this — changes sync to everyone in the room
const users = ['Alice', 'Bob', 'Carol'];
users.forEach((user, i) => {
  console.log(\`User \${i + 1}: \${user}\`);
});
`;

export default function MonacoEditor({
  language,
  onLanguageChange,
  onLocalChange,
  onCursorChange,
  onEditorReady,
  remoteCursors,
  editorRef,
  branchTabsSlot,
  onRun,
  isRunning,
}) {
  const internalRef = useRef(null);
  const decorationsRef = useRef([]);
  // Ref so the Monaco listener always calls the latest callback, not a stale closure
  const onCursorChangeRef = useRef(onCursorChange);
  useEffect(() => {
    onCursorChangeRef.current = onCursorChange;
  });
  const onLocalChangeRef = useRef(onLocalChange);
  useEffect(() => {
    onLocalChangeRef.current = onLocalChange;
  });
  // Ref so content-change re-renders (below) always redraw the latest cursors
  const remoteCursorsRef = useRef(remoteCursors);
  useEffect(() => {
    remoteCursorsRef.current = remoteCursors;
  }, [remoteCursors]);

  const applyDecorations = () => {
    const editor = internalRef.current;
    const cursors = remoteCursorsRef.current;
    if (!editor || !cursors) return;

    const newDecorations = [];
    cursors.forEach(({ username, position }) => {
      const idx = colorIdx(username);
      newDecorations.push({
        // Monaco silently drops `before`/`after` injected text on a collapsed
        // (zero-width) range, so the range must span at least one column.
        range: {
          startLineNumber: position.lineNumber,
          startColumn: position.column,
          endLineNumber: position.lineNumber,
          endColumn: position.column + 1,
        },
        options: {
          description: `cursor-${username}`,
          before: { content: '⁠', inlineClassName: `rcu-c${idx}` },
          after: { content: username, inlineClassName: `rcu-l${idx}` },
        },
      });
    });

    decorationsRef.current = editor.deltaDecorations(decorationsRef.current, newDecorations);
  };

  const handleMount = (editor) => {
    internalRef.current = editor;
    if (editorRef) editorRef.current = editor;
    injectCursorCSS();

    editor.onDidChangeCursorPosition((e) => {
      onCursorChangeRef.current?.({ lineNumber: e.position.lineNumber, column: e.position.column });
    });

    // editor.setValue() / executeEdits() (used to apply incoming code:sync/
    // code:op content) drop every decoration on the model, so remote cursor
    // markers must be reapplied after any content change. Also forward the
    // raw event (with e.changes) up so Room.jsx can build an OT operation
    // from it — Monaco doesn't distinguish local keystrokes from
    // programmatic edits here, so the parent is responsible for ignoring
    // changes it triggered itself (via an isRemote-style guard).
    editor.onDidChangeModelContent((e) => {
      decorationsRef.current = [];
      applyDecorations();
      onLocalChangeRef.current?.(e);
    });

    onEditorReady?.();
  };

  // Apply remote cursor decorations whenever remoteCursors map changes
  useEffect(() => {
    applyDecorations();
  }, [remoteCursors]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-4 py-2 bg-gray-900 border-b border-gray-700">
        <span className="text-gray-400 text-sm">Language:</span>
        <select
          value={language}
          onChange={(e) => onLanguageChange?.(e.target.value)}
          className="bg-gray-800 text-white text-sm border border-gray-600 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          {LANGUAGES.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
        {branchTabsSlot}
        <button
          onClick={() => onRun?.()}
          disabled={isRunning}
          className="text-xs bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium px-3 py-1 rounded-lg transition-colors"
        >
          {isRunning ? 'Running…' : 'Run ▶'}
        </button>
      </div>

      <div className="flex-1">
        <Editor
          height="100%"
          language={language}
          defaultValue=""
          theme="vs-dark"
          onMount={handleMount}
          options={{
            fontSize: 14,
            minimap: { enabled: true },
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            tabSize: 2,
            lineNumbers: 'on',
            renderLineHighlight: 'all',
            smoothScrolling: true,
            cursorBlinking: 'smooth',
          }}
        />
      </div>
    </div>
  );
}
