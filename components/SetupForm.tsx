import React, { useState, ChangeEvent, useEffect, useRef, useMemo } from 'react';
import { UserPreferences, RawSheetRow, PriorityLevel, POSHealthData, Team, TeamMember } from '../types';
import { parseSheetFile, loadHealthBaseFromAssets, mergeRouteAndHealthData, applyPortfolioRules } from '../services/excelService';
import { batchCheckBusStops } from '../services/geminiService';
import LoadingModal from './LoadingModal';
import AnalysisModal from './AnalysisModal';
import DistributionModal from './DistributionModal';

interface SetupFormProps {
  onGenerate: (prefs: UserPreferences, data: RawSheetRow[]) => void;
  isLoading: boolean;
  teams: Team[]; 
  distributionRules?: string; 
}

const BUSINESS_SECTORS = [
  "Saúde (Farmácia)", 
  "Varejo (Moda)", 
  "Serviços (Pet)", 
  "Varejo (Escritório)", 
  "Serviços (Tecnologia)", 
  "Alimentos (Varejo)", 
  "Serviços (Saúde)", 
  "Serviços (Educação)", 
  "Saúde (Ótica)", 
  "Serviços (Beleza)", 
  "Varejo (Diversos)", 
  "Varejo (Automotivo)"
];

const normalizeStr = (str: string) => {
    if (!str) return "";
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
};

const getTransportIcon = (member: TeamMember) => {
    const mode = member.transportMode;
    if (mode === 'bicycle') return '🚲';
    if (mode === 'walking') return '🚶';
    if (mode === 'motorcycle') return '🏍️';
    // Se for 'car' ou o booleano antigo usesCar for true
    if (mode === 'car' || member.usesCar) return '🚗';
    return '🚌'; // Default: Transporte Público
};

