import { useEffect, useState, useRef } from 'react';
import { AsciiDna } from './ascii-dna';

const pieces = [
  { name: 'Socket.io + Redis adapter', detail: 'Cross-instance pub/sub for horizontal scaling' },
  { name: 'Operational Transform core', detail: 'Ported TextOperation engine, client + server' },
  { name: 'MongoDB Atlas', detail: 'Rooms, branches, messages, join requests' },
  { name: 'Piston sandbox', detail: '7 languages executed off-process' },
];

export function InfrastructureSection() {
  const [isVisible, setIsVisible] = useState(false);
  const sectionRef = useRef(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setIsVisible(true);
      },
      { threshold: 0.1 },
    );

    if (sectionRef.current) observer.observe(sectionRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section ref={sectionRef} className="relative py-32 bg-muted/30 overflow-hidden">
      {/* ASCII DNA Background */}
      <div className="absolute right-0 top-1/2 -translate-y-1/2 opacity-10 pointer-events-none">
        <AsciiDna className="w-[600px] h-[500px]" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* Left: Content */}
          <div
            className={`transition-all duration-700 ${
              isVisible ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-8'
            }`}
          >
            <p className="text-sm font-mono text-primary mb-4">// UNDER THE HOOD</p>
            <h2 className="text-4xl lg:text-5xl font-semibold tracking-tight mb-6 text-balance">
              Built on a real-time architecture.
            </h2>
            <p className="text-lg text-muted-foreground leading-relaxed mb-8">
              No last-write-wins hacks. DevCollab runs a classic Operational
              Transform pipeline over Socket.io, with Redis pub/sub so the
              realtime layer scales across multiple server instances.
            </p>

            <div className="space-y-6">
              <div className="flex items-start gap-4">
                <pre className="font-mono text-2xl text-primary">⚡</pre>
                <div>
                  <h3 className="font-semibold mb-1">Convergent by design</h3>
                  <p className="text-sm text-muted-foreground">
                    Concurrent edits transform against missed operations and always converge
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <pre className="font-mono text-2xl text-primary">🔄</pre>
                <div>
                  <h3 className="font-semibold mb-1">Per-branch isolation</h3>
                  <p className="text-sm text-muted-foreground">
                    Every branch keeps its own OT document and presence state, no cross-talk
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <pre className="font-mono text-2xl text-primary">🛡️</pre>
                <div>
                  <h3 className="font-semibold mb-1">Authorized sockets</h3>
                  <p className="text-sm text-muted-foreground">
                    Every socket event is checked against real room/branch membership
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Architecture pieces */}
          <div
            className={`transition-all duration-700 delay-200 ${
              isVisible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-8'
            }`}
          >
            <div className="grid grid-cols-1 gap-3">
              {pieces.map((piece, index) => (
                <div
                  key={piece.name}
                  className="group relative bg-card rounded-lg p-5 border border-border card-shadow hover:border-primary/50 transition-all duration-300"
                  style={{ transitionDelay: `${index * 50}ms` }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-semibold">{piece.name}</h4>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground font-mono">{piece.detail}</span>
                  </div>

                  <div className="absolute right-4 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-30 transition-opacity font-mono text-xs text-primary">
                    <pre>{`
  ┌───┐
  │ ◉ │
  └─┬─┘
    │
`}</pre>
                  </div>
                </div>
              ))}
            </div>

            {/* Stats */}
            <div className="mt-8 p-6 rounded-lg bg-foreground/5 border border-border">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="font-mono text-2xl font-semibold text-primary">139</div>
                  <div className="text-xs text-muted-foreground">Backend tests</div>
                </div>
                <div>
                  <div className="font-mono text-2xl font-semibold text-primary">7</div>
                  <div className="text-xs text-muted-foreground">Languages run</div>
                </div>
                <div>
                  <div className="font-mono text-2xl font-semibold text-primary">0</div>
                  <div className="text-xs text-muted-foreground">Merge conflicts</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
