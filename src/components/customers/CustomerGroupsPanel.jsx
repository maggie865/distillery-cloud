import { useState } from 'react';
import { useCustomerGroups } from '@/hooks/useCustomerGroups';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tag, Plus, Trash2, Users } from 'lucide-react';

// Groups tab on the Customers page — create groups here, click one to jump
// to All Customers pre-filtered to its members (reuses that tab's search +
// table rather than duplicating a member list view).
export default function CustomerGroupsPanel({ onSelectGroup }) {
  const { groups, isLoading, createGroup, deleteGroup } = useCustomerGroups();
  const [newName, setNewName] = useState('');

  const handleCreate = () => {
    if (!newName.trim()) return;
    createGroup(newName);
    setNewName('');
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex items-center gap-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleCreate(); } }}
            placeholder="New group name, e.g. Christmas Promo"
            className="max-w-xs"
          />
          <Button onClick={handleCreate} disabled={!newName.trim()} className="gap-1.5"><Plus className="w-4 h-4" /> Create Group</Button>
        </div>
      </Card>

      {isLoading ? (
        <p className="text-sm text-muted-foreground text-center py-6">Loading…</p>
      ) : groups.length === 0 ? (
        <Card className="p-10 text-center space-y-2">
          <Tag className="w-8 h-8 mx-auto text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">No groups yet — create one above, then add customers to it from their profile.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {groups.map((g) => (
            <Card key={g.id} className="p-4 flex flex-col gap-2">
              <button type="button" onClick={() => onSelectGroup(g.id)} className="text-left flex-1">
                <p className="font-semibold truncate">{g.name}</p>
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1"><Users className="w-3 h-3" /> {g.memberCount} customer{g.memberCount !== 1 ? 's' : ''}</p>
              </button>
              <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive hover:text-destructive self-end -mt-1" onClick={() => deleteGroup(g.id)}>
                <Trash2 className="w-3 h-3 mr-1" /> Delete
              </Button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
