
import React, { useState } from 'react';
import SetupForm from './components/SetupForm';
import Itinerary from './components/Itinerary';
import LoadingModal from './components/LoadingModal';
import TeamManagementModal from './components/TeamManagementModal'; // Import
import { UserPreferences, RawSheetRow, MultiDayPlan } from './types';
import { generateRoutePlan } from './services/geminiService';

const App: React.FC = () => {
  const [routePlan, setRoutePlan] = useState<MultiDayPlan | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showTeamModal, setShowTeamModal] = useState(false); // State for Team Modal
  
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
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between h-20">
            {/* LEFT SIDE: Logo + Title */}
            <div className="flex items-center gap-6">
                <img 
                    src="https://storage.googleapis.com/produtopoc/logo.png" 
                    alt="RotaSmart Logo" 
                    className="object-contain"
                    style={{ width: '190px', height: '50px', display: 'block' }}
                />
                
                {/* Vertical Divider */}
                <div className="h-10 w-px bg-yellow-600/20 hidden md:block"></div>

                {/* Title moved from SetupForm */}
                <div className="hidden md:flex flex-col justify-center">
                    <h1 className="text-2xl font-bold text-gray-900 leading-tight">Planejar Rotas</h1>
                    <p className="text-sm text-gray-800/80">Configure sua jornada e revise seus clientes.</p>
                </div>
            </div>
            
            {/* RIGHT SIDE: Controls & Footer Text */}
            <div className="flex flex-col items-end justify-center gap-1 h-full">
                <button 
                    onClick={() => setShowTeamModal(true)}
                    className="hidden md:flex items-center gap-2 bg-white/50 hover:bg-white text-gray-800 px-3 py-1.5 rounded-lg text-sm font-bold transition-colors border border-black/5"
                >
                    <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>
                    Equipes & Pessoas
                </button>
                <div className="text-[10px] text-gray-800 font-medium mt-auto">Powered by Gemini & Google Maps</div>
            </div>
        </div>
      </header>

      {/* Render Team Modal */}
      {showTeamModal && <TeamManagementModal onClose={() => setShowTeamModal(false)} />}

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