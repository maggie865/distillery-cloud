import { Card } from '@/components/ui/card';
import { MapPin } from 'lucide-react';

/**
 * No geocoding/mapping service is connected in this environment (no Maps
 * API key, no geocode function). Per "do not create fake coordinates",
 * this shows an honest empty state instead of plotting anything —
 * wiring in a real key later just means replacing this component's body.
 */
export default function CustomerMapPanel() {
  return (
    <Card className="p-10 text-center space-y-2">
      <MapPin className="w-8 h-8 mx-auto text-muted-foreground/40" />
      <p className="text-sm font-medium text-foreground">Map view isn't available yet</p>
      <p className="text-sm text-muted-foreground max-w-sm mx-auto">
        Plotting customers on a map requires a connected geocoding service, which isn't configured in this environment yet.
      </p>
    </Card>
  );
}
