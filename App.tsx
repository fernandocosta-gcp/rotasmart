import React, { useState, useEffect } from 'react';
import SetupForm from './components/SetupForm';
import Itinerary from './components/Itinerary';
import LoadingModal from './components/LoadingModal';
import TeamManagementModal from './components/TeamManagementModal';
import SettingsModal from './components/SettingsModal'; 
import { UserPreferences, RawSheetRow, MultiDayPlan, Team } from './types';
import { generateRoutePlan, DEFAULT_DISTRIBUTION_RULES } from './services/geminiService';

const App: React.FC = () => {
  const [routePlan, setRoutePlan] = useState<MultiDayPlan | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showTeamModal, setShowTeamModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  
  // LIFTED STATE: Teams management moved here to share data between Modal and Form
  const [teams, setTeams] = useState<Team[]>([]);

  // RULES STATE: Management of distribution prompt
  const [distributionRules, setDistributionRules] = useState<string>(DEFAULT_DISTRIBUTION_RULES);

  // Load Teams and Rules on Mount
  useEffect(() => {
    // Teams
    const savedTeams = localStorage.getItem('rotaSmart_teams');
    if (savedTeams) {
        try {
            setTeams(JSON.parse(savedTeams));
        } catch (e) {
            console.error("Erro ao carregar times do storage", e);
        }
    }

    // Rules
    const savedRules = localStorage.getItem('rotaSmart_distRules');
    if (savedRules) {
        setDistributionRules(savedRules);
    }
  }, []);

  // Save Teams on Change
  useEffect(() => {
    localStorage.setItem('rotaSmart_teams', JSON.stringify(teams));
  }, [teams]);

  // Save Rules handler
  const handleSaveRules = (newRules: string) => {
      setDistributionRules(newRules);
      localStorage.setItem('rotaSmart_distRules', newRules);
  };
  
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
        <div className="w-full max-w-[2500px] mx-auto px-6 py-3 flex items-center justify-between h-20">
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

                {/* Title */}
                <div className="hidden md:flex flex-col justify-center">
                    <h1 className="text-2xl font-bold text-gray-900 leading-tight">Planejar Rotas</h1>
                    <p className="text-sm text-gray-800/80">Configure sua jornada e revise seus clientes.</p>
                </div>
            </div>
            
            {/* RIGHT SIDE: Controls & Footer Text */}
            <div className="flex flex-col items-end justify-center gap-1 h-full">
                <div className="flex items-center gap-2">
                    <button 
                        onClick={() => setShowTeamModal(true)}
                        className="hidden md:flex items-center gap-2 bg-white/50 hover:bg-white text-gray-800 px-3 py-1.5 rounded-lg text-sm font-bold transition-colors border border-black/5"
                    >
                        <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>
                        Equipes ({teams.length})
                    </button>
                    
                    <button 
                        onClick={() => setShowSettingsModal(true)}
                        className="p-1.5 rounded-lg bg-white/50 hover:bg-white text-gray-700 border border-black/5 transition-colors"
                        title="Configurações (Regras de IA)"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                    </button>
                </div>
                <div className="text-[10px] text-gray-800 font-medium mt-auto">Powered by Gemini & Google Maps</div>
            </div>
        </div>
      </header>

      {/* Render Team Modal with Props */}
      {showTeamModal && (
          <TeamManagementModal 
              onClose={() => setShowTeamModal(false)} 
              teams={teams}
              setTeams={setTeams}
          />
      )}

      {/* Render Settings Modal */}
      {showSettingsModal && (
          <SettingsModal
              onClose={() => setShowSettingsModal(false)}
              currentRules={distributionRules}
              onSave={handleSaveRules}
          />
      )}

      <main className="w-full max-w-[2500px] mx-auto px-6 py-8">
        {isLoading && <LoadingModal />}
        
        {!routePlan ? (
            <div className="flex flex-col items-center justify-center min-h-[60vh]">
                 {/* Pass teams AND rules to SetupForm */}
                 <SetupForm 
                    onGenerate={handleGenerate} 
                    isLoading={isLoading} 
                    teams={teams}
                    distributionRules={distributionRules}
                 />
            </div>
        ) : (
            <Itinerary plan={routePlan} onReset={() => setRoutePlan(null)} />
        )}
      </main>
    </div>
  );
};

export default App;