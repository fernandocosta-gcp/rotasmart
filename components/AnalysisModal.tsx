import React, { useMemo, useState } from 'react';
import { RawSheetRow } from '../types';

interface AnalysisModalProps {
    data: RawSheetRow[];
    onClose: () => void;
}

type TabType = 'sales' | 'sectors' | 'days' | 'clusters';

// Helper: Convert HH:MM to decimal hours (e.g. 08:30 -> 8.5)
const timeToDecimal = (timeStr?: string): number => {
    if (!timeStr) return 0;
    const [h, m] = timeStr.split(':').map(Number);
    if (isNaN(h)) return 0;
    return h + (m || 0) / 60;
};

// Helper: K-Means Implementation
interface ClusterResult {
    id: number;
    label: string;
    description: string;
    avgSales: number;
    avgOpen: number;
    avgClose: number;
    items: RawSheetRow[];
    color: string;
}

const performKMeans = (data: RawSheetRow[], k: number = 4): ClusterResult[] => {
    // 1. Feature Extraction
    const features = data.map(row => {
        const sales = row.AverageSales || 0;
        const open = timeToDecimal(row.HorarioAbertura) || 9; // Default 9am
        let close = timeToDecimal(row.HorarioFechamento) || 18; // Default 6pm
        if (close < open) close += 24; // Handle after midnight
        const duration = close - open;
        
        return { sales, open, close, duration, row };
    });

    if (features.length < k) return [];

    // Find Max/Min for Normalization
    const maxSales = Math.max(...features.map(f => f.sales)) || 1;
    const maxTime = 24;

    // Normalize (0-1 scale)
    const normalized = features.map(f => ({
        ...f,
        nSales: f.sales / maxSales,
        nOpen: f.open / maxTime,
        nClose: f.close / maxTime
    }));

    // 2. Initialize Centroids (Seeding with distinct profiles to encourage separation)
    // We pick 4 distinct points: Max Sales, Min Sales, Max Duration, Min Open
    let sortedBySales = [...normalized].sort((a,b) => b.nSales - a.nSales);
    let sortedByDuration = [...normalized].sort((a,b) => (b.close - b.open) - (a.close - a.open));
    let sortedByOpen = [...normalized].sort((a,b) => a.open - b.open);

    let centroids = [
        sortedBySales[0], // High Sales
        sortedBySales[sortedBySales.length - 1], // Low Sales
        sortedByDuration[0], // Long Duration
        sortedByOpen[0] // Early Open
    ].map(p => ({ nSales: p.nSales, nOpen: p.nOpen, nClose: p.nClose }));

    // Fallback if data is too small/same
    if (centroids.length < k) {
         centroids = normalized.slice(0, k).map(p => ({ nSales: p.nSales, nOpen: p.nOpen, nClose: p.nClose }));
    }

    // 3. Iterations
    let assignments = new Array(normalized.length).fill(0);
    let iterations = 0;
    const maxIterations = 20;

    while (iterations < maxIterations) {
        let changed = false;

        // Assign points to nearest centroid
        normalized.forEach((p, idx) => {
            let minDist = Infinity;
            let clusterIdx = 0;

            centroids.forEach((c, cIdx) => {
                const dist = Math.sqrt(
                    Math.pow(p.nSales - c.nSales, 2) +
                    Math.pow(p.nOpen - c.nOpen, 2) + 
                    Math.pow(p.nClose - c.nClose, 2)
                );
                if (dist < minDist) {
                    minDist = dist;
                    clusterIdx = cIdx;
                }
            });

            if (assignments[idx] !== clusterIdx) {
                assignments[idx] = clusterIdx;
                changed = true;
            }
        });

        if (!changed) break;

        // Update Centroids
        centroids = centroids.map((_, cIdx) => {
            const clusterPoints = normalized.filter((_, i) => assignments[i] === cIdx);
            if (clusterPoints.length === 0) return centroids[cIdx];

            const avg = (key: 'nSales' | 'nOpen' | 'nClose') => 
                clusterPoints.reduce((sum, p) => sum + p[key], 0) / clusterPoints.length;

            return {
                nSales: avg('nSales'),
                nOpen: avg('nOpen'),
                nClose: avg('nClose')
            };
        });

        iterations++;
    }

    // 4. Denormalize & Relative Labeling
    // We want to force mapping the clusters to the requested profiles:
    // High Perf, Low Perf, Extended, Morning.

    // Calculate stats for each cluster
    let clusterStats = centroids.map((c, idx) => {
        const items = features.filter((_, i) => assignments[i] === idx).map(f => f.row);
        if (items.length === 0) return null;
        
        const avgSales = items.reduce((a, r) => a + (r.AverageSales || 0), 0) / items.length;
        const avgOpen = items.reduce((a, r) => a + (timeToDecimal(r.HorarioAbertura) || 9), 0) / items.length;
        const avgClose = items.reduce((a, r) => a + (timeToDecimal(r.HorarioFechamento) || 18), 0) / items.length;
        let duration = avgClose - avgOpen;
        if (duration < 0) duration += 24;

        return { idx, avgSales, avgOpen, avgClose, items, duration };
    }).filter(x => x !== null) as NonNullable<typeof clusterStats[0]>[];

    // --- LOGIC TO ASSIGN LABELS UNIQUELY ---
    
    // 1. Find "Alto Desempenho" (Highest Sales)
    clusterStats.sort((a, b) => b.avgSales - a.avgSales);
    const highPerf = clusterStats[0];
    
    // Remove it from pool
    let remaining = clusterStats.filter(c => c !== highPerf);

    // 2. Find "Baixo Desempenho" (Lowest Sales from remaining, OR if only 1 remaining)
    let lowPerf = null;
    if (remaining.length > 0) {
        remaining.sort((a, b) => a.avgSales - b.avgSales); // Ascending
        lowPerf = remaining[0];
        remaining = remaining.filter(c => c !== lowPerf);
    }

    // 3. Find "Operação Estendida" (Longest duration from remaining)
    let extended = null;
    if (remaining.length > 0) {
        remaining.sort((a, b) => b.duration - a.duration); // Descending duration
        extended = remaining[0];
        remaining = remaining.filter(c => c !== extended);
    }

    // 4. Find "Manhã Premium" (Remaining one)
    let morning = null;
    if (remaining.length > 0) {
        morning = remaining[0];
    }

    // Construct final result list
    const results: ClusterResult[] = [];

    // Helper to format result
    const pushResult = (stat: typeof highPerf, label: string, desc: string, color: string) => {
        results.push({
            id: stat.idx,
            label,
            description: desc,
            avgSales: stat.avgSales,
            avgOpen: stat.avgOpen,
            avgClose: stat.avgClose,
            items: stat.items,
            color
        });
    };

    if (highPerf) {
        pushResult(highPerf, "💰 Alto Desempenho", "Líderes de receita em horário comercial.", "bg-emerald-50 text-emerald-900 border-emerald-200");
    }

    if (lowPerf) {
        // Validation: If Low Perf sales are actually quite high (e.g. within 10% of High Perf), rename to "Standard"
        const isCloseToHigh = highPerf && (lowPerf.avgSales > highPerf.avgSales * 0.8);
        if (isCloseToHigh) {
             pushResult(lowPerf, "🏢 Comércio Padrão", "Perfil de faturamento regular.", "bg-gray-50 text-gray-800 border-gray-200");
        } else {
             pushResult(lowPerf, "📉 Baixo Desempenho", "Empresas com menor receita relativa.", "bg-orange-50 text-orange-900 border-orange-200");
        }
    }

    if (extended) {
        // Validation: Is duration actually long? (> 10h)
        if (extended.duration > 10.5) {
            pushResult(extended, "🏪 Operação Estendida", "Lojas com longas jornadas de funcionamento.", "bg-blue-50 text-blue-900 border-blue-200");
        } else {
            pushResult(extended, "⚖️ Desempenho Médio", "Estabelecimentos com operação padrão.", "bg-blue-50 text-blue-800 border-blue-200");
        }
    }

    if (morning) {
        // Validation: Is open early? (< 8am)
        if (morning.avgOpen < 8.5) {
            pushResult(morning, "☕ Manhã Premium", "Alto fluxo no início do dia.", "bg-indigo-50 text-indigo-900 border-indigo-200");
        } else {
            // Fallback personality
            pushResult(morning, "🍸 Perfil Alternativo", "Horários ou perfil diferenciado.", "bg-purple-50 text-purple-900 border-purple-200");
        }
    }

    // Return sorted by sales for display consistency
    return results.sort((a, b) => b.avgSales - a.avgSales);
};


