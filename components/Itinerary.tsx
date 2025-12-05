import React, { useState, useMemo, useEffect } from 'react';
import { MultiDayPlan, EstablishmentType, RouteStop, Team } from '../types';

interface ItineraryProps {
  plan: MultiDayPlan;
  teams: Team[]; // Add teams prop to check schedule
  onReset: () => void;
}

const Itinerary: React.FC<ItineraryProps> = ({ plan, teams, onReset }) => {
  // Filtros de Estado
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedCollaboratorId, setSelectedCollaboratorId] = useState<string>('all');

  // Helper para dia da semana
  const getDayOfWeekPT = (dateString: string): string => {
      const date = new Date(`${dateString}T12:00:00`);
      const days = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
      return days[date.getDay()];
  };

  // Extrair opções únicas para os filtros
  const { uniqueDates, uniqueCollaborators } = useMemo(() => {
      const dates = new Set<string>();
      const collaborators = new Map<string, string>(); // ID -> Name

      plan.forEach(day => {
          if(day.date) dates.add(day.date);
          const cId = day.collaboratorId || 'generic';
          const cName = day.collaboratorName || 'Roteiro Geral';
          collaborators.set(cId, cName);
      });

      return {
          uniqueDates: Array.from(dates).sort(),
          uniqueCollaborators: Array.from(collaborators.entries()).map(([id, name]) => ({ id, name }))
      };
  }, [plan]);

  // Inicializar filtros
  useEffect(() => {
      if (uniqueDates.length > 0 && !selectedDate) {
          setSelectedDate(uniqueDates[0]);
      }
  }, [uniqueDates, selectedDate]);

  // Filtrar o plano com base nas seleções
  const filteredPlan = useMemo(() => {
      return plan.filter(day => {
          const dateMatch = selectedDate ? day.date === selectedDate : true;
          const collabMatch = selectedCollaboratorId === 'all' 
              ? true 
              : (day.collaboratorId || 'generic') === selectedCollaboratorId;
          
          return dateMatch && collabMatch;
      });
  }, [plan, selectedDate, selectedCollaboratorId]);

  // Check if selected collaborator is on Day Off for selected Date
  const dayOffInfo = useMemo(() => {
      if (selectedCollaboratorId === 'all' || !selectedDate) return null;

      // Find member in teams
      for (const team of teams) {
          const member = team.members.find(m => m.id === selectedCollaboratorId);
          if (member) {
              const dow = getDayOfWeekPT(selectedDate);
              // Normalize day string match (e.g. "Segunda-feira" vs "Segunda")
              const schedule = member.schedule.find(s => s.dayOfWeek.includes(dow) || dow.includes(s.dayOfWeek));
              
              if (schedule && schedule.isDayOff) {
                  return { isOff: true, memberName: member.name, day: dow };
              }
          }
      }
      return null;
  }, [selectedCollaboratorId, selectedDate, teams]);


  // Calcular agregados da visão atual
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
            
            // Format to UTC string YYYYMMDDTHHmmssZ
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
    <div className="max-w-[1800px] mx-auto p-4 md:p-6 bg-gray-50 min-h-screen">
      
      {/* Top Bar: Title & Actions */}
      <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4 bg-white p-4 rounded-xl shadow-sm border border-gray-200">
         <div>
             <h2 className="text-2xl font-bold text-gray-900">Dashboard de Rotas</h2>
             <p className="text-sm text-gray-500">Gestão operacional diária</p>
         </div>
         <div className="flex gap-3">
             <button onClick={downloadICS} className="px-4 py-2 bg-gray-800 text-white rounded-lg text-sm font-bold hover:bg-black transition-colors flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                Exportar Agenda
             </button>
             <button onClick={onReset} className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm font-bold hover:bg-gray-50 transition-colors">
                Novo Planejamento
             </button>
         </div>
      </div>

      {/* Filters & Stats Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-8">
          
          {/* Filters Card */}
          <div className="lg:col-span-1 bg-white p-5 rounded-xl shadow-sm border border-gray-200 h-fit">
              <h3 className="text-xs font-bold text-gray-500 uppercase mb-4 tracking-wider">Filtros de Visualização</h3>
              
              <div className="space-y-4">
                  <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Data da Rota</label>
                      <select 
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        className="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-gray-50"
                      >
                          {uniqueDates.map(date => (
                              <option key={date} value={date}>{date.split('-').reverse().join('/')}</option>
                          ))}
                      </select>
                  </div>

                  <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Colaborador / Equipe</label>
                      <select 
                        value={selectedCollaboratorId}
                        onChange={(e) => setSelectedCollaboratorId(e.target.value)}
                        className="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-gray-50"
                      >
                          <option value="all">Todos os Colaboradores ({uniqueCollaborators.length})</option>
                          {uniqueCollaborators.map(c => (
                              <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                      </select>
                  </div>
              </div>

              {/* Mini Stats for Filter */}
              <div className="mt-6 pt-4 border-t border-gray-100 grid grid-cols-2 gap-4">
                  <div>
                      <span className="block text-2xl font-bold text-blue-600">{aggregates.stops}</span>
                      <span className="text-xs text-gray-500">Visitas</span>
                  </div>
                  <div>
                      <span className="block text-2xl font-bold text-green-600">R$ {aggregates.cost}</span>
                      <span className="text-xs text-gray-500">Combustível Est.</span>
                  </div>
              </div>
          </div>

          {/* Timeline View */}
          <div className="lg:col-span-3 space-y-6">
              
              {dayOffInfo ? (
                  <div className="bg-yellow-50 p-10 rounded-xl text-center border border-yellow-200 flex flex-col items-center">
                       <svg className="w-16 h-16 text-yellow-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                       <h3 className="text-xl font-bold text-yellow-800">Folga Programada</h3>
                       <p className="text-yellow-700 mt-2">
                           O colaborador <strong>{dayOffInfo.memberName}</strong> não trabalha às <strong>{dayOffInfo.day}s</strong>.
                       </p>
                       <p className="text-sm text-yellow-600 mt-1">
                           Verifique se o sistema agendou as visitas para o próximo dia útil.
                       </p>
                  </div>
              ) : filteredPlan.length === 0 ? (
                  <div className="bg-white p-10 rounded-xl text-center border border-gray-200">
                      <p className="text-gray-500">Nenhum roteiro encontrado para os filtros selecionados.</p>
                  </div>
              ) : (
                  filteredPlan.map((dayPlan, idx) => (
                      <div key={idx} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                          {/* Header of the Card (Collab Name) */}
                          <div className="bg-gray-50 px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                              <div>
                                  <h3 className="font-bold text-lg text-gray-800 flex items-center gap-2">
                                      <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-sm">
                                          {(dayPlan.collaboratorName || 'G').charAt(0)}
                                      </div>
                                      {dayPlan.collaboratorName || 'Roteiro Geral'}
                                      {dayPlan.teamName && <span className="text-xs font-normal text-gray-500 bg-white px-2 py-0.5 rounded border border-gray-200">{dayPlan.teamName}</span>}
                                  </h3>
                                  <p className="text-xs text-gray-500 mt-1 pl-10">
                                      {dayPlan.summary}
                                  </p>
                              </div>
                              <div className="text-right hidden sm:block">
                                  <div className="text-xs font-bold text-gray-400 uppercase">Estimativa</div>
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
                                              
                                              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 group">
                                                  <div className="flex-1">
                                                      <div className="flex items-center gap-3 mb-1">
                                                          <span className="font-mono text-sm font-bold text-gray-600 bg-gray-100 px-2 py-0.5 rounded">
                                                              {stop.estimatedArrival}
                                                          </span>
                                                          <h4 className="font-bold text-gray-800 group-hover:text-blue-600 transition-colors">
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
                                          </div>
                                      );
                                  })}
                              </div>
                          </div>
                      </div>
                  ))
              )}
          </div>
      </div>
    </div>
  );
};

export default Itinerary;