import React, { useState } from 'react';
import { DEFAULT_DISTRIBUTION_RULES } from '../services/geminiService';

interface SettingsModalProps {
    onClose: () => void;
    currentRules: string;
    onSave: (newRules: string) => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ onClose, currentRules, onSave }) => {
    const [rules, setRules] = useState(currentRules);

    const handleReset = () => {
        if (confirm("Tem certeza que deseja restaurar as regras padrão?")) {
            setRules(DEFAULT_DISTRIBUTION_RULES);
        }
    };

    const handleSave = () => {
        onSave(rules);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-gray-900/90 backdrop-blur-md">
            <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full h-[80vh] flex flex-col overflow-hidden animate-fade-in-up border border-gray-200">
                
                {/* Header */}
                <div className="bg-gray-800 p-5 flex justify-between items-center text-white">
                    <div>
                        <h2 className="text-xl font-bold flex items-center gap-2">
                            <svg className="w-6 h-6 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                            Configurações do Sistema
                        </h2>
                        <p className="text-sm text-gray-400 mt-1">Personalize o comportamento da Inteligência Artificial.</p>
                    </div>
                    <button onClick={onClose} className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                        <div className="px-4 py-3 bg-blue-50 border-b border-blue-100 flex justify-between items-center">
                            <h3 className="font-bold text-blue-900 flex items-center gap-2">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"></path></svg>
                                Regras de Distribuição (Prompt)
                            </h3>
                            <button 
                                onClick={handleReset}
                                className="text-xs text-blue-600 hover:text-blue-800 underline font-medium"
                            >
                                Restaurar Padrão
                            </button>
                        </div>
                        
                        <div className="p-4">
                            <p className="text-sm text-gray-600 mb-3">
                                Estas instruções são enviadas diretamente ao Gemini para decidir qual equipe deve atender cada cliente. Você pode editar para priorizar critérios (ex: capacidade, tipo de veículo) ou alterar a lógica geográfica.
                            </p>
                            <textarea 
                                value={rules}
                                onChange={(e) => setRules(e.target.value)}
                                className="w-full h-64 p-4 font-mono text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-gray-900 text-green-400 shadow-inner"
                                placeholder="Digite as regras aqui..."
                            ></textarea>
                            <div className="mt-2 text-xs text-gray-500 flex items-center gap-1">
                                <svg className="w-4 h-4 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                                Alterações aqui afetam imediatamente a função "Distribuir por Equipe".
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-gray-200 bg-white flex justify-end gap-3">
                    <button 
                        onClick={onClose}
                        className="px-4 py-2 text-gray-600 font-bold hover:bg-gray-100 rounded-lg transition-colors border border-gray-300"
                    >
                        Cancelar
                    </button>
                    <button 
                        onClick={handleSave}
                        className="px-6 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 shadow-md transition-colors"
                    >
                        Salvar Alterações
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SettingsModal;