import React, { useState } from 'react';
import { MultiDayPlan, EstablishmentType, RouteStop } from '../types';

interface ItineraryProps {
  plan: MultiDayPlan;
  onReset: () => void;
}

const Itinerary: React.FC<ItineraryProps> = ({ plan, onReset }) => {
  const [activeDayIndex, setActiveDayIndex] = useState(0);

  const currentDay = plan[activeDayIndex];

  if (!currentDay) return <div>Erro ao carregar dados do dia.</div>;

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

  const getTypeIcon = (type: EstablishmentType) => {
    switch (type) {
      case EstablishmentType.CLIENT: return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path></svg>
      );
      case EstablishmentType.RESTAURANT: return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"></path></svg>
      ); 
      case EstablishmentType.GAS_STATION: return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
      );
      default: return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
      );
    }
  };

  const getWeatherIcon = (condition: string = '', isStormy: boolean = false) => {
     const lowerCond = condition.toLowerCase();
     
     if (isStormy || lowerCond.includes('tempestade') || lowerCond.includes('trovoada')) {
        return <span className="text-xl" title="Tempestade">⛈️</span>;
     }
     if (lowerCond.includes('chuva') || lowerCond.includes('garoa')) {
        return <span className="text-xl" title="Chuva">🌧️</span>;
     }
     if (lowerCond.includes('nublado') || lowerCond.includes('nuvens')) {
        return <span className="text-xl" title="Nublado">☁️</span>;
     }
     return <span className="text-xl" title="Ensolarado/Limpo">☀️</span>;
  };

  // --- CALENDAR HELPERS ---

  const formatDateForCalendar = (dateStr: string, timeStr: string) => {
     // dateStr: YYYY-MM-DD, timeStr: HH:MM
     const d = new Date(`${dateStr}T${timeStr}:00`);
     const pad = (n: number) => n < 10 ? '0' + n : String(n);
     return d.getFullYear() +
            pad(d.getMonth() + 1) +
            pad(d.getDate()) + 'T' +
            pad(d.getHours()) +
            pad(d.getMinutes()) + '00';
  };

  const getGoogleCalendarLink = (stop: RouteStop, date: string) => {
    // Calculates end time based on duration
    const startDate = new Date(`${date}T${stop.estimatedArrival}:00`);
    const endDate = new Date(startDate.getTime() + Number(stop.durationMinutes) * 60000);
    
    const pad = (n: number) => n < 10 ? '0' + n : String(n);
    const formatTime = (d: Date) => pad(d.getHours()) + ':' + pad(d.getMinutes());
    
    const startStr = formatDateForCalendar(date, stop.estimatedArrival);
    const endStr = formatDateForCalendar(date, formatTime(endDate));
    
    const title = encodeURIComponent(`Visita ${stop.name}`);
    const details = encodeURIComponent(`Endereço: ${stop.address}\n\nObs: ${stop.notes}\n\nRisco: ${stop.risks.description || 'Nenhum'}`);
    const location = encodeURIComponent(stop.address);

    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${startStr}/${endStr}&details=${details}&location=${location}`;
  };

  const downloadDayICS = () => {
    let icsContent = "BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//RotaSmartAI//BR\nCALSCALE:GREGORIAN\nMETHOD:PUBLISH\n";
    
    // Helper to format date to UTC (YYYYMMDDTHHmmssZ) required for max compatibility
    const formatToUTC = (d: Date) => {
        const pad = (n: number) => n < 10 ? '0' + n : String(n);
        return d.getUTCFullYear() +
               pad(d.getUTCMonth() + 1) +
               pad(d.getUTCDate()) + 'T' +
               pad(d.getUTCHours()) +
               pad(d.getUTCMinutes()) +
               pad(d.getUTCSeconds()) + 'Z';
    };

    const now = new Date();
    const dtStamp = formatToUTC(now);

    currentDay.stops.forEach(stop => {
        // Create date object based on browser's local time context
        // This assumes the user wants the event at "08:00" in their current timezone context
        const startDate = new Date(`${currentDay.date}T${stop.estimatedArrival}:00`);
        const endDate = new Date(startDate.getTime() + Number(stop.durationMinutes) * 60000);
        
        // Generate a unique ID to prevent duplicates on re-import
        const uid = `${stop.id || Math.random().toString(36).substr(2, 9)}@rotasmart.ai`;

        icsContent += "BEGIN:VEVENT\n";
        icsContent += `UID:${uid}\n`;
        icsContent += `DTSTAMP:${dtStamp}\n`;
        // Using UTC (Z) forces Google Calendar to calculate the time based on the user's calendar settings
        // ensuring 08:00 local time appears correctly rather than floating.
        icsContent += `DTSTART:${formatToUTC(startDate)}\n`;
        icsContent += `DTEND:${formatToUTC(endDate)}\n`;
        icsContent += `SUMMARY:Visita ${stop.name}\n`;
        // Handle commas in address as per RFC 5545
        const safeAddress = stop.address ? stop.address.replace(/,/g, '\\,') : '';
        icsContent += `LOCATION:${safeAddress}\n`;
        
        const description = `Obs: ${stop.notes || ''}\\nRisco: ${stop.risks.description || 'N/A'}`;
        icsContent += `DESCRIPTION:${description}\n`;
        icsContent += "END:VEVENT\n";
    });

    icsContent += "END:VCALENDAR";

    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const link = document.createElement('a');
    link.href = window.URL.createObjectURL(blob);
    link.setAttribute('download', `agenda_${currentDay.date}.ics`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="max-w-[1800px] mx-auto p-6">
      
      <div className="flex justify-between items-center mb-6">
         <h2 className="text-2xl font-bold text-gray-900">Plano de Rotas</h2>
         <button onClick={onReset} className="text-blue-600 hover:underline text-sm">Novo Planejamento</button>
      </div>

      {/* Day Tabs */}
      {plan.length > 1 && (
        <div className="flex overflow-x-auto space-x-2 mb-6 pb-2 scrollbar-hide">
          {plan.map((day, idx) => (
            <button
              key={idx}
              onClick={() => setActiveDayIndex(idx)}
              className={`px-5 py-2 rounded-full whitespace-nowrap font-medium transition-colors ${
                activeDayIndex === idx
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
              }`}
            >
              {day.dayLabel} <span className="text-xs opacity-75 ml-1">({day.stops.length})</span>
            </button>
          ))}
        </div>
      )}

      {/* Summary Card */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-center gap-3">
            <div className="p-3 bg-blue-50 rounded-lg text-blue-600">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
            </div>
            <div>
                <span className="block text-xs font-bold text-gray-500 uppercase">Distância Total</span>
                <span className="text-xl font-bold text-gray-800">{currentDay.totalDistanceKm}</span>
            </div>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-center gap-3">
            <div className="p-3 bg-purple-50 rounded-lg text-purple-600">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
            </div>
            <div>
                <span className="block text-xs font-bold text-gray-500 uppercase">Tempo Estimado</span>
                <span className="text-xl font-bold text-gray-800">{currentDay.totalTimeHours}</span>
            </div>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-center gap-3">
            <div className="p-3 bg-green-50 rounded-lg text-green-600">
                 <span className="text-xl font-bold">R$</span>
            </div>
            <div>
                <span className="block text-xs font-bold text-gray-500 uppercase">Custo Combustível</span>
                <span className="text-xl font-bold text-gray-800">{currentDay.estimatedFuelCost}</span>
            </div>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-center gap-3">
             <button 
                onClick={downloadDayICS}
                className="w-full h-full flex items-center justify-center gap-2 bg-gray-800 hover:bg-black text-white rounded-lg transition-colors"
             >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                <span className="font-bold">Baixar Agenda (.ics)</span>
             </button>
        </div>
      </div>

      {/* Timeline */}
      <div className="relative border-l-2 border-gray-200 ml-4 md:ml-6 space-y-8">
        {currentDay.stops.map((stop, index) => {
            const isRisk = stop.risks.security || stop.risks.flood || stop.risks.towing;
            return (
                <div key={stop.id} className="relative pl-8 md:pl-12">
                    {/* Time Bubble */}
                    <div className="absolute -left-[9px] md:-left-[10px] top-0 bg-white border-2 border-blue-500 w-5 h-5 rounded-full z-10"></div>
                    
                    <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-3">
                            <div className="flex items-center gap-3 mb-2 md:mb-0">
                                <span className="font-mono text-lg font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded">{stop.estimatedArrival}</span>
                                <h3 className="text-lg font-bold text-gray-800">{stop.name}</h3>
                                <span className={`px-2 py-0.5 rounded text-xs font-bold border flex items-center gap-1 ${getTypeColor(stop.type)}`}>
                                    {getTypeIcon(stop.type)}
                                    {stop.type}
                                </span>
                            </div>
                            <div className="flex items-center gap-3">
                                {stop.weather && (
                                    <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium ${stop.weather.isStormy ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-700'}`}>
                                        {getWeatherIcon(stop.weather.condition, stop.weather.isStormy)}
                                        <span>{stop.weather.temp}</span>
                                        <span className="text-xs opacity-75">({stop.weather.chanceOfRain} chuva)</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            <div>
                                <div className="flex items-start gap-2 mb-2">
                                    <svg className="w-5 h-5 text-gray-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                                    <p className="text-gray-600 text-sm">{stop.address}</p>
                                </div>
                                
                                {stop.nearbyBusStop && !stop.nearbyBusStop.toLowerCase().includes('nenhum') && (
                                     <div className="flex items-start gap-2 mb-2 ml-1">
                                         <span className="text-lg">🚌</span>
                                         <p className="text-xs text-blue-700 bg-blue-50 px-2 py-1 rounded border border-blue-100 w-fit">
                                            {stop.nearbyBusStop}
                                         </p>
                                     </div>
                                )}

                                {stop.notes && (
                                    <div className="flex items-start gap-2 mt-2">
                                        <svg className="w-5 h-5 text-gray-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                                        <p className="text-gray-500 text-sm italic">{stop.notes}</p>
                                    </div>
                                )}
                            </div>

                            <div className="space-y-2">
                                {isRisk && (
                                    <div className="bg-red-50 border border-red-100 p-3 rounded-lg">
                                        <div className="flex items-center gap-2 mb-1">
                                            <svg className="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                                            <span className="text-xs font-bold text-red-700 uppercase">Alertas de Risco</span>
                                        </div>
                                        <div className="flex flex-wrap gap-2 text-xs">
                                            {stop.risks.security && <span className="bg-red-200 text-red-800 px-2 py-0.5 rounded">Segurança</span>}
                                            {stop.risks.flood && <span className="bg-blue-200 text-blue-800 px-2 py-0.5 rounded">Alagamento</span>}
                                            {stop.risks.towing && <span className="bg-yellow-200 text-yellow-800 px-2 py-0.5 rounded">Guincho</span>}
                                        </div>
                                        {stop.risks.description && <p className="text-xs text-red-800 mt-1">{stop.risks.description}</p>}
                                    </div>
                                )}

                                <div className="flex gap-2 justify-end mt-4">
                                     <a 
                                        href={getGoogleCalendarLink(stop, currentDay.date)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 px-3 py-2 rounded-lg flex items-center gap-2 transition-colors"
                                     >
                                         <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                                         Add Calendar
                                     </a>
                                     <a 
                                        href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(stop.address)}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 px-3 py-2 rounded-lg flex items-center gap-2 transition-colors shadow-sm"
                                     >
                                         <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                                         Navegar
                                     </a>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            );
        })}
      </div>
    </div>
  );
};

export default Itinerary;