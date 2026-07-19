import { useEffect, useRef, useState, useCallback } from 'react';
import { AsciiCube } from './ascii-cube';

const asciiAnimations = {
  neural: (frame) => {
    const states = ['◉', '◎', '○', '◎'];
    const getChar = (offset) => states[(frame + offset) % states.length];
    return `  ┌───────┐
  │ ${getChar(0)} ${getChar(1)} ${getChar(2)} │
  │ ${getChar(3)} ${getChar(4)} ${getChar(5)} │
  │ ${getChar(6)} ${getChar(7)} ${getChar(8)} │
  └───────┘`;
  },
  workflow: (frame) => {
    const arrows = ['─', '═', '━', '═'];
    const pulse = ['►', '▸', '▹', '▸'];
    const a = arrows[frame % arrows.length];
    const p = pulse[frame % pulse.length];
    return `  ┌─┐   ┌─┐
  │A├${a}${a}${p}│B│
  └─┘   └┬┘
        ┌▼┐
        │C│
        └─┘`;
  },
  security: (frame) => {
    const lock = ['◈', '◇', '◆', '◇'];
    const bars = ['░', '▒', '▓', '▒'];
    const l = lock[frame % lock.length];
    const b = bars[frame % bars.length];
    return `   ╔═══╗
   ║ ${l} ║
  ┌╨───╨┐
  │${b}${b}${b}${b}${b}│
  └─────┘`;
  },
  analytics: (frame) => {
    const heights = [
      [1, 2, 3, 2],
      [2, 3, 2, 3],
      [3, 2, 3, 1],
      [2, 1, 2, 2],
    ];
    const h = heights[frame % heights.length];
    const bar = (height) => {
      if (height === 3) return '█';
      if (height === 2) return '▄';
      return '▁';
    };
    return `  │${h[0] === 3 ? '▄' : ' '}${h[1] === 3 ? '▄' : ' '}${h[2] === 3 ? '▄' : ' '}${h[3] === 3 ? '▄' : ' '}
  │${bar(h[0])} ${bar(h[1])} ${bar(h[2])} ${bar(h[3])}
  │█ █ █ █
  └────────`;
  },
  globe: (frame) => {
    const rotations = [
      `    .--.
   /    \\
  | (  ) |
   \\    /
    '--'`,
      `    .--.
   /    \\
  |  () |
   \\    /
    '--'`,
      `    .--.
   /    \\
  |  (  )|
   \\    /
    '--'`,
      `    .--.
   /    \\
  | ()  |
   \\    /
    '--'`,
    ];
    return rotations[frame % rotations.length];
  },
  api: (frame) => {
    const methods = ['GET', 'POST', 'PUT', 'GET'];
    const arrows = ['────────►', '═══════►', '━━━━━━━►', '────────►'];
    const m = methods[frame % methods.length];
    const a = arrows[frame % arrows.length];
    return `  ${m} /api
  ${a}
  ◄────────
  { data }`;
  },
};

const features = [
  {
    title: 'Operational Transform',
    description: 'True concurrent editing with zero data loss — two people typing at the same cursor position converge correctly, like Google Docs.',
    animationKey: 'neural',
  },
  {
    title: 'Branches',
    description: 'Fork a room into independent live documents, rename them, and switch between them — a lightweight take on git branching for code sessions.',
    animationKey: 'workflow',
  },
  {
    title: 'Hardened by Default',
    description: 'httpOnly cookies, CSRF protection, rate limiting, and DB-backed membership checks on every socket event.',
    animationKey: 'security',
  },
  {
    title: 'Live Presence',
    description: 'See every collaborator\'s cursor and selection in real time, color-coded per user, alongside room chat.',
    animationKey: 'analytics',
  },
  {
    title: 'Join by Code or Request',
    description: 'Share a 6-character join code, or let teammates request access — owners and admins accept or decline live.',
    animationKey: 'globe',
  },
  {
    title: 'Run Any Language',
    description: 'Execute JavaScript, Python, C++, Java, Go, Rust, and TypeScript in-browser via Piston, output streamed to the whole room.',
    animationKey: 'api',
  },
];

function AnimatedAscii({ animationKey }) {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setFrame((f) => f + 1);
    }, 400);
    return () => clearInterval(interval);
  }, []);

  const getAscii = useCallback(() => {
    return asciiAnimations[animationKey](frame);
  }, [animationKey, frame]);

  return (
    <pre className="font-mono text-xs text-primary leading-tight whitespace-pre">
      {getAscii()}
    </pre>
  );
}

function FeatureCard({ feature, index }) {
  const [isVisible, setIsVisible] = useState(false);
  const cardRef = useRef(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setIsVisible(true);
      },
      { threshold: 0.2 },
    );

    if (cardRef.current) observer.observe(cardRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={cardRef}
      className={`group relative rounded-xl p-8 card-shadow transition-all duration-700 hover:border-primary/50 bg-transparent border-0 border-none border-transparent ${
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
      }`}
      style={{ transitionDelay: `${index * 100}ms` }}
    >
      <div className="mb-6 h-20 flex items-center">
        <AnimatedAscii animationKey={feature.animationKey} />
      </div>

      <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
      <p className="text-sm text-muted-foreground leading-relaxed">
        {feature.description}
      </p>
    </div>
  );
}

export function FeaturesSection() {
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
    <section id="features" ref={sectionRef} className="relative py-32 overflow-hidden">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        {/* Header with ASCII cube */}
        <div className="grid lg:grid-cols-2 gap-16 items-center mb-20">
          <div>
            <p className="text-sm font-mono text-primary mb-3">// PLATFORM</p>
            <h2
              className={`text-3xl lg:text-5xl font-semibold tracking-tight mb-6 transition-all duration-700 ${
                isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
              }`}
            >
              <span className="text-balance">Everything you need</span>
              <br />
              <span className="text-balance">to build together.</span>
            </h2>
            <p
              className={`text-lg text-muted-foreground leading-relaxed max-w-lg transition-all duration-700 delay-100 ${
                isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
              }`}
            >
              A complete real-time collaboration layer for code — from the first
              keystroke to running your program, with a team watching live.
            </p>
          </div>

          <div className="flex justify-center lg:justify-end">
            <AsciiCube className="w-[480px] h-[640px]" />
          </div>
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {features.map((feature, index) => (
            <FeatureCard key={feature.title} feature={feature} index={index} />
          ))}
        </div>
      </div>
    </section>
  );
}
