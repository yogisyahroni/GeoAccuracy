import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Polygon, Popup, useMap } from 'react-leaflet';
import 'leaflet-draw';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';
import { areaAPI, Area } from '@/services/api/areas';
import { toast } from 'sonner';
import { Map, Trash, Plus, MapPin } from 'lucide-react';
import { motion } from 'framer-motion';
import { useAuthStore } from '@/store/useAuthStore';

// Fix Leaflet's default icon paths
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

export default function AreasPage() {
    const [areas, setAreas] = useState<Area[]>([]);
    const [loading, setLoading] = useState(true);
    const user = useAuthStore(s => s.user);
    const isObserver = user?.role === 'observer';

    // Default coordinate (Jakarta)
    const defaultCenter: [number, number] = [-6.2088, 106.8456];

    useEffect(() => {
        fetchAreas();
    }, []);

    const fetchAreas = async () => {
        try {
            setLoading(true);
            const data = await areaAPI.listAreas();
            setAreas(data);
        } catch (err: any) {
            toast.error('Gagal mengambil data area', {
                description: err.response?.data?.error || err.message,
            });
        } finally {
            setLoading(false);
        }
    };

    const onCreated = async (e: any, removeCallback?: () => void) => {
        const { layerType, layer } = e;
        if (layerType === 'polygon' || layerType === 'rectangle') {
            const geoJson = layer.toGeoJSON();

            // We need a name from the user, for simplicity we generate a default one here
            const areaName = `Area Baru ${new Date().getTime().toString().slice(-4)}`;

            try {
                await areaAPI.createArea({
                    name: areaName,
                    description: 'Digambar melalui UI',
                    geoJson: geoJson.geometry,
                });
                toast.success('Area berhasil disimpan');
                if (removeCallback) removeCallback();
                fetchAreas();
            } catch (err: any) {
                toast.error('Gagal menyimpan area', {
                    description: err.response?.data?.error || err.message,
                });
                if (removeCallback) removeCallback();
            }
        }
    };

    // Komponen kontrol kustom Leaflet Draw mengatasi bug react-leaflet-draw (render2 is not a function)
    const CustomDrawControl = () => {
        const map = useMap();
        const mounted = useRef(false);

        useEffect(() => {
            if (mounted.current) return;
            mounted.current = true;

            const fg = new L.FeatureGroup();
            map.addLayer(fg);

            const drawControl = new L.Control.Draw({
                edit: {
                    featureGroup: fg,
                    edit: false,
                    remove: false,
                },
                draw: {
                    rectangle: {},
                    polygon: {},
                    circle: false,
                    circlemarker: false,
                    marker: false,
                    polyline: false,
                },
            });

            map.addControl(drawControl);

            const handleCreated = (e: any) => {
                fg.addLayer(e.layer);
                onCreated(e, () => {
                    fg.removeLayer(e.layer);
                });
            };

            map.on(L.Draw.Event.CREATED, handleCreated);

            return () => {
                mounted.current = false;
                map.removeControl(drawControl);
                map.off(L.Draw.Event.CREATED, handleCreated);
                map.removeLayer(fg);
            };
        }, [map]);

        return null;
    };

    const handleDelete = async (id: string) => {
        try {
            await areaAPI.deleteArea(id);
            toast.success('Area berhasil dihapus');
            fetchAreas();
        } catch (err: any) {
            toast.error('Gagal menghapus area', {
                description: err.response?.data?.error || err.message,
            });
        }
    };

    // Helper to reverse GeoJSON coordinates [lng, lat] to Leaflet [lat, lng]
    const geoJsonToLeafletPaths = (geoJsonGeometry: any) => {
        if (!geoJsonGeometry || !geoJsonGeometry.coordinates) return [];

        if (geoJsonGeometry.type === 'Polygon') {
            return geoJsonGeometry.coordinates[0].map((coord: number[]) => [coord[1], coord[0]]);
        }
        return [];
    };

    return (
        <div className="flex flex-col md:flex-row h-full">
            {/* Sidebar List */}
            <div className="w-full md:w-80 border-r bg-surface-1 flex flex-col h-1/3 md:h-full shrink-0">
                <div className="p-4 border-b">
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                        <Map className="w-5 h-5 text-primary" />
                        Manajemen Area
                    </h2>
                    <p className="text-sm text-muted-foreground mt-1">
                        Gunakan peta untuk menggambar area (geofence). Area yang disimpan dapat digunakan untuk filter data.
                    </p>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {loading ? (
                        <div className="space-y-3">
                            {[1, 2, 3].map(i => (
                                <div key={i} className="animate-pulse h-20 bg-muted rounded-md" />
                            ))}
                        </div>
                    ) : areas.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-40 text-muted-foreground text-sm border-2 border-dashed rounded-md p-4 text-center">
                            <MapPin className="w-8 h-8 mb-2 opacity-50" />
                            Belum ada area.<br />Gambar poligon di peta untuk menambahkan.
                        </div>
                    ) : (
                        areas.map(area => (
                            <motion.div
                                key={area.id}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="p-3 rounded-md border bg-card hover:border-primary/50 transition-colors group"
                            >
                                <div className="flex justify-between items-start mb-2">
                                    <h3 className="font-medium text-sm truncate pr-2">{area.name}</h3>
                                    {!isObserver && (
                                        <button
                                            onClick={() => handleDelete(area.id)}
                                            className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                                            title="Hapus"
                                        >
                                            <Trash className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                                <p className="text-xs text-muted-foreground line-clamp-2">
                                    {area.description}
                                </p>
                            </motion.div>
                        ))
                    )}
                </div>
            </div>

            {/* Map Content */}
            <div className="flex-1 relative z-0 min-h-[400px]">
                <MapContainer
                    center={defaultCenter}
                    zoom={11}
                    style={{ height: '100%', width: '100%' }}
                >
                    <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />

                    {!isObserver && (
                        <CustomDrawControl />
                    )}

                    {/* Render saved areas */}
                    {areas.map((area) => {
                        const positions = geoJsonToLeafletPaths(area.geoJson);
                        if (positions.length > 0) {
                            return (
                                <Polygon
                                    key={area.id}
                                    positions={positions}
                                    pathOptions={{ color: 'hsl(var(--primary))', weight: 2, fillOpacity: 0.2 }}
                                >
                                    <Popup>
                                        <div className="font-semibold">{area.name}</div>
                                        <div className="text-sm text-gray-600">{area.description}</div>
                                    </Popup>
                                </Polygon>
                            );
                        }
                        return null;
                    })}
                </MapContainer>
            </div>
        </div>
    );
}
