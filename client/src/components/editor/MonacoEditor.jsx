import { useRef, useState } from 'react';
import Editor from '@monaco-editor/react';

const LANGUAGES = ['javascript', 'typescript', 'python', 'cpp', 'java', 'go', 'rust'];

const DEFAULT_CODE = {
  javascript: `// Welcome to DevCollab
function greet(name) {
  return \`Hello, \${name}! Ready to collaborate?\`;
}

const message = greet('World');
console.log(message);

// Try editing this — syntax highlighting is live
const users = ['Alice', 'Bob', 'Carol'];
users.forEach((user, i) => {
  console.log(\`User \${i + 1}: \${user}\`);
});
`,
};

export default function MonacoEditor() {
  const editorRef = useRef(null);
  const [language, setLanguage] = useState('javascript');
  const [value, setValue] = useState(DEFAULT_CODE.javascript);

  const handleEditorDidMount = (editor) => {
    editorRef.current = editor;
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-4 py-2 bg-gray-900 border-b border-gray-700">
        <span className="text-gray-400 text-sm">Language:</span>
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          className="bg-gray-800 text-white text-sm border border-gray-600 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          {LANGUAGES.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
        <span className="ml-auto text-xs text-gray-500">main branch</span>
      </div>

      <div className="flex-1">
        <Editor
          height="100%"
          language={language}
          value={value}
          theme="vs-dark"
          onChange={(v) => setValue(v)}
          onMount={handleEditorDidMount}
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
