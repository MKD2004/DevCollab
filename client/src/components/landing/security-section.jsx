import { useEffect, useState, useRef } from 'react';
import { AsciiTorus } from './ascii-torus';

const securityFeatures = [
  {
    title: 'httpOnly Auth Cookies',
    description: 'JWTs never touch localStorage or JS — no XSS token theft, double-submit CSRF on every unsafe request.',
    ascii: `  ╔═══╗\n  ║ ◈ ║\n  ╚═══╝`,
  },
  {
    title: 'DB-Backed Authorization',
    description: 'Every socket event checks real room/branch membership before joining, editing, or running code.',
    ascii: `  ┌───┐\n  │ ✓ │\n  └───┘`,
  },
  {
    title: 'Rate Limiting',
    description: 'Login, register, join-code, and code execution are all throttled against brute-force and abuse.',
    ascii: `  ╭───╮\n  │ ★ │\n  ╰───╯`,
  },
  {
    title: 'bcrypt Password Hashing',
    description: '12 salt rounds, never a plaintext password stored or logged.',
    ascii: `  [===]\n  [===]`,
  },
  {
    title: 'Role-Based Access',
    description: 'Owner and admin roles gate join-request handling and admin promotion — never assumed from a client claim.',
    ascii: `  ◉─◉─◉\n  │ │ │`,
  },
  {
    title: 'Injection-Hardened',
    description: 'Auth inputs are type-checked to close NoSQL operator-injection vectors before they reach a query.',
    ascii: `  ▪ ▪ ▪\n  ▪ ▪ ▪`,
  },
];

export function SecuritySection() {
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
      {/* ASCII Torus Background */}
      <div className="absolute right-0 bottom-0 opacity-5 pointer-events-none">
        <AsciiTorus className="w-[500px] h-[450px]" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-6 lg:px-8">
        {/* Header */}
        <div
          className={`text-center max-w-3xl mx-auto mb-16 transition-all duration-700 ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}
        >
          <p className="text-sm font-mono text-primary mb-4">// SECURITY</p>
          <h2 className="text-4xl lg:text-5xl font-semibold tracking-tight mb-6 text-balance">
            Hardened by a dedicated audit pass.
          </h2>
          <p className="text-lg text-muted-foreground leading-relaxed">
            Before shipping, DevCollab went through a full security hardening
            pass — every fix below shipped as its own tested, reviewed commit.
          </p>
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-16">
          {securityFeatures.map((feature, index) => (
            <div
              key={feature.title}
              className={`bg-card rounded-xl p-6 border border-border card-shadow transition-all duration-500 hover:border-primary/50 ${
                isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
              }`}
              style={{ transitionDelay: `${index * 50}ms` }}
            >
              <pre className="font-mono text-sm text-primary mb-4 leading-tight h-12 flex items-center">
                {feature.ascii}
              </pre>

              <h3 className="font-semibold mb-2">{feature.title}</h3>
              <p className="text-sm text-muted-foreground">{feature.description}</p>
            </div>
          ))}
        </div>

        {/* CORS / Headers Bar */}
        <div
          className={`rounded-xl bg-card border border-border card-shadow p-8 transition-all duration-700 delay-300 ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}
        >
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div>
              <h3 className="font-semibold text-lg mb-2">Locked-down transport</h3>
              <p className="text-sm text-muted-foreground">
                Restricted CORS origins and helmet security headers on every response
              </p>
            </div>

            <div className="flex flex-wrap gap-4 justify-center md:justify-end">
              {[
                { name: 'Helmet', status: 'Enabled' },
                { name: 'CORS', status: 'Restricted' },
                { name: 'CSRF', status: 'Double-submit' },
                { name: 'Cookies', status: 'httpOnly' },
              ].map((cert) => (
                <div
                  key={cert.name}
                  className="flex flex-col items-center gap-2 px-6 py-4 rounded-lg bg-muted/50 border border-border"
                >
                  <span className="font-mono text-xs text-primary">{cert.name}</span>
                  <span className="text-xs text-muted-foreground">{cert.status}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Security Notice */}
        <div
          className={`mt-8 p-6 rounded-xl bg-foreground/5 border border-primary/20 transition-all duration-700 delay-400 ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}
        >
          <div className="flex items-start gap-4">
            <pre className="font-mono text-2xl text-primary mt-1">🔒</pre>
            <div>
              <h4 className="font-semibold mb-2">Built in the open</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">
                DevCollab's source is on GitHub — read the actual auth middleware,
                socket authorization, and OT engine instead of taking our word for it.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
