import React, { useState } from 'react';
import { RawSheetRow, Team, TeamMember } from '../types';
import { distributeActivities } from '../services/geminiService';
import LoadingModal from './LoadingModal';

interface DistributionModalProps {
    activities: RawSheetRow[];
    teams: Team[];
    distributionRules?: string; // Prop opcional para regras
    onClose: () => void;
    onApply: (updatedActivities: RawSheetRow[]) => void;
}

const getTransportIcon = (member: TeamMember) => {
    const mode = member.transportMode;
    if (mode === 'bicycle') return '🚲';
    if (mode === 'walking') return '🚶';
    if (mode === 'motorcycle') return '🏍️';
    if (mode === 'car' || member.usesCar) return '🚗';
    return '🚌'; // Default fallback
};

const normalizeForMatch = (str: string) => {
    return str.toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Remove acentos
        .replace(/[^a-z0-9]/g, ""); // Remove especiais
};

const DistributionModal: React.FC<DistributionModalProps> = ({ activities, teams, distributionRules, onClose, onApply }) => {
    // Estado das equipes selecionadas
    const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>(
        teams.filter(t => t.isActive).map(t => t.id)
    );
    
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [distributionResult, setDistributionResult] = useState<Record<string, { teamId: string, memberId: string, reason: string } > | null>(null);
    
    // Estado para o diálogo de confirmação customizado
    const [showConfirmDialog, setShowConfirmDialog] = useState(false);

    const toggleTeam = (id: string) => {
        setSelectedTeamIds(prev => 
            prev.includes(id) ? prev.filter(tid => tid !== id) : [...prev, id]
        );
    };

    // Passo 1: Solicita a distribuição -> Abre confirmação
    const handleRequestDistribution = () => {
        if (selectedTeamIds.length === 0) {
            setError("Selecione pelo menos uma equipe.");
            return;
        }
        setShowConfirmDialog(true);
    };

    // Passo 2: Resposta da confirmação
    const handleConfirmResponse = (proceed: boolean) => {
        setShowConfirmDialog(false);
        if (proceed) {
            executeDistribution();
        } else {
            // "caso contrário a modal deverá ser fechada e nada ser alterado"
            onClose();
        }
    };

    // Passo 3: Execução real da IA
    const executeDistribution = async () => {
        setIsProcessing(true);
        setError(null);

        try {
            // Filtra as equipes que participarão
            const activeTeams = teams.filter(t => selectedTeamIds.includes(t.id));
            
            // Logica de Sobrescrita:
            // Enviamos TODAS as atividades para o Gemini reprocessar, ignorando o estado anterior.
            // Isso garante que a atribuição automática do carregamento seja substituída.
            
            let aiResults = {};
            if (activities.length > 0) {
                // Chama a IA passando as regras customizadas (se existirem)
                aiResults = await distributeActivities(activities, activeTeams, distributionRules);
            }

            // Atualiza o resultado. Usamos spread para garantir que se algo falhar parcialmente, 
            // ainda tenhamos dados, mas a intenção é substituir as chaves existentes.
            setDistributionResult(prev => ({ ...prev, ...aiResults }));

        } catch (err) {
            setError("Erro ao processar distribuição: " + (err as Error).message);
        } finally {
            setIsProcessing(false);
        }
    };

    const handleApplyPortfolios = () => {
        // Lógica local para varrer todas as atividades e tentar casar com os portfólios das equipes selecionadas
        const newAssignments: Record<string, { teamId: string, memberId: string, reason: string }> = { ...(distributionResult || {}) };
        let matchCount = 0;

        const activeTeams = teams.filter(t => selectedTeamIds.includes(t.id));

        activities.forEach(activity => {
            
            const normalizedActivityName = normalizeForMatch(activity.Nome);

            for (const team of activeTeams) {
                for (const member of team.members) {
                    if (member.portfolio && member.portfolio.length > 0) {
                        const hasMatch = member.portfolio.some(pClient => {
                            return normalizeForMatch(pClient) === normalizedActivityName;
                        });

                        if (hasMatch) {
                            newAssignments[activity.id] = {
                                teamId: team.id,
                                memberId: member.id,
                                reason: "Carteira Fixa (Portfolio)"
                            };
                            matchCount++;
                            // Break inner loop (member found)
                            return; 
                        }
                    }
                }
                // Check if assigned in inner loop to break outer loop
                if (newAssignments[activity.id] && newAssignments[activity.id].reason === "Carteira Fixa (Portfolio)") break;
            }
        });

        setDistributionResult(newAssignments);
        if(matchCount > 0) {
            alert(`${matchCount} clientes foram vinculados às suas carteiras fixas.`);
        } else {
            alert("Nenhum vínculo de carteira encontrado para os clientes listados.");
        }
    };

    const handleApply = () => {
        if (!distributionResult) return;

        const updatedActivities = activities.map(row => {
            const assignment = distributionResult[row.id];
            // Assignment might be undefined OR might be an object { teamId, memberId }
            if (assignment && assignment.teamId) {
                return { 
                    ...row, 
                    assignedTeamId: assignment.teamId,
                    assignedMemberId: assignment.memberId, // Apply member ID too
                    distributionReason: assignment.reason // Save the AI reasoning
                };
            }
            return row;
        });

        onApply(updatedActivities);
    };

    // Estatísticas do preview
    const getStats = () => {
        if (!distributionResult) return null;
        
        const counts: Record<string, number> = {};
        let unassigned = 0;

        activities.forEach(row => {
            const assignment = distributionResult[row.id];
            if (assignment && assignment.teamId) {
                counts[assignment.teamId] = (counts[assignment.teamId] || 0) + 1;
            } else {
                unassigned++;
            }
        });

        return { counts, unassigned };
    };

    const stats = getStats();

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-gray-900/90 backdrop-blur-md">
            
            {/* Show Standard T-Rex Loading Modal when processing */}
            {isProcessing && <LoadingModal type="distribution" />}

            <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full h-[80vh] flex flex-col overflow-hidden animate-fade-in-up relative">
                
                {/* Confirmation Dialog Overlay */}
                {showConfirmDialog && (
                    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-fade-in">
                        <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-6 text-center transform scale-100 transition-transform">
                            <div className="w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                            </div>
                            <h3 className="text-lg font-bold text-gray-900 mb-2">Atenção</h3>
                            <p className="text-gray-600 mb-6">Deseja substituir a atribuição automática?</p>
                            <div className="flex gap-3">
                                <button 
                                    onClick={() => handleConfirmResponse(false)}
                                    className="flex-1 py-2 bg-gray-100 text-gray-700 font-bold rounded-lg hover:bg-gray-200 transition-colors"
                                >
                                    Não (Sair)
                                </button>
                                <button 
                                    onClick={() => handleConfirmResponse(true)}
                                    className="flex-1 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition-colors shadow-md"
                                >
                                    Sim
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Header */}
                <div className="bg-gradient-to-r from-blue-600 to-indigo-700 p-6 flex justify-between items-center text-white shadow-lg flex-shrink-0">
                    <div>
                        <h2 className="text-2xl font-bold flex items-center gap-2">
                            <svg className="w-8 h-8 opacity-80" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"></path></svg>
                            Distribuição Inteligente (IA)
                        </h2>
                        <p className="opacity-80 text-sm mt-1">Selecione as equipes e deixe a IA atribuir as visitas com base na localização e colaborador ideal.</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                    </button>
                </div>

                <div className="flex-1 flex overflow-hidden">
                    {/* Left Panel: Teams Selection */}
                    <div className="w-1/3 border-r border-gray-200 bg-gray-50 flex flex-col p-4">
                        <h3 className="font-bold text-gray-700 mb-3 uppercase text-xs tracking-wider">Equipes Disponíveis</h3>
                        <div className="flex-1 overflow-y-auto space-y-2">
                            {teams.map(team => (
                                <label 
                                    key={team.id} 
                                    className={`flex items-center p-3 rounded-lg border cursor-pointer transition-all ${
                                        selectedTeamIds.includes(team.id) 
                                        ? 'bg-white border-blue-400 shadow-sm' 
                                        : 'bg-gray-100 border-gray-200 text-gray-500'
                                    }`}
                                >
                                    <input 
                                        type="checkbox" 
                                        checked={selectedTeamIds.includes(team.id)}
                                        onChange={() => toggleTeam(team.id)}
                                        className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500 border-gray-300 mr-3"
                                    />
                                    <div>
                                        <div className="font-bold text-sm">{team.name}</div>
                                        <div className="text-xs opacity-70 truncate max-w-[150px]">
                                            {team.regions.map(r => r.city).join(', ') || 'Sem região'}
                                        </div>
                                    </div>
                                </label>
                            ))}
                        </div>
                        
                        <div className="mt-4 pt-4 border-t border-gray-200 space-y-2">
                            {error && <div className="text-red-600 text-xs mb-2 bg-red-50 p-2 rounded border border-red-100">{error}</div>}
                            
                            <button
                                onClick={handleApplyPortfolios}
                                disabled={isProcessing || selectedTeamIds.length === 0}
                                className="w-full py-2 rounded-lg font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 shadow-sm flex items-center justify-center gap-2 transition-all text-sm"
                                title="Atribui clientes baseado na lista fixa definida no cadastro da equipe"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"></path></svg>
                                🛡️ Aplicar Carteiras
                            </button>

                            <button
                                onClick={handleRequestDistribution}
                                disabled={isProcessing || selectedTeamIds.length === 0}
                                className={`w-full py-3 rounded-xl font-bold text-white shadow-sm flex items-center justify-center gap-2 transition-all ${
                                    isProcessing 
                                    ? 'bg-gray-400 cursor-not-allowed' 
                                    : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:shadow-lg hover:scale-[1.02]'
                                }`}
                            >
                                <span className="text-lg">⚡</span> Processar com Gemini
                            </button>
                        </div>
                    </div>

                    {/* Right Panel: Results */}
                    <div className="flex-1 bg-white flex flex-col p-0">
                        {!distributionResult ? (
                            <div className="flex-1 flex flex-col items-center justify-center text-gray-400 p-8 text-center">
                                <div className="bg-gray-100 p-4 rounded-full mb-4">
                                    <svg className="w-12 h-12 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"></path></svg>
                                </div>
                                <h4 className="text-lg font-bold text-gray-600">Aguardando Processamento</h4>
                                <p className="text-sm max-w-md mt-2">
                                    Você pode clicar em "Aplicar Carteiras" para forçar os vínculos fixos ou "Processar com Gemini" para distribuir automaticamente.
                                </p>
                            </div>
                        ) : (
                            <div className="flex-1 flex flex-col h-full">
                                {/* Stats Bar */}
                                <div className="bg-gray-50 border-b border-gray-200 p-4 flex gap-4 overflow-x-auto">
                                    {stats && Object.entries(stats.counts).map(([teamId, count]) => {
                                        const team = teams.find(t => t.id === teamId);
                                        return (
                                            <div key={teamId} className="bg-white px-3 py-2 rounded-lg border border-gray-200 shadow-sm flex items-center min-w-[120px]">
                                                <div className="w-2 h-8 bg-blue-500 rounded mr-3"></div>
                                                <div>
                                                    <div className="text-xs text-gray-500 font-bold uppercase truncate max-w-[100px]">{team?.name || 'Desconhecido'}</div>
                                                    <div className="text-lg font-bold text-gray-800">{count}</div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                    <div className="bg-white px-3 py-2 rounded-lg border border-gray-200 shadow-sm flex items-center min-w-[120px]">
                                        <div className="w-2 h-8 bg-gray-300 rounded mr-3"></div>
                                        <div>
                                            <div className="text-xs text-gray-500 font-bold uppercase">Não Atribuído</div>
                                            <div className="text-lg font-bold text-gray-800">{stats?.unassigned}</div>
                                        </div>
                                    </div>
                                </div>

                                {/* List Preview */}
                                <div className="flex-1 overflow-y-auto custom-scrollbar">
                                    <table className="min-w-full divide-y divide-gray-200">
                                        <thead className="bg-gray-50 sticky top-0">
                                            <tr>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Local</th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Equipe / Colaborador</th>
                                            </tr>
                                        </thead>
                                        <tbody className="bg-white divide-y divide-gray-200">
                                            {activities.map((row) => {
                                                const assignment = distributionResult[row.id];
                                                const teamId = assignment?.teamId;
                                                const memberId = assignment?.memberId;
                                                const reason = assignment?.reason;
                                                
                                                const team = teams.find(t => t.id === teamId);
                                                const member = team?.members.find(m => m.id === memberId);
                                                
                                                return (
                                                    <tr key={row.id} className="hover:bg-gray-50 group">
                                                        <td className="px-6 py-3">
                                                            <div className="text-sm font-medium text-gray-900">{row.Nome}</div>
                                                            <div className="text-xs text-gray-500">
                                                                {[row.Bairro, row.Municipio].filter(Boolean).join(' - ')}
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-3">
                                                            {team ? (
                                                                <div className="flex flex-col items-start gap-1">
                                                                    <span 
                                                                        className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 cursor-help"
                                                                        title={reason || "Atribuído pela IA"}
                                                                    >
                                                                        {team.name}
                                                                    </span>
                                                                    {member && (
                                                                        <span className="text-[10px] text-gray-500 font-medium flex items-center gap-1 ml-1">
                                                                            <span title={member.transportMode === 'car' ? 'Carro' : 'Outro'} className="text-[14px]">
                                                                                {getTransportIcon(member)}
                                                                            </span>
                                                                            {member.name}
                                                                        </span>
                                                                    )}
                                                                    {reason && (
                                                                        <span className="text-[9px] text-gray-400 italic mt-0.5">
                                                                            ↳ {reason}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            ) : (
                                                                <span className="text-red-600 text-xs font-bold">
                                                                    Sem equipe para esta região
                                                                </span>
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Footer Action */}
                                <div className="p-4 border-t border-gray-200 bg-gray-50 flex justify-end gap-3">
                                    <button 
                                        onClick={onClose}
                                        className="px-4 py-2 text-gray-600 font-bold hover:bg-gray-200 rounded-lg transition-colors"
                                    >
                                        Cancelar
                                    </button>
                                    <button 
                                        onClick={handleApply}
                                        className="px-6 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 shadow-md transition-colors"
                                    >
                                        Aplicar
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DistributionModal;