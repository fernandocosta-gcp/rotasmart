import React, { useState, useEffect } from 'react';

const LOGISTICS_TRIVIA = [
  "Você sabia? Otimizar rotas pode economizar até 30% de combustível e tempo.",
  "O Problema do Caixeiro Viajante (TSP) é um dos problemas matemáticos mais famosos da computação.",
  "O Google Maps cobre mais de 99% do mundo habitado, totalizando mais de 60 milhões de quilômetros de estradas.",
  "A IA analisa milhares de combinações possíveis para encontrar a sequência mais eficiente para seu dia.",
  "Em grandes metrópoles, planejar paradas agrupadas por bairro reduz o estresse no trânsito em 40%.",
  "O algoritmo 'Nearest Neighbor' (Vizinho Mais Próximo) é uma das heurísticas mais antigas de roteirização.",
  "Sua rota está sendo calculada considerando horários de pico e janelas de atendimento."
];

const TV_TRIVIA = [
  "Friends: A estátua do cachorro branco de Joey pertencia originalmente a Jennifer Aniston, que ganhou de presente de boa sorte.",
  "The Sopranos: Em 'Pine Barrens', Paulie e Christopher ficam perdidos na neve, episódio dirigido por Steve Buscemi.",
  "Stranger Things: Mais de 1.200 crianças fizeram testes para os papéis principais antes do elenco final ser escolhido.",
  "The Last of Us: O fungo Cordyceps é real, mas na vida real ele afeta principalmente insetos, não humanos (ainda!).",
  "Friends: O elenco principal negociava seus salários em conjunto, chegando a ganhar US$ 1 milhão por episódio na última temporada.",
  "The Sopranos: A cena final com o corte abrupto para preto (Cut to Black) ainda é uma das mais debatidas da história da TV.",
  "Stranger Things: Os criadores se inspiraram em Stephen King e Steven Spielberg, usando fontes e estéticas dos anos 80.",
  "The Last of Us: Ellie é imune porque o fungo em seu cérebro sofreu uma mutação desde o nascimento.",
  "Friends: A moldura dourada no olho mágico da porta de Monica era originalmente um espelho que quebrou."
];

interface LoadingModalProps {
    type?: 'route' | 'bus';
}

