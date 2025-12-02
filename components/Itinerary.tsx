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
    <div className="max-w-4xl mx-auto p-4">
      
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
              {day.dayLabel} <span className="text-xs opacity-75 ml-1">({day.date})</span>
            </button>
          ))}
        </div>
      )}

      {/* Active Day Summary */}
      <div className="bg-white rounded-2xl shadow-lg p-6 mb-8 border border-gray-200">
        <div className="flex flex-col gap-4">
            <div>
                <div className="flex flex-col md:flex-row justify-between md:items-start gap-4 mb-4">
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <h3 className="text-xl font-bold text-gray-900">{currentDay.dayLabel} - {currentDay.date}</h3>
                        </div>
                        <p className="text-gray-600 text-sm">{currentDay.summary}</p>
                    </div>
                    
                    {/* Bulk Action: Download ICS */}
                    <button 
                        onClick={downloadDayICS}
                        className="flex items-center justify-center px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-sm font-semibold transition-colors border border-indigo-200 shadow-sm"
                        title="Baixar arquivo de agenda para Outlook, Apple Calendar, etc."
                    >
                        <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                        Baixar Agenda do Dia (.ics)
                    </button>
                </div>
                
                {/* Stats Grid - Responsive */}
                <div className="flex flex-wrap gap-3 text-gray-700 text-sm">
                    {/* Tempo */}
                    <div className="flex items-center bg-blue-50 px-3 py-2 rounded-lg border border-blue-100 flex-grow md:flex-grow-0">
                        <svg className="w-4 h-4 mr-2 text-blue-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                        <span className="font-semibold whitespace-nowrap">{currentDay.totalTimeHours}</span>
                    </div>
                    {/* Distância */}
                    <div className="flex items-center bg-blue-50 px-3 py-2 rounded-lg border border-blue-100 flex-grow md:flex-grow-0">
                        <svg className="w-4 h-4 mr-2 text-blue-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"></path></svg>
                        <span className="font-semibold whitespace-nowrap">{currentDay.totalDistanceKm}</span>
                    </div>
                    {/* Paradas */}
                    <div className="flex items-center bg-blue-50 px-3 py-2 rounded-lg border border-blue-100 flex-grow md:flex-grow-0">
                        <svg className="w-4 h-4 mr-2 text-blue-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                        <span className="font-semibold whitespace-nowrap">{currentDay.stops.length} Paradas</span>
                    </div>

                    {/* Divisor Visual para Custos */}
                    <div className="hidden md:block w-px bg-gray-300 mx-2 h-8 self-center"></div>

                    {/* Combustível Estimado */}
                    <div className="flex items-center bg-green-50 px-3 py-2 rounded-lg border border-green-100 flex-grow md:flex-grow-0" title="Estimativa para Carro 1.0 Gasolina (R$6/L)">
                        <svg className="w-4 h-4 mr-2 text-green-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                        <span className="font-semibold text-green-800 whitespace-nowrap">{currentDay.estimatedFuelCost || 'R$ --'}</span>
                    </div>

                    {/* Estacionamento Estimado */}
                    <div className="flex items-center bg-indigo-50 px-3 py-2 rounded-lg border border-indigo-100 flex-grow md:flex-grow-0">
                        <span className="mr-2 text-lg leading-none">🅿️</span>
                        <span className="font-semibold text-indigo-800 whitespace-nowrap">{currentDay.estimatedParkingCost || 'R$ --'}</span>
                    </div>
                </div>
            </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="relative border-l-4 border-blue-100 ml-4 md:ml-6 space-y-8 pb-8">
        {currentDay.stops.map((stop, index) => {
          // Check if there are any risks
          const hasRisk = stop.risks.flood || stop.risks.towing || stop.risks.security;
          
          // Helper para texto do ônibus
          const busInfo = stop.nearbyBusStop || "Nenhum ponto de ônibus identificado nas imediações.";
          const hasBus = !busInfo.toLowerCase().includes("nenhum") && !busInfo.toLowerCase().includes("não identificad");

          return (
            <div key={index} className="relative pl-6 md:pl-8">
              {/* Dot on Timeline */}
              <div className={`absolute -left-3.5 top-6 w-7 h-7 rounded-full border-4 flex items-center justify-center z-10 ${hasRisk ? 'bg-orange-50 border-orange-500' : 'bg-white border-blue-500'}`}>
                  {hasRisk ? (
                      <span className="text-[10px] font-bold text-orange-600">!</span>
                  ) : (
                      <span className="text-xs font-bold text-blue-700">{stop.order}</span>
                  )}
              </div>

              {/* Card */}
              <div className={`bg-white rounded-xl shadow-md hover:shadow-lg transition-shadow p-5 border ${hasRisk ? 'border-orange-200' : 'border-gray-100'}`}>
                <div className="flex flex-col md:flex-row justify-between md:items-center mb-3">
                  <div className="flex items-center gap-3 mb-2 md:mb-0">
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wide flex items-center gap-2 border ${getTypeColor(stop.type)}`}>
                          {getTypeIcon(stop.type)}
                          {stop.type}
                      </span>
                      <h3 className="text-lg font-bold text-gray-800">{stop.name}</h3>
                  </div>
                  <div className="text-right min-w-[100px]">
                      <div className="text-2xl font-bold text-blue-600">{stop.estimatedArrival}</div>
                      <div className="text-xs text-gray-500">Duração: {stop.durationMinutes} min</div>
                  </div>
                </div>

                <div className="mb-4">
                    <p className="text-gray-600 text-sm flex items-start">
                        <svg className="w-4 h-4 mr-1 mt-0.5 flex-shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                        {stop.address}
                    </p>
                    
                    {/* BUS STOP INFO (Always Rendered) */}
                    <div className={`flex items-center mt-2 text-xs font-medium px-2 py-1.5 rounded w-fit ml-5 ${
                        hasBus 
                        ? "bg-blue-50 text-blue-700 border border-blue-200" 
                        : "bg-gray-100 text-gray-500 border border-gray-200"
                    }`}>
                        {hasBus ? (
                            <svg className="w-3.5 h-3.5 mr-1.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                <path d="M5 10a1 1 0 011-1h12a1 1 0 011 1v7a1 1 0 01-1 1h-2a1 1 0 01-1-1v-1H8v1a1 1 0 01-1 1H5a1 1 0 01-1-1v-7z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path>
                                <path d="M5 10V7a2 2 0 012-2h10a2 2 0 012 2v3" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path>
                                <circle cx="7.5" cy="14.5" r="1.5" fill="currentColor" />
                                <circle cx="16.5" cy="14.5" r="1.5" fill="currentColor" />
                            </svg>
                        ) : (
                            <svg className="w-3.5 h-3.5 mr-1.5 flex-shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"></path></svg>
                        )}
                        <span>{busInfo}</span>
                    </div>
                </div>

                {/* Weather Section (NEW) */}
                {stop.weather && (
                    <div className={`mb-4 p-3 rounded-lg border flex items-center gap-4 ${stop.weather.isStormy ? 'bg-red-50 border-red-200' : 'bg-sky-50 border-sky-100'}`}>
                        <div className="flex items-center gap-2">
                            {getWeatherIcon(stop.weather.condition, stop.weather.isStormy)}
                            <div className="flex flex-col">
                                <span className="font-bold text-gray-800 text-sm leading-tight">{stop.weather.temp}</span>
                                <span className="text-xs text-gray-600">{stop.weather.condition}</span>
                            </div>
                        </div>
                        <div className="h-8 w-px bg-gray-300"></div>
                        <div className="text-xs text-gray-700">
                             <div>Chuva: <strong>{stop.weather.chanceOfRain}</strong></div>
                             {stop.weather.isStormy && (
                                 <div className="text-red-700 font-bold uppercase mt-1 flex items-center">
                                     ⚠️ Alerta de Tempestade
                                 </div>
                             )}
                        </div>
                    </div>
                )}

                {/* Metadata Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm mb-4">
                  {stop.phoneNumber && (
                      <div className="flex items-center text-gray-600">
                          <svg className="w-4 h-4 mr-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"></path></svg>
                          {stop.phoneNumber}
                      </div>
                  )}
                  {stop.parkingSuggestion && (
                      <div className="flex items-center text-indigo-600 bg-indigo-50 p-2 rounded">
                          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                          <span className="font-medium">Estacionamento: </span> <span className="ml-1 truncate">{stop.parkingSuggestion}</span>
                      </div>
                  )}
                </div>

                {/* Risks/Warnings Enhanced */}
                {hasRisk && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4 flex items-start animate-fade-in-up">
                        <div className="flex-shrink-0 mr-3">
                           {stop.risks.security ? (
                              <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg>
                           ) : (
                              <svg className="w-6 h-6 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                           )}
                        </div>
                        <div className="text-sm text-red-800 flex-1">
                            <p className="font-bold mb-1">Análise de Risco:</p>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                {stop.risks.security && (
                                  <span className="flex items-center text-xs bg-red-100 text-red-800 px-2 py-1 rounded font-medium">
                                     🛡️ Risco de Segurança / Roubo
                                  </span>
                                )}
                                {stop.risks.flood && (
                                  <span className="flex items-center text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded font-medium">
                                     💧 Área de Alagamento
                                  </span>
                                )}
                                {stop.risks.towing && (
                                  <span className="flex items-center text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded font-medium">
                                     🚗 Risco de Guincho/Multa
                                  </span>
                                )}
                            </div>
                            {stop.risks.description && (
                                <p className="mt-2 text-gray-700 italic border-l-2 border-red-300 pl-2">
                                  "{stop.risks.description}"
                                </p>
                            )}
                        </div>
                    </div>
                )}

                <div className="flex justify-between items-center pt-3 border-t border-gray-100">
                    <span className="text-xs text-gray-400 italic mr-2 truncate flex-1">{stop.notes}</span>
                    <div className="flex gap-2">
                        {/* Google Calendar Action */}
                        <a 
                            href={getGoogleCalendarLink(stop, currentDay.date)}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center px-3 py-1.5 bg-gray-50 text-gray-700 text-sm font-semibold rounded-lg hover:bg-gray-100 border border-gray-200 transition-colors"
                        >
                            <svg className="w-4 h-4 mr-1.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                            Agendar
                        </a>

                        {/* Maps Action */}
                        <a 
                          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(stop.address)}`} 
                          target="_blank" 
                          rel="noreferrer"
                          className="flex items-center px-3 py-1.5 bg-blue-50 text-blue-700 text-sm font-semibold rounded-lg hover:bg-blue-100 border border-blue-200 transition-colors"
                        >
                            Maps
                            <svg className="w-4 h-4 ml-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg>
                        </a>
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