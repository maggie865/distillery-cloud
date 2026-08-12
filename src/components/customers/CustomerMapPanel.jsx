import { useState, useEffect, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { MapPin, Loader2 } from 'lucide-react';

const TYPE_COLORS = {
  'On-Premise': '#3b82f6',
  'Off-Premise': '#22c55e',
  'Distributor': '#a855f7',
  'Export': '#f59e0b',
};
const DEFAULT_COLOR = '#6b7280';

export default function CustomerMapPanel({ customers = [] }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (window.google?.maps) { initMap(); return; }

    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    if (!apiKey) { setError('Maps API key not configured'); setLoading(false); return; }
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}`;
    script.async = true;
    script.onload = initMap;
    script.onerror = () => { setError('Failed to load Google Maps'); setLoading(false); };
    document.head.appendChild(script);
  }, []);

  const initMap = () => {
    if (!mapRef.current) return;
    if (!mapInstanceRef.current) {
      mapInstanceRef.current = new window.google.maps.Map(mapRef.current, {
        center: { lat: -41, lng: 173 }, // New Zealand default
        zoom: 5,
        mapTypeControl: false,
        streetViewControl: false,
      });
    }
    plotCustomers();
  };

  useEffect(() => {
    if (mapInstanceRef.current) plotCustomers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customers]);

  const plotCustomers = async () => {
    setLoading(true);
    setError(null);

    markersRef.current.forEach(m => m.setMap(null));
    markersRef.current = [];

    const withAddress = customers.filter(c => c.delivery_address);
    if (withAddress.length === 0) {
      setLoading(false);
      return;
    }

    const geocoder = new window.google.maps.Geocoder();
    const bounds = new window.google.maps.LatLngBounds();

    await Promise.all(withAddress.map(async (customer) => {
      try {
        const { results } = await geocoder.geocode({ address: customer.delivery_address });
        const loc = results[0]?.geometry?.location;
        if (!loc) return;
        const position = { lat: loc.lat(), lng: loc.lng() };

        const marker = new window.google.maps.Marker({
          position,
          map: mapInstanceRef.current,
          title: customer.business_name,
          icon: {
            path: window.google.maps.SymbolPath.CIRCLE,
            scale: 8,
            fillColor: TYPE_COLORS[customer.customer_type] || DEFAULT_COLOR,
            fillOpacity: 0.9,
            strokeColor: '#fff',
            strokeWeight: 2,
          },
        });

        const info = new window.google.maps.InfoWindow({
          content: `<div style="font-family:sans-serif;min-width:140px">
            <strong>${customer.business_name}</strong><br/>
            <span style="color:#666;font-size:12px">${customer.delivery_address}</span><br/>
            <span style="font-size:12px">${customer.customer_type || ''}${customer.status ? ` · ${customer.status}` : ''}</span>
          </div>`,
        });
        marker.addListener('click', () => info.open(mapInstanceRef.current, marker));

        markersRef.current.push(marker);
        bounds.extend(position);
      } catch {
        // skip customers that fail to geocode
      }
    }));

    if (!bounds.isEmpty()) {
      mapInstanceRef.current.fitBounds(bounds, { padding: 60 });
    }
    setLoading(false);
  };

  if (error) {
    return (
      <Card className="p-10 text-center space-y-2">
        <MapPin className="w-8 h-8 mx-auto text-muted-foreground/40" />
        <p className="text-sm font-medium text-foreground">Map view isn't available</p>
        <p className="text-sm text-muted-foreground max-w-sm mx-auto">{error}</p>
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-primary" />
          <h2 className="text-lg font-semibold">Customer Map</h2>
        </div>
        {!loading && (
          <span className="text-xs text-muted-foreground">
            {markersRef.current.length} of {customers.length} customer{customers.length !== 1 ? 's' : ''} plotted
          </span>
        )}
      </div>

      <div className="relative rounded-lg overflow-hidden border" style={{ height: '480px' }}>
        <div ref={mapRef} className="w-full h-full" />
        {loading && (
          <div className="absolute inset-0 bg-background/70 flex items-center justify-center">
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <Loader2 className="w-6 h-6 animate-spin" />
              <span className="text-sm">Geocoding customer addresses…</span>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
