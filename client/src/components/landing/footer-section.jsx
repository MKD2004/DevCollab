import { ExternalLink, Terminal } from 'lucide-react';
import { Link } from 'react-router-dom';

const footerLinks = {
  Platform: [
    { name: 'Features', href: '#features' },
    { name: 'Technology', href: '#how-it-works' },
    { name: 'Built so far', href: '#metrics' },
    { name: 'Developers', href: '#developers' },
  ],
  Project: [
    { name: 'GitHub', href: 'https://github.com/MKD2004/DevCollab' },
    { name: 'Sign in', href: '/login' },
  ],
};

export function FooterSection() {
  return (
    <footer className="relative border-t border-border">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        {/* Main Footer */}
        <div className="py-16">
          <div className="grid grid-cols-2 md:grid-cols-6 gap-8">
            {/* Brand Column */}
            <div className="col-span-2">
              <Link to="/" className="flex items-center gap-2 mb-6">
                <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
                  <Terminal className="w-4 h-4 text-primary" />
                </div>
                <span className="font-semibold text-lg tracking-tight">DevCollab</span>
              </Link>

              <p className="text-sm text-muted-foreground leading-relaxed mb-6">
                A real-time collaborative code editor — live cursors, branches, chat,
                and instant execution, built from scratch.
              </p>

              <div className="flex gap-3">
                <a
                  href="https://github.com/MKD2004/DevCollab"
                  target="_blank"
                  rel="noreferrer"
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="GitHub"
                >
                  <ExternalLink className="w-5 h-5" />
                </a>
              </div>
            </div>

            {/* Link Columns */}
            {Object.entries(footerLinks).map(([title, links]) => (
              <div key={title}>
                <h3 className="text-sm font-medium mb-4">{title}</h3>
                <ul className="space-y-3">
                  {links.map((link) => (
                    <li key={link.name}>
                      {link.href.startsWith('/') ? (
                        <Link
                          to={link.href}
                          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {link.name}
                        </Link>
                      ) : (
                        <a
                          href={link.href}
                          target={link.href.startsWith('http') ? '_blank' : undefined}
                          rel={link.href.startsWith('http') ? 'noreferrer' : undefined}
                          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {link.name}
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="py-6 border-t border-border flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} DevCollab. Built by MKD2004.
          </p>

          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
              Actively developed
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
