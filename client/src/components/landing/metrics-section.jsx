import { useEffect, useState, useRef } from 'react';
import { AsciiWave } from './ascii-wave';

function AnimatedCounter({ end, suffix = '', prefix = '' }) {
  const [count, setCount] = useState(0);
  const ref = useRef(null);
  const [hasAnimated, setHasAnimated] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasAnimated) {
          setHasAnimated(true);
          const duration = 2000;
          const startTime = performance.now();

          const animate = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            setCount(Math.floor(eased * end));

            if (progress < 1) {
              requestAnimationFrame(animate);
            }
          };

          requestAnimationFrame(animate);
        }
      },
      { threshold: 0.5 },
    );

    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [end, hasAnimated]);

  return (
    <div ref={ref} className="font-mono text-4xl lg:text-6xl font-semibold tracking-tight">
      {prefix}
      {count.toLocaleString()}
      {suffix}
    </div>
  );
}

const metrics = [
  { value: 139, suffix: '', label: 'Backend tests passing', sublabel: 'Jest + Supertest + real sockets' },
  { value: 7, suffix: '', label: 'Languages executable', sublabel: 'via the Piston sandbox' },
  { value: 50, suffix: 'ms', label: 'Cursor sync debounce', sublabel: 'feels instant, stays light' },
  { value: 0, suffix: '', label: 'Merge conflicts', sublabel: 'OT convergence guarantees it' },
];

const activity = [
  { icon: '✓', event: 'feat: multi-admin rooms + leave room', detail: 'ownership transfer, promote/demote' },
  { icon: '✓', event: 'feat: join-request flow', detail: 'request-to-join, owner/admin accept' },
  { icon: '✓', event: 'fix: security hardening pass', detail: 'CSRF, rate limiting, httpOnly cookies' },
  { icon: '✓', event: 'feat: Piston code execution', detail: 'broadcast run output to the room' },
];

export function MetricsSection() {
  return (
    <section id="metrics" className="relative py-32 overflow-hidden">
      {/* ASCII Wave Background */}
      <div className="absolute inset-0 flex items-center justify-center opacity-10 pointer-events-none">
        <AsciiWave className="w-full h-full object-cover" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-6 lg:px-8">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6 mb-16">
          <div>
            <p className="text-sm font-mono text-primary mb-3">// BUILT SO FAR</p>
            <h2 className="text-3xl lg:text-5xl font-semibold tracking-tight text-balance">
              Real engineering,
              <br />
              not vaporware.
            </h2>
          </div>
          <div className="flex items-center gap-3 font-mono text-sm text-muted-foreground">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span>Actively developed</span>
          </div>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-px bg-border rounded-xl overflow-hidden card-shadow">
          {metrics.map((metric) => (
            <div key={metric.label} className="bg-card p-8 flex flex-col gap-4">
              <div className="text-primary">
                <AnimatedCounter end={metric.value} suffix={metric.suffix} />
              </div>
              <div>
                <div className="text-foreground font-medium">{metric.label}</div>
                <div className="text-sm text-muted-foreground">{metric.sublabel}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Recent Activity */}
        <div className="mt-12 p-6 rounded-xl bg-card border border-border card-shadow">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            <span className="font-mono text-sm text-muted-foreground">Recently shipped</span>
          </div>
          <div className="font-mono text-xs space-y-2 text-muted-foreground">
            {activity.map((item) => (
              <div key={item.event} className="flex items-center gap-4 animate-in slide-in-from-bottom-2 duration-500">
                <span className="text-green-500 w-4">{item.icon}</span>
                <span className="text-foreground">{item.event}</span>
                <span className="text-muted-foreground/60 hidden sm:inline">— {item.detail}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
