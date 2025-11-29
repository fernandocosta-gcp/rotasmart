import React, { useState } from 'react';
import { MultiDayPlan, EstablishmentType } from '../types';

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
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center">
            <div>
                <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-xl font-bold text-gray-900">{currentDay.dayLabel} - {currentDay.date}</h3>
                </div>
                <p className="text-gray-600 text-sm mb-3">{currentDay.summary}</p>
                <div className="flex space-x-6 text-gray-700 text-sm">
                    <div className="flex items-center bg-blue-50 px-3 py-1 rounded-lg">
                        <svg className="w-4 h-4 mr-2 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                        <span className="font-semibold">{currentDay.totalTimeHours}</span>
                    </div>
                    <div className="flex items-center bg-blue-50 px-3 py-1 rounded-lg">
                        <svg className="w-4 h-4 mr-2 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"></path></svg>
                        <span className="font-semibold">{currentDay.totalDistanceKm}</span>
                    </div>
                    <div className="flex items-center bg-blue-50 px-3 py-1 rounded-lg">
                        <svg className="w-4 h-4 mr-2 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                        <span className="font-semibold">{currentDay.stops.length} Paradas</span>
                    </div>
                </div>
            </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="relative border-l-4 border-blue-100 ml-4 md:ml-6 space-y-8 pb-8">
        {currentDay.stops.map((stop, index) => (
          <div key={index} className="relative pl-6 md:pl-8">
            {/* Dot on Timeline */}
            <div className="absolute -left-3.5 top-6 w-7 h-7 rounded-full bg-white border-4 border-blue-500 flex items-center justify-center z-10">
                <span className="text-xs font-bold text-blue-700">{stop.order}</span>
            </div>

            {/* Card */}
            <div className="bg-white rounded-xl shadow-md hover:shadow-lg transition-shadow p-5 border border-gray-100">
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

              <p className="text-gray-600 text-sm mb-4 flex items-start">
                <svg className="w-4 h-4 mr-1 mt-0.5 flex-shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                {stop.address}
              </p>

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

              {/* Risks/Warnings */}
              {(stop.risks.flood || stop.risks.towing) && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 flex items-start">
                      <svg className="w-5 h-5 text-red-500 mr-2 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                      <div className="text-sm text-red-800">
                          <p className="font-bold">Atenção:</p>
                          <ul className="list-disc pl-4 mt-1">
                              {stop.risks.flood && <li>Risco de Alagamento na região</li>}
                              {stop.risks.towing && <li>Zona sujeita a guincho (Proibido Estacionar)</li>}
                              {stop.risks.description && <li className="italic">{stop.risks.description}</li>}
                          </ul>
                      </div>
                  </div>
              )}

              <div className="flex justify-between items-center pt-3 border-t border-gray-100">
                  <span className="text-xs text-gray-400 italic">{stop.notes}</span>
                  <a 
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(stop.address)}`} 
                    target="_blank" 
                    rel="noreferrer"
                    className="text-blue-600 hover:text-blue-800 font-semibold text-sm flex items-center"
                  >
                      Abrir no Maps
                      <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg>
                  </a>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Itinerary;