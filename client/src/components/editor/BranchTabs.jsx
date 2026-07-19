import { useState } from 'react';

export default function BranchTabs({ branches, currentBranchId, onSwitch, onCreate, onRename }) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState('');

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    await onCreate?.(name.trim());
    setName('');
    setCreating(false);
  };

  const startRename = (branch) => {
    setRenamingId(branch._id);
    setRenameValue(branch.name);
  };

  const submitRename = async (e) => {
    e.preventDefault();
    const trimmed = renameValue.trim();
    const branch = branches.find((b) => b._id === renamingId);
    if (trimmed && branch && trimmed !== branch.name) {
      await onRename?.(renamingId, trimmed);
    }
    setRenamingId(null);
  };

  return (
    <div className="ml-auto flex items-center gap-1.5">
      {branches.map((b) => {
        const active = b._id === currentBranchId;

        if (b._id === renamingId) {
          return (
            <form key={b._id} onSubmit={submitRename}>
              <input
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={submitRename}
                onKeyDown={(e) => e.key === 'Escape' && setRenamingId(null)}
                className="font-mono text-xs tracking-widest bg-secondary border border-primary rounded px-2 py-0.5 text-foreground focus:outline-none w-24"
              />
            </form>
          );
        }

        return (
          <button
            key={b._id}
            onClick={() => !active && onSwitch?.(b._id)}
            onDoubleClick={() => startRename(b)}
            title="Double-click to rename"
            className={`font-mono text-xs tracking-widest px-2 py-0.5 rounded border transition-colors ${
              active
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-secondary text-muted-foreground border-border hover:bg-secondary/70 hover:text-foreground'
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
            className="bg-secondary border border-border rounded px-2 py-0.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-ring w-28"
          />
        </form>
      ) : (
        <button
          onClick={() => setCreating(true)}
          title="New branch"
          className="text-xs text-muted-foreground hover:text-foreground border border-border hover:border-foreground/30 rounded px-2 py-0.5 transition-colors"
        >
          + branch
        </button>
      )}
    </div>
  );
}
