import React, { useState, useEffect, useRef } from 'react';
import { Team, TeamMember, WorkSchedule, ServiceRegion, TransportMode } from '../types';
import CoverageHeatmapModal from './CoverageHeatmapModal';

interface TeamManagementModalProps {
  onClose: () => void;
  teams: Team[];
  setTeams: React.Dispatch<React.SetStateAction<Team[]>>;
}

const DEFAULT_SCHEDULE: WorkSchedule[] = [
    { dayOfWeek: 'Segunda', startTime: '08:00', endTime: '18:00', isDayOff: false },
    { dayOfWeek: 'Terça',   startTime: '08:00', endTime: '18:00', isDayOff: false },
    { dayOfWeek: 'Quarta',  startTime: '08:00', endTime: '18:00', isDayOff: false },
    { dayOfWeek: 'Quinta',  startTime: '08:00', endTime: '18:00', isDayOff: false },
    { dayOfWeek: 'Sexta',   startTime: '08:00', endTime: '18:00', isDayOff: false },
    { dayOfWeek: 'Sábado',  startTime: '08:00', endTime: '12:00', isDayOff: true },
    { dayOfWeek: 'Domingo', startTime: '00:00', endTime: '00:00', isDayOff: true },
];

const ROTATION_DAYS = ['Nenhum', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira'];

const TRANSPORT_OPTIONS: { value: TransportMode; label: string; icon: string }[] = [
    { value: 'public_transport', label: 'Transporte Público', icon: '🚌' },
    { value: 'walking', label: 'A pé', icon: '🚶' },
    { value: 'bicycle', label: 'Bicicleta', icon: '🚲' },
    { value: 'motorcycle', label: 'Moto', icon: '🏍️' },
    { value: 'car', label: 'Veículo Próprio', icon: '🚗' },
];

// Helper seguro para IDs
const generateUUID = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
};

