import { useState } from 'react';
import { useCustomerGroups } from '@/hooks/useCustomerGroups';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tag, X, Plus } from 'lucide-react';

export default function CustomerGroupTagEditor({ customerId }) {
  const { groups, groupsByCustomerId, addMember, removeMember, addCustomerToGroupByName } = useCustomerGroups();
  const [adding, setAdding] = useState(false);
  const [pickGroupId, setPickGroupId] = useState('');
  const [newGroupName, setNewGroupName] = useState('');

  const myGroups = groupsByCustomerId.get(customerId) || [];
  const availableGroups = groups.filter((g) => !myGroups.some((mg) => mg.id === g.id));

  const closeAdd = () => { setAdding(false); setPickGroupId(''); setNewGroupName(''); };

  const handlePickExisting = (groupId) => {
    addMember({ customerId, groupId });
    closeAdd();
  };

  const handleCreateAndAdd = async () => {
    if (!newGroupName.trim()) return;
    await addCustomerToGroupByName(customerId, newGroupName);
    closeAdd();
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Tag className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
      {myGroups.map((g) => (
        <span key={g.id} className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 pl-2.5 pr-1 py-1 text-xs">
          {g.name}
          <button type="button" onClick={() => removeMember({ customerId, groupId: g.id })} className="rounded-full p-0.5 hover:bg-destructive/10 hover:text-destructive">
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}

      {adding ? (
        <div className="flex items-center gap-1.5">
          {availableGroups.length > 0 && (
            <Select value={pickGroupId} onValueChange={handlePickExisting}>
              <SelectTrigger className="h-7 text-xs w-40"><SelectValue placeholder="Existing group…" /></SelectTrigger>
              <SelectContent>
                {availableGroups.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Input
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleCreateAndAdd(); } }}
            placeholder="Or type a new group name"
            className="h-7 text-xs w-44"
            autoFocus
          />
          <Button type="button" size="sm" className="h-7 text-xs px-2" onClick={handleCreateAndAdd} disabled={!newGroupName.trim()}>Add</Button>
          <Button type="button" variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={closeAdd}>Cancel</Button>
        </div>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground hover:border-foreground/40">
          <Plus className="w-3 h-3" /> Add to group
        </button>
      )}
    </div>
  );
}
