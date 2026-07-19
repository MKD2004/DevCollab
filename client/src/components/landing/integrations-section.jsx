import { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { AsciiCube } from './ascii-cube';

const stack = [
  { name: 'React + Vite', category: 'Frontend', ascii: `  ┌─┐\n  │#│\n  └─┘` },
  { name: 'Monaco Editor', category: 'Code editor', ascii: `  ╔═╗\n  ║<║\n  ╚═╝` },
  { name: 'Socket.io', category: 'Realtime', ascii: `  ┌$┐\n  └─┘` },
  { name: 'MongoDB Atlas', category: 'Database', ascii: `  [█]\n  [█]` },
  { name: 'Redis', category: 'Pub/sub', ascii: `  ◈◈\n  ◈◈` },
  { name: 'Node.js + Express', category: 'Backend', ascii: `  ≋≋\n  ≋≋` },
  { name: 'Piston API', category: 'Code execution', ascii: `  {M}\n  ---` },
  { name: 'JWT + bcrypt', category: 'Auth', ascii: `  ▲\n  ─` },
];

export function IntegrationsSection() {
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
    <section ref={sectionRef} className="relative py-32 overflow-hidden">
      {/* ASCII Cube Background */}
      <div className="absolute left-10 top-1/3 opacity-5 pointer-events-none hidden xl:block">
        <AsciiCube className="w-[400px] h-[350px]" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-6 lg:px-8">
        {/* Header */}
        <div
          className={`text-center max-w-3xl mx-auto mb-16 transition-all duration-700 ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}
        >
          <p className="text-sm font-mono text-primary mb-4">// TECH STACK</p>
          <h2 className="text-4xl lg:text-5xl font-semibold tracking-tight mb-6 text-balance">
            Built with tools that scale.
            <br />
            No magic, just engineering.
          </h2>
          <p className="text-lg text-muted-foreground leading-relaxed">
            Every layer of DevCollab is a well-known, production-grade tool —
            wired together for real-time collaborative editing.
          </p>
        </div>

        {/* Stack Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
          {stack.map((item, index) => (
            <div
              key={item.name}
              className={`group relative bg-card rounded-xl p-6 border border-border card-shadow hover:border-primary/50 transition-all duration-500 ${
                isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
              }`}
              style={{ transitionDelay: `${index * 50}ms` }}
            >
              <pre className="font-mono text-lg text-primary mb-4 leading-tight h-12 flex items-center justify-center">
                {item.ascii}
              </pre>

              <div className="text-center">
                <h3 className="font-semibold mb-1">{item.name}</h3>
                <p className="text-xs text-muted-foreground">{item.category}</p>
              </div>

              <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <span className="text-primary font-mono text-xs">→</span>
              </div>
            </div>
          ))}
        </div>

        {/* CTA Card */}
        <div
          className={`relative overflow-hidden rounded-2xl bg-gradient-to-br from-card to-muted/50 border border-border card-shadow transition-all duration-700 delay-300 ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}
        >
          <div className="relative z-10 p-8 lg:p-12">
            <div className="grid lg:grid-cols-2 gap-8 items-center">
              <div>
                <h3 className="text-2xl lg:text-3xl font-semibold mb-4">
                  Curious how it's built?
                </h3>
                <p className="text-muted-foreground mb-6">
                  DevCollab's realtime layer runs a classic Operational Transform
                  pipeline over Socket.io, with per-branch OT documents and
                  Redis-backed pub/sub for horizontal scaling.
                </p>
                <Link
                  to="/login"
                  className="inline-block px-6 py-3 bg-foreground text-background rounded-lg font-medium hover:bg-foreground/90 transition-colors"
                >
                  Try it yourself
                </Link>
              </div>

              <div className="font-mono text-xs text-muted-foreground space-y-2 bg-background/50 rounded-lg p-6 border border-border">
                <div className="text-primary mb-2">// Server: transform + apply a client op</div>
                <div>
                  <span className="text-purple-400">const</span> result = otDocument.
                  <span className="text-blue-400">applyClientOperation</span>(
                </div>
                <div className="pl-4">
                  <span className="text-green-400">revision</span>, <span className="text-green-400">operation</span>
                </div>
                <div>{'});'} // → transformed op + new revision</div>
              </div>
            </div>
          </div>

          <div className="absolute inset-0 opacity-5 grid-pattern pointer-events-none" />
        </div>
      </div>
    </section>
  );
}