const TeamManagementModal: React.FC<TeamManagementModalProps> = ({ onClose, teams, setTeams }) => {
    const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
    const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    
    // State for Portfolio Text Area (Temporary holder while editing)
    const [tempPortfolioText, setTempPortfolioText] = useState("");

    // State for Heatmap Modal
    const [showHeatmap, setShowHeatmap] = useState(false);

    // Estado para guardar dados de importação temporariamente
    const [pendingImportData, setPendingImportData] = useState<Team[] | null>(null);
    const [importError, setImportError] = useState<string | null>(null);

    // Estado para Modal de Confirmação Customizado
    const [confirmModal, setConfirmModal] = useState<{
        isOpen: boolean;
        type: 'team' | 'member' | 'import';
        id?: string;
        title: string;
        message: string;
    } | null>(null);

    const activeTeam = teams.find(t => t.id === selectedTeamId);

    // Sync portfolio text when opening a member
    useEffect(() => {
        if (selectedTeamId && editingMemberId) {
            const team = teams.find(t => t.id === selectedTeamId);
            const member = team?.members.find(m => m.id === editingMemberId);
            if (member) {
                setTempPortfolioText(member.portfolio ? member.portfolio.join('\n') : '');
            }
        }
    }, [editingMemberId, selectedTeamId, teams]);

    // --- DATA EXPORT / IMPORT ---

    const handleExportData = () => {
        const dataStr = JSON.stringify(teams, null, 2);
        const blob = new Blob([dataStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.download = `rotasmart_equipes_backup_${new Date().toISOString().split('T')[0]}.json`;
        link.href = url;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleImportClick = () => {
        setImportError(null);
        if (fileInputRef.current) {
            fileInputRef.current.click();
        }
    };

    const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const json = event.target?.result as string;
                const importedTeams = JSON.parse(json);
                
                if (Array.isArray(importedTeams)) {
                    // Validação simples
                    const isValid = importedTeams.every(t => t.id && t.name && Array.isArray(t.members));
                    if (isValid) {
                        setPendingImportData(importedTeams);
                        setConfirmModal({
                            isOpen: true,
                            type: 'import',
                            title: 'Restaurar Backup',
                            message: `Isso substituirá as ${teams.length} equipes atuais pelas ${importedTeams.length} do arquivo. Deseja continuar?`
                        });
                    } else {
                        setImportError("Arquivo inválido. Estrutura de dados incorreta.");
                    }
                } else {
                    setImportError("Arquivo inválido. O conteúdo não é uma lista de equipes.");
                }
            } catch (err) {
                console.error(err);
                setImportError("Erro ao ler o arquivo. Certifique-se de que é um JSON válido.");
            }
            // Reset input
            if (fileInputRef.current) fileInputRef.current.value = '';
        };
        reader.readAsText(file);
    };

    // --- TEAM ACTIONS ---

    const handleCreateTeam = () => {
        const newTeam: Team = {
            id: generateUUID(),
            name: 'Nova Equipe',
            isActive: true,
            maxActivitiesPerRoute: 20, // Default value
            regions: [],
            members: []
        };
        setTeams(prev => [...prev, newTeam]);
        setSelectedTeamId(newTeam.id);
    };

    const requestDeleteTeam = (id: string) => {
        setConfirmModal({
            isOpen: true,
            type: 'team',
            id,
            title: 'Excluir Equipe',
            message: 'Tem certeza que deseja excluir esta equipe e todos os seus membros?'
        });
    };

    const updateTeam = (id: string, updates: Partial<Team>) => {
        setTeams(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
    };

    // --- REGION ACTIONS ---

    const addRegion = () => {
        if (!selectedTeamId) return;
        setTeams(prev => prev.map(t => {
            if (t.id === selectedTeamId) {
                return { ...t, regions: [...t.regions, { city: '', neighborhood: '' }] };
            }
            return t;
        }));
    };

    const updateRegion = (idx: number, field: keyof ServiceRegion, value: string) => {
        if (!selectedTeamId) return;
        setTeams(prev => prev.map(t => {
            if (t.id === selectedTeamId) {
                const newRegions = [...t.regions];
                newRegions[idx] = { ...newRegions[idx], [field]: value };
                return { ...t, regions: newRegions };
            }
            return t;
        }));
    };

    const removeRegion = (idx: number) => {
        if (!selectedTeamId) return;
        setTeams(prev => prev.map(t => {
            if (t.id === selectedTeamId) {
                const newRegions = t.regions.filter((_, i) => i !== idx);
                return { ...t, regions: newRegions };
            }
            return t;
        }));
    };

    // --- MEMBER ACTIONS ---

    const addMember = () => {
        if (!selectedTeamId) return;
        const newMember: TeamMember = {
            id: generateUUID(),
            name: 'Novo Colaborador',
            isOnVacation: false,
            schedule: JSON.parse(JSON.stringify(DEFAULT_SCHEDULE)), // Deep copy
            phoneNumber: '',
            usesCar: false,
            transportMode: 'public_transport',
            rotationDay: 'Nenhum',
            preferredStartLocation: '',
            preferredEndLocation: '',
            returnToStart: true, // Padrão: retornar ao início
            portfolio: [] // Inicializa carteira vazia
        };
        
        setTeams(prev => prev.map(t => {
            if (t.id === selectedTeamId) {
                return { ...t, members: [...t.members, newMember] };
            }
            return t;
        }));
        setEditingMemberId(newMember.id);
        setTempPortfolioText("");
    };

    const requestDeleteMember = (memberId: string) => {
        setConfirmModal({
            isOpen: true,
            type: 'member',
            id: memberId,
            title: 'Remover Colaborador',
            message: 'Tem certeza que deseja remover este colaborador da equipe?'
        });
    };

    // --- EXECUTE CONFIRM ACTION ---
    const executeConfirmAction = () => {
        if (!confirmModal) return;

        if (confirmModal.type === 'team' && confirmModal.id) {
             setTeams(prev => prev.filter(t => t.id !== confirmModal.id));
             if (selectedTeamId === confirmModal.id) setSelectedTeamId(null);
        } 
        else if (confirmModal.type === 'member' && confirmModal.id) {
             if (!selectedTeamId) return;
             setTeams(prev => prev.map(t => {
                if (t.id === selectedTeamId) {
                    return { ...t, members: t.members.filter(m => m.id !== confirmModal.id) };
                }
                return t;
            }));
            setEditingMemberId(prev => prev === confirmModal.id ? null : prev);
        }
        else if (confirmModal.type === 'import') {
            if (pendingImportData) {
                setTeams(pendingImportData);
                setSelectedTeamId(null);
                setPendingImportData(null);
            }
        }
        
        setConfirmModal(null);
    };

    const updateMember = (memberId: string, updates: Partial<TeamMember>) => {
        if (!selectedTeamId) return;
        setTeams(prev => prev.map(t => {
            if (t.id === selectedTeamId) {
                const newMembers = t.members.map(m => m.id === memberId ? { ...m, ...updates } : m);
                return { ...t, members: newMembers };
            }
            return t;
        }));
    };

    const savePortfolio = (memberId: string) => {
        const lines = tempPortfolioText.split('\n')
            .map(l => l.trim())
            .filter(l => l.length > 0);
        
        // Remove duplicates within the list
        const unique = Array.from(new Set(lines)) as string[];
        
        updateMember(memberId, { portfolio: unique });
    };

    const updateMemberSchedule = (memberId: string, dayIndex: number, field: keyof WorkSchedule, value: any) => {
        if (!selectedTeamId) return;
        
        setTeams(prev => prev.map(t => {
            if (t.id === selectedTeamId) {
                const newMembers = t.members.map(m => {
                    if (m.id === memberId) {
                         const newSchedule = [...m.schedule];
                         newSchedule[dayIndex] = { ...newSchedule[dayIndex], [field]: value };
                         return { ...m, schedule: newSchedule };
                    }
                    return m;
                });
                return { ...t, members: newMembers };
            }
            return t;
        }));
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-gray-900/90 backdrop-blur-md">
            {/* Heatmap Overlay */}
            {showHeatmap && (
                <CoverageHeatmapModal teams={teams} onClose={() => setShowHeatmap(false)} />
            )}

            <div className="bg-white rounded-2xl shadow-2xl max-w-6xl w-full h-[90vh] flex overflow-hidden animate-fade-in-up">
                
                {/* SIDEBAR - TEAM LIST */}
                <div className="w-1/4 bg-gray-50 border-r border-gray-200 flex flex-col">
                    <div className="p-5 border-b border-gray-200 bg-white">
                        <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                            <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>
                            Gestão de Equipes
                        </h2>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto p-3 space-y-2">
                        {teams.map(team => (
                            <div 
                                key={team.id}
                                onClick={() => { setSelectedTeamId(team.id); setEditingMemberId(null); }}
                                className={`p-3 rounded-lg cursor-pointer transition-all border flex justify-between items-center group ${
                                    selectedTeamId === team.id 
                                    ? 'bg-blue-50 border-blue-300 shadow-sm' 
                                    : 'bg-white border-gray-200 hover:bg-gray-100'
                                }`}
                            >
                                <div>
                                    <div className={`font-bold ${selectedTeamId === team.id ? 'text-blue-800' : 'text-gray-700'}`}>{team.name}</div>
                                    <div className="text-xs text-gray-500 flex gap-2">
                                        <span>{team.members.length} membros</span>
                                        <span className={team.isActive ? 'text-green-600' : 'text-red-500'}>
                                            ● {team.isActive ? 'Ativa' : 'Inativa'}
                                        </span>
                                    </div>
                                </div>
                                <button 
                                    onClick={(e) => { e.stopPropagation(); requestDeleteTeam(team.id); }}
                                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-100 text-red-500 rounded z-10 relative"
                                    title="Excluir equipe"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                                </button>
                            </div>
                        ))}

                        {teams.length === 0 && (
                            <div className="text-center text-gray-400 py-10 text-sm">
                                Nenhuma equipe cadastrada.
                            </div>
                        )}
                    </div>

                    <div className="p-4 border-t border-gray-200 bg-gray-100 space-y-3">
                        {importError && (
                            <div className="p-2 mb-2 bg-red-100 border border-red-200 text-red-700 text-xs rounded">
                                {importError}
                            </div>
                        )}

                        <button 
                            onClick={() => setShowHeatmap(true)}
                            className="w-full py-2 bg-gradient-to-r from-orange-400 to-red-500 hover:from-orange-500 hover:to-red-600 text-white rounded-lg font-bold shadow-sm transition-all flex justify-center items-center gap-2 mb-2"
                        >
                            <span className="text-lg">🔥</span> Mapa de Cobertura
                        </button>

                        <button 
                            onClick={handleCreateTeam}
                            className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold shadow-sm transition-colors flex justify-center items-center gap-2"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
                            Nova Equipe
                        </button>

                        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-200">
                            {/* Hidden Import Input */}
                            <input 
                                type="file" 
                                ref={fileInputRef} 
                                className="hidden" 
                                accept=".json" 
                                onChange={handleFileImport}
                            />
                            
                            <button 
                                onClick={handleExportData}
                                className="flex flex-col items-center justify-center p-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-xs text-gray-600 transition-colors"
                                title="Baixar backup dos dados para seu computador"
                            >
                                <svg className="w-5 h-5 mb-1 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                                Backup (Salvar)
                            </button>
                            
                            <button 
                                onClick={handleImportClick}
                                className="flex flex-col items-center justify-center p-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-xs text-gray-600 transition-colors"
                                title="Carregar backup do seu computador"
                            >
                                <svg className="w-5 h-5 mb-1 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path></svg>
                                Restaurar
                            </button>
                        </div>
                    </div>
                </div>

                {/* MAIN CONTENT */}
                <div className="flex-1 bg-white flex flex-col overflow-hidden relative">
                    <button 
                        onClick={onClose} 
                        className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 z-10 p-2 bg-gray-100 hover:bg-gray-200 rounded-full transition-colors"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                    </button>

                    {activeTeam ? (
                        <div className="flex-1 overflow-y-auto custom-scrollbar p-8">
                            
                            {/* TEAM HEADER DETAILS */}
                            <div className="mb-8 pb-8 border-b border-gray-100">
                                
                                {/* Name, Max Activities and Active Status */}
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                                    <div className="md:col-span-2">
                                        <div className="flex justify-between items-end mb-2">
                                            <label className="block text-xs font-bold text-gray-500 uppercase">Nome da Equipe</label>
                                            <div onClick={(e) => e.stopPropagation()}>
                                                <label className="flex items-center cursor-pointer gap-2 select-none">
                                                    <div className="relative">
                                                        <input 
                                                            type="checkbox" 
                                                            checked={activeTeam.isActive}
                                                            onChange={(e) => updateTeam(activeTeam.id, { isActive: e.target.checked })}
                                                            className="sr-only peer"
                                                        />
                                                        <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-green-600"></div>
                                                    </div>
                                                    <span className={`font-bold text-sm ${activeTeam.isActive ? 'text-green-700' : 'text-gray-400'}`}>
                                                        {activeTeam.isActive ? 'Ativa' : 'Inativa'}
                                                    </span>
                                                </label>
                                            </div>
                                        </div>
                                        <input 
                                            type="text" 
                                            value={activeTeam.name}
                                            onChange={(e) => updateTeam(activeTeam.id, { name: e.target.value })}
                                            className="w-full border border-gray-300 rounded-lg px-4 py-3 text-lg font-bold text-gray-800 bg-white focus:ring-2 focus:ring-blue-500 outline-none transition-shadow shadow-sm"
                                            placeholder="Nome da Equipe"
                                        />
                                    </div>
                                    
                                    <div className="md:col-span-1">
                                        <label className="block text-xs font-bold text-gray-500 uppercase mb-2">
                                            Máx. Atividades (Por Roteiro)
                                        </label>
                                        <input
                                            type="number"
                                            min="1"
                                            max="100"
                                            value={activeTeam.maxActivitiesPerRoute || ''}
                                            onChange={(e) => updateTeam(activeTeam.id, { maxActivitiesPerRoute: parseInt(e.target.value) || 0 })}
                                            className="w-full border border-gray-300 rounded-lg px-4 py-3 text-lg font-bold text-gray-800 bg-white focus:ring-2 focus:ring-blue-500 outline-none transition-shadow shadow-sm"
                                            placeholder="Ex: 20"
                                        />
                                        <p className="text-xs text-gray-400 mt-1">Limite sugerido de paradas.</p>
                                    </div>
                                </div>

                                {/* REGIONS */}
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Regiões de Atuação</label>
                                    <div className="space-y-2 bg-gray-50 p-4 rounded-xl border border-gray-100">
                                        {activeTeam.regions.map((reg, idx) => (
                                            <div key={idx} className="flex gap-2 items-center">
                                                <input 
                                                    type="text" 
                                                    placeholder="Município (ex: São Paulo)" 
                                                    value={reg.city}
                                                    onChange={(e) => updateRegion(idx, 'city', e.target.value)}
                                                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none shadow-sm"
                                                />
                                                <input 
                                                    type="text" 
                                                    placeholder="Bairro (ex: Pinheiros)" 
                                                    value={reg.neighborhood}
                                                    onChange={(e) => updateRegion(idx, 'neighborhood', e.target.value)}
                                                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none shadow-sm"
                                                />
                                                <button onClick={() => removeRegion(idx)} className="text-gray-400 hover:text-red-600 p-2 bg-white border border-gray-200 rounded-lg hover:bg-red-50 hover:border-red-200 transition-colors">
                                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                                                </button>
                                            </div>
                                        ))}
                                        {activeTeam.regions.length === 0 && (
                                            <p className="text-gray-400 text-sm text-center italic py-2">Nenhuma região definida.</p>
                                        )}
                                        <button onClick={addRegion} className="w-full py-2 border-2 border-dashed border-blue-200 text-blue-600 rounded-lg text-sm font-bold hover:bg-blue-50 hover:border-blue-300 transition-colors flex justify-center items-center gap-2 mt-2">
                                            + Adicionar Região
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* MEMBERS SECTION */}
                            <div>
                                <div className="flex justify-between items-center mb-4">
                                    <h3 className="text-lg font-bold text-gray-800">Colaboradores ({activeTeam.members.length})</h3>
                                    <button 
                                        onClick={addMember}
                                        className="bg-indigo-50 text-indigo-700 px-4 py-2 rounded-lg text-sm font-bold hover:bg-indigo-100 transition-colors shadow-sm"
                                    >
                                        + Adicionar Pessoa
                                    </button>
                                </div>

                                <div className="space-y-4">
                                    {activeTeam.members.map(member => {
                                        const transportMode = member.transportMode || (member.usesCar ? 'car' : 'public_transport');
                                        const portfolioCount = member.portfolio ? member.portfolio.length : 0;
                                        
                                        return (
                                        <div key={member.id} className={`border rounded-xl transition-all ${editingMemberId === member.id ? 'border-blue-400 shadow-md bg-white' : 'border-gray-200 bg-gray-50'}`}>
                                            {/* Member Header (Click to Expand) */}
                                            <div 
                                                className="p-4 flex justify-between items-center cursor-pointer group relative"
                                                onClick={() => {
                                                    setEditingMemberId(editingMemberId === member.id ? null : member.id);
                                                }}
                                            >
                                                <div className="flex items-center gap-4">
                                                    {/* Avatar */}
                                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white shadow-sm transition-colors ${!member.isOnVacation ? 'bg-blue-600' : 'bg-gray-400'}`}>
                                                        {member.name.charAt(0).toUpperCase()}
                                                    </div>
                                                    
                                                    {/* Name & Active Checkbox */}
                                                    <div className="flex flex-col">
                                                        <span className="font-bold text-gray-800 text-base leading-tight">{member.name}</span>
                                                        <div className="flex items-center gap-3">
                                                            <div onClick={(e) => e.stopPropagation()} className="relative z-30">
                                                                <label className="flex items-center gap-2 mt-1 cursor-pointer">
                                                                    <input 
                                                                        type="checkbox" 
                                                                        checked={!member.isOnVacation}
                                                                        onChange={(e) => {
                                                                            updateMember(member.id, { isOnVacation: !e.target.checked });
                                                                        }}
                                                                        className="w-4 h-4 text-green-600 rounded focus:ring-green-500 border-gray-300 cursor-pointer"
                                                                    />
                                                                    <span className="text-sm text-gray-600 select-none">Ativo</span>
                                                                </label>
                                                            </div>
                                                            {portfolioCount > 0 && (
                                                                <span className="text-[10px] font-bold bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full mt-1 border border-indigo-200">
                                                                    {portfolioCount} Clientes na Carteira
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Actions */}
                                                <div className="flex items-center gap-4">
                                                    <button 
                                                        type="button"
                                                        onClick={(e) => { 
                                                            e.stopPropagation(); 
                                                            requestDeleteMember(member.id); 
                                                        }}
                                                        className="text-gray-400 hover:text-red-600 transition-colors p-2 hover:bg-red-50 rounded-full relative z-30"
                                                        title="Remover colaborador"
                                                    >
                                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                                                    </button>
                                                    
                                                    <svg 
                                                        className={`w-5 h-5 text-gray-400 transform transition-transform duration-200 ${editingMemberId === member.id ? 'rotate-180' : ''}`} 
                                                        fill="none" stroke="currentColor" viewBox="0 0 24 24"
                                                    >
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
                                                    </svg>
                                                </div>
                                            </div>

                                            {/* Member Details (Expanded) */}
                                            {editingMemberId === member.id && (
                                                <div className="p-4 border-t border-gray-100 bg-white rounded-b-xl animate-fade-in">
                                                    {/* BASIC INFO SECTION */}
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                                        <div>
                                                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Nome Completo</label>
                                                            <input 
                                                                type="text" 
                                                                value={member.name} 
                                                                onChange={(e) => updateMember(member.id, { name: e.target.value })}
                                                                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none bg-white text-gray-800"
                                                            />
                                                        </div>
                                                        <div className="flex items-end pb-0">
                                                            <label className="flex items-center gap-2 cursor-pointer bg-orange-50 px-3 py-2 rounded-lg border border-orange-100 w-full hover:bg-orange-100 transition-colors h-[42px]">
                                                                <input 
                                                                    type="checkbox" 
                                                                    checked={member.isOnVacation}
                                                                    onChange={(e) => updateMember(member.id, { isOnVacation: e.target.checked })}
                                                                    className="w-5 h-5 text-orange-500 rounded focus:ring-orange-400"
                                                                />
                                                                <span className="text-gray-700 font-medium text-sm">Está de Férias? (Inativo)</span>
                                                            </label>
                                                        </div>
                                                    </div>

                                                    {/* NEW CONTACT & TRANSPORT SECTION */}
                                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4 bg-gray-50 p-3 rounded-lg border border-gray-200">
                                                        <div className="col-span-1">
                                                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Celular (WhatsApp)</label>
                                                            <input 
                                                                type="tel"
                                                                placeholder="(11) 99999-9999"
                                                                value={member.phoneNumber || ''}
                                                                onChange={(e) => updateMember(member.id, { phoneNumber: e.target.value })}
                                                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none shadow-sm"
                                                            />
                                                        </div>
                                                        <div className="col-span-1">
                                                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Modo de Transporte</label>
                                                            <div className="relative">
                                                                <select 
                                                                    value={transportMode}
                                                                    onChange={(e) => updateMember(member.id, { 
                                                                        transportMode: e.target.value as TransportMode,
                                                                        usesCar: e.target.value === 'car' // Sync legacy boolean
                                                                    })}
                                                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none shadow-sm appearance-none"
                                                                >
                                                                    {TRANSPORT_OPTIONS.map(opt => (
                                                                        <option key={opt.value} value={opt.value}>
                                                                            {opt.icon} {opt.label}
                                                                        </option>
                                                                    ))}
                                                                </select>
                                                                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-700">
                                                                    <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <div className="col-span-1">
                                                            <label className={`block text-xs font-bold uppercase mb-1 ${transportMode === 'car' ? 'text-gray-500' : 'text-gray-300'}`}>Dia de Rodízio</label>
                                                            <select 
                                                                disabled={transportMode !== 'car'}
                                                                value={member.rotationDay || 'Nenhum'}
                                                                onChange={(e) => updateMember(member.id, { rotationDay: e.target.value as any })}
                                                                className={`w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none ${transportMode === 'car' ? 'bg-white border-gray-300 text-gray-800' : 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed'}`}
                                                            >
                                                                {ROTATION_DAYS.map(day => (
                                                                    <option key={day} value={day}>{day}</option>
                                                                ))}
                                                            </select>
                                                        </div>
                                                    </div>

                                                    {/* NEW PORTFOLIO SECTION */}
                                                    <div className="mb-4 bg-indigo-50 p-4 rounded-lg border border-indigo-100">
                                                        <div className="flex justify-between items-center mb-2">
                                                            <h4 className="text-xs font-bold text-indigo-700 uppercase flex items-center gap-1">
                                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path></svg>
                                                                Carteira de Clientes (Vínculo Fixo)
                                                            </h4>
                                                            <span className="text-xs text-indigo-500 font-medium">
                                                                {tempPortfolioText.split('\n').filter(x=>x.trim()).length} / 250 empresas
                                                            </span>
                                                        </div>
                                                        <p className="text-xs text-indigo-600 mb-2">
                                                            Cole abaixo a lista de nomes das empresas (um por linha) que este colaborador deve atender preferencialmente. Estes vínculos são aplicados automaticamente, mas o Gemini sobrescreverá a atribuição quando solicitado.
                                                        </p>
                                                        <textarea 
                                                            value={tempPortfolioText}
                                                            onChange={(e) => setTempPortfolioText(e.target.value)}
                                                            onBlur={() => savePortfolio(member.id)}
                                                            className="w-full h-32 p-3 text-sm font-mono border border-indigo-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                                                            placeholder={`Padaria do João\nFarmácia Central\nMercado Silva...`}
                                                        />
                                                    </div>

                                                    {/* NEW LOCATION SECTION */}
                                                    <div className="mb-6 bg-gray-50 p-3 rounded-lg border border-gray-200">
                                                        <h4 className="text-xs font-bold text-gray-500 uppercase mb-3 border-b border-gray-200 pb-1">
                                                            Logística (Locais Preferenciais)
                                                        </h4>
                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                            <div>
                                                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Partida (Opcional)</label>
                                                                <input
                                                                    type="text"
                                                                    placeholder="Ex: Rua A, 123 - Centro"
                                                                    value={member.preferredStartLocation || ''}
                                                                    onChange={(e) => {
                                                                        const val = e.target.value;
                                                                        updateMember(member.id, { 
                                                                            preferredStartLocation: val,
                                                                            // Se a opção de retorno igual estiver marcada, atualiza também o retorno
                                                                            preferredEndLocation: member.returnToStart ? val : member.preferredEndLocation
                                                                        });
                                                                    }}
                                                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none shadow-sm"
                                                                />
                                                            </div>
                                                            <div>
                                                                <div className="flex justify-between items-center mb-1">
                                                                    <label className="block text-xs font-bold text-gray-500 uppercase">Retorno (Opcional)</label>
                                                                    <label className="flex items-center gap-1 cursor-pointer">
                                                                        <input 
                                                                            type="checkbox" 
                                                                            checked={member.returnToStart ?? true}
                                                                            onChange={(e) => {
                                                                                const isChecked = e.target.checked;
                                                                                updateMember(member.id, { 
                                                                                    returnToStart: isChecked,
                                                                                    // Se marcou, copia o endereço de partida para o retorno
                                                                                    preferredEndLocation: isChecked ? member.preferredStartLocation : member.preferredEndLocation 
                                                                                });
                                                                            }}
                                                                            className="w-3.5 h-3.5 text-blue-600 rounded focus:ring-blue-500"
                                                                        />
                                                                        <span className="text-[10px] text-blue-600 font-medium select-none">Retornar ao mesmo local?</span>
                                                                    </label>
                                                                </div>
                                                                <input
                                                                    type="text"
                                                                    placeholder="Ex: Rua B, 456 - Bairro"
                                                                    value={member.preferredEndLocation || ''}
                                                                    disabled={member.returnToStart ?? true}
                                                                    onChange={(e) => updateMember(member.id, { preferredEndLocation: e.target.value })}
                                                                    className={`w-full border rounded-lg px-3 py-2 text-sm outline-none shadow-sm ${(member.returnToStart ?? true) ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed' : 'bg-white text-gray-900 border-gray-300 focus:ring-2 focus:ring-blue-500'}`}
                                                                />
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div>
                                                        <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Jornada de Trabalho Semanal</label>
                                                        <div className="bg-gray-50 rounded-lg border border-gray-200 overflow-hidden">
                                                            <div className="grid grid-cols-4 bg-gray-100 p-2 text-xs font-bold text-gray-500 uppercase border-b border-gray-200">
                                                                <div className="pl-2">Dia</div>
                                                                <div className="text-center">Entrada</div>
                                                                <div className="text-center">Saída</div>
                                                                <div className="text-center">Folga?</div>
                                                            </div>
                                                            {member.schedule.map((day, idx) => (
                                                                <div key={idx} className={`grid grid-cols-4 p-2 items-center border-b border-gray-100 last:border-0 ${day.isDayOff ? 'bg-gray-100/50' : 'bg-white'}`}>
                                                                    <div className="pl-2 font-medium text-sm text-gray-700">{day.dayOfWeek}</div>
                                                                    <div className="px-2">
                                                                        <input 
                                                                            type="time" 
                                                                            disabled={day.isDayOff}
                                                                            value={day.startTime}
                                                                            onChange={(e) => updateMemberSchedule(member.id, idx, 'startTime', e.target.value)}
                                                                            className="w-full text-center text-sm border border-gray-300 rounded p-1 disabled:bg-gray-100 disabled:text-gray-400 bg-white"
                                                                        />
                                                                    </div>
                                                                    <div className="px-2">
                                                                        <input 
                                                                            type="time" 
                                                                            disabled={day.isDayOff}
                                                                            value={day.endTime}
                                                                            onChange={(e) => updateMemberSchedule(member.id, idx, 'endTime', e.target.value)}
                                                                            className="w-full text-center text-sm border border-gray-300 rounded p-1 disabled:bg-gray-100 disabled:text-gray-400 bg-white"
                                                                        />
                                                                    </div>
                                                                    <div className="flex justify-center">
                                                                        <input 
                                                                            type="checkbox" 
                                                                            checked={day.isDayOff}
                                                                            onChange={(e) => updateMemberSchedule(member.id, idx, 'isDayOff', e.target.checked)}
                                                                            className="w-5 h-5 text-gray-400 rounded focus:ring-gray-400 cursor-pointer"
                                                                        />
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                        );
                                    })}

                                    {activeTeam.members.length === 0 && (
                                        <div className="text-center py-8 border-2 border-dashed border-gray-200 rounded-xl bg-gray-50">
                                            <p className="text-gray-500 mb-2">Nenhum colaborador nesta equipe.</p>
                                            <button onClick={addMember} className="text-blue-600 font-bold hover:underline">Adicionar Primeiro</button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
                            <svg className="w-20 h-20 mb-4 opacity-20" fill="currentColor" viewBox="0 0 20 20"><path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z"></path></svg>
                            <p className="text-lg font-medium">Selecione uma equipe para editar ou crie uma nova.</p>
                        </div>
                    )}
                </div>

                {/* CUSTOM CONFIRMATION MODAL */}
                {confirmModal && (
                    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm transition-opacity">
                        <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-6 transform transition-all scale-100 animate-fade-in-up">
                            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-100 mx-auto mb-4">
                                <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                            </div>
                            <h3 className="text-lg font-bold text-center text-gray-900 mb-2">
                                {confirmModal.title}
                            </h3>
                            <p className="text-gray-500 text-center text-sm mb-6">
                                {confirmModal.message}
                            </p>
                            <div className="flex gap-3">
                                <button 
                                    type="button" 
                                    onClick={() => setConfirmModal(null)}
                                    className="flex-1 py-2 bg-transparent text-gray-600 border border-gray-300 rounded-lg font-bold hover:bg-gray-50 transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button 
                                    type="button" 
                                    onClick={executeConfirmAction}
                                    className="flex-1 py-2 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700 transition-colors shadow-md"
                                >
                                    Confirmar
                                </button>
                            </div>
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
};

export default TeamManagementModal;