const LoadingModal: React.FC<LoadingModalProps> = ({ type = 'route' }) => {
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState("Iniciando...");
  const [triviaIndex, setTriviaIndex] = useState(0);

  const activeTrivia = type === 'bus' ? TV_TRIVIA : LOGISTICS_TRIVIA;

  // Simula o progresso com fases distintas para parecer mais realista
  useEffect(() => {
    const interval = setInterval(() => {
      setProgress((prev) => {
        let increment = 0;
        let next = prev;

        // Fase 1: Análise Inicial (0-25%) - Rápida
        if (prev < 25) {
           increment = 1.5; 
        }
        // Fase 2: Processamento AI / Segurança (25-60%) - Média
        else if (prev < 60) {
           increment = 0.4; 
        }
        // Fase 3: Otimização (60-85%) - Lenta
        else if (prev < 85) {
           increment = 0.2; 
        }
        // Fase 4: Finalização (85-95%) - Muito Lenta
        else if (prev < 95) {
           increment = 0.05; 
        }
        // Trava em 95% até o componente ser desmontado (conclusão real)
        else {
           return 95;
        }

        next = prev + increment;
        
        // Atualiza o texto baseado na porcentagem atual e no TIPO
        if (type === 'route') {
            if (next < 25) setStatusText("Lendo lista de endereços e prioridades...");
            else if (next < 50) setStatusText("Analisando riscos de segurança e geolocalização...");
            else if (next < 75) setStatusText("Calculando distâncias e agrupando visitas...");
            else setStatusText("Finalizando roteiro e gerando horários...");
        } else {
            if (next < 25) setStatusText("Lendo endereços dos clientes...");
            else if (next < 50) setStatusText("Consultando base de transporte público...");
            else if (next < 75) setStatusText("Calculando distâncias de caminhada (300m)...");
            else setStatusText("Atualizando endereços na planilha...");
        }

        return next;
      });
    }, 100); // Atualiza a cada 100ms

    return () => clearInterval(interval);
  }, [type]);

  // Rotaciona curiosidades a cada 5 segundos
  useEffect(() => {
    const interval = setInterval(() => {
      setTriviaIndex((prev) => (prev + 1) % activeTrivia.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [activeTrivia]);

  // Animação de "pulo" do Dino (toggle frame)
  const [legFrame, setLegFrame] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setLegFrame(prev => prev === 0 ? 1 : 0), 150);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-gray-900/80 backdrop-blur-sm transition-opacity">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-8 relative overflow-hidden">
        
        <div className="text-center mb-8">
          <h3 className="text-2xl font-bold text-gray-800 mb-1">
              {type === 'bus' ? 'Localizando Pontos de Ônibus' : 'Otimizando sua Rota'}
          </h3>
          <p className="text-blue-600 text-sm font-medium animate-pulse">{statusText}</p>
        </div>

        {/* Scene Container */}
        <div className="relative h-32 w-full mb-6 border-b border-gray-200">
            
            {/* Moving Clouds (CSS Animation) */}
            <div className="absolute top-2 left-0 w-full h-full overflow-hidden pointer-events-none opacity-30">
                 <div className="absolute top-2 animate-[float_10s_linear_infinite]" style={{ left: '10%' }}>☁️</div>
                 <div className="absolute top-6 animate-[float_15s_linear_infinite]" style={{ left: '60%' }}>☁️</div>
                 <div className="absolute top-1 animate-[float_12s_linear_infinite]" style={{ left: '90%' }}>☁️</div>
            </div>

            {/* Dino & Progress Wrapper */}
            <div className="absolute bottom-0 left-0 w-full">
                {/* Dino positioned based on progress */}
                <div 
                    className="absolute bottom-4 transition-all duration-300 ease-linear"
                    style={{ left: `calc(${progress}% - 24px)` }}
                >
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-gray-800">
                        {/* Simple Pixel Art Style Dino Path */}
                        <path d="M22 10V4H20V2H12V4H10V6H8V8H6V10H4V14H2V18H6V16H8V14H10V16H12V18H14V16H16V14H18V12H20V10H22Z" fill="currentColor"/>
                        {/* Eye */}
                        <rect x="14" y="4" width="2" height="2" fill="white"/>
                        {/* Legs - Animated */}
                        {legFrame === 0 ? (
                             <path d="M8 18V22H10V18H8ZM14 18V22H16V18H14Z" fill="currentColor"/>
                        ) : (
                             <path d="M8 18V20H6V22H10V18H8ZM14 18V20H12V22H16V18H14Z" fill="currentColor"/>
                        )}
                    </svg>
                    {/* Speech Bubble */}
                    <div className="absolute -top-8 -right-8 bg-blue-100 text-blue-800 text-[10px] font-bold px-2 py-1 rounded-lg rounded-bl-none whitespace-nowrap opacity-90">
                        {Math.floor(progress)}%
                    </div>
                </div>

                {/* Progress Bar Track */}
                <div className="w-full h-4 bg-gray-100 rounded-full overflow-hidden relative">
                    {/* Progress Bar Fill */}
                    <div 
                        className="h-full bg-gradient-to-r from-blue-400 to-indigo-600 transition-all duration-300 ease-linear relative"
                        style={{ width: `${progress}%` }}
                    >
                         {/* Striped pattern overlay */}
                        <div className="absolute inset-0 w-full h-full bg-[length:20px_20px] bg-[linear-gradient(45deg,rgba(255,255,255,0.2)_25%,transparent_25%,transparent_50%,rgba(255,255,255,0.2)_50%,rgba(255,255,255,0.2)_75%,transparent_75%,transparent)] animate-[moveStripe_1s_linear_infinite]"></div>
                    </div>
                </div>
            </div>
        </div>

        {/* Trivia Section */}
        <div className="bg-blue-50 rounded-xl p-4 min-h-[80px] flex items-center justify-center transition-all duration-500">
             <div key={triviaIndex} className="text-center animate-fade-in">
                 <span className="text-blue-500 text-xs font-bold uppercase tracking-wider block mb-1">
                     {type === 'bus' ? 'Curiosidade Geek/TV' : 'Curiosidade Logística'}
                 </span>
                 <p className="text-gray-700 text-sm font-medium">{activeTrivia[triviaIndex]}</p>
             </div>
        </div>

        <style>{`
          @keyframes moveStripe {
            0% { background-position: 0 0; }
            100% { background-position: 20px 20px; }
          }
          @keyframes float {
            0% { transform: translateX(0); }
            100% { transform: translateX(-200px); }
          }
          .animate-fade-in {
            animation: fadeIn 0.5s ease-in-out;
          }
          @keyframes fadeIn {
            from { opacity: 0; transform: translateY(5px); }
            to { opacity: 1; transform: translateY(0); }
          }
        `}</style>

      </div>
    </div>
  );
};

export default LoadingModal;