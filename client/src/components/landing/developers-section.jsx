import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

const codeExamples = [
  {
    label: 'Create Room',
    code: `const res = await axios.post('/api/rooms', {
  name: 'sprint-planning'
})

// res.data.room.joinCode → "K7X2QP"`,
  },
  {
    label: 'Join & Sync',
    code: `socket.emit('room:join', { branchId })

socket.on('code:sync', ({ content, revision }) => {
  editor.setValue(content)
  otClient = new OTClient(revision)
})`,
  },
  {
    label: 'Run Code',
    code: `socket.emit('code:run', {
  code: editor.getValue(),
  language: 'python'
})

socket.on('code:result', ({ stdout, stderr }) => {
  render(stdout, stderr)
})`,
  },
];

const features = [
  {
    title: 'Operational Transform, not diffing',
    description: 'A ported classic OT engine (retain/insert/delete, transform, compose) runs identically on client and server.',
  },
  {
    title: 'Socket-first API',
    description: 'Rooms and branches are REST resources; everything that happens inside one is a typed Socket.io event.',
  },
  {
    title: 'Membership-checked everywhere',
    description: 'No socket handler trusts a client-supplied room or branch id without a DB-backed membership check.',
  },
  {
    title: 'Open source',
    description: 'The full server and client are on GitHub — auth, OT core, and socket layer included.',
  },
];

export function DevelopersSection() {
  const [activeTab, setActiveTab] = useState(0);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(codeExamples[activeTab].code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section id="developers" className="relative py-32 overflow-hidden">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-16 items-start">
          {/* Left: Content */}
          <div>
            <p className="text-sm font-mono text-primary mb-3">// FOR DEVELOPERS</p>
            <h2 className="text-3xl lg:text-5xl font-semibold tracking-tight mb-6 text-balance">
              Built for developers,
              <br />
              by a developer.
            </h2>
            <p className="text-lg text-muted-foreground mb-10 leading-relaxed">
              A small, honest API surface: REST for rooms and branches,
              Socket.io events for everything that happens live.
            </p>

            <div className="grid gap-6">
              {features.map((feature) => (
                <div key={feature.title} className="flex gap-4">
                  <div className="w-1 bg-primary/30 rounded-full shrink-0" />
                  <div>
                    <h3 className="font-medium mb-1">{feature.title}</h3>
                    <p className="text-sm text-muted-foreground">{feature.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Code block */}
          <div className="lg:sticky lg:top-32">
            <div className="rounded-xl overflow-hidden bg-card border border-border card-shadow">
              {/* Tabs */}
              <div className="flex items-center gap-1 p-2 border-b border-border bg-secondary/30">
                {codeExamples.map((example, idx) => (
                  <button
                    key={example.label}
                    type="button"
                    onClick={() => setActiveTab(idx)}
                    className={`px-3 py-1.5 text-xs font-mono rounded-md transition-colors ${
                      activeTab === idx
                        ? 'bg-card text-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {example.label}
                  </button>
                ))}
                <div className="flex-1" />
                <button
                  type="button"
                  onClick={handleCopy}
                  className="p-2 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Copy code"
                >
                  {copied ? (
                    <Check className="w-4 h-4 text-green-500" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              </div>

              {/* Code content */}
              <div className="p-6 font-mono text-sm overflow-x-auto">
                <pre className="text-muted-foreground">
                  <code>
                    {codeExamples[activeTab].code.split('\n').map((line, i) => (
                      <div key={i} className="leading-relaxed">
                        <span className="text-muted-foreground/40 select-none w-8 inline-block">{i + 1}</span>
                        <span
                          dangerouslySetInnerHTML={{
                            __html: highlightSyntax(line),
                          }}
                        />
                      </div>
                    ))}
                  </code>
                </pre>
              </div>

              {/* Terminal output */}
              <div className="border-t border-border p-4 bg-secondary/20">
                <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground mb-2">
                  <span className="text-green-500">$</span>
                  <span>git clone github.com/MKD2004/DevCollab</span>
                </div>
                <div className="text-xs font-mono text-muted-foreground/60">
                  React + Vite frontend, Node + Express backend
                </div>
              </div>
            </div>

            {/* Docs link */}
            <div className="mt-6 flex items-center gap-4 text-sm">
              <a
                href="https://github.com/MKD2004/DevCollab"
                target="_blank"
                rel="noreferrer"
                className="text-primary hover:underline font-mono"
              >
                View on GitHub
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function highlightSyntax(line) {
  return line
    .replace(/(const|await|axios|socket|editor|render)/g, '<span class="text-primary">$1</span>')
    .replace(/('.*?'|".*?")/g, '<span class="text-green-400">$1</span>')
    .replace(/(\/\/.*$)/g, '<span class="text-muted-foreground/50">$1</span>')
    .replace(/(\{|\}|\(|\)|\[|\])/g, '<span class="text-muted-foreground">$1</span>');
}
