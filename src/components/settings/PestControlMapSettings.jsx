import { useState, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { uploadFile } from '@/lib/uploadFile';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Upload, Loader2, MapPin } from 'lucide-react';
import { toast } from 'sonner';

export default function PestControlMapSettings() {
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);
  const qc = useQueryClient();

  const { data: settings = [] } = useQuery({
    queryKey: ['appSettings'],
    queryFn: () => base44.entities.AppSettings.list('key', 100),
  });

  const mapImageUrl = settings.find(s => s.key === 'pest_map_image')?.value || null;
  const mapSettingId = settings.find(s => s.key === 'pest_map_image')?.id || null;

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const uploadedUrl = await uploadFile(file, 'pest-control-map');
      // Save to shared AppSettings entity so all users see the floor plan
      if (mapSettingId) {
        await base44.entities.AppSettings.update(mapSettingId, { key: 'pest_map_image', value: uploadedUrl });
      } else {
        await base44.entities.AppSettings.create({ key: 'pest_map_image', value: uploadedUrl });
      }
      qc.invalidateQueries({ queryKey: ['appSettings'] });
      toast.success('Floor plan saved — go to Pest Control to see it on the map');
    } catch (err) {
      toast.error('Upload failed: ' + err.message);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleRemove = async () => {
    if (!confirm('Remove the floor plan image?')) return;
    if (mapSettingId) {
      try { await base44.entities.AppSettings.delete(mapSettingId); } catch {}
    }
    qc.invalidateQueries({ queryKey: ['appSettings'] });
    toast.success('Floor plan removed');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pest control floor plan</CardTitle>
        <CardDescription>
          Upload a photo or diagram of your facility to use as the background on the Pest Control map.
          PNG, JPG or PDF — recommended size 1200×800px or larger.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {mapImageUrl ? (
          <div className="space-y-3">
            <div className="rounded-xl border border-border overflow-hidden bg-muted/30" style={{ maxHeight: '320px' }}>
              <img src={mapImageUrl} alt="Pest control floor plan" className="w-full h-full object-contain" />
            </div>
            <div className="flex gap-2">
              <label className="cursor-pointer">
                <input ref={fileRef} type="file" accept=".png,.jpg,.jpeg,.pdf,.svg" className="hidden" onChange={handleUpload} />
                <div className="inline-flex items-center gap-2 h-9 px-4 rounded-md border border-input text-sm font-medium hover:bg-accent transition-colors cursor-pointer">
                  {uploading ? <><Loader2 className="w-4 h-4 animate-spin" /> Uploading…</> : <><Upload className="w-4 h-4" /> Replace image</>}
                </div>
              </label>
              <Button variant="outline" className="text-destructive hover:text-destructive" onClick={handleRemove}>
                Remove
              </Button>
            </div>
          </div>
        ) : (
          <label className="cursor-pointer block">
            <input type="file" accept=".png,.jpg,.jpeg,.pdf,.svg" className="hidden" onChange={handleUpload} />
            <div className="rounded-xl border-2 border-dashed border-border hover:border-primary/50 transition-colors p-10 text-center">
              {uploading ? (
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="w-8 h-8 text-primary animate-spin" />
                  <p className="text-sm text-muted-foreground">Uploading image…</p>
                </div>
              ) : (
                <>
                  <MapPin className="w-10 h-10 mx-auto mb-3 text-muted-foreground/40" />
                  <p className="font-medium text-muted-foreground">Click to upload your facility floor plan</p>
                  <p className="text-sm text-muted-foreground/60 mt-1">PNG, JPG, or PDF</p>
                </>
              )}
            </div>
          </label>
        )}
      </CardContent>
    </Card>
  );
}
