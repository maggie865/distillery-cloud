import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import { renamePalletItemsForMerge } from '@/lib/palletStock';

export default function FixProductNames() {
  const queryClient = useQueryClient();
  const [fixing, setFixing] = useState(false);

  const { data: finishedGoods = [], isLoading } = useQuery({
    queryKey: ['finishedGoods-all'],
    queryFn: () => base44.entities.FinishedGood.list('product_name', 5000),
  });

  // Find records where product_name ends with " Nml" (e.g. "London Dry Gin 700ml")
  const needsFix = finishedGoods.filter(g => /\s\d+ml$/i.test(g.product_name || ''));

  const fixMutation = useMutation({
    mutationFn: async () => {
      setFixing(true);
      const updates = [];
      // A plain rename can collide with a record that already exists under
      // the clean name for the same batch/size (e.g. "X 200ml" and "X" both
      // present) — renaming blindly would then leave two FinishedGood rows
      // with an identical product/batch/size key, which every exact-match
      // lookup elsewhere (dispatch, pallets, stock takes) only ever finds
      // one of. Merge into the existing record instead when that happens.
      for (const fg of needsFix) {
        const cleanName = (fg.product_name || '').replace(/\s\d+ml$/i, '').trim();
        if (!cleanName || cleanName === fg.product_name) continue;

        const collision = finishedGoods.find(g =>
          g.id !== fg.id &&
          g.product_name === cleanName &&
          (g.batch_number || null) === (fg.batch_number || null) &&
          Number(g.bottle_size_ml) === Number(fg.bottle_size_ml)
        );

        if (collision) {
          await base44.entities.FinishedGood.update(collision.id, {
            quantity_bottles: (collision.quantity_bottles || 0) + (fg.quantity_bottles || 0),
            total_lals: parseFloat(((collision.total_lals || 0) + (fg.total_lals || 0)).toFixed(4)),
          });
          await base44.entities.FinishedGood.delete(fg.id);
        } else {
          await base44.entities.FinishedGood.update(fg.id, { product_name: cleanName });
        }

        await renamePalletItemsForMerge([fg.product_name], cleanName, fg.batch_number, fg.bottle_size_ml);
        updates.push({ id: fg.id, old: fg.product_name, new: cleanName, merged: !!collision });
      }
      return updates;
    },
    onSuccess: (updates) => {
      queryClient.invalidateQueries({ queryKey: ['finishedGoods'] });
      queryClient.invalidateQueries({ queryKey: ['finishedGoods-all'] });
      toast.success(`Fixed ${updates.length} product name${updates.length !== 1 ? 's' : ''}`);
      setFixing(false);
    },
    onError: () => {
      toast.error('Failed to fix product names');
      setFixing(false);
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-6 flex items-center justify-center">
          <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading finished goods…
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mb-4">
      <CardHeader className="pb-3">
        <CardTitle className="font-display flex items-center gap-2">
          <Wand2 className="w-4 h-4" />
          Fix Product Names
        </CardTitle>
      </CardHeader>
      <CardContent>
        {needsFix.length === 0 ? (
          <p className="text-sm text-muted-foreground">All product names are clean — no records need fixing.</p>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground mb-2">
              {needsFix.length} product{needsFix.length !== 1 ? 's' : ''} have the bottle size embedded in the name. Click below to strip the size suffix (e.g. "700ml").
            </p>
            <div className="max-h-40 overflow-auto rounded border border-border">
              <table className="w-full text-xs">
                <tbody>
                  {needsFix.map(fg => (
                    <tr key={fg.id} className="border-b border-border last:border-0">
                      <td className="p-1.5 font-medium">{fg.product_name}</td>
                      <td className="p-1.5 text-muted-foreground">→</td>
                      <td className="p-1.5 text-green-700">
                        {(fg.product_name || '').replace(/\s\d+ml$/i, '').trim()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button
              onClick={() => fixMutation.mutate()}
              disabled={fixing}
              className="gap-1.5"
            >
              {fixing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
              {fixing ? 'Fixing…' : 'Fix All Names'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}