const AnalysisModal: React.FC<AnalysisModalProps> = ({ data, onClose }) => {
    const [activeTab, setActiveTab] = useState<TabType>('sales');

    // 1. Calculate Average Sales by Neighborhood
    const salesByNeighbor = useMemo(() => {
        const groups: Record<string, { total: number; count: number }> = {};
        
        data.forEach(row => {
            const key = row.Bairro || row.Municipio || 'Outros';
            if (!groups[key]) groups[key] = { total: 0, count: 0 };
            
            if (row.AverageSales) {
                groups[key].total += row.AverageSales;
                groups[key].count += 1;
            }
        });

        return Object.entries(groups)
            .map(([key, val]) => ({
                name: key,
                avg: val.count > 0 ? Math.round(val.total / val.count) : 0
            }))
            .sort((a, b) => b.avg - a.avg)
            .slice(0, 10); // Top 10
    }, [data]);

    // 2. Count by Sector
    const sectorStats = useMemo(() => {
        const counts: Record<string, number> = {};
        let total = 0;
        
        data.forEach(row => {
            const sector = row.Setor || 'Não Informado';
            counts[sector] = (counts[sector] || 0) + 1;
            total++;
        });

        return Object.entries(counts)
            .map(([name, value]) => ({ name, value, percent: (value / total) * 100 }))
            .sort((a, b) => b.value - a.value); // Decrescente
    }, [data]);

    // 3. Best Day Frequency
    const dayStats = useMemo(() => {
        const counts: Record<string, number> = {};
        const mapDays: Record<string, string> = {
            'segunda': 'Seg', 'monday': 'Seg', 'seg': 'Seg',
            'terça': 'Ter', 'tuesday': 'Ter', 'ter': 'Ter',
            'quarta': 'Qua', 'wednesday': 'Qua', 'qua': 'Qua',
            'quinta': 'Qui', 'thursday': 'Qui', 'qui': 'Qui',
            'sexta': 'Sex', 'friday': 'Sex', 'sex': 'Sex',
            'sábado': 'Sáb', 'saturday': 'Sáb', 'sab': 'Sáb',
            'domingo': 'Dom', 'sunday': 'Dom', 'dom': 'Dom'
        };

        const sorter = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

        data.forEach(row => {
            if (row.BestDay) {
                const clean = row.BestDay.toLowerCase().split('-')[0].trim();
                const mapped = mapDays[clean] || clean;
                counts[mapped] = (counts[mapped] || 0) + 1;
            }
        });

        return Object.entries(counts)
            .map(([day, count]) => ({ day, count }))
            .sort((a, b) => {
                return sorter.indexOf(a.day) - sorter.indexOf(b.day);
            });
    }, [data]);

    // 4. Clusters (K-Means)
    const clusters = useMemo(() => {
        return performKMeans(data, 4);
    }, [data]);

    const maxSales = Math.max(...salesByNeighbor.map(s => s.avg), 1);
    const maxDays = Math.max(...dayStats.map(d => d.count), 1);

    // Format Decimal Time to HH:MM
    const formatDecTime = (dec: number) => {
        const h = Math.floor(dec);
        const m = Math.round((dec - h) * 60);
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    };

    // Render Helpers
    const renderTabButton = (id: TabType, label: string, icon: React.ReactNode) => (
        <button
            onClick={() => setActiveTab(id)}
            className={`flex items-center px-4 py-3 text-sm font-medium transition-colors border-b-2 whitespace-nowrap ${
                activeTab === id 
                ? 'border-white text-white' 
                : 'border-transparent text-indigo-200 hover:text-white hover:bg-indigo-700/20'
            }`}
        >
            <span className="mr-2">{icon}</span>
            {label}
        </button>
    );

    return (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-gray-900/90 backdrop-blur-md transition-opacity">
            <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full h-[85vh] flex flex-col overflow-hidden animate-fade-in-up">
                
                {/* Header with Tabs */}
                <div className="bg-indigo-600 pt-5 px-6 pb-0 flex flex-col shadow-md flex-shrink-0">
                    <div className="flex justify-between items-start mb-4">
                        <div>
                            <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                                <svg className="w-8 h-8 text-indigo-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg>
                                Análise de Dados
                            </h2>
                            <p className="text-indigo-200 text-sm mt-1">Base: {data.length} registros importados</p>
                        </div>
                        <button onClick={onClose} className="text-white/80 hover:text-white bg-indigo-700/50 hover:bg-indigo-700 p-2 rounded-lg transition-colors">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                        </button>
                    </div>

                    <div className="flex gap-2 mt-2 overflow-x-auto scrollbar-hide">
                        {renderTabButton('sales', 'Vendas por Bairro', 
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>
                        )}
                        {renderTabButton('sectors', 'Setores', 
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>
                        )}
                        {renderTabButton('days', 'Melhor Dia', 
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                        )}
                        {renderTabButton('clusters', 'Segmentação (IA)', 
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"></path></svg>
                        )}
                    </div>
                </div>

                {/* Content Body */}
                <div className="flex-1 bg-gray-50 overflow-hidden relative">
                    <div className="absolute inset-0 overflow-y-auto custom-scrollbar p-6">
                        
                        {/* TAB 1: SALES BY NEIGHBORHOOD */}
                        {activeTab === 'sales' && (
                            <div className="max-w-4xl mx-auto bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                                <h3 className="text-lg font-bold text-gray-800 mb-2">Ticket Médio por Bairro (Semanal)</h3>
                                <p className="text-sm text-gray-500 mb-6">Identifique as regiões com maior potencial de receita.</p>
                                
                                <div className="space-y-5">
                                    {salesByNeighbor.map((item, idx) => (
                                        <div key={idx} className="relative">
                                            <div className="flex justify-between text-sm mb-1 z-10 relative">
                                                <span className="font-semibold text-gray-700">{item.name}</span>
                                                <span className="font-bold text-emerald-600">R$ {item.avg.toLocaleString('pt-BR')}</span>
                                            </div>
                                            <div className="w-full bg-gray-100 rounded-lg h-8 relative overflow-hidden">
                                                <div 
                                                    className="bg-emerald-100 h-full absolute top-0 left-0 border-r-4 border-emerald-500 transition-all duration-700"
                                                    style={{ width: `${(item.avg / maxSales) * 100}%` }}
                                                ></div>
                                            </div>
                                        </div>
                                    ))}
                                    {salesByNeighbor.length === 0 && <p className="text-center text-gray-400 py-10">Nenhum dado de vendas encontrado.</p>}
                                </div>
                            </div>
                        )}

                        {/* TAB 2: SECTORS (NEW LAYOUT) */}
                        {activeTab === 'sectors' && (
                            <div className="max-w-4xl mx-auto bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                                <h3 className="text-lg font-bold text-gray-800 mb-2">Distribuição por Segmento</h3>
                                <p className="text-sm text-gray-500 mb-6">Volume de estabelecimentos por categoria de atuação.</p>

                                <div className="space-y-3">
                                    {sectorStats.map((item, idx) => (
                                        <div key={idx} className="flex items-center">
                                            <div className="w-1/3 pr-4 text-right">
                                                <div className="text-sm font-medium text-gray-700 truncate" title={item.name}>{item.name}</div>
                                            </div>
                                            <div className="flex-1">
                                                <div className="h-6 w-full bg-gray-100 rounded-full overflow-hidden flex items-center">
                                                    <div 
                                                        className="h-full bg-purple-500 rounded-full flex items-center justify-end px-2"
                                                        style={{ width: `${Math.max(item.percent, 5)}%` }} // Min width for visibility
                                                    >
                                                        <span className="text-[10px] font-bold text-white whitespace-nowrap">{Math.round(item.percent)}%</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="w-16 pl-3 text-sm text-gray-500 font-mono">
                                                {item.value} un
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* TAB 3: BEST DAY (FIXED HOVER BUG) */}
                        {activeTab === 'days' && (
                            <div className="max-w-4xl mx-auto bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                                <h3 className="text-lg font-bold text-gray-800 mb-2">Frequência de Pico de Vendas</h3>
                                <p className="text-sm text-gray-500 mb-8">Dia da semana indicado como "Melhor Dia" pelos clientes.</p>

                                <div className="h-80 flex items-end justify-between gap-4 px-4 pb-4 border-b border-gray-200">
                                    {dayStats.map((item, idx) => {
                                        const heightPercent = (item.count / maxDays) * 100;
                                        // Ensure bar has at least a little height if count > 0
                                        const displayHeight = item.count > 0 ? Math.max(heightPercent, 2) : 0; 
                                        
                                        return (
                                            <div key={idx} className="flex flex-col items-center flex-1 h-full justify-end group">
                                                <div className="mb-2 text-sm font-bold text-blue-600 transition-transform duration-300 transform group-hover:-translate-y-1">
                                                    {item.count}
                                                </div>
                                                <div 
                                                    className="w-full bg-blue-500 rounded-t-lg relative hover:bg-blue-600 transition-colors"
                                                    style={{ height: `${displayHeight}%` }}
                                                >
                                                </div>
                                                <div className="mt-4 text-xs font-bold text-gray-500 uppercase">{item.day}</div>
                                            </div>
                                        );
                                    })}
                                </div>
                                <div className="mt-6 bg-blue-50 p-4 rounded-xl border border-blue-100 flex items-start gap-3">
                                    <span className="text-2xl">💡</span>
                                    <div>
                                        <h4 className="font-bold text-blue-900 text-sm">Insight Estratégico</h4>
                                        <p className="text-blue-800 text-sm mt-1">
                                            <strong>{dayStats.sort((a,b) => b.count - a.count)[0]?.day || 'N/A'}</strong> é o dia com maior frequência de pico. 
                                            Planeje visitas de reposição ou promoções nos dias anteriores para preparar o estoque.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* TAB 4: CLUSTERING (K-MEANS) */}
                        {activeTab === 'clusters' && (
                            <div className="max-w-5xl mx-auto">
                                <div className="mb-6 bg-indigo-50 p-4 rounded-xl border border-indigo-100 flex gap-4 items-center">
                                    <div className="p-3 bg-indigo-200 text-indigo-800 rounded-full">
                                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"></path></svg>
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-bold text-indigo-900">Perfis Descobertos (Machine Learning)</h3>
                                        <p className="text-sm text-indigo-700">
                                            O sistema utilizou o algoritmo <strong>K-Means</strong> para agrupar automaticamente os estabelecimentos em {clusters.length} perfis semelhantes baseando-se em Faturamento e Horários de Pico.
                                        </p>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    {clusters.map((cluster) => (
                                        <div key={cluster.id} className={`rounded-xl border shadow-sm overflow-hidden flex flex-col ${cluster.color}`}>
                                            <div className="p-5 border-b border-black/5 bg-white/50">
                                                <div className="flex justify-between items-start mb-2">
                                                    <h4 className="text-xl font-bold flex items-center gap-2">
                                                        {cluster.label}
                                                    </h4>
                                                    <span className="bg-white/80 px-2 py-1 rounded text-xs font-bold border border-black/10 shadow-sm">
                                                        {cluster.items.length} lojas
                                                    </span>
                                                </div>
                                                <p className="text-sm opacity-90">{cluster.description}</p>
                                            </div>
                                            
                                            <div className="p-5 grid grid-cols-2 gap-4 text-sm bg-white/30">
                                                <div>
                                                    <span className="block text-xs uppercase font-bold opacity-60">Faturamento Médio</span>
                                                    <span className="text-lg font-bold">R$ {Math.round(cluster.avgSales).toLocaleString('pt-BR')}</span>
                                                </div>
                                                <div>
                                                    <span className="block text-xs uppercase font-bold opacity-60">Horário Médio</span>
                                                    <span className="text-lg font-bold">{formatDecTime(cluster.avgOpen)} - {formatDecTime(cluster.avgClose)}</span>
                                                </div>
                                            </div>

                                            <div className="bg-white p-4 flex-1">
                                                <h5 className="text-xs font-bold text-gray-400 uppercase mb-3">Principais Estabelecimentos:</h5>
                                                <ul className="space-y-2">
                                                    {cluster.items.slice(0, 4).map((store, i) => (
                                                        <li key={i} className="flex justify-between items-center text-sm text-gray-700 border-b border-gray-100 last:border-0 pb-1 last:pb-0">
                                                            <span className="truncate flex-1 pr-2">{store.Nome}</span>
                                                            <span className="text-xs font-mono bg-gray-100 px-1.5 py-0.5 rounded text-gray-500">
                                                                R$ {(store.AverageSales || 0).toLocaleString('pt-BR', { notation: "compact" })}
                                                            </span>
                                                        </li>
                                                    ))}
                                                </ul>
                                                {cluster.items.length > 4 && (
                                                    <div className="mt-3 text-center text-xs text-gray-400 italic">
                                                        + {cluster.items.length - 4} outros
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                    </div>
                </div>
            </div>
        </div>
    );
};

export default AnalysisModal;