import MonacoEditor from '../components/editor/MonacoEditor';
import { useAuth } from '../hooks/useAuth';

export default function Dashboard() {
  const { user, logout } = useAuth();

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-white">
      {/* Navbar */}
      <header className="flex items-center justify-between px-6 py-3 bg-gray-900 border-b border-gray-800 shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-indigo-400 font-bold text-lg">DevCollab</span>
          <span className="text-gray-600 text-sm">/ scratch</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-400">
            Signed in as{' '}
            <span className="text-white font-medium">{user?.username}</span>
          </span>
          <button
            onClick={logout}
            className="text-sm text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 px-3 py-1.5 rounded-lg transition-colors"
          >
            Sign out
          </button>
        </div>
      </header>

      {/* Editor — takes remaining height */}
      <main className="flex-1 overflow-hidden">
        <MonacoEditor />
      </main>
    </div>
  );
}
