import { useState } from 'react';
import { Link } from 'react-router-dom';
import { login as loginApi, register as registerApi } from '../../api/auth';
import { useAuth } from '../../hooks/useAuth.jsx';
import { AsciiWave } from '../landing/ascii-wave';
import { Button } from '../ui/button';

export default function LoginForm() {
  const { login } = useAuth();
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [form, setForm] = useState({ username: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res =
        mode === 'login'
          ? await loginApi({ email: form.email, password: form.password })
          : await registerApi({ username: form.username, email: form.email, password: form.password });
      login(res.data.user);
    } catch (err) {
      setError(err.response?.data?.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden px-6">
      {/* Same background as the landing hero */}
      <div className="absolute inset-0 grid-pattern opacity-50" />
      <div className="absolute inset-0 opacity-30 pointer-events-none overflow-hidden">
        <AsciiWave className="w-full h-full" />
      </div>

      {/* Logo, top-left, matches Navigation */}
      <Link to="/" className="absolute top-6 left-6 md:top-8 md:left-8 flex items-center gap-3 group z-10">
        <div className="relative w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-accent/20" />
          <span className="font-mono text-primary font-bold text-lg relative z-10">D</span>
        </div>
        <span className="text-xl font-bold tracking-tight">DevCollab</span>
      </Link>

      <div className="relative z-10 w-full max-w-md bg-card border border-border rounded-2xl card-shadow p-8">
        <h1
          className="text-3xl font-semibold text-center mb-2"
          style={{ fontFamily: 'var(--font-geist-pixel-line), monospace' }}
        >
          {mode === 'login' ? 'Welcome back' : 'Create an account'}
        </h1>
        <p className="text-muted-foreground text-center mb-8 text-sm">
          Real-time collaborative code editor
        </p>

        <div className="flex rounded-lg bg-secondary p-1 mb-6">
          {['login', 'register'].map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                setError('');
              }}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                mode === m
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {m === 'login' ? 'Sign In' : 'Register'}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'register' && (
            <div>
              <label className="block text-sm text-muted-foreground mb-1">Username</label>
              <input
                type="text"
                name="username"
                value={form.username}
                onChange={handleChange}
                required
                className="w-full bg-secondary/50 border border-border rounded-lg px-4 py-2.5 text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="your_username"
              />
            </div>
          )}
          <div>
            <label className="block text-sm text-muted-foreground mb-1">Email</label>
            <input
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
              required
              className="w-full bg-secondary/50 border border-border rounded-lg px-4 py-2.5 text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label className="block text-sm text-muted-foreground mb-1">Password</label>
            <input
              type="password"
              name="password"
              value={form.password}
              onChange={handleChange}
              required
              className="w-full bg-secondary/50 border border-border rounded-lg px-4 py-2.5 text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="text-sm text-destructive-foreground bg-destructive/10 border border-destructive/30 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <Button
            type="submit"
            disabled={loading}
            className="w-full bg-foreground hover:bg-foreground/90 text-background font-medium py-2.5 h-auto rounded-lg"
          >
            {loading ? 'Please wait…' : mode === 'login' ? 'Sign In' : 'Create Account'}
          </Button>
        </form>
      </div>
    </div>
  );
}
