import { useState } from 'react';

export default function BranchTabs({ branches, currentBranchId, onSwitch, onCreate }) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    await onCreate?.(name.trim());
    setName('');
    setCreating(false);
  };

  return (
    <div className="ml-auto flex items-center gap-1.5">
      {branches.map((b) => {
        const active = b._id === currentBranchId;
        return (
          <button
            key={b._id}
            onClick={() => !active && onSwitch?.(b._id)}
            className={`font-mono text-xs tracking-widest px-2 py-0.5 rounded border transition-colors ${
              active
                ? 'bg-indigo-600 text-white border-indigo-500'
                : 'bg-gray-800 text-gray-400 border-gray-700 hover:bg-gray-700 hover:text-gray-200'
            }`}
          >
            {b.name}
          </button>
        );
      })}

      {creating ? (
        <form onSubmit={handleCreate} className="flex items-center gap-1">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => !name && setCreating(false)}
            placeholder="branch name"
            className="bg-gray-800 border border-gray-700 rounded px-2 py-0.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 w-28"
          />
        </form>
      ) : (
        <button
          onClick={() => setCreating(true)}
          title="New branch"
          className="text-xs text-gray-500 hover:text-gray-300 border border-gray-700 hover:border-gray-500 rounded px-2 py-0.5 transition-colors"
        >
          + branch
        </button>
      )}
    </div>
  );
}
