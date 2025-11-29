import React, { useState } from 'react';
import SetupForm from './components/SetupForm';
import Itinerary from './components/Itinerary';
import { UserPreferences, RawSheetRow, MultiDayPlan } from './types';
import { generateRoutePlan } from './services/geminiService';

const App: React.FC = () => {
  const [routePlan, setRoutePlan] = useState<MultiDayPlan | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  
  const handleGenerate = async (prefs: UserPreferences, data: RawSheetRow[]) => {
    setIsLoading(true);
    try {
        let currentCoords;
        if (prefs.useCurrentLocation) {
             try {
                 const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
                     navigator.geolocation.getCurrentPosition(resolve, reject);
                 });
                 currentCoords = {
                     lat: pos.coords.latitude,
                     lng: pos.coords.longitude
                 };
             } catch (e) {
                 console.warn("Geolocation failed, falling back to text");
             }
        }

        const plan = await generateRoutePlan(data, prefs, currentCoords);
        setRoutePlan(plan);
    } catch (error) {
        alert("Erro ao gerar rota: " + (error as Error).message);
    } finally {
        setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 pb-20">
      <header className="bg-white shadow-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
                <div className="bg-blue-600 text-white p-2 rounded-lg">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0121 18.382V7.618a1 1 0 01-.447-.894L15 7m0 13V7m0 0L9.553 4.553A1 1 0 009 4.553L3.553 7.276a1 1 0 00-.553.894v10.764a1 1 0 00.553.894L9 20z"></path></svg>
                </div>
                <h1 className="text-xl font-bold tracking-tight text-gray-800">RotaSmart <span className="text-blue-600 font-light">AI</span></h1>
            </div>
            <div className="text-xs text-gray-500 hidden md:block">Powered by Gemini & Google Maps</div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-10">
        {!routePlan ? (
            <div className="flex flex-col items-center justify-center min-h-[60vh]">
                 <SetupForm onGenerate={handleGenerate} isLoading={isLoading} />
            </div>
        ) : (
            <Itinerary plan={routePlan} onReset={() => setRoutePlan(null)} />
        )}
      </main>
    </div>
  );
};

export default App;