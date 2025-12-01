import { GoogleGenAI } from "@google/genai";
import { RawSheetRow, UserPreferences, MultiDayPlan } from "../types";

export const generateRoutePlan = async (
  sheetData: RawSheetRow[],
  preferences: UserPreferences,
  currentCoords?: { lat: number; lng: number }
): Promise<MultiDayPlan> => {
  
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const stopsList = sheetData.map(row => {
    let priorityNote = "";
    if (row.priority === 'high') priorityNote = " [PRIORIDADE ALTA: Visitar no início do roteiro]";
    if (row.priority === 'lunch') priorityNote = " [VISITA DE ALMOÇO: Agendar próximo de 12:00-13:00]";
    if (row.priority === 'end_of_day') priorityNote = " [FIM DO DIA: Agendar como uma das últimas visitas]";
    
    const timeConstraints = (row.HorarioAbertura || row.HorarioFechamento) 
      ? ` (Horário: ${row.HorarioAbertura || '?'} às ${row.HorarioFechamento || '?'})` 
      : '';
      
    // Include custom parking info if present
    const parkingInfo = row.customParkingInfo 
      ? ` [INFO ESTACIONAMENTO: ${row.customParkingInfo}]` 
      : '';

    return `- ${row.Nome} (${row.Endereco || 'Endereço não especificado'}) - Obs: ${row.Observacoes || ''}${timeConstraints}${priorityNote}${parkingInfo}`;
  }).join('\n');

  // Determine locations
  const startLocationStr = preferences.useCurrentLocation 
    ? 'Minha localização atual (lat/long fornecida)' 
    : preferences.startLocation;

  const endLocationStr = preferences.returnToStart 
    ? startLocationStr 
    : preferences.endLocation;

  // Build Office Instruction
  let officeInstruction = "NÃO";
  if (preferences.officeSettings.enabled) {
      const freqMap: Record<string, string> = {
          'all_days': 'Todos os dias da rota',
          'first_day': 'Apenas no 1º dia',
          'last_day': 'Apenas no último dia da rota'
      };
      const timingMap: Record<string, string> = {
          'morning': 'Manhã (após a saída)',
          'lunch': 'Próximo ao almoço',
          'afternoon': 'Final da tarde (antes do encerramento)'
      };
      
      officeInstruction = `SIM.
      - Frequência: ${freqMap[preferences.officeSettings.frequency]}
      - Horário Preferencial: ${timingMap[preferences.officeSettings.timing]}
      - Duração da parada: ${preferences.officeSettings.durationMinutes} minutos`;
  }

  const prompt = `
    Atue como um Solver de Roteirização Avançado (VRP) E um Especialista em Segurança Logística Urbana.
    
    OBJETIVO: Criar um cronograma de visitas otimizado, minimizando tempo/distância e MAXIMIZANDO A SEGURANÇA.
    
    DADOS DO PLANEJAMENTO:
    - Início: ${preferences.departureDate} às ${preferences.departureTime}
    - Fim Máximo: ${preferences.returnTime}
    - Duração Visita: ${preferences.visitDurationMinutes} min
    - Partida: ${startLocationStr}
    - Chegada: ${endLocationStr}
    
    PARADAS ESPECIAIS:
    - Almoço: ${preferences.needsLunch ? `SIM (${preferences.lunchDurationMinutes} min)` : 'NÃO'}
    - Escritório: ${officeInstruction}
    - Estacionamento Preferido: ${preferences.parkingPreference}

    LISTA DE CLIENTES:
    ${stopsList}

    --- INSTRUÇÕES DE ANÁLISE DE RISCO (CRÍTICO) ---
    Para CADA parada, você deve avaliar o endereço e o horário estimado de chegada para preencher o objeto 'risks':
    1. **Security (Segurança):** O bairro/região é considerado perigoso (roubo de carga/veículo) historicamente? O horário da visita (ex: tarde da noite) aumenta esse risco? Marque 'security': true se houver risco real.
    2. **Flood (Alagamento):** A região é uma baixada ou conhecida por enchentes (ex: marginais, vales)? 
    3. **Towing (Guincho):** É uma região central com fiscalização de trânsito agressiva e pouca vaga de rua?
    4. **Description:** Se houver qualquer risco (true), escreva uma frase curta e direta explicando o motivo (ex: "Área com alto índice de roubos à noite" ou "Zona de difícil estacionamento, risco de multa").

    --- ALGORITMO DE OTIMIZAÇÃO APLICADO ---
    Para garantir eficiência matemática e lógica, aplique a seguinte metodologia passo-a-passo:
    
    1. **Cluster-First (Agrupamento):** 
       Agrupe as visitas por proximidade geográfica (bairros ou zonas). O roteiro deve esgotar um cluster antes de mover para o próximo para evitar deslocamentos pendulares improdutivos.
    
    2. **Nearest Neighbor com Refinamento 2-Opt:**
       Dentro de cada cluster, ordene as paradas utilizando a lógica do "Vizinho Mais Próximo" a partir do ponto anterior.
       Verifique se há cruzamentos de rota óbvios (ex: ir do ponto A ao C passando pelo B, quando A->B->C é mais curto) e corrija-os (simulação de 2-Opt).

    3. **Restrições Hard & Soft:**
       - **Hard:** Janelas de horário de funcionamento e almoço DEVEM ser respeitadas.
       - **Soft:** Evite áreas de risco ('security': true) no final do dia (após as 17h/18h). Priorize estas áreas para o período da manhã/tarde cedo.

    4. **Multi-Dia:**
       Se o tempo total exceder o limite do dia, divida o roteiro em múltiplos dias mantendo a lógica de clusters (ex: Dia 1 Zona Norte, Dia 2 Zona Sul).

    FORMATO DE RESPOSTA (JSON Array):
    Retorne APENAS o JSON.
    [
      {
        "dayLabel": "Dia 1",
        "date": "YYYY-MM-DD",
        "summary": "Resumo da rota focado na lógica utilizada (ex: 'Roteiro focado na Zona Sul com paradas agrupadas')",
        "totalDistanceKm": "X km",
        "totalTimeHours": "X h",
        "stops": [
          {
            "id": "uuid",
            "order": 1,
            "name": "Nome",
            "type": "Cliente",
            "address": "Endereço Completo",
            "estimatedArrival": "HH:MM",
            "durationMinutes": ${preferences.visitDurationMinutes},
            "notes": "Obs logística",
            "risks": { 
                "flood": boolean, 
                "towing": boolean, 
                "security": boolean, 
                "description": "Texto explicativo do risco ou null" 
            },
            "parkingSuggestion": "Dica de onde parar baseada na preferência ${preferences.parkingPreference}",
            "phoneNumber": "Telefone se houver",
            "coordinates": { "lat": 0, "lng": 0 }
          }
        ]
      }
    ]
  `;

  // Prepare retrieval config if coordinates exist
  const toolConfig = currentCoords ? {
    retrievalConfig: {
      latLng: {
        latitude: currentCoords.lat,
        longitude: currentCoords.lng
      }
    }
  } : undefined;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        tools: [{ googleMaps: {} }],
        toolConfig: toolConfig,
      }
    });

    let text = response.text;
    if (!text) throw new Error("Sem resposta do Gemini");

    // Robust JSON Extraction Logic
    const arrayMatch = text.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      text = arrayMatch[0];
    } else {
      const objectMatch = text.match(/\{[\s\S]*\}/);
      if (objectMatch) {
        text = objectMatch[0];
      } else {
        console.error("Invalid JSON response:", text.substring(0, 200));
        throw new Error("A resposta da IA não está no formato JSON esperado.");
      }
    }

    // Parsing logic
    let result;
    try {
        result = JSON.parse(text);
    } catch (e) {
        console.error("JSON Parse Error:", e, text);
        throw new Error("Erro de sintaxe no JSON gerado pela IA.");
    }
    
    if (Array.isArray(result)) {
      return result as MultiDayPlan;
    } else if (typeof result === 'object' && result !== null) {
      if ('stops' in result) {
         return [{
            dayLabel: "Dia 1",
            date: preferences.departureDate,
            ...result
         }] as any as MultiDayPlan;
      }
      return [result] as any as MultiDayPlan;
    }
    
    throw new Error("Formato de resposta inválido (estrutura incorreta)");

  } catch (error) {
    console.error("Error generating route:", error);
    throw new Error("Falha ao gerar a rota. " + (error as Error).message);
  }
};