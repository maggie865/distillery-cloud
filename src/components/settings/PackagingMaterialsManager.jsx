import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { uploadFile } from '@/lib/uploadFile';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Package, Pencil, Leaf, Award, Plus, Trash2, Paperclip, Loader2, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';

const BLANK_CERT_FORM = { name: '', issuing_body: '', certificate_number: '', expiry_date: '', document_url: '' };

// ── Edit dialog: one packaging material's emission factor + certifications ──
// Parent only mounts this when a material is being edited (see
// PackagingMaterialsManager below) so every open is a fresh mount with
// state seeded straight from that material — reopening the same item
// after cancelling never shows a stale draft from the previous session.
function EditMaterialDialog({ material, onOpenChange, onSave, saving }) {
  const [factor, setFactor] = useState(material.emission_factor_kg_co2e != null ? String(material.emission_factor_kg_co2e) : '');
  const [certifications, setCertifications] = useState(Array.isArray(material.certifications) ? material.certifications : []);
  const [certForm, setCertForm] = useState(BLANK_CERT_FORM);
  const [addingCert, setAddingCert] = useState(false);
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadFile(file, 'packaging-certifications');
      setCertForm(f => ({ ...f, document_url: url }));
      toast.success('Document attached');
    } catch (err) {
      toast.error('Upload failed: ' + err.message);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const addCert = () => {
    if (!certForm.name.trim()) { toast.error('Certification name is required'); return; }
    setCertifications(prev => [...prev, { ...certForm, name: certForm.name.trim() }]);
    setCertForm(BLANK_CERT_FORM);
    setAddingCert(false);
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="font-display">{material.name}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="text-xs flex items-center gap-1.5"><Leaf className="w-3.5 h-3.5" /> Emission factor (kg CO₂e per {material.unit || 'unit'})</Label>
            <Input type="number" step="0.0001" min="0" value={factor} onChange={e => setFactor(e.target.value)} placeholder="e.g. 0.45" className="mt-1" />
            <p className="text-xs text-muted-foreground mt-1">Embodied carbon per unit of this material — used by the Lifecycle Report's Packaging stage.</p>
          </div>

          <div className="border-t border-border pt-3 space-y-2">
            <Label className="text-xs flex items-center gap-1.5"><Award className="w-3.5 h-3.5" /> Environmental certifications</Label>
            {certifications.length === 0 && !addingCert && (
              <p className="text-xs text-muted-foreground">No certifications recorded.</p>
            )}
            {certifications.map((c, i) => (
              <div key={i} className="flex items-start gap-2 rounded-lg bg-muted/30 px-3 py-2 text-sm">
                <div className="flex-1 min-w-0">
                  <p className="font-medium">{c.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {[c.issuing_body, c.certificate_number].filter(Boolean).join(' · ')}
                    {c.expiry_date && ` · Expires ${c.expiry_date}`}
                  </p>
                </div>
                {c.document_url && (
                  <a href={c.document_url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary transition-colors shrink-0">
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
                <button type="button" onClick={() => setCertifications(prev => prev.filter((_, idx) => idx !== i))} className="text-muted-foreground hover:text-destructive transition-colors shrink-0">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}

            {addingCert ? (
              <div className="space-y-2 rounded-lg border border-dashed border-border p-3">
                <Input placeholder="Certification name (e.g. FSC Certified)" value={certForm.name} onChange={e => setCertForm(f => ({ ...f, name: e.target.value }))} />
                <div className="grid grid-cols-2 gap-2">
                  <Input placeholder="Issuing body" value={certForm.issuing_body} onChange={e => setCertForm(f => ({ ...f, issuing_body: e.target.value }))} />
                  <Input placeholder="Certificate #" value={certForm.certificate_number} onChange={e => setCertForm(f => ({ ...f, certificate_number: e.target.value }))} />
                </div>
                <div className="grid grid-cols-2 gap-2 items-end">
                  <div>
                    <Label className="text-xs">Expiry date</Label>
                    <Input type="date" value={certForm.expiry_date} onChange={e => setCertForm(f => ({ ...f, expiry_date: e.target.value }))} />
                  </div>
                  <label className="cursor-pointer block">
                    <input type="file" className="hidden" onChange={handleUpload} disabled={uploading} />
                    <div className="h-9 flex items-center gap-1.5 px-3 rounded-md border border-input text-sm text-muted-foreground hover:bg-accent transition-colors">
                      {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Paperclip className="w-3.5 h-3.5" />}
                      {certForm.document_url ? 'Replace file' : uploading ? 'Uploading…' : 'Attach evidence'}
                    </div>
                  </label>
                </div>
                <div className="flex gap-2">
                  <Button type="button" size="sm" onClick={addCert}>Add</Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => { setAddingCert(false); setCertForm(BLANK_CERT_FORM); }}>Cancel</Button>
                </div>
              </div>
            ) : (
              <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => setAddingCert(true)}>
                <Plus className="w-3.5 h-3.5" /> Add certification
              </Button>
            )}
          </div>

          <Button
            className="w-full"
            disabled={saving}
            onClick={() => onSave(material.id, { emission_factor_kg_co2e: factor !== '' ? parseFloat(factor) : null, certifications })}
          >
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function PackagingMaterialsManager() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(null);

  const { data: rawMaterials = [], isLoading } = useQuery({
    queryKey: ['rawMaterials'],
    queryFn: () => base44.entities.RawMaterial.list('name', 5000),
  });
  const packagingMaterials = rawMaterials.filter(m => (m.type || '').toLowerCase() === 'packaging');

  const saveMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.RawMaterial.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rawMaterials'] });
      setEditing(null);
      toast.success('Packaging material updated');
    },
    onError: (e) => toast.error(e.message || 'Failed to update'),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Package className="w-4 h-4" /> Packaging Materials</CardTitle>
        <CardDescription>
          Set an embodied-carbon factor and record environmental certifications for each packaging item —
          feeds the Packaging stage of the EMS Lifecycle Report.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Loading…</p>
        ) : packagingMaterials.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">No packaging materials in stock yet — receive some via Receiving first.</p>
        ) : (
          <div className="space-y-2">
            {packagingMaterials.map(m => {
              const certCount = Array.isArray(m.certifications) ? m.certifications.length : 0;
              return (
                <div key={m.id} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{m.name}</p>
                    <div className="flex flex-wrap items-center gap-2 mt-0.5">
                      {m.emission_factor_kg_co2e != null ? (
                        <Badge variant="secondary" className="text-xs gap-1"><Leaf className="w-3 h-3" /> {m.emission_factor_kg_co2e} kg CO₂e/{m.unit || 'unit'}</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground italic">No emission factor set</span>
                      )}
                      {certCount > 0 && (
                        <Badge variant="outline" className="text-xs gap-1"><Award className="w-3 h-3" /> {certCount} certification{certCount !== 1 ? 's' : ''}</Badge>
                      )}
                    </div>
                  </div>
                  <Button variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={() => setEditing(m)}>
                    <Pencil className="w-3.5 h-3.5" /> Edit
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      {editing && (
        <EditMaterialDialog
          key={editing.id}
          material={editing}
          onOpenChange={(open) => !open && setEditing(null)}
          onSave={(id, data) => saveMutation.mutate({ id, data })}
          saving={saveMutation.isPending}
        />
      )}
    </Card>
  );
}
