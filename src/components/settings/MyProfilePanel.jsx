import { useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';

const ROLE_LABELS = { super_admin: 'Super Admin', admin: 'Admin', user: 'User' };

export default function MyProfilePanel() {
  const { user, deleteAccount } = useAuth();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const initial = (user?.full_name || user?.email || '?').charAt(0).toUpperCase();

  const handleDeleteAccount = async () => {
    try {
      await deleteAccount();
    } catch {
      toast.error('Failed to delete account');
    }
  };

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xl font-semibold shrink-0">
            {initial}
          </div>
          <div className="min-w-0">
            <p className="text-lg font-semibold text-foreground truncate">{user?.full_name}</p>
            <p className="text-sm text-muted-foreground truncate">{user?.email}</p>
          </div>
          <Badge variant="secondary" className="ml-auto shrink-0">{ROLE_LABELS[user?.role] || user?.role}</Badge>
        </div>
      </Card>

      <Card className="p-5 border-destructive/30">
        <h3 className="text-sm font-semibold text-destructive mb-1">Danger Zone</h3>
        <p className="text-sm text-muted-foreground mb-4">Deleting your account will permanently remove all your data from the system.</p>
        <Button variant="destructive" size="sm" className="gap-2" onClick={() => setShowDeleteDialog(true)}>
          <Trash2 className="w-4 h-4" /> Delete Account
        </Button>
      </Card>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Your Account?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. All your data will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex items-center gap-2 rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2">
            <Trash2 className="w-4 h-4 text-destructive flex-shrink-0" />
            <p className="text-sm text-destructive font-medium">This will delete your account and all associated data.</p>
          </div>
          <div className="flex gap-3 mt-4">
            <AlertDialogCancel asChild>
              <Button variant="outline">Cancel</Button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button variant="destructive" onClick={handleDeleteAccount}>Delete Account</Button>
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
