import { useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/api/supabaseClient';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Upload, FileText, CheckCircle2, Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { parseCsvToObjects } from '@/lib/csv';

const TARGET_FIELDS = [
  { key: 'business_name', label: 'Business Name', required: true, hints: ['contactname', 'name', 'businessname', 'customername', 'customer'] },
  { key: 'xero_contact_id', label: 'Xero Contact ID', hints: ['contactid', 'xerocontactid', 'id'] },
  { key: 'email', label: 'Email', hints: ['emailaddress', 'email'] },
  { key: 'phone', label: 'Phone', hints: ['phonenumber', 'phone', 'mobilenumber', 'mobile'] },
  { key: 'website', label: 'Website', hints: ['website', 'url'] },
  { key: 'delivery_address', label: 'Physical / Delivery Address', hints: ['saaddressline1', 'streetaddressline1', 'address', 'addressline1', 'deliveryaddress'] },
  { key: 'postal_address', label: 'Postal Address', hints: ['poaddressline1', 'postaladdressline1', 'postaladdress'] },
  { key: 'city', label: 'City', hints: ['sacity', 'city', 'pocity'] },
  { key: 'region', label: 'Region', hints: ['saregion', 'region', 'state', 'poregion'] },
  { key: 'country', label: 'Country', hints: ['sacountry', 'country', 'pocountry'] },
  { key: 'primary_contact', label: 'Primary Contact', hints: ['firstname', 'contactperson', 'attentionto', 'poattentionto'] },
];

const norm = (s) => (s || '').trim().toLowerCase();
const normHeader = (s) => norm(s).replace(/[\s_-]/g, '');

function autoMap(headers) {
  const mapping = {};
  for (const field of TARGET_FIELDS) {
    const match = headers.find((h) => field.hints.includes(normHeader(h)));
    mapping[field.key] = match || '';
  }
  return mapping;
}

export default function CustomerImportPanel() {
  const queryClient = useQueryClient();
  const fileRef = useRef(null);
  const [fileName, setFileName] = useState('');
  const [headers, setHeaders] = useState([]);
  const [rows, setRows] = useState([]);
  const [mapping, setMapping] = useState({});
  const [result, setResult] = useState(null);

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setResult(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const { headers: h, rows: r } = parseCsvToObjects(ev.target.result);
      if (h.length === 0) {
        toast.error('Could not read any rows from that file');
        return;
      }
      setHeaders(h);
      setRows(r);
      setMapping(autoMap(h));
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const reset = () => {
    setFileName(''); setHeaders([]); setRows([]); setMapping({}); setResult(null);
  };

  const mappedRows = useMemo(() => rows.map((row) => {
    const out = {};
    for (const field of TARGET_FIELDS) {
      const col = mapping[field.key];
      out[field.key] = col ? row[col] : '';
    }
    return out;
  }), [rows, mapping]);

  const validCount = mappedRows.filter((r) => r.business_name).length;

  const importMutation = useMutation({
    mutationFn: async () => {
      const existing = await db.Customer.list('business_name', 5000);
      const byXeroId = new Map(existing.filter((c) => c.xero_contact_id).map((c) => [c.xero_contact_id, c]));
      const byName = new Map(existing.map((c) => [norm(c.business_name), c]));

      let created = 0, updated = 0, skipped = 0;
      for (const row of mappedRows) {
        if (!row.business_name) { skipped++; continue; }
        const payload = {};
        for (const field of TARGET_FIELDS) {
          if (row[field.key]) payload[field.key] = row[field.key];
        }
        const match = (payload.xero_contact_id && byXeroId.get(payload.xero_contact_id)) || byName.get(norm(payload.business_name));
        if (match) {
          await db.Customer.update(match.id, payload);
          updated++;
        } else {
          const created_row = await db.Customer.create(payload);
          if (created_row.xero_contact_id) byXeroId.set(created_row.xero_contact_id, created_row);
          byName.set(norm(created_row.business_name), created_row);
          created++;
        }
      }
      return { created, updated, skipped };
    },
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      setResult(r);
      toast.success(`Imported ${r.created + r.updated} customers`);
    },
    onError: (e) => toast.error('Import failed: ' + e.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Import Customers from CSV</CardTitle>
        <CardDescription>
          Upload a contacts export (e.g. from Xero: Contacts → Export) to bulk-create or update customer records.
          Matches existing customers by Xero Contact ID first, then by business name, so re-importing the same file won't create duplicates.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {!fileName ? (
          <div
            className="rounded-xl border-2 border-dashed border-border hover:border-primary/50 transition-colors cursor-pointer p-10 text-center"
            onClick={() => fileRef.current?.click()}
          >
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFile} />
            <Upload className="w-10 h-10 mx-auto mb-3 text-muted-foreground/40" />
            <p className="font-medium text-muted-foreground">Click to upload a CSV file</p>
            <p className="text-sm text-muted-foreground/60 mt-1">Customer/contact list — .csv only</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">{fileName}</span>
                <span className="text-xs text-muted-foreground">({rows.length} rows)</span>
              </div>
              <Button variant="ghost" size="sm" onClick={reset}>Change file</Button>
            </div>

            {result ? (
              <div className="rounded-lg border border-success/30 bg-success/5 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className="w-5 h-5 text-success" />
                  <p className="font-semibold text-foreground">Import complete</p>
                </div>
                <p className="text-sm text-muted-foreground">
                  {result.created} created · {result.updated} updated
                  {result.skipped > 0 && ` · ${result.skipped} skipped (no business name)`}
                </p>
                <Button variant="outline" size="sm" className="mt-3" onClick={reset}>Import another file</Button>
              </div>
            ) : (
              <>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Map columns</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {TARGET_FIELDS.map((field) => (
                      <div key={field.key}>
                        <label className="text-xs text-muted-foreground flex items-center gap-1">
                          {field.label}{field.required && <span className="text-destructive">*</span>}
                        </label>
                        <Select value={mapping[field.key] || '__none__'} onValueChange={(v) => setMapping((m) => ({ ...m, [field.key]: v === '__none__' ? '' : v }))}>
                          <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">— Not in file —</SelectItem>
                            {headers.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                </div>

                {!mapping.business_name && (
                  <div className="flex items-center gap-2 rounded-lg bg-warning/10 border border-warning/20 px-3 py-2 text-sm text-warning">
                    <AlertTriangle className="w-4 h-4 shrink-0" /> Map a Business Name column to continue.
                  </div>
                )}

                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                    Preview — {validCount} of {rows.length} rows have a business name
                  </p>
                  <div className="overflow-x-auto rounded-lg border border-border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {TARGET_FIELDS.filter((f) => mapping[f.key]).map((f) => <TableHead key={f.key}>{f.label}</TableHead>)}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {mappedRows.slice(0, 5).map((row, i) => (
                          <TableRow key={i}>
                            {TARGET_FIELDS.filter((f) => mapping[f.key]).map((f) => (
                              <TableCell key={f.key} className="text-sm">{row[f.key] || '—'}</TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                <Button
                  className="gap-2"
                  disabled={!mapping.business_name || validCount === 0 || importMutation.isPending}
                  onClick={() => importMutation.mutate()}
                >
                  {importMutation.isPending ? <><Loader2 className="w-4 h-4 animate-spin" /> Importing…</> : `Import ${validCount} Customers`}
                </Button>
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
