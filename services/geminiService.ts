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
    Atue como um Solver de Roteirização Avançado (Vehicle Routing Problem - VRP).
    
    OBJETIVO: Criar um cronograma de visitas otimizado, DIVIDIDO EM MÚLTIPLOS DIAS se necessário, minimizando a distância total e o tempo de deslocamento.
    
    ESTRATÉGIA ALGORÍTMICA APLICADA:
    Utilize uma abordagem híbrida simulando as seguintes heurísticas:
    1. **Clustering (Agrupamento Geográfico):** Agrupe as visitas que estão geograficamente próximas (bairros/regiões vizinhas) no mesmo dia para evitar deslocamentos longos desnecessários.
    2. **Nearest Neighbor (Vizinho Mais Próximo):** A partir do ponto atual, selecione o próximo ponto mais próximo que atenda às restrições de tempo, criando uma cadeia lógica.
    3. **Sweep Algorithm (Varredura):** Organize as paradas em um fluxo direcional lógico (ex: sentido horário ou linear) para evitar cruzamentos de rota (ziguezague) e retornos (backtracking).
    
    DADOS DO PLANEJAMENTO:
    - Data de Início: ${preferences.departureDate}
    - Horário de Saída Diária: ${preferences.departureTime}
    - Horário MÁXIMO de Retorno (Fim da jornada): ${preferences.returnTime}
    - Duração Fixa por Visita (Cliente): ${preferences.visitDurationMinutes} minutos
    - Local de Partida (Início): ${startLocationStr}
    - Local de Chegada (Fim): ${endLocationStr}
    
    PARADAS OBRIGATÓRIAS E REGRAS ESPECIAIS:
    - Abastecer? ${preferences.needsFuel ? 'SIM' : 'NÃO'}
    - Almoço? ${preferences.needsLunch ? 'SIM (1 hora - Janela 11:30 a 13:30)' : 'NÃO'}
    - Preferência de Estacionamento: ${preferences.parkingPreference === 'blue_zone' ? 'Zona Azul' : preferences.parkingPreference === 'paid' ? 'Estacionamento Pago' : 'Rua/Livre'}
    
    --- CONFIGURAÇÃO DO ESCRITÓRIO ---
    - Passar no escritório? ${officeInstruction}
    ----------------------------------

    LISTA DE CLIENTES E PRIORIDADES (Input Nodes):
    ${stopsList}

    REGRAS DE RESTRIÇÃO (Hard Constraints):
    1. **Prioridades**: Respeite RIGOROSAMENTE as marcações [PRIORIDADE ALTA], [VISITA DE ALMOÇO] e [FIM DO DIA]. Prioridades altas "furam" a fila lógica, mas tente encaixá-las sem destruir a eficiência geográfica se possível.
    2. **Respeito ao Tempo**: Você deve somar o tempo de deslocamento (estimativa realista de trânsito urbano) + tempo de visita (${preferences.visitDurationMinutes} min) para cada parada.
    3. **Ciclo Diário**: A rota de CADA dia deve começar no "Local de Partida" e deve ser desenhada para terminar próxima ao "Local de Chegada" no final do expediente.
    4. **Múltiplos Dias**: Se a soma dos tempos ultrapassar o Horário Máximo de Retorno (${preferences.returnTime}), encerre o dia (retorne ao fim) e inicie um novo dia com os nós restantes.
    5. **Lógica do Escritório**: Se "Passar no escritório" for SIM, trate como um nó obrigatório respeitando a janela de tempo solicitada.
    6. **Geolocalização**: Use o conhecimento do Google Maps para validar a proximidade real.
    7. **Info Estacionamento**: Se a visita tiver [INFO ESTACIONAMENTO], inclua esse texto EXATAMENTE como está no campo "parkingSuggestion".

    FORMATO DE RESPOSTA (JSON Array):
    Retorne APENAS o JSON. Sem markdown, sem explicações.
    [
      {
        "dayLabel": "Dia 1",
        "date": "YYYY-MM-DD",
        "summary": "Resumo estratégico da rota (ex: Zona Sul -> Centro)",
        "totalDistanceKm": "X km",
        "totalTimeHours": "X horas",
        "stops": [
          {
            "id": "unique_id",
            "order": 1,
            "name": "Nome",
            "type": "Cliente",
            "address": "Endereço",
            "estimatedArrival": "HH:MM",
            "durationMinutes": ${preferences.visitDurationMinutes},
            "notes": "Motivo da sequência (ex: 'Próximo ao anterior')",
            "risks": { "flood": boolean, "towing": boolean, "description": "..." },
            "parkingSuggestion": "...",
            "phoneNumber": "...",
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
        throw new Error("A resposta da IA não está no formato JSON esperado. Verifique se a lista de endereços é válida.");
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