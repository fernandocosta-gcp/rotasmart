import React, { useState, ChangeEvent } from 'react';
import { UserPreferences, RawSheetRow, PriorityLevel } from '../types';
import { parseSheetFile } from '../services/excelService';

interface SetupFormProps {
  onGenerate: (prefs: UserPreferences, data: RawSheetRow[]) => void;
  isLoading: boolean;
}

const SetupForm: React.FC<SetupFormProps> = ({ onGenerate, isLoading }) => {
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
  const [fileName, setFileName] = useState<string>('');
  const [error, setError] = useState<string>('');
  
  // State for bulk selection
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // State for delete confirmation modal
  const [itemToDelete, setItemToDelete] = useState<string | null>(null); // For single delete (kept for safety/logic reuse)
  const [isBulkDelete, setIsBulkDelete] = useState(false); // Flag for bulk delete

  // State for Parking Info Modal
  const [parkingModalOpen, setParkingModalOpen] = useState(false);
  const [currentParkingId, setCurrentParkingId] = useState<string | null>(null);
  const [parkingText, setParkingText] = useState('');

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setFileName(file.name);
      try {
        const data = await parseSheetFile(file);
        if (data.length === 0) throw new Error("Arquivo vazio ou formato inválido");
        setSheetData(data);
        setError('');
        setSelectedIds([]);
      } catch (err) {
        console.error(err);
        setError('Erro ao ler o arquivo. Use um .xlsx ou .csv válido.');
        setSheetData([]);
      }
    }
  };

  // --- Bulk Actions Logic ---

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
          selectedIds.includes(row.id) ? { ...row, priority } : row
      ));
      // Optional: Clear selection after action? Let's keep it for now in case they want to do more.
      // setSelectedIds([]); 
  };

  const promptBulkDelete = () => {
      setIsBulkDelete(true);
      // We borrow the itemToDelete modal logic roughly, but use a specific flag
  };

  const confirmBulkDelete = () => {
      setSheetData(prev => prev.filter(row => !selectedIds.includes(row.id)));
      setSelectedIds([]);
      setIsBulkDelete(false);
  };

  // --- End Bulk Actions Logic ---

  // Parking Info Handlers
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
      // Also remove from selected if present
      setSelectedIds(prev => prev.filter(id => id !== itemToDelete));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (sheetData.length === 0) {
      setError('Por favor, faça upload de uma lista de locais.');
      return;
    }
    if (!prefs.useCurrentLocation && !prefs.startLocation) {
      setError('Defina um local de partida ou use sua localização atual.');
      return;
    }
    if (!prefs.returnToStart && !prefs.endLocation) {
      setError('Defina um local de chegada ou marque "Retornar ao início".');
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
          case 'lunch': return { text: 'Almoço', class: 'bg-orange-100 text-orange-800' };
          case 'end_of_day': return { text: 'Fim do Dia', class: 'bg-purple-100 text-purple-800' };
          default: return { text: 'Normal', class: 'bg-gray-100 text-gray-600' };
      }
  };

  const itemToDeleteName = itemToDelete ? sheetData.find(r => r.id === itemToDelete)?.Nome : '';

  return (
    <div className={`bg-white rounded-2xl shadow-xl p-6 w-full mx-auto border border-gray-100 transition-all duration-300 ${sheetData.length > 0 ? 'max-w-7xl' : 'max-w-3xl'}`}>
      <div className="mb-6 text-center">
        <h2 className="text-3xl font-bold text-gray-800 mb-2">Planejar Rotas</h2>
        <p className="text-gray-500">Configure sua jornada e revise seus clientes.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        
        {/* Step 1: File Upload (Only visible if NO data) */}
        {sheetData.length === 0 && (
            <div className="border-2 border-dashed border-blue-200 rounded-xl p-10 bg-blue-50 text-center hover:bg-blue-100 transition-colors cursor-pointer relative">
            <input 
                type="file" 
                accept=".xlsx, .xls, .csv" 
                onChange={handleFileChange}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
            <div className="flex flex-col items-center">
                <svg className="w-12 h-12 text-blue-500 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                </svg>
                <span className="text-blue-700 font-medium text-lg">
                Selecione sua lista de visitas (Excel/CSV)
                </span>
                <p className="text-sm text-blue-400 mt-1">Colunas sugeridas: Nome, Endereço, Setor, Horário, Obs</p>
            </div>
            </div>
        )}

        {/* Step 2: Combined View (Preview + Settings) */}
        {sheetData.length > 0 && (
            <div className="flex flex-col lg:flex-row gap-6 items-start">
                
                {/* Left Column: Preview Table */}
                <div className="flex-1 w-full min-w-0 bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm flex flex-col h-full self-stretch relative">
                    
                    {/* Header with Bulk Actions */}
                    <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex flex-col gap-2 flex-shrink-0">
                        <div className="flex justify-between items-center">
                            <h3 className="font-semibold text-gray-700">Lista de Empresas ({sheetData.length})</h3>
                            <button 
                                type="button" 
                                onClick={() => { setSheetData([]); setFileName(''); setSelectedIds([]); }}
                                className="text-xs text-red-600 hover:text-red-800 font-medium"
                            >
                                Trocar Arquivo
                            </button>
                        </div>
                        
                        {/* Bulk Action Bar */}
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
                    
                    <div className="overflow-x-auto overflow-y-auto custom-scrollbar flex-grow" style={{ maxHeight: '700px' }}>
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
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Empresa / Setor</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Endereço</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Detalhes (Horário)</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {sheetData.map((row) => (
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
                                            <div className="font-medium text-gray-900">{row.Nome}</div>
                                            <div className="text-xs text-gray-500">{row.Setor || 'Setor n/a'}</div>
                                            {row.priority !== 'normal' && (
                                                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium mt-1 ${getPriorityLabel(row.priority).class}`}>
                                                    {getPriorityLabel(row.priority).text}
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-gray-600 max-w-xs truncate" title={row.Endereco}>
                                            <div className="flex items-center gap-2">
                                                <span className="truncate">{row.Endereco}</span>
                                                <button 
                                                    type="button"
                                                    onClick={(e) => { e.stopPropagation(); openParkingModal(row.id); }}
                                                    className="text-gray-400 hover:text-indigo-600 flex-shrink-0 transition-colors"
                                                    title="Editar informações de estacionamento"
                                                >
                                                    🅿️
                                                </button>
                                            </div>
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
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Right Column: Settings */}
                <div className="w-full lg:w-[380px] flex-shrink-0 space-y-4 animate-fade-in-up">
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

                    <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                        <label className="block text-sm font-semibold text-gray-700 mb-2">Defina ponto de partida e retorno</label>
                        
                        {/* Start Location */}
                        <div className="mb-3">
                            <label className="block text-xs text-gray-500 mb-1">Partida</label>
                            <div className="flex gap-2">
                                <input 
                                    type="text" 
                                    placeholder="Endereço de partida"
                                    value={prefs.startLocation}
                                    disabled={prefs.useCurrentLocation}
                                    onChange={(e) => setPrefs({...prefs, startLocation: e.target.value})}
                                    className={`w-full px-3 py-2 text-sm rounded-lg border border-gray-600 bg-gray-700 text-white focus:ring-2 focus:ring-blue-500 outline-none placeholder-gray-400 ${prefs.useCurrentLocation ? 'opacity-50 cursor-not-allowed' : ''}`}
                                />
                                <button
                                    type="button"
                                    onClick={() => setPrefs(prev => ({...prev, useCurrentLocation: !prev.useCurrentLocation}))}
                                    className={`p-2 rounded-lg border flex-shrink-0 ${prefs.useCurrentLocation ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-500 border-gray-300'}`}
                                    title="Usar atual"
                                >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                                </button>
                            </div>
                        </div>

                        {/* Return Location Toggle & Input */}
                        <div>
                             <label className="flex items-center space-x-2 cursor-pointer mb-2">
                                <input 
                                    type="checkbox" 
                                    checked={prefs.returnToStart} 
                                    onChange={(e) => setPrefs({...prefs, returnToStart: e.target.checked})} 
                                    className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                                />
                                <span className="text-xs text-gray-600 font-medium">Retornar ao mesmo local</span>
                            </label>

                            {!prefs.returnToStart && (
                                <div className="animate-fade-in-up">
                                    <label className="block text-xs text-gray-500 mb-1">Chegada</label>
                                    <input 
                                        type="text" 
                                        placeholder="Endereço de chegada"
                                        value={prefs.endLocation}
                                        onChange={(e) => setPrefs({...prefs, endLocation: e.target.value})}
                                        className="w-full px-3 py-2 text-sm rounded-lg border border-gray-600 bg-gray-700 text-white focus:ring-2 focus:ring-blue-500 outline-none placeholder-gray-400"
                                    />
                                </div>
                            )}
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
                                
                                {/* Office Stop Settings */}
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

                                {/* Lunch Settings */}
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
                        className={`w-full py-3 rounded-xl font-bold text-white shadow-lg transition-all transform hover:scale-[1.01] ${isLoading ? 'bg-gray-400 cursor-not-allowed' : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700'}`}
                    >
                        Gerar Roteiro
                    </button>
                </div>

            </div>
        )}

        {error && (
            <div className="p-3 bg-red-100 text-red-700 rounded-lg text-sm flex items-center justify-center animate-pulse">
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                {error}
            </div>
        )}

        {/* Delete Confirmation Modal (Handles Both Single and Bulk) */}
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
                            ? `Tem certeza que deseja remover ${selectedIds.length} visita(s) selecionada(s)?`
                            : <span>Tem certeza que deseja remover <span className="font-semibold text-gray-700">{itemToDeleteName}</span> da sua lista?</span>
                        }
                        <br/>Esta ação não pode ser desfeita.
                    </p>
                    <div className="flex gap-3">
                        <button
                            type="button"
                            onClick={() => { setItemToDelete(null); setIsBulkDelete(false); }}
                            className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            type="button"
                            onClick={isBulkDelete ? confirmBulkDelete : confirmDelete}
                            className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors shadow-lg shadow-red-200"
                        >
                            Confirmar
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* Parking Info Modal */}
        {parkingModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm transition-opacity">
                <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 transform transition-all scale-100 animate-fade-in-up">
                    <div className="flex items-center justify-center w-12 h-12 rounded-full bg-indigo-100 mx-auto mb-4">
                        <span className="text-2xl">🅿️</span>
                    </div>
                    <h3 className="text-lg font-bold text-center text-gray-900 mb-2">Informação de Estacionamento</h3>
                    <p className="text-gray-500 text-center text-sm mb-4">
                        Adicione detalhes específicos para este local (ex: "Entrada pela lateral", "Vagas limitadas", "Conveniado").
                    </p>
                    
                    <textarea 
                        value={parkingText}
                        onChange={(e) => setParkingText(e.target.value)}
                        placeholder="Digite os detalhes do estacionamento..."
                        className="w-full h-24 p-3 border border-gray-600 bg-gray-700 text-white rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm mb-6 resize-none placeholder-gray-400"
                    ></textarea>

                    <div className="flex gap-3">
                        <button
                            type="button"
                            onClick={() => { setParkingModalOpen(false); setCurrentParkingId(null); setParkingText(''); }}
                            className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            type="button"
                            onClick={saveParkingInfo}
                            className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200"
                        >
                            Salvar
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