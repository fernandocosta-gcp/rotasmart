import React, { useState } from 'react';
import SetupForm from './components/SetupForm';
import Itinerary from './components/Itinerary';
import LoadingModal from './components/LoadingModal';
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
      <header className="bg-[#ffe600] shadow-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
            <div className="flex items-center">
                <img 
                    src="https://storage.googleapis.com/produtopoc/logo.png" 
                    alt="RotaSmart Logo" 
                    className="object-contain"
                    style={{ width: '190px', height: '50px', display: 'block' }}
                />
            </div>
            <div className="text-xs text-gray-900 font-medium hidden md:block">Powered by Gemini & Google Maps</div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-10">
        {isLoading && <LoadingModal />}
        
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