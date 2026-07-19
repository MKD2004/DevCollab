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
    }
    /* Merged bar+label, used where the caret and the label have to share a
       single injected-text slot (end of line / empty line — see cursorRange).
       The white left edge stands in for the separate caret bar. */
    .rcu-m${i} {
      background: ${color}; color: #fff; font-size: 10px; font-family: sans-serif;
      padding: 1px 4px; border-radius: 3px; border-left: 2px solid rgba(255,255,255,0.9);
      white-space: nowrap; pointer-events: none; line-height: 1.4;
    }`,
  ).join('');
  document.head.appendChild(style);
}

/**
 * Picks a range that Monaco will actually paint injected text on, for a remote
 * cursor at `position`.
 *
 * Monaco clamps decoration ranges to real document positions and then silently
 * drops `before`/`after` injected text on anything that ends up collapsed
 * (zero-width). A naive [column, column + 1] range therefore renders nothing
 * whenever the cursor sits at end-of-line or on an empty line — i.e. most of
 * the time while someone is actually typing. Measured behaviour:
 *
 *   mid-line   [col, col+1]            -> renders
 *   end-of-line[maxCol, maxCol+1]      -> clamps to collapsed, DROPPED
 *   end-of-line[maxCol-1, maxCol]      -> renders
 *   empty line [1, 2]                  -> clamps to collapsed, DROPPED
 *   empty line [line 1 -> line+1 col 1]-> renders
 *
 * Returns `{ range, mode }`, where mode says which injected-text slot lines up
 * with the true cursor position: 'split' (before = caret, after = label),
 * 'after' (range runs backwards into the previous character, so only the end
 * is on the cursor), or 'before' (range runs forward onto the next line, so
 * only the start is on the cursor). Returns null if there's nowhere valid.
 */
function cursorRange(model, position) {
  const lineCount = model.getLineCount();
  const lineNumber = Math.min(Math.max(position.lineNumber, 1), lineCount);
  const maxColumn = model.getLineMaxColumn(lineNumber);
  const column = Math.min(Math.max(position.column, 1), maxColumn);

  if (column < maxColumn) {
    // Room to the right — the ordinary case.
    return {
      mode: 'split',
      range: { startLineNumber: lineNumber, startColumn: column, endLineNumber: lineNumber, endColumn: column + 1 },
    };
  }

  if (maxColumn > 1) {
    // End of a non-empty line: extend backwards over the last character, so
    // the range end (not its start) is what sits on the cursor.
    return {
      mode: 'after',
      range: { startLineNumber: lineNumber, startColumn: maxColumn - 1, endLineNumber: lineNumber, endColumn: maxColumn },
    };
  }

  if (lineNumber < lineCount) {
    // Empty line: the only non-collapsed range available spans the newline
    // into the next line, so anchor on the range start.
    return {
      mode: 'before',
      range: { startLineNumber: lineNumber, startColumn: 1, endLineNumber: lineNumber + 1, endColumn: 1 },
    };
  }

  // Empty final line — no character and no following line to span into.
  return null;
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
    const model = editor?.getModel();
    if (!editor || !model || !cursors) return;

    const newDecorations = [];
    cursors.forEach(({ username, position }) => {
      const idx = colorIdx(username);
      const spec = cursorRange(model, position);
      if (!spec) return; // nowhere valid to anchor this cursor
      newDecorations.push({
        range: spec.range,
        options: {
          description: `cursor-${username}`,
          // `before` paints at the range start, `after` at the range end —
          // so only the slot that coincides with the real cursor position
          // may be used. See cursorRange for which that is.
          ...(spec.mode === 'split'
            ? {
                before: { content: '⁠', inlineClassName: `rcu-c${idx}` },
                after: { content: username, inlineClassName: `rcu-l${idx}` },
              }
            : spec.mode === 'after'
              ? { after: { content: username, inlineClassName: `rcu-m${idx}` } }
              : { before: { content: username, inlineClassName: `rcu-m${idx}` } }),
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

    // editor.setValue() (used by Room.jsx's pushCurrentContentToEditor on
    // code:sync) drops every decoration on the model, so remote cursor
    // markers must be reapplied after any content change. NEVER clear
    // decorationsRef here: deltaDecorations only removes the ids it is
    // *given*, so blanking the ref makes every reapply an insert-only call
    // and cursor markers pile up forever (one extra label per keystroke).
    // Passing already-removed ids back in is harmless — Monaco ignores ids
    // that are no longer on the model.
    // Also forward the raw event (with e.changes) up so Room.jsx can build
    // an OT operation from it — Monaco doesn't distinguish local keystrokes
    // from programmatic edits here, so the parent is responsible for
    // ignoring changes it triggered itself (via an isRemote-style guard).
    editor.onDidChangeModelContent((e) => {
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
      <div className="flex items-center gap-3 px-4 py-2 bg-card border-b border-border">
        <span className="text-muted-foreground text-sm">Language:</span>
        <select
          value={language}
          onChange={(e) => onLanguageChange?.(e.target.value)}
          className="bg-secondary text-foreground text-sm border border-border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-ring"
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
          className="text-xs bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground font-medium px-3 py-1 rounded-lg transition-colors"
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