const SetupForm: React.FC<SetupFormProps> = ({ onGenerate, isLoading, teams, distributionRules }) => {
  const [prefs, setPrefs] = useState<UserPreferences>({
    departureDate: new Date().toISOString().split('T')[0],
    departureTime: '08:00',
    returnTime: '18:00',
    visitDurationMinutes: 45,
    startLocation: '',
    useCurrentLocation: false,
    returnToStart: true,
    endLocation: '',
    needsFuel: false,
    officeSettings: {
        enabled: false,
        frequency: 'all_days',
        timing: 'morning',
        durationMinutes: 30
    },
    needsLunch: true,
    lunchDurationMinutes: 60,
    parkingPreference: 'paid'
  });
  
  const [sheetData, setSheetData] = useState<RawSheetRow[]>([]);
  const [healthMap, setHealthMap] = useState<Map<string, POSHealthData[]> | null>(null);
  const [healthBaseStatus, setHealthBaseStatus] = useState<string>('Carregando base de saúde...');
  
  const [fileName, setFileName] = useState<string>('');
  const [error, setError] = useState<string>('');
  
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [tempSheetData, setTempSheetData] = useState<RawSheetRow[]>([]);
  const [selectedSectors, setSelectedSectors] = useState<string[]>(BUSINESS_SECTORS);
  const [importMode, setImportMode] = useState<'all' | 'filter'>('all');
  
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [isCheckingBus, setIsCheckingBus] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const [itemToDelete, setItemToDelete] = useState<string | null>(null); 
  const [isBulkDelete, setIsBulkDelete] = useState(false); 

  const [parkingModalOpen, setParkingModalOpen] = useState(false);
  const [currentParkingId, setCurrentParkingId] = useState<string | null>(null);
  const [parkingText, setParkingText] = useState('');

  const [posModalOpen, setPosModalOpen] = useState(false);
  const [selectedPosData, setSelectedPosData] = useState<{name: string, data: POSHealthData[]} | null>(null);

  const [globalHealthOpen, setGlobalHealthOpen] = useState(false);
  
  const [showAnalysisModal, setShowAnalysisModal] = useState(false);

  const [showDistributionModal, setShowDistributionModal] = useState(false);

  const allAssigned = sheetData.length > 0 && sheetData.every(row => row.assignedTeamId);
  const activeTeamsCount = teams.filter(t => t.isActive).length;

  useEffect(() => {
    const loadHealth = async () => {
        try {
            const map = await loadHealthBaseFromAssets();
            if (map.size > 0) {
                setHealthMap(map);
                setHealthBaseStatus(`✓ Base conectada (${map.size} estabelecimentos)`);
            } else {
                setHealthBaseStatus('⚠️ Base "assets/base_saude.xlsx" não encontrada. Usando dados simulados.');
            }
        } catch (e) {
            setHealthBaseStatus('❌ Erro ao carregar base de saúde.');
        }
    };
    loadHealth();
  }, []);

  // --- MEMO: Coverage Stats ---
  const coverageStats = useMemo(() => {
    if (sheetData.length === 0) return null;

    const activeTeams = teams.filter(t => t.isActive);
    let baselineCapacity = 0;
    let totalCollaborators = 0;

    activeTeams.forEach(team => {
        const activeMembers = team.members.filter(m => !m.isOnVacation).length;
        totalCollaborators += activeMembers;
        const capacityPerPerson = team.maxActivitiesPerRoute || 20;
        if (activeMembers > 0) {
            baselineCapacity += (capacityPerPerson * activeMembers);
        }
    });

    const totalVisits = sheetData.length;
    const assignedVisits = sheetData.filter(row => row.assignedTeamId).length;
    const pendingVisits = totalVisits - assignedVisits;
    const remainingCapacity = Math.max(0, baselineCapacity - assignedVisits);

    const uncoveredLabels = new Set<string>(); 
    const unassignedRows = sheetData.filter(row => !row.assignedTeamId);

    unassignedRows.forEach(row => {
        const rowBairro = normalizeStr(row.Bairro || "");
        const rowCity = normalizeStr(row.Municipio || "");
        
        let isCoveredByGeography = false;

        activeTeams.forEach(team => {
            const covers = team.regions.some(reg => {
                const teamBairro = normalizeStr(reg.neighborhood);
                const teamCity = normalizeStr(reg.city);
                if (!teamBairro && !teamCity) return false; 

                let matchCity = false;
                if (teamCity && rowCity) {
                    matchCity = (rowCity === teamCity) || (rowCity.includes(teamCity)) || (teamCity.includes(rowCity));
                }
                if (!matchCity) return false; 

                let matchBairro = false;
                if (teamBairro) {
                    if (rowBairro) {
                        matchBairro = (rowBairro === teamBairro) || (rowBairro.includes(teamBairro)) || (teamBairro.includes(rowBairro));
                    } else {
                        matchBairro = false;
                    }
                } else {
                    matchBairro = true; 
                }
                return matchCity && matchBairro;
            });
            if (covers) isCoveredByGeography = true;
        });

        if (!isCoveredByGeography) {
            const displayLabel = (row.Bairro && row.Municipio) 
            ? `${row.Bairro} - ${row.Municipio}`
            : (row.Endereco ? row.Endereco.substring(0, 35) + "..." : row.Nome);
            uncoveredLabels.add(displayLabel);
        }
    });

    let capacityHealth = 0;
    if (pendingVisits === 0) capacityHealth = 100;
    else if (remainingCapacity === 0) capacityHealth = 0;
    else {
        capacityHealth = Math.min(100, Math.round((remainingCapacity / pendingVisits) * 100));
    }

    return {
        availableTeamsCount: activeTeams.length,
        totalCollaborators,
        baselineCapacity,
        remainingCapacity,
        assignedVisits,
        totalVisits,
        pendingVisits,
        capacityHealth,
        uncoveredRegions: Array.from(uncoveredLabels).slice(0, 50) 
    };
  }, [sheetData, teams]);

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setFileName(file.name);
      setIsProcessingFile(true); 
      setError(''); 

      try {
        await new Promise(r => setTimeout(r, 100));
        const data = await parseSheetFile(file);
        
        if (!data || data.length === 0) {
            throw new Error("O arquivo parece vazio ou não contém colunas reconhecíveis (Nome, Endereço).");
        }
        
        setTempSheetData(data);
        setImportMode('all');
        setSelectedSectors(BUSINESS_SECTORS);
        setShowFilterModal(true);
        
      } catch (err) {
        console.error("SetupForm File Error:", err);
        const msg = (err as Error).message || 'Erro desconhecido ao ler arquivo.';
        setError(`Erro na leitura: ${msg}`);
        setSheetData([]);
        
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
      } finally {
        setIsProcessingFile(false);
        e.target.value = '';
      }
    }
  };

  const handleInputClick = (e: React.MouseEvent<HTMLInputElement>) => {
      (e.target as HTMLInputElement).value = '';
  };

  const handleConfirmImport = () => {
      let finalData: RawSheetRow[] = [];

      if (importMode === 'all') {
          finalData = tempSheetData;
      } else {
          const filtered = tempSheetData.filter(row => {
              if (!row.Setor) return false;
              return selectedSectors.some(s => s.toLowerCase() === row.Setor?.trim().toLowerCase());
          });
          
          if (filtered.length === 0) {
              alert("Nenhum estabelecimento encontrado com as categorias selecionadas.");
              return; 
          }
          finalData = filtered;
      }

      // 1. Merge com dados de Saúde
      finalData = mergeRouteAndHealthData(finalData, healthMap);
      
      // 2. Auto-Associação baseada na Carteira (Portfolio) + Região
      finalData = applyPortfolioRules(finalData, teams);

      setSheetData(finalData);
      setShowFilterModal(false);
      setTempSheetData([]);
      setSelectedIds([]);
  };

  const toggleSector = (sector: string) => {
      setImportMode('filter');
      setSelectedSectors(prev => 
          prev.includes(sector) ? prev.filter(s => s !== sector) : [...prev, sector]
      );
  };

  const toggleAllSectors = () => {
      if (selectedSectors.length === BUSINESS_SECTORS.length) {
          setSelectedSectors([]);
          setImportMode('filter');
      } else {
          setSelectedSectors(BUSINESS_SECTORS);
      }
  };

  const handleCheckBusStops = async () => {
      if (sheetData.length === 0) return;
      
      setIsCheckingBus(true);
      try {
          const results = await batchCheckBusStops(sheetData);
          
          setSheetData(prev => prev.map(row => {
              const result = results[row.id];
              
              if (result) {
                  const isNegative = result.toLowerCase().includes("nenhum") || result.toLowerCase().includes("não encontrado");

                  if (isNegative) {
                      return {
                          ...row,
                          busStatus: 'not_found'
                      };
                  } else {
                      let cleanAddress = result.replace(/^(Ponto de ônibus (na|no|em|a)|Ponto (na|no|em|a)|Parada (na|no|em|a)|Localizado (na|no|em|a)|Próximo (ao?|à)|Em frente (ao?|à))\s+/i, '');
                      cleanAddress = cleanAddress.charAt(0).toUpperCase() + cleanAddress.slice(1);

                      return {
                          ...row,
                          Endereco: cleanAddress,
                          busStatus: 'found'
                      };
                  }
              }
              return row;
          }));
      } catch (e) {
          setError("Erro ao verificar pontos de ônibus. Tente novamente.");
      } finally {
          setIsCheckingBus(false);
      }
  };

  const toggleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.checked) {
          setSelectedIds(sheetData.map(row => row.id));
      } else {
          setSelectedIds([]);
      }
  };

  const toggleSelectRow = (id: string) => {
      setSelectedIds(prev => 
          prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
      );
  };

  const bulkUpdatePriority = (priority: PriorityLevel) => {
      setSheetData(prev => prev.map(row => 
          selectedIds.includes(row.id) ? { ...row, priority, prioritySource: 'file' } : row
      ));
  };

  const promptBulkDelete = () => {
      setIsBulkDelete(true);
  };

  const confirmBulkDelete = () => {
      setSheetData(prev => prev.filter(row => !selectedIds.includes(row.id)));
      setSelectedIds([]);
      setIsBulkDelete(false);
  };

  const openParkingModal = (id: string) => {
      const row = sheetData.find(r => r.id === id);
      if (row) {
          setCurrentParkingId(id);
          setParkingText(row.customParkingInfo || '');
          setParkingModalOpen(true);
      }
  };

  const saveParkingInfo = () => {
      if (currentParkingId) {
          setSheetData(prev => prev.map(row => 
              row.id === currentParkingId ? { ...row, customParkingInfo: parkingText } : row
          ));
          setParkingModalOpen(false);
          setCurrentParkingId(null);
          setParkingText('');
      }
  };

  const confirmDelete = () => {
    if (itemToDelete) {
      setSheetData(prev => prev.filter(row => row.id !== itemToDelete));
      setItemToDelete(null);
      setSelectedIds(prev => prev.filter(id => id !== itemToDelete));
    }
  };

  const openPosModal = (row: RawSheetRow) => {
      if (row.posData) {
          setSelectedPosData({
              name: row.Nome,
              data: row.posData
          });
          setPosModalOpen(true);
      }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (sheetData.length === 0) {
      setError('Por favor, faça upload de uma lista de locais.');
      return;
    }
    
    if (prefs.departureTime >= prefs.returnTime) {
        setError('O horário de retorno deve ser posterior ao horário de saída.');
        return;
    }
    onGenerate(prefs, sheetData);
  };

  const getPriorityLabel = (p: PriorityLevel) => {
      switch(p) {
          case 'high': return { text: 'Alta Prioridade', class: 'bg-red-100 text-red-800' };
          case 'medium': return { text: 'Média Prioridade', class: 'bg-orange-100 text-orange-800' };
          case 'lunch': return { text: 'Almoço', class: 'bg-yellow-100 text-yellow-800' };
          case 'end_of_day': return { text: 'Fim do Dia', class: 'bg-purple-100 text-purple-800' };
          default: return { text: 'Normal', class: 'bg-gray-100 text-gray-600' };
      }
  };

  const getHealthStatus = (data: POSHealthData) => {
      if (data.errorRate >= 6) return { label: 'CRÍTICO', color: 'text-red-600 bg-red-100', border: 'border-red-200' };
      if (data.paperStatus !== 'OK' || data.signalStrength < 20) return { label: 'COMPROMETIDO', color: 'text-orange-600 bg-orange-100', border: 'border-orange-200' };
      if (data.errorRate < 6 && data.signalStrength > 40) return { label: 'OPERATIVO', color: 'text-green-600 bg-green-100', border: 'border-green-200' };
      return { label: 'ATENÇÃO', color: 'text-yellow-600 bg-yellow-100', border: 'border-yellow-200' };
  };

  const getHealthAnalysis = (data: POSHealthData) => {
      const issues = [];
      const status = getHealthStatus(data).label;

      if (status === 'CRÍTICO') issues.push("Taxa de erro muito elevada (>6%).");
      if (status === 'COMPROMETIDO') {
          if (data.paperStatus !== 'OK') issues.push("Bobina precisa de reposição.");
          if (data.signalStrength < 20) issues.push("Sinal Wifi crítico (<20%).");
      }
      if (status === 'ATENÇÃO') issues.push("Sinal mediano (20-40%). Monitorar.");
      
      if (data.batteryLevel < 20) issues.push("Bateria baixa.");
      if (data.incidents && data.incidents > 0) issues.push(`${data.incidents} incidentes abertos.`);

      if (status === 'OPERATIVO') return "Equipamento em perfeito estado.";
      if (issues.length === 0) return "Funcional.";
      
      return issues.join(' ');
  };

  const itemToDeleteName = itemToDelete ? sheetData.find(r => r.id === itemToDelete)?.Nome : '';

  const renderHealthGauge = (total: number, operative: number) => {
    const score = total > 0 ? Math.round((operative / total) * 100) : 0;
    let label = "";
    let colorClass = "";
    if (score <= 25) { label = "Muito Medo"; colorClass = "text-red-600"; }
    else if (score <= 50) { label = "Medo"; colorClass = "text-yellow-600"; }
    else if (score <= 75) { label = "Confiante"; colorClass = "text-lime-600"; }
    else { label = "Muito Confiante"; colorClass = "text-green-700"; }

    const rotation = (score / 100) * 180 - 90;

    return (
        <div className="flex flex-col items-center justify-center bg-white rounded-xl border border-gray-200 shadow-sm p-4 h-full">
            <h3 className="text-xs font-bold uppercase text-gray-500 mb-2">Índice de Operacionalidade</h3>
            <div className="relative w-48 h-24 overflow-hidden mb-2">
                <div 
                    className="w-48 h-48 rounded-full box-border"
                    style={{
                        background: `conic-gradient(from 270deg at 50% 50%, 
                            #EF4444 0deg 45deg, 
                            #EAB308 45deg 90deg, 
                            #84CC16 90deg 135deg, 
                            #15803D 135deg 180deg, 
                            transparent 180deg)`,
                        transform: 'rotate(0deg)',
                        mask: 'radial-gradient(transparent 55%, black 56%)',
                        WebkitMask: 'radial-gradient(transparent 55%, black 56%)'
                    }}
                ></div>
                <div 
                    className="absolute bottom-0 left-1/2 w-1 h-[90%] bg-gray-800 origin-bottom rounded-full transition-transform duration-700 ease-out"
                    style={{ 
                        transform: `translateX(-50%) rotate(${rotation}deg)`,
                        zIndex: 10 
                    }}
                >
                    <div className="absolute -top-1 -left-1 w-3 h-3 bg-gray-800 rounded-full"></div>
                </div>
                <div className="absolute bottom-[-5px] left-1/2 w-4 h-4 bg-gray-800 rounded-full transform -translate-x-1/2 z-20"></div>
            </div>
            <div className="text-center -mt-2">
                <div className="text-3xl font-bold text-gray-800">{score}%</div>
                <div className={`text-sm font-bold uppercase ${colorClass}`}>{label}</div>
            </div>
            <div className="flex justify-between w-full px-4 mt-2 text-[10px] text-gray-400 font-mono">
                <span>0</span>
                <span>100</span>
            </div>
        </div>
    );
  };

  return (
    <div className={`bg-white rounded-2xl shadow-xl p-6 w-full mx-auto border border-gray-100 transition-all duration-300 ${sheetData.length > 0 ? 'max-w-full' : 'max-w-3xl'}`}>
      
      {isCheckingBus && <LoadingModal type="bus" />}
      {showAnalysisModal && <AnalysisModal data={sheetData} onClose={() => setShowAnalysisModal(false)} />}
      
      {showDistributionModal && (
          <DistributionModal 
              activities={sheetData} 
              teams={teams} 
              distributionRules={distributionRules}
              onClose={() => setShowDistributionModal(false)} 
              onApply={(updatedData) => {
                  setSheetData(updatedData);
                  setShowDistributionModal(false);
              }}
          />
      )}

      <form onSubmit={handleSubmit} className="space-y-8">
        
        {sheetData.length === 0 && (
            <div className="space-y-6">
                <div className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors cursor-pointer relative group ${isProcessingFile ? 'border-gray-300 bg-gray-50' : 'border-blue-200 bg-blue-50 hover:bg-blue-100'}`}>
                    <input 
                        ref={fileInputRef}
                        type="file" 
                        accept=".xlsx, .xls, .csv" 
                        onChange={handleFileChange}
                        onClick={handleInputClick}
                        disabled={isProcessingFile}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                    />
                    
                    {isProcessingFile ? (
                        <div className="flex flex-col items-center animate-pulse">
                             <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-3"></div>
                             <span className="text-blue-800 font-bold text-lg">Processando Arquivo...</span>
                             <p className="text-sm text-blue-500 mt-1">Lendo dados e colunas...</p>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center">
                            <div className="bg-white p-3 rounded-full mb-3 shadow-sm group-hover:scale-110 transition-transform">
                                <svg className="w-8 h-8 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                            </div>
                            <span className="text-blue-800 font-bold text-lg">
                            Carregar Lista de Visitas (Rota)
                            </span>
                            <p className="text-sm text-blue-500 mt-1">Clique ou arraste seu arquivo Excel/CSV aqui</p>
                        </div>
                    )}
                </div>

                <div className={`p-4 rounded-lg flex items-center justify-between transition-colors ${healthBaseStatus.includes('⚠️') ? 'bg-yellow-50 text-yellow-800 border border-yellow-200' : (healthBaseStatus.includes('❌') ? 'bg-red-50 text-red-800 border border-red-200' : 'bg-green-50 text-green-800 border border-green-200')}`}>
                    <div className="flex items-center gap-3">
                         <div className="p-2 bg-white rounded-full shadow-sm">
                             <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                        </div>
                        <span className="font-medium text-sm">{healthBaseStatus}</span>
                    </div>
                </div>

                 {healthBaseStatus.includes('⚠️') && (
                     <div className="text-center bg-gray-50 p-4 rounded-lg border border-gray-200 text-xs text-gray-600">
                        <p className="font-bold mb-1">Como usar dados reais?</p>
                        1. Crie a pasta <code>public/assets</code> na raiz do projeto.<br/>
                        2. Salve sua planilha de saúde lá com o nome <code>base_saude.xlsx</code>.<br/>
                        3. Recarregue a página.
                     </div>
                 )}
            </div>
        )}

        {sheetData.length > 0 && (
            <div className="flex flex-col lg:flex-row gap-6 items-start">
                
                <div className="flex-1 w-full min-w-0 bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm flex flex-col h-full self-stretch relative">
                    
                    <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex flex-col gap-2 flex-shrink-0">
                        <div className="flex flex-wrap justify-between items-center gap-2">
                            <h3 className="font-semibold text-gray-700">Lista de Empresas ({sheetData.length})</h3>
                            <div className="flex flex-wrap gap-3 text-xs items-center">
                                 <button
                                     type="button"
                                     onClick={() => setShowAnalysisModal(true)}
                                     className="flex items-center gap-1 bg-indigo-100 text-indigo-700 px-3 py-1.5 rounded-lg font-bold hover:bg-indigo-200 transition-colors shadow-sm"
                                 >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z"></path></svg>
                                    Módulo de Análise
                                 </button>

                                 <button
                                     type="button"
                                     onClick={() => setShowDistributionModal(true)}
                                     disabled={allAssigned || activeTeamsCount === 0}
                                     title={activeTeamsCount === 0 ? "Cadastre equipes ativas para usar a distribuição." : ""}
                                     className={`flex items-center gap-1 px-3 py-1.5 rounded-lg font-bold transition-colors shadow-sm ${
                                         allAssigned || activeTeamsCount === 0
                                         ? 'bg-gray-200 text-gray-500 border border-gray-300 cursor-not-allowed' 
                                         : 'bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white'
                                     }`}
                                 >
                                    {allAssigned ? (
                                        <>
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                                            Distribuído
                                        </>
                                    ) : (
                                        <>
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>
                                            Distribuir por Equipe
                                        </>
                                    )}
                                 </button>
                                 
                                 <button
                                     type="button"
                                     onClick={handleCheckBusStops}
                                     disabled={isCheckingBus}
                                     className={`flex items-center gap-1 px-3 py-1.5 rounded-lg font-bold transition-colors shadow-sm ${isCheckingBus ? 'bg-gray-200 text-gray-500 cursor-not-allowed' : 'bg-green-100 text-green-700 hover:bg-green-200'}`}
                                 >
                                     {isCheckingBus ? (
                                         <>
                                            <div className="w-3 h-3 border-2 border-gray-500 border-t-transparent rounded-full animate-spin"></div>
                                            Verificando...
                                         </>
                                     ) : (
                                         <>
                                            🚌 Sub. por Pontos de Bus
                                         </>
                                     )}
                                 </button>
                                 <button
                                     type="button"
                                     onClick={() => setGlobalHealthOpen(true)}
                                     className="flex items-center gap-1 bg-blue-100 text-blue-700 px-3 py-1.5 rounded-lg font-bold hover:bg-blue-200 transition-colors shadow-sm"
                                 >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg>
                                    Monitoramento Global
                                 </button>
                                 {(!healthMap || healthMap.size === 0) && (
                                     <span className="text-orange-500 flex items-center ml-2 hidden md:inline" title="Dados de saúde das máquinas estão sendo simulados.">
                                         ⚠️ Dados Simulados
                                     </span>
                                 )}
                                 <button 
                                    type="button" 
                                    onClick={() => { setSheetData([]); setFileName(''); setSelectedIds([]); }}
                                    className="text-red-600 hover:text-red-800 font-medium ml-2"
                                >
                                    Reiniciar
                                </button>
                            </div>
                        </div>
                        
                        {selectedIds.length > 0 && (
                            <div className="flex items-center justify-between bg-blue-50 p-2 rounded-lg border border-blue-100 animate-fade-in-up">
                                <span className="text-xs font-bold text-blue-800 ml-1">
                                    {selectedIds.length} selecionados
                                </span>
                                <div className="flex gap-1 overflow-x-auto">
                                    <button type="button" onClick={() => bulkUpdatePriority('high')} className="px-2 py-1 text-xs bg-white border border-red-200 text-red-700 rounded hover:bg-red-50 flex items-center" title="Definir Alta Prioridade">🔥 Alta</button>
                                    <button type="button" onClick={() => bulkUpdatePriority('lunch')} className="px-2 py-1 text-xs bg-white border border-orange-200 text-orange-700 rounded hover:bg-orange-50 flex items-center" title="Definir para Almoço">🍽️ Almoço</button>
                                    <button type="button" onClick={() => bulkUpdatePriority('end_of_day')} className="px-2 py-1 text-xs bg-white border border-purple-200 text-purple-700 rounded hover:bg-purple-50 flex items-center" title="Definir Fim do Dia">🌙 Fim</button>
                                    <button type="button" onClick={() => bulkUpdatePriority('normal')} className="px-2 py-1 text-xs bg-white border border-gray-200 text-gray-600 rounded hover:bg-gray-50 flex items-center" title="Remover Prioridade">↺ Normal</button>
                                    <div className="w-px h-4 bg-gray-300 mx-1 self-center"></div>
                                    <button type="button" onClick={promptBulkDelete} className="px-2 py-1 text-xs bg-white border border-red-200 text-red-600 rounded hover:bg-red-50 flex items-center font-bold">🗑️</button>
                                </div>
                            </div>
                        )}
                    </div>
                    
                    <div className="overflow-x-auto overflow-y-auto custom-scrollbar flex-grow" style={{ maxHeight: 'calc(100vh - 280px)' }}>
                        <table className="min-w-full divide-y divide-gray-200 relative pb-24">
                            <thead className="bg-gray-50 sticky top-0 z-10 shadow-sm">
                                <tr>
                                    <th className="px-4 py-3 w-10">
                                        <input 
                                            type="checkbox" 
                                            className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 cursor-pointer"
                                            checked={sheetData.length > 0 && selectedIds.length === sheetData.length}
                                            onChange={toggleSelectAll}
                                        />
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Empresa / Maquininhas</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Equipe / Colaborador</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Prioridade</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Endereço</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Detalhes (Horário)</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {sheetData.map((row) => {
                                    const hasPos = row.posData && row.posData.length > 0;
                                    const busStatus = row.busStatus;
                                    const isBusStop = busStatus === 'found';
                                    const isBusNotFound = busStatus === 'not_found';
                                    const assignedTeam = row.assignedTeamId ? teams.find(t => t.id === row.assignedTeamId) : null;
                                    const assignedMember = assignedTeam && row.assignedMemberId ? assignedTeam.members.find(m => m.id === row.assignedMemberId) : null;

                                    return (
                                        <tr key={row.id} className={`hover:bg-gray-50 transition-colors ${selectedIds.includes(row.id) ? 'bg-blue-50/30' : ''}`}>
                                            <td className="px-4 py-3">
                                                <input 
                                                    type="checkbox" 
                                                    className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 cursor-pointer"
                                                    checked={selectedIds.includes(row.id)}
                                                    onChange={() => toggleSelectRow(row.id)}
                                                />
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap">
                                                {hasPos ? (
                                                    <button 
                                                        type="button"
                                                        onClick={() => openPosModal(row)}
                                                        className="font-medium text-blue-600 hover:text-blue-800 hover:underline text-left"
                                                    >
                                                        {row.Nome}
                                                    </button>
                                                ) : (
                                                    <span className="font-medium text-gray-800 text-left cursor-default">
                                                        {row.Nome}
                                                    </span>
                                                )}
                                                
                                                <div className="flex items-center gap-2 mt-1">
                                                    <span className={`text-xs px-2 py-0.5 rounded-full border ${hasPos ? 'bg-gray-100 text-gray-600 border-gray-200' : 'bg-gray-50 text-gray-400 border-gray-100'}`}>
                                                        {hasPos ? row.posData!.length : 0} POS
                                                    </span>
                                                    {hasPos && row.posData!.some(p => getHealthStatus(p).label === 'CRÍTICO') && (
                                                        <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full font-bold">! Crítico</span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap">
                                                {assignedTeam ? (
                                                    <div className="flex flex-col items-start gap-1">
                                                        <span 
                                                            className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-[10px] font-bold px-2 py-1 rounded-full shadow-sm flex items-center w-fit gap-1 cursor-help"
                                                            title={row.distributionReason || "Atribuído automaticamente"}
                                                        >
                                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>
                                                            {assignedTeam.name}
                                                        </span>
                                                        {assignedMember && (
                                                            <span className="text-[10px] text-gray-500 font-medium flex items-center gap-1 ml-1">
                                                                <span title={assignedMember.transportMode === 'car' ? 'Carro' : 'Outro'} className="text-[14px]">
                                                                    {getTransportIcon(assignedMember)}
                                                                </span>
                                                                {assignedMember.name}
                                                            </span>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <span className="text-red-600 text-xs font-bold">Sem equipe para esta região</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap">
                                                <div className="flex flex-col items-start gap-1">
                                                    {row.priority !== 'normal' ? (
                                                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getPriorityLabel(row.priority).class}`}>
                                                            {getPriorityLabel(row.priority).text}
                                                        </span>
                                                    ) : (
                                                        <span className="text-xs text-gray-400">Normal</span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-sm text-gray-600 max-w-xs truncate" title={`${row.Endereco}${row.Bairro ? `, ${row.Bairro}` : ''}${row.Municipio ? `, ${row.Municipio}` : ''}`}>
                                                <div className="flex flex-col">
                                                    <div className="flex items-center gap-2">
                                                        {(isBusStop || isBusNotFound) && (
                                                             <span 
                                                                className={`flex-shrink-0 p-0.5 rounded ${isBusNotFound ? 'text-red-500 bg-red-50' : 'text-blue-600 bg-blue-50'}`}
                                                                title={isBusNotFound ? "sem ponto nas prox de 300m" : "Ponto de ônibus próximo"}
                                                             >
                                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 10a1 1 0 011-1h12a1 1 0 011 1v7a1 1 0 01-1 1h-2a1 1 0 01-1-1v-1H8v1a1 1 0 01-1 1H5a1 1 0 01-1-1v-7z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v4m0 0l-2-2m2 2l2-2"></path></svg>
                                                             </span>
                                                        )}
                                                        <span className="truncate font-medium text-gray-900">{row.Endereco}</span>
                                                    </div>
                                                    {(row.Bairro || row.Municipio) && (
                                                        <span className="text-xs text-gray-500 truncate mt-0.5">
                                                            {[row.Bairro, row.Municipio].filter(Boolean).join(", ")}
                                                        </span>
                                                    )}
                                                </div>
                                                <button 
                                                        type="button"
                                                        onClick={(e) => { e.stopPropagation(); openParkingModal(row.id); }}
                                                        className="text-gray-400 hover:text-indigo-600 flex-shrink-0 transition-colors hidden"
                                                        title="Editar informações de estacionamento"
                                                >
                                                        🅿️
                                                </button>
                                                {row.customParkingInfo && (
                                                    <div className="mt-1 flex items-start text-xs font-medium text-indigo-600 bg-indigo-50 p-1 rounded inline-block">
                                                        {row.customParkingInfo}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                                                <div className="flex flex-col">
                                                    <span>Abre: {row.HorarioAbertura || '-'}</span>
                                                    <span>Fecha: {row.HorarioFechamento || '-'}</span>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="w-full lg:w-[380px] flex-shrink-0 space-y-4 animate-fade-in-up">
                    
                    {coverageStats && (
                        <div className={`p-5 rounded-xl border shadow-sm transition-all ${coverageStats.uncoveredRegions.length > 0 ? 'bg-red-50 border-red-200' : 'bg-blue-50 border-blue-200'}`}>
                            <h3 className={`font-semibold mb-3 flex items-center ${coverageStats.uncoveredRegions.length > 0 ? 'text-red-800' : 'text-blue-800'}`}>
                                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    {coverageStats.uncoveredRegions.length > 0 
                                     ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
                                     : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                                    }
                                </svg>
                                Capacidade Operacional
                            </h3>

                            <div className="grid grid-cols-2 gap-3 mb-3">
                                <div className="bg-white p-2 rounded border border-gray-100 shadow-sm">
                                    <span className="block text-xs text-gray-500 uppercase font-bold">Equipes Disp.</span>
                                    <span className="text-lg font-bold text-gray-800">{coverageStats.availableTeamsCount}</span>
                                </div>
                                <div className="bg-white p-2 rounded border border-gray-100 shadow-sm">
                                    <span className="block text-xs text-gray-500 uppercase font-bold">Colaboradores</span>
                                    <span className="text-lg font-bold text-gray-800">{coverageStats.totalCollaborators}</span>
                                </div>
                            </div>

                            <div className="bg-white p-3 rounded border border-gray-100 shadow-sm mb-3">
                                <div className="flex justify-between items-end mb-1">
                                     <span className="text-xs text-gray-500 uppercase font-bold">Capacidade Restante</span>
                                     <span className={`text-xs font-bold ${coverageStats.capacityHealth > 50 ? 'text-green-600' : 'text-red-600'}`}>
                                        {coverageStats.capacityHealth}% da Demanda
                                     </span>
                                </div>
                                <div className="w-full bg-gray-200 rounded-full h-2">
                                     <div 
                                        className={`h-2 rounded-full ${coverageStats.capacityHealth > 50 ? 'bg-green-500' : 'bg-red-500'}`} 
                                        style={{ width: `${coverageStats.capacityHealth}%` }}
                                     ></div>
                                </div>
                                <div className="flex justify-between text-xs mt-1 text-gray-600">
                                    <span>{coverageStats.pendingVisits} Visitas Pendentes</span>
                                    <span>{coverageStats.remainingCapacity} Restantes (de {coverageStats.baselineCapacity})</span>
                                </div>
                            </div>

                            {coverageStats.uncoveredRegions.length > 0 && (
                                <div className="bg-red-100 border border-red-200 rounded p-2 text-xs text-red-800">
                                    <span className="font-bold block mb-1">⚠️ Regiões sem cobertura (Geográfica):</span>
                                    <ul className="list-disc list-inside max-h-20 overflow-y-auto custom-scrollbar">
                                        {coverageStats.uncoveredRegions.map((r, i) => (
                                            <li key={i} className="truncate">{r}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                    )}

                    <div className="bg-gray-50 p-5 rounded-xl border border-gray-200 shadow-sm">
                        <h3 className="font-semibold text-gray-800 mb-4 flex items-center">
                            <svg className="w-5 h-5 mr-2 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                            Configuração
                        </h3>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="col-span-1">
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Data</label>
                                <input 
                                    type="date" 
                                    value={prefs.departureDate}
                                    onChange={(e) => setPrefs({...prefs, departureDate: e.target.value})}
                                    className="w-full px-2 py-2 text-sm rounded-lg border border-gray-600 bg-gray-700 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                />
                            </div>
                            <div className="col-span-1">
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Tempo de Visita (min)</label>
                                <input 
                                    type="number" 
                                    min="5"
                                    max="480"
                                    value={prefs.visitDurationMinutes}
                                    onChange={(e) => setPrefs({...prefs, visitDurationMinutes: parseInt(e.target.value) || 0})}
                                    className="w-full px-2 py-2 text-sm rounded-lg border border-gray-600 bg-gray-700 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                />
                            </div>
                            <div className="col-span-1">
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Horário de Saída</label>
                                <input 
                                    type="time" 
                                    value={prefs.departureTime}
                                    onChange={(e) => setPrefs({...prefs, departureTime: e.target.value})}
                                    className="w-full px-2 py-2 text-sm rounded-lg border border-gray-600 bg-gray-700 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                />
                            </div>
                            <div className="col-span-1">
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Horário de Retorno</label>
                                <input 
                                    type="time" 
                                    value={prefs.returnTime}
                                    onChange={(e) => setPrefs({...prefs, returnTime: e.target.value})}
                                    className="w-full px-2 py-2 text-sm rounded-lg border border-gray-600 bg-gray-700 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm space-y-4">
                        <div>
                            <h3 className="text-sm font-semibold text-gray-700 mb-2">Obrigatórios</h3>
                            <div className="space-y-3">
                                <label className="flex items-center space-x-2 cursor-pointer p-1 rounded hover:bg-gray-50">
                                    <input type="checkbox" checked={prefs.needsFuel} onChange={(e) => setPrefs({...prefs, needsFuel: e.target.checked})} className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"/>
                                    <span className="text-gray-700 text-sm">Abastecer</span>
                                </label>
                                
                                <div className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                                    <label className="flex items-center space-x-2 cursor-pointer mb-2">
                                        <input 
                                            type="checkbox" 
                                            checked={prefs.officeSettings.enabled} 
                                            onChange={(e) => setPrefs({...prefs, officeSettings: {...prefs.officeSettings, enabled: e.target.checked}})} 
                                            className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                                        />
                                        <span className="text-gray-700 text-sm font-medium">Passar no Escritório</span>
                                    </label>
                                    
                                    {prefs.officeSettings.enabled && (
                                        <div className="pl-6 space-y-2 animate-fade-in-up">
                                            <div>
                                                <label className="block text-xs text-gray-500 mb-1">Frequência</label>
                                                <select 
                                                    value={prefs.officeSettings.frequency}
                                                    onChange={(e) => setPrefs({...prefs, officeSettings: {...prefs.officeSettings, frequency: e.target.value as any}})}
                                                    className="w-full text-xs p-1.5 border border-gray-600 rounded bg-gray-700 text-white outline-none"
                                                >
                                                    <option value="all_days">Todos os Dias</option>
                                                    <option value="first_day">Apenas Primeiro Dia</option>
                                                    <option value="last_day">Apenas Último Dia</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-xs text-gray-500 mb-1">Período</label>
                                                <select 
                                                    value={prefs.officeSettings.timing}
                                                    onChange={(e) => setPrefs({...prefs, officeSettings: {...prefs.officeSettings, timing: e.target.value as any}})}
                                                    className="w-full text-xs p-1.5 border border-gray-600 rounded bg-gray-700 text-white outline-none"
                                                >
                                                    <option value="morning">Manhã (Início)</option>
                                                    <option value="lunch">Próximo ao Almoço</option>
                                                    <option value="afternoon">Final do Dia</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-xs text-gray-500 mb-1">Duração (min)</label>
                                                <input 
                                                    type="number"
                                                    min="5"
                                                    max="240"
                                                    value={prefs.officeSettings.durationMinutes}
                                                    onChange={(e) => setPrefs({...prefs, officeSettings: {...prefs.officeSettings, durationMinutes: parseInt(e.target.value) || 0}})}
                                                    className="w-full text-xs p-1.5 border border-gray-600 rounded bg-gray-700 text-white outline-none"
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                                    <label className="flex items-center space-x-2 cursor-pointer mb-2">
                                        <input 
                                            type="checkbox" 
                                            checked={prefs.needsLunch} 
                                            onChange={(e) => setPrefs({...prefs, needsLunch: e.target.checked})} 
                                            className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                                        />
                                        <span className="text-gray-700 text-sm font-medium">Parada de Almoço</span>
                                    </label>
                                    
                                    {prefs.needsLunch && (
                                        <div className="pl-6 animate-fade-in-up">
                                            <div>
                                                <label className="block text-xs text-gray-500 mb-1">Duração (min)</label>
                                                <input 
                                                    type="number"
                                                    min="15"
                                                    max="120"
                                                    value={prefs.lunchDurationMinutes}
                                                    onChange={(e) => setPrefs({...prefs, lunchDurationMinutes: parseInt(e.target.value) || 0})}
                                                    className="w-full text-xs p-1.5 border border-gray-600 rounded bg-gray-700 text-white outline-none"
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                        <div className="border-t pt-2">
                             <h3 className="text-sm font-semibold text-gray-700 mb-2">Estacionamento</h3>
                             <div className="flex gap-2">
                                {['street', 'paid'].map((type) => (
                                    <label key={type} className={`flex-1 flex items-center justify-center space-x-1 cursor-pointer p-2 rounded border ${prefs.parkingPreference === type ? 'bg-blue-50 border-blue-300 text-blue-700' : 'border-gray-200 text-gray-600'}`}>
                                        <input 
                                            type="radio" 
                                            name="parking"
                                            checked={prefs.parkingPreference === type} 
                                            onChange={() => setPrefs({...prefs, parkingPreference: type as any})} 
                                            className="hidden"
                                        />
                                        <span className="text-xs font-medium">
                                            {type === 'street' ? 'Rua' : 'Pago'}
                                        </span>
                                    </label>
                                ))}
                                <label className={`flex-1 flex items-center justify-center space-x-1 cursor-pointer p-2 rounded border ${prefs.parkingPreference === 'blue_zone' ? 'bg-blue-50 border-blue-300 text-blue-700' : 'border-gray-200 text-gray-600'}`}>
                                        <input 
                                            type="radio" 
                                            name="parking"
                                            checked={prefs.parkingPreference === 'blue_zone'} 
                                            onChange={() => setPrefs({...prefs, parkingPreference: 'blue_zone'})} 
                                            className="hidden"
                                        />
                                        <span className="text-xs font-medium">Zona Azul</span>
                                </label>
                             </div>
                        </div>
                    </div>

                    <button 
                        type="submit" 
                        disabled={isLoading}
                        className={`w-full py-3 rounded-xl font-bold text-white shadow-lg transition-all transform hover:scale-[1.01] ${isLoading ? 'bg-gray-400 cursor-not-allowed' : 'bg-[#3483fa] hover:bg-blue-600'}`}
                    >
                        Gerar Roteiro
                    </button>
                </div>

            </div>
        )}

        {error && (
            <div className="p-4 bg-red-100 text-red-700 rounded-xl text-sm flex items-center justify-center animate-pulse border border-red-200 shadow-sm mt-4 font-semibold">
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                {error}
            </div>
        )}

        {showFilterModal && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm transition-opacity">
                <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full p-6 transform transition-all scale-100 flex flex-col max-h-[90vh]">
                    <div className="text-center mb-6">
                        <h3 className="text-2xl font-bold text-gray-900">Importar Estabelecimentos</h3>
                        <p className="text-gray-500 text-sm mt-1">Selecione como deseja processar os dados do arquivo.</p>
                    </div>

                    <div className="flex gap-4 mb-6">
                        <button
                            type="button"
                            onClick={() => setImportMode('all')}
                            className={`flex-1 p-4 rounded-xl border-2 transition-all ${importMode === 'all' ? 'border-blue-600 bg-blue-50 text-blue-700 shadow-sm' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}
                        >
                            <div className="font-bold text-lg mb-1">Importar Tudo</div>
                            <div className="text-xs opacity-80">Processar {tempSheetData.length} endereços sem filtrar</div>
                        </button>
                        <button
                            type="button"
                            onClick={() => { setImportMode('filter'); if(selectedSectors.length === 0) setSelectedSectors(BUSINESS_SECTORS); }}
                            className={`flex-1 p-4 rounded-xl border-2 transition-all ${importMode === 'filter' ? 'border-indigo-600 bg-indigo-50 text-indigo-700 shadow-sm' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}
                        >
                            <div className="font-bold text-lg mb-1">Filtrar por Setor</div>
                            <div className="text-xs opacity-80">Selecionar categorias específicas</div>
                        </button>
                    </div>

                    {importMode === 'filter' && (
                        <div className="flex-1 overflow-y-auto mb-6 custom-scrollbar pr-2">
                             <div className="flex justify-between items-center mb-3">
                                 <h4 className="font-semibold text-gray-700 text-sm">Selecione os setores desejados:</h4>
                                 <button type="button" onClick={toggleAllSectors} className="text-xs text-blue-600 font-medium hover:underline">
                                     {selectedSectors.length === BUSINESS_SECTORS.length ? 'Desmarcar Todos' : 'Marcar Todos'}
                                 </button>
                             </div>
                             <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                 {BUSINESS_SECTORS.map((sector) => (
                                     <label 
                                         key={sector} 
                                         className={`flex items-center p-3 rounded-lg border cursor-pointer transition-colors ${selectedSectors.includes(sector) ? 'bg-indigo-50 border-indigo-200' : 'border-gray-200 hover:bg-gray-50'}`}
                                     >
                                         <input 
                                             type="checkbox" 
                                             checked={selectedSectors.includes(sector)}
                                             onChange={() => toggleSector(sector)}
                                             className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500 mr-3"
                                         />
                                         <span className="text-sm font-medium text-gray-700">{sector}</span>
                                     </label>
                                 ))}
                             </div>
                        </div>
                    )}

                    <div className="flex justify-end gap-3 mt-auto pt-4 border-t border-gray-100">
                         <button
                            type="button"
                            onClick={() => { setShowFilterModal(false); setTempSheetData([]); setFileName(''); }}
                            className="px-6 py-2 bg-transparent text-[#3483fa] border border-[#3483fa] rounded-lg font-bold hover:bg-blue-50 transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            type="button"
                            onClick={handleConfirmImport}
                            className="px-6 py-2 bg-[#3483fa] text-white rounded-lg font-bold hover:shadow-lg transition-all hover:bg-blue-600"
                        >
                            Confirmar Importação
                        </button>
                    </div>
                </div>
            </div>
        )}
        
        {(itemToDelete || isBulkDelete) && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm transition-opacity">
                <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-6 transform transition-all scale-100 animate-fade-in-up">
                    <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-100 mx-auto mb-4">
                        <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                    </div>
                    <h3 className="text-lg font-bold text-center text-gray-900 mb-2">
                        {isBulkDelete ? 'Remover Múltiplas Visitas?' : 'Remover Visita?'}
                    </h3>
                    <p className="text-gray-500 text-center text-sm mb-6">
                        {isBulkDelete 
                            ? `Tem certeza que deseja remover ${selectedIds.length} estabelecimentos? Esta ação não pode ser desfeita.` 
                            : `Tem certeza que deseja remover "${itemToDeleteName}"?`}
                    </p>
                    <div className="flex gap-3">
                        <button 
                            type="button" 
                            onClick={() => { setItemToDelete(null); setIsBulkDelete(false); }}
                            className="flex-1 py-2 bg-transparent text-[#3483fa] border border-[#3483fa] rounded-lg font-bold hover:bg-blue-50 transition-colors"
                        >
                            Cancelar
                        </button>
                        <button 
                            type="button" 
                            onClick={isBulkDelete ? confirmBulkDelete : confirmDelete}
                            className="flex-1 py-2 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700 transition-colors shadow-md"
                        >
                            Remover
                        </button>
                    </div>
                </div>
            </div>
        )}

        {parkingModalOpen && (
             <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm transition-opacity">
                <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 transform transition-all scale-100 animate-fade-in-up">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="bg-indigo-100 p-2 rounded-full text-indigo-700">
                             <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                        </div>
                        <h3 className="text-lg font-bold text-gray-900">Info. de Estacionamento</h3>
                    </div>
                    <p className="text-gray-500 text-sm mb-4">
                        Adicione detalhes específicos para este local (ex: "Entrada pela lateral", "Conveniado com ParkZap").
                    </p>
                    <textarea 
                        value={parkingText}
                        onChange={(e) => setParkingText(e.target.value)}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 min-h-[100px] text-sm"
                        placeholder="Digite as informações aqui..."
                    ></textarea>
                     <div className="flex justify-end gap-3 mt-4">
                        <button 
                            type="button" 
                            onClick={() => { setParkingModalOpen(false); setCurrentParkingId(null); }}
                            className="px-4 py-2 bg-transparent text-[#3483fa] border border-[#3483fa] rounded-lg font-bold hover:bg-blue-50 transition-colors"
                        >
                            Cancelar
                        </button>
                        <button 
                            type="button" 
                            onClick={saveParkingInfo}
                            className="px-4 py-2 bg-[#3483fa] text-white rounded-lg font-bold hover:bg-blue-600 transition-colors shadow-sm"
                        >
                            Salvar
                        </button>
                    </div>
                </div>
             </div>
        )}

        {posModalOpen && selectedPosData && (
            <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md transition-opacity">
                <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full overflow-hidden transform transition-all scale-100 animate-fade-in-up flex flex-col max-h-[90vh]">
                    <div className="bg-[#3483fa] px-6 py-5 flex justify-between items-start flex-shrink-0">
                        <div>
                            <h2 className="text-xl font-bold text-white mb-1">Painel de Saúde POS</h2>
                            <p className="text-blue-100 text-sm flex items-center">
                                <span className="mr-2">Cliente:</span> 
                                <span className="text-white font-semibold">{selectedPosData.name}</span>
                                <span className="mx-2 text-blue-200">|</span>
                                <span className="text-blue-100">{selectedPosData.data.length} Maquininhas</span>
                            </p>
                        </div>
                        <button type="button" onClick={() => setPosModalOpen(false)} className="text-white/80 hover:text-white transition-colors">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                        </button>
                    </div>

                    <div className="p-6 bg-gray-50 overflow-y-auto custom-scrollbar">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                            
                            <div className="h-full">
                                {renderHealthGauge(
                                    selectedPosData.data.length,
                                    selectedPosData.data.filter(d => getHealthStatus(d).label === 'OPERATIVO').length
                                )}
                            </div>

                            <div className="grid grid-cols-2 gap-4 h-full">
                                <div className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm flex flex-col justify-center">
                                    <span className="block text-xs text-gray-500 uppercase font-bold mb-1">Total de Equipamentos</span>
                                    <span className="text-3xl font-bold text-gray-800">{selectedPosData.data.length}</span>
                                </div>
                                <div className="bg-green-50 p-3 rounded-lg border border-green-100 shadow-sm flex flex-col justify-center">
                                    <span className="block text-xs text-green-600 uppercase font-bold mb-1">Operativos (Saudáveis)</span>
                                    <span className="text-3xl font-bold text-green-700">
                                        {selectedPosData.data.filter(d => getHealthStatus(d).label === 'OPERATIVO').length}
                                    </span>
                                </div>
                                <div className="bg-red-50 p-3 rounded-lg border border-red-100 shadow-sm flex flex-col justify-center">
                                    <span className="block text-xs text-red-500 uppercase font-bold mb-1">Críticos (Erro Alto)</span>
                                    <span className="text-3xl font-bold text-red-700">
                                        {selectedPosData.data.filter(d => getHealthStatus(d).label === 'CRÍTICO').length}
                                    </span>
                                </div>
                                <div className="bg-yellow-50 p-3 rounded-lg border border-yellow-100 shadow-sm flex flex-col justify-center">
                                    <span className="block text-xs text-yellow-600 uppercase font-bold mb-1">Atenção (Sinal/Bobina)</span>
                                    <span className="text-3xl font-bold text-yellow-700">
                                        {selectedPosData.data.filter(d => ['ATENÇÃO', 'COMPROMETIDO'].includes(getHealthStatus(d).label)).length}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <h4 className="text-sm font-bold text-gray-700 mb-3 uppercase tracking-wide">Detalhamento por Equipamento</h4>
                        <div className="grid grid-cols-1 gap-6">
                            {selectedPosData.data.map((machine, idx) => {
                                const status = getHealthStatus(machine);
                                return (
                                    <div key={idx} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                                        <div className={`px-4 py-3 border-b flex justify-between items-center ${status.label === 'CRÍTICO' ? 'bg-red-50 border-red-100' : (status.label === 'COMPROMETIDO' ? 'bg-orange-50 border-orange-100' : 'bg-gray-50 border-gray-100')}`}>
                                            <div className="flex items-center gap-3">
                                                 <div className={`w-3 h-3 rounded-full ${status.label === 'CRÍTICO' ? 'bg-red-500' : (status.label === 'OPERATIVO' ? 'bg-green-500' : 'bg-yellow-500')}`}></div>
                                                 <span className="font-mono text-sm font-bold text-gray-700">{machine.machineId}</span>
                                                 <span className="text-xs text-gray-500 bg-white px-2 py-0.5 rounded border">{machine.model}</span>
                                            </div>
                                            <span className={`text-xs font-bold px-2 py-1 rounded ${status.color} border ${status.border}`}>
                                                {status.label}
                                            </span>
                                        </div>

                                        <div className="p-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                                            <div>
                                                <span className="text-xs text-gray-500 block mb-1">Wifi / Sinal</span>
                                                <div className="flex items-center gap-2">
                                                    <div className="w-16 bg-gray-200 rounded-full h-1.5 overflow-hidden">
                                                        <div className={`h-full ${machine.signalStrength < 30 ? 'bg-red-500' : 'bg-green-500'}`} style={{width: `${machine.signalStrength}%`}}></div>
                                                    </div>
                                                    <span className="text-sm font-bold">{machine.signalStrength}%</span>
                                                </div>
                                            </div>
                                            <div>
                                                <span className="text-xs text-gray-500 block mb-1">Bateria</span>
                                                <div className="flex items-center gap-2">
                                                    <div className="w-16 bg-gray-200 rounded-full h-1.5 overflow-hidden">
                                                        <div className={`h-full ${machine.batteryLevel < 20 ? 'bg-red-500' : 'bg-blue-500'}`} style={{width: `${machine.batteryLevel}%`}}></div>
                                                    </div>
                                                    <span className="text-sm font-bold">{machine.batteryLevel}%</span>
                                                </div>
                                            </div>
                                            <div>
                                                <span className="text-xs text-gray-500 block mb-1">Taxa de Erro</span>
                                                <span className={`text-sm font-bold ${machine.errorRate >= 6 ? 'text-red-600' : 'text-gray-800'}`}>
                                                    {machine.errorRate}%
                                                </span>
                                            </div>
                                            <div>
                                                <span className="text-xs text-gray-500 block mb-1">Bobina</span>
                                                <span className={`text-sm font-bold ${machine.paperStatus === 'Vazio' ? 'text-red-600' : 'text-gray-800'}`}>
                                                    {machine.paperStatus}
                                                </span>
                                            </div>
                                            <div>
                                                <span className="text-xs text-gray-500 block mb-1">Tempo Ligado</span>
                                                <div className="flex items-center gap-1">
                                                     <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                                                     <span className="text-sm font-bold text-gray-800">
                                                        {machine.avgUptime ? `${machine.avgUptime}h` : 'N/A'}
                                                     </span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 flex justify-between items-center">
                                             <div className="text-xs text-gray-500">
                                                 Firmware: <span className="font-mono">{machine.firmwareVersion}</span> | Incidents: {machine.incidents || 0}
                                             </div>
                                             <div className="text-xs font-medium text-indigo-600 max-w-[50%] text-right truncate">
                                                 {getHealthAnalysis(machine)}
                                             </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                    <div className="bg-gray-100 px-6 py-4 flex justify-end flex-shrink-0">
                        <button 
                            type="button"
                            onClick={() => setPosModalOpen(false)}
                            className="bg-transparent border border-[#3483fa] text-[#3483fa] font-bold py-2 px-6 rounded-lg hover:bg-blue-50 transition-colors shadow-sm"
                        >
                            Fechar
                        </button>
                    </div>
                </div>
            </div>
        )}

        {globalHealthOpen && (
            <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md transition-opacity">
                <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full overflow-hidden transform transition-all scale-100 animate-fade-in-up flex flex-col max-h-[90vh]">
                    {/* Header */}
                    <div className="bg-slate-800 px-6 py-5 flex justify-between items-start flex-shrink-0">
                        <div>
                            <h2 className="text-xl font-bold text-white mb-1">Monitoramento Global de Ativos</h2>
                            <p className="text-slate-300 text-sm">
                                Visão consolidada de {sheetData.length} estabelecimentos
                            </p>
                        </div>
                        <button type="button" onClick={() => setGlobalHealthOpen(false)} className="text-white/80 hover:text-white transition-colors">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                        </button>
                    </div>

                    {/* Body */}
                    <div className="p-6 bg-gray-50 overflow-y-auto custom-scrollbar">
                       {/* Calculation of stats */}
                       {(() => {
                           const allPos = sheetData.flatMap(r => (r.posData || []).map(p => ({...p, _companyName: r.Nome})));
                           const total = allPos.length;
                           const operative = allPos.filter(p => getHealthStatus(p).label === 'OPERATIVO').length;
                           const critical = allPos.filter(p => getHealthStatus(p).label === 'CRÍTICO');
                           const attention = allPos.filter(p => ['ATENÇÃO', 'COMPROMETIDO'].includes(getHealthStatus(p).label));
                           
                           return (
                               <>
                                   <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                                       <div className="h-full">
                                           {renderHealthGauge(total, operative)}
                                       </div>
                                       <div className="grid grid-cols-2 gap-4 h-full">
                                            {/* Summary Cards similar to individual modal but aggregated */}
                                            <div className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm flex flex-col justify-center">
                                                <span className="block text-xs text-gray-500 uppercase font-bold mb-1">Total Parque</span>
                                                <span className="text-3xl font-bold text-gray-800">{total}</span>
                                            </div>
                                            <div className="bg-green-50 p-3 rounded-lg border border-green-100 shadow-sm flex flex-col justify-center">
                                                <span className="block text-xs text-green-600 uppercase font-bold mb-1">Saudáveis</span>
                                                <span className="text-3xl font-bold text-green-700">{operative}</span>
                                            </div>
                                            <div className="bg-red-50 p-3 rounded-lg border border-red-100 shadow-sm flex flex-col justify-center">
                                                <span className="block text-xs text-red-500 uppercase font-bold mb-1">Críticos</span>
                                                <span className="text-3xl font-bold text-red-700">{critical.length}</span>
                                            </div>
                                            <div className="bg-yellow-50 p-3 rounded-lg border border-yellow-100 shadow-sm flex flex-col justify-center">
                                                <span className="block text-xs text-yellow-600 uppercase font-bold mb-1">Atenção</span>
                                                <span className="text-3xl font-bold text-yellow-700">{attention.length}</span>
                                            </div>
                                       </div>
                                   </div>

                                   {/* List of issues */}
                                   <div className="space-y-6">
                                       {critical.length > 0 && (
                                           <div>
                                               <h4 className="text-sm font-bold text-red-700 mb-3 uppercase tracking-wide flex items-center gap-2">
                                                   <span className="w-2 h-2 rounded-full bg-red-600"></span> Prioridade Alta: Equipamentos Críticos ({critical.length})
                                               </h4>
                                               <div className="grid grid-cols-1 gap-3">
                                                   {critical.map((machine, idx) => (
                                                       <div key={'crit-'+idx} className="bg-white rounded-lg border border-red-100 shadow-sm p-3 flex justify-between items-center hover:bg-red-50 transition-colors">
                                                           <div>
                                                               <div className="font-bold text-gray-800 text-sm">{(machine as any)._companyName}</div>
                                                               <div className="text-xs text-red-600 font-mono mt-0.5">ID: {machine.machineId} • {machine.model}</div>
                                                           </div>
                                                           <div className="text-right">
                                                               <span className="text-xs font-bold bg-red-100 text-red-700 px-2 py-1 rounded">Erro: {machine.errorRate}%</span>
                                                               <div className="text-[10px] text-gray-500 mt-1">{getHealthAnalysis(machine)}</div>
                                                           </div>
                                                       </div>
                                                   ))}
                                               </div>
                                           </div>
                                       )}

                                       {attention.length > 0 && (
                                           <div>
                                               <h4 className="text-sm font-bold text-yellow-700 mb-3 uppercase tracking-wide flex items-center gap-2">
                                                   <span className="w-2 h-2 rounded-full bg-yellow-500"></span> Atenção Necessária ({attention.length})
                                               </h4>
                                               <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                   {attention.map((machine, idx) => (
                                                       <div key={'att-'+idx} className="bg-white rounded-lg border border-yellow-100 shadow-sm p-3 flex justify-between items-center hover:bg-yellow-50 transition-colors">
                                                           <div>
                                                               <div className="font-bold text-gray-800 text-sm">{(machine as any)._companyName}</div>
                                                               <div className="text-xs text-gray-500 font-mono mt-0.5">ID: {machine.machineId}</div>
                                                           </div>
                                                           <div className="text-right">
                                                               <div className="text-xs font-medium text-yellow-700">{getHealthAnalysis(machine)}</div>
                                                           </div>
                                                       </div>
                                                   ))}
                                               </div>
                                           </div>
                                       )}
                                       
                                       {critical.length === 0 && attention.length === 0 && (
                                           <div className="text-center py-10 bg-green-50 rounded-xl border border-green-100">
                                               <div className="text-4xl mb-2">🎉</div>
                                               <h3 className="text-green-800 font-bold">Parque 100% Saudável</h3>
                                               <p className="text-green-600 text-sm">Nenhum equipamento requer atenção imediata.</p>
                                           </div>
                                       )}
                                   </div>
                               </>
                           );
                       })()}
                    </div>
                    
                    {/* Footer */}
                    <div className="bg-gray-100 px-6 py-4 flex justify-end flex-shrink-0">
                        <button 
                            type="button"
                            onClick={() => setGlobalHealthOpen(false)}
                            className="bg-transparent border border-slate-400 text-slate-600 font-bold py-2 px-6 rounded-lg hover:bg-slate-200 transition-colors shadow-sm"
                        >
                            Fechar Painel
                        </button>
                    </div>
                </div>
            </div>
        )}

      </form>
    </div>
  );
};

export default SetupForm;