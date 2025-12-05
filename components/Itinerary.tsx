
import React, { useState, useMemo, useEffect } from 'react';
import { MultiDayPlan, EstablishmentType, Team, TeamMember } from '../types';

interface ItineraryProps {
  plan: MultiDayPlan;
  teams: Team[];
  onReset: () => void;
}

const ITEMS_PER_PAGE = 20;

const Itinerary: React.FC<ItineraryProps> = ({ plan, teams, onReset }) => {
  // --- STATES FOR SIDEBAR ---
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  
  // --- STATES FOR SELECTION ---
  const [selectedCollaboratorId, setSelectedCollaboratorId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null); // Null means "Show All Dates"

  // Helper para dia da semana
  const getDayOfWeekPT = (dateString: string): string => {
      const date = new Date(`${dateString}T12:00:00`);
      const days = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
      return days[date.getDay()];
  };

  const formatDateBR = (dateString: string) => {
      const [y, m, d] = dateString.split('-');
      return `${d}/${m}`;
  };

  // Helper para calcular horário de término
  const getEndTime = (start: string, durationMinutes: number) => {
      if (!start) return '--:--';
      const [h, m] = start.split(':').map(Number);
      if (isNaN(h) || isNaN(m)) return start;

      const date = new Date();
      date.setHours(h, m, 0, 0);
      date.setMinutes(date.getMinutes() + durationMinutes);
      
      return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };

  // --- DATA PROCESSING: FLATTEN MEMBERS & LINK TO PLAN ---
  const enrichedMembers = useMemo(() => {
      const list: Array<{
          member: TeamMember;
          teamName: string;
          assignedDates: string[]; // Dates present in generated plan
      }> = [];

      teams.forEach(team => {
          team.members.forEach(member => {
              // Find days in plan for this member
              const memberDays = plan
                  .filter(p => p.collaboratorId === member.id)
                  .map(p => p.date)
                  .sort(); // Sort dates
              
              list.push({
                  member,
                  teamName: team.name,
                  assignedDates: Array.from(new Set(memberDays)) // Unique dates
              });
          });
      });

      // Filter by Search Term
      const filtered = list.filter(item => {
          const search = searchTerm.toLowerCase();
          return (
              item.member.name.toLowerCase().includes(search) || 
              item.teamName.toLowerCase().includes(search)
          );
      });

      return filtered;
  }, [teams, plan, searchTerm]);

  // --- PAGINATION LOGIC ---
  const totalPages = Math.ceil(enrichedMembers.length / ITEMS_PER_PAGE);
  const paginatedMembers = useMemo(() => {
      const start = (currentPage - 1) * ITEMS_PER_PAGE;
      return enrichedMembers.slice(start, start + ITEMS_PER_PAGE);
  }, [enrichedMembers, currentPage]);

  // Reset page when search changes
  useEffect(() => {
      setCurrentPage(1);
  }, [searchTerm]);

  // --- FILTERED PLAN LOGIC (MAIN CONTENT) ---
  const filteredPlan = useMemo(() => {
      if (!selectedCollaboratorId) return [];

      return plan.filter(day => {
          const collabMatch = day.collaboratorId === selectedCollaboratorId;
          const dateMatch = selectedDate ? day.date === selectedDate : true;
          return collabMatch && dateMatch;
      });
  }, [plan, selectedCollaboratorId, selectedDate]);

  // --- DAY OFF CHECK LOGIC ---
  const dayOffInfo = useMemo(() => {
      if (!selectedCollaboratorId || !selectedDate) return null;

      // Find member in teams
      for (const team of teams) {
          const member = team.members.find(m => m.id === selectedCollaboratorId);
          if (member) {
              const dow = getDayOfWeekPT(selectedDate);
              const schedule = member.schedule.find(s => s.dayOfWeek.includes(dow) || dow.includes(s.dayOfWeek));
              
              if (schedule && schedule.isDayOff) {
                  return { isOff: true, memberName: member.name, day: dow };
              }
          }
      }
      return null;
  }, [selectedCollaboratorId, selectedDate, teams]);

  // --- AGGREGATES ---
  const aggregates = useMemo(() => {
      let totalDist = 0;
      let totalTime = 0;
      let totalStops = 0;
      let costFuel = 0;

      filteredPlan.forEach(day => {
          totalDist += parseFloat(day.totalDistanceKm.replace(/[^0-9.]/g, '')) || 0;
          totalTime += parseFloat(day.totalTimeHours.replace(/[^0-9.]/g, '')) || 0;
          totalStops += day.stops.length;
          
          const costStr = day.estimatedFuelCost.replace('R$', '').replace(',', '.').trim();
          costFuel += parseFloat(costStr) || 0;
      });

      return {
          dist: totalDist.toFixed(1),
          time: totalTime.toFixed(1),
          stops: totalStops,
          cost: costFuel.toFixed(2).replace('.', ',')
      };
  }, [filteredPlan]);

  const getTypeColor = (type: EstablishmentType) => {
    switch (type) {
      case EstablishmentType.CLIENT: return 'bg-blue-100 text-blue-800 border-blue-200';
      case EstablishmentType.RESTAURANT: return 'bg-orange-100 text-orange-800 border-orange-200';
      case EstablishmentType.GAS_STATION: return 'bg-green-100 text-green-800 border-green-200';
      case EstablishmentType.OFFICE: return 'bg-purple-100 text-purple-800 border-purple-200';
      case EstablishmentType.PARKING: return 'bg-gray-100 text-gray-800 border-gray-200';
      default: return 'bg-gray-50 text-gray-700 border-gray-200';
    }
  };

  const getWeatherIcon = (condition: string = '', isStormy: boolean = false) => {
     const lowerCond = condition.toLowerCase();
     if (isStormy || lowerCond.includes('tempestade') || lowerCond.includes('trovoada')) return <span className="text-xl" title="Tempestade">⛈️</span>;
     if (lowerCond.includes('chuva') || lowerCond.includes('garoa')) return <span className="text-xl" title="Chuva">🌧️</span>;
     if (lowerCond.includes('nublado') || lowerCond.includes('nuvens')) return <span className="text-xl" title="Nublado">☁️</span>;
     return <span className="text-xl" title="Ensolarado/Limpo">☀️</span>;
  };

  const downloadICS = () => {
    let icsContent = "BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//RotaSmartAI//BR\nCALSCALE:GREGORIAN\nMETHOD:PUBLISH\n";
    filteredPlan.forEach(day => {
        day.stops.forEach(stop => {
            const startDate = new Date(`${day.date}T${stop.estimatedArrival}:00`);
            const endDate = new Date(startDate.getTime() + Number(stop.durationMinutes) * 60000);
            const formatUTC = (d: Date) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
            const uid = `${stop.id || Math.random().toString(36).substr(2, 9)}@rotasmart.ai`;
            icsContent += "BEGIN:VEVENT\n";
            icsContent += `UID:${uid}\n`;
            icsContent += `DTSTART:${formatUTC(startDate)}\n`;
            icsContent += `DTEND:${formatUTC(endDate)}\n`;
            icsContent += `SUMMARY:[${day.collaboratorName || 'Rota'}] ${stop.name}\n`;
            icsContent += `LOCATION:${stop.address || ''}\n`;
            icsContent += `DESCRIPTION:${stop.notes || ''}\n`;
            icsContent += "END:VEVENT\n";
        });
    });
    icsContent += "END:VCALENDAR";
    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const link = document.createElement('a');
    link.href = window.URL.createObjectURL(blob);
    link.download = `agenda_filtrada.ics`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="max-w-[1800px] mx-auto p-4 md:p-6 bg-gray-50 min-h-screen flex flex-col">
      
      {/* HEADER BAR */}
      <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4 bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex-shrink-0">
         <div>
             <h2 className="text-2xl font-bold text-gray-900">Dashboard de Rotas</h2>
             <p className="text-sm text-gray-500">Gestão operacional diária</p>
         </div>
         <div className="flex gap-3">
             <button onClick={downloadICS} disabled={filteredPlan.length === 0} className="px-4 py-2 bg-gray-800 text-white rounded-lg text-sm font-bold hover:bg-black transition-colors flex items-center gap-2 disabled:bg-gray-300">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                Exportar Agenda
             </button>
             <button onClick={onReset} className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm font-bold hover:bg-gray-50 transition-colors">
                Novo Planejamento
             </button>
         </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 items-start flex-1">
          
          {/* SIDEBAR: COLLABORATORS LIST */}
          <div className="w-full lg:w-96 flex-shrink-0 flex flex-col gap-4">
              
              {/* Search Box */}
              <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                  <div className="relative">
                      <input 
                          type="text" 
                          placeholder="Buscar colaborador ou equipe..."
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none transition-all"
                      />
                      <svg className="w-5 h-5 text-gray-400 absolute left-3 top-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                  </div>
              </div>

              {/* List Container */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col h-[700px]">
                  <div className="p-3 bg-gray-50 border-b border-gray-200 text-xs font-bold text-gray-500 uppercase flex justify-between">
                      <span>Colaboradores ({enrichedMembers.length})</span>
                      <span>Página {currentPage} de {totalPages || 1}</span>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-2">
                      {paginatedMembers.map((item) => (
                          <div 
                              key={item.member.id} 
                              className={`p-3 rounded-lg border transition-all ${selectedCollaboratorId === item.member.id ? 'bg-blue-50 border-blue-300 shadow-sm' : 'bg-white border-gray-100 hover:border-gray-300 hover:shadow-sm'}`}
                          >
                              {/* Header: Name and Team */}
                              <div 
                                  className="flex items-center gap-3 cursor-pointer mb-3"
                                  onClick={() => {
                                      setSelectedCollaboratorId(item.member.id);
                                      setSelectedDate(null); // Show all dates when clicking name
                                  }}
                              >
                                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white text-sm ${selectedCollaboratorId === item.member.id ? 'bg-blue-600' : 'bg-gray-400'}`}>
                                      {item.member.name.charAt(0)}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                      <div className={`font-bold truncate ${selectedCollaboratorId === item.member.id ? 'text-blue-800' : 'text-gray-800'}`}>
                                          {item.member.name}
                                      </div>
                                      <div className="text-xs text-gray-500 truncate">{item.teamName}</div>
                                  </div>
                              </div>

                              {/* Dates List */}
                              <div className="flex flex-wrap gap-2">
                                  {item.assignedDates.length > 0 ? (
                                      item.assignedDates.map(date => {
                                          const isSelected = selectedCollaboratorId === item.member.id && selectedDate === date;
                                          return (
                                              <button
                                                  key={date}
                                                  onClick={(e) => {
                                                      e.stopPropagation();
                                                      setSelectedCollaboratorId(item.member.id);
                                                      setSelectedDate(date);
                                                  }}
                                                  className={`text-[10px] px-2 py-1 rounded-full font-bold border transition-colors ${
                                                      isSelected 
                                                      ? 'bg-blue-600 text-white border-blue-600' 
                                                      : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                                                  }`}
                                                  title={`Ver roteiro de ${date}`}
                                              >
                                                  {formatDateBR(date)}
                                              </button>
                                          );
                                      })
                                  ) : (
                                      <span className="text-[10px] text-gray-400 italic px-1">Sem roteiro</span>
                                  )}
                              </div>
                          </div>
                      ))}
                      
                      {paginatedMembers.length === 0 && (
                          <div className="p-8 text-center text-gray-400 text-sm">
                              Nenhum colaborador encontrado para "{searchTerm}"
                          </div>
                      )}
                  </div>

                  {/* Pagination Controls */}
                  {totalPages > 1 && (
                      <div className="p-3 border-t border-gray-200 bg-gray-50 flex justify-between items-center">
                          <button 
                              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                              disabled={currentPage === 1}
                              className="px-3 py-1 bg-white border border-gray-300 rounded text-xs font-bold disabled:opacity-50 hover:bg-gray-100"
                          >
                              Anterior
                          </button>
                          <span className="text-xs text-gray-600 font-mono">
                              {currentPage} / {totalPages}
                          </span>
                          <button 
                              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                              disabled={currentPage === totalPages}
                              className="px-3 py-1 bg-white border border-gray-300 rounded text-xs font-bold disabled:opacity-50 hover:bg-gray-100"
                          >
                              Próxima
                          </button>
                      </div>
                  )}
              </div>
          </div>

          {/* MAIN CONTENT: ITINERARY */}
          <div className="flex-1 min-w-0">
              {selectedCollaboratorId ? (
                  <div className="space-y-6">
                      
                      {/* Summary Aggregates for Selection */}
                      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 grid grid-cols-2 md:grid-cols-4 gap-4 animate-fade-in-up">
                          <div>
                              <span className="text-xs text-gray-500 uppercase font-bold block mb-1">Total Visitas</span>
                              <span className="text-2xl font-bold text-blue-600">{aggregates.stops}</span>
                          </div>
                          <div>
                              <span className="text-xs text-gray-500 uppercase font-bold block mb-1">Distância Tot.</span>
                              <span className="text-2xl font-bold text-gray-800">{aggregates.dist} km</span>
                          </div>
                          <div>
                              <span className="text-xs text-gray-500 uppercase font-bold block mb-1">Tempo Tot.</span>
                              <span className="text-2xl font-bold text-gray-800">{aggregates.time} h</span>
                          </div>
                          <div>
                              <span className="text-xs text-gray-500 uppercase font-bold block mb-1">Custo Est.</span>
                              <span className="text-2xl font-bold text-green-600">R$ {aggregates.cost}</span>
                          </div>
                      </div>

                      {/* Day Off Warning */}
                      {dayOffInfo && (
                          <div className="bg-yellow-50 p-6 rounded-xl border border-yellow-200 flex items-start gap-4 animate-fade-in-up">
                               <div className="p-3 bg-yellow-100 rounded-full text-yellow-600">
                                   <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                               </div>
                               <div>
                                   <h3 className="text-lg font-bold text-yellow-800">Folga Programada</h3>
                                   <p className="text-yellow-700 mt-1">
                                       O colaborador <strong>{dayOffInfo.memberName}</strong> não trabalha às <strong>{dayOffInfo.day}s</strong>.
                                   </p>
                                   <p className="text-sm text-yellow-600 mt-2">
                                       Se houver visitas listadas abaixo, verifique se foram movidas para um horário de plantão ou se é uma exceção.
                                   </p>
                               </div>
                          </div>
                      )}

                      {/* Plan Cards */}
                      {filteredPlan.length > 0 ? (
                          filteredPlan.map((dayPlan, idx) => (
                            <div key={idx} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden animate-fade-in-up" style={{ animationDelay: `${idx * 100}ms` }}>
                                {/* Header of the Card */}
                                <div className="bg-gray-50 px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                                    <div>
                                        <h3 className="font-bold text-lg text-gray-800 flex items-center gap-2">
                                            <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-sm font-mono border border-blue-200">
                                                {formatDateBR(dayPlan.date)}
                                            </span>
                                            {dayPlan.dayLabel.split('-')[0].trim()}
                                        </h3>
                                        <p className="text-xs text-gray-500 mt-1">
                                            {dayPlan.summary}
                                        </p>
                                    </div>
                                    <div className="text-right hidden sm:block">
                                        <div className="text-xs font-bold text-gray-400 uppercase">Estimativa do Dia</div>
                                        <div className="text-sm font-medium text-gray-700">{dayPlan.totalDistanceKm} • {dayPlan.totalTimeHours}</div>
                                    </div>
                                </div>

                                {/* Stops List */}
                                <div className="p-6">
                                    <div className="relative border-l-2 border-gray-100 ml-3 space-y-8">
                                        {dayPlan.stops.map((stop) => {
                                            const isRisk = stop.risks.security || stop.risks.flood || stop.risks.towing;
                                            return (
                                                <div key={stop.id} className="relative pl-8">
                                                    {/* Bullet */}
                                                    <div className={`absolute -left-[9px] top-1.5 w-4 h-4 rounded-full border-2 border-white shadow-sm ${stop.order === 1 ? 'bg-green-500' : 'bg-blue-500'}`}></div>
                                                    
                                                    <div className="flex flex-col gap-3 group">
                                                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                                                            <div className="flex-1">
                                                                <div className="flex items-center gap-3 mb-1">
                                                                    <span className="font-mono text-sm font-bold text-gray-700 bg-gray-100 px-2 py-0.5 rounded border border-gray-200 flex items-center gap-1">
                                                                        <svg className="w-3 h-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                                                                        {stop.estimatedArrival} - {getEndTime(stop.estimatedArrival, stop.durationMinutes)}
                                                                    </span>
                                                                    <h4 className="font-bold text-gray-800 group-hover:text-blue-600 transition-colors text-lg">
                                                                        {stop.name}
                                                                    </h4>
                                                                    <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded border ${getTypeColor(stop.type)}`}>
                                                                        {stop.type}
                                                                    </span>
                                                                </div>
                                                                
                                                                <div className="text-sm text-gray-600 mb-2 pl-1">
                                                                    {stop.address}
                                                                </div>

                                                                {(stop.notes || stop.parkingSuggestion) && (
                                                                    <div className="bg-yellow-50 p-2 rounded-lg text-xs text-yellow-800 mb-2 border border-yellow-100 inline-block max-w-full">
                                                                        {stop.notes && <span className="block font-medium">Obs: {stop.notes}</span>}
                                                                        {stop.parkingSuggestion && <span className="block mt-1">🅿️ {stop.parkingSuggestion}</span>}
                                                                    </div>
                                                                )}
                                                            </div>

                                                            {/* Right Side Info */}
                                                            <div className="flex flex-col sm:items-end gap-2 min-w-[140px]">
                                                                {stop.weather && (
                                                                    <div className="flex items-center gap-1 text-xs text-gray-500 bg-gray-50 px-2 py-1 rounded-full w-fit">
                                                                        {getWeatherIcon(stop.weather.condition, stop.weather.isStormy)}
                                                                        {stop.weather.temp}
                                                                    </div>
                                                                )}
                                                                
                                                                {isRisk && (
                                                                    <div className="flex gap-1">
                                                                        {stop.risks.security && <span className="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded font-bold">Risco</span>}
                                                                        {stop.risks.flood && <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded font-bold">Chuva</span>}
                                                                    </div>
                                                                )}

                                                                <a 
                                                                    href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(stop.address)}`}
                                                                    target="_blank"
                                                                    rel="noreferrer"
                                                                    className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-1 mt-1"
                                                                >
                                                                    Navegar 
                                                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg>
                                                                </a>
                                                            </div>
                                                        </div>

                                                        {/* Next Stop Info Badge */}
                                                        {(stop.distanceToNext || stop.travelTimeToNext) && (
                                                            <div className="flex items-center gap-2 text-xs text-gray-500 mt-1 pl-1 border-t border-gray-100 pt-2 border-dashed">
                                                                <span className="uppercase font-bold text-gray-400 text-[10px]">Próximo destino:</span>
                                                                <div className="flex items-center gap-3 bg-gray-50 px-2 py-1 rounded-md">
                                                                    {stop.distanceToNext && (
                                                                        <span className="flex items-center gap-1 font-medium">
                                                                             <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"></path></svg>
                                                                             {stop.distanceToNext}
                                                                        </span>
                                                                    )}
                                                                    {stop.travelTimeToNext && (
                                                                        <span className="flex items-center gap-1 font-medium">
                                                                             <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                                                                             {stop.travelTimeToNext}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                          ))
                      ) : (
                          <div className="flex flex-col items-center justify-center p-12 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200 text-gray-400">
                               {dayOffInfo && dayOffInfo.isOff ? (
                                   <p>Nenhuma rota gerada para esta folga.</p>
                               ) : (
                                   <>
                                       <svg className="w-12 h-12 mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"></path></svg>
                                       <p>Nenhum roteiro encontrado para a seleção atual.</p>
                                   </>
                               )}
                          </div>
                      )}
                  </div>
              ) : (
                  // EMPTY STATE (NO COLLABORATOR SELECTED)
                  <div className="flex flex-col items-center justify-center h-[700px] bg-white rounded-xl shadow-sm border border-gray-200 text-center p-8">
                       <div className="w-24 h-24 bg-blue-50 rounded-full flex items-center justify-center mb-6">
                           <svg className="w-12 h-12 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>
                       </div>
                       <h3 className="text-xl font-bold text-gray-800 mb-2">Selecione um Colaborador</h3>
                       <p className="text-gray-500 max-w-md mx-auto">
                           Utilize a lista à esquerda para visualizar os roteiros detalhados. Você pode filtrar por nome, equipe e selecionar datas específicas.
                       </p>
                  </div>
              )}
          </div>
      </div>
    </div>
  );
};

export default Itinerary;
