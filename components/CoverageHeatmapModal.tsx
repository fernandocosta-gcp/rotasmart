import React, { useEffect, useState, useRef } from 'react';
import { Team } from '../types';
import { getRegionCoordinates } from '../services/geminiService';

interface CoverageHeatmapModalProps {
    teams: Team[];
    onClose: () => void;
}

const CoverageHeatmapModal: React.FC<CoverageHeatmapModalProps> = ({ teams, onClose }) => {
    const mapRef = useRef<HTMLDivElement>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let mapInstance: any = null;

        const initMap = async () => {
            if (!mapRef.current) return;
            if (!(window as any).L) {
                setError("Leaflet library not loaded.");
                return;
            }

            // 1. Prepare Data
            const regionWeights: Record<string, number> = {};
            
            teams.forEach(team => {
                if (!team.isActive) return;
                const weight = team.members.length;
                
                team.regions.forEach(reg => {
                    // Normalize region key "City - Neighborhood"
                    const key = `${reg.neighborhood}, ${reg.city}`;
                    regionWeights[key] = (regionWeights[key] || 0) + weight;
                });
            });

            const uniqueRegions = Object.keys(regionWeights);
            
            if (uniqueRegions.length === 0) {
                setIsLoading(false);
                setError("Nenhuma região definida nas equipes ativas.");
                return;
            }

            try {
                // 2. Geocode Regions using Gemini
                const coordsMap = await getRegionCoordinates(uniqueRegions);

                // 3. Prepare Heatmap Points [lat, lng, intensity]
                const heatPoints: any[] = [];
                const markers: any[] = [];
                let validCoordsCount = 0;
                let centerLat = 0, centerLng = 0;

                uniqueRegions.forEach(region => {
                    const coords = coordsMap[region];
                    const weight = regionWeights[region];
                    
                    if (coords && coords.lat && coords.lng) {
                        // Leaflet Heatmap expects intensity 0-1 usually, but can handle raw values if max is set.
                        // For simplicity, we push multiple points or use the third param as intensity
                        heatPoints.push([coords.lat, coords.lng, weight * 10]); // Scale weight for visibility
                        
                        markers.push({ 
                            lat: coords.lat, 
                            lng: coords.lng, 
                            name: region, 
                            staff: weight 
                        });

                        centerLat += coords.lat;
                        centerLng += coords.lng;
                        validCoordsCount++;
                    }
                });

                if (validCoordsCount === 0) {
                     throw new Error("Não foi possível encontrar coordenadas para as regiões.");
                }

                // 4. Initialize Map
                const L = (window as any).L;
                
                // Calculate Center
                const avgLat = centerLat / validCoordsCount;
                const avgLng = centerLng / validCoordsCount;

                mapInstance = L.map(mapRef.current).setView([avgLat, avgLng], 12);

                L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
                    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
                    subdomains: 'abcd',
                    maxZoom: 19
                }).addTo(mapInstance);

                // 5. Add Heatmap Layer
                if (L.heatLayer) {
                    L.heatLayer(heatPoints, {
                        radius: 35,
                        blur: 20,
                        maxZoom: 15,
                        gradient: {
                            0.2: 'blue',
                            0.4: 'lime',
                            0.6: 'yellow',
                            0.8: 'orange',
                            1.0: 'red'
                        }
                    }).addTo(mapInstance);
                }

                // 6. Add Tooltip Markers (Invisible circles just for hover)
                markers.forEach(m => {
                    L.circleMarker([m.lat, m.lng], {
                        radius: 5 + (m.staff * 2), // Size based on staff count
                        color: 'transparent',
                        fillColor: 'transparent',
                    })
                    .addTo(mapInstance)
                    .bindTooltip(`
                        <div class="font-bold text-sm">${m.name}</div>
                        <div class="text-xs">Cobertura: ${m.staff} pessoas</div>
                    `, { direction: 'top' });
                });

                setIsLoading(false);

            } catch (err) {
                console.error(err);
                setError("Erro ao gerar mapa. Verifique sua conexão.");
                setIsLoading(false);
            }
        };

        // Timeout to ensure DOM is ready and Leaflet loaded
        setTimeout(initMap, 100);

        return () => {
            if (mapInstance) {
                mapInstance.remove();
            }
        };
    }, [teams]);

    return (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-gray-900/95 backdrop-blur-md">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl h-[80vh] flex flex-col overflow-hidden relative animate-fade-in-up">
                
                {/* Header */}
                <div className="bg-white p-4 border-b border-gray-200 flex justify-between items-center z-10 shadow-sm">
                    <div>
                        <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                             <span className="text-2xl">🔥</span> Mapa de Calor de Cobertura
                        </h2>
                        <p className="text-sm text-gray-500">Intensidade baseada no número de colaboradores por região.</p>
                    </div>
                    <button 
                        onClick={onClose}
                        className="p-2 bg-gray-100 hover:bg-gray-200 rounded-full text-gray-600 transition-colors"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                    </button>
                </div>

                {/* Map Container */}
                <div className="flex-1 relative bg-gray-100">
                    <div ref={mapRef} className="absolute inset-0 z-0"></div>

                    {isLoading && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/80 z-20 backdrop-blur-sm">
                            <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
                            <span className="font-bold text-gray-800">Geocodificando regiões com IA...</span>
                            <span className="text-sm text-gray-500">Isso pode levar alguns segundos.</span>
                        </div>
                    )}

                    {error && (
                        <div className="absolute inset-0 flex items-center justify-center bg-white/90 z-20">
                            <div className="text-center p-6 bg-red-50 border border-red-200 rounded-xl">
                                <svg className="w-12 h-12 text-red-500 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                                <p className="text-red-800 font-bold">{error}</p>
                                <button onClick={onClose} className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700">Fechar</button>
                            </div>
                        </div>
                    )}
                </div>
                
                {/* Legend */}
                <div className="bg-white p-3 border-t border-gray-200 flex items-center justify-center gap-6 text-xs font-medium text-gray-600">
                    <div className="flex items-center gap-2">
                        <div className="w-20 h-3 bg-gradient-to-r from-blue-500 via-yellow-400 to-red-500 rounded-full"></div>
                        <span>Intensidade de Atendimento</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CoverageHeatmapModal;