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

    return `- ${row.Nome} (${row.Endereco || 'Endereço não especificado'}) - Obs: ${row.Observacoes || ''}${timeConstraints}${priorityNote}`;
  }).join('\n');

  // Determine locations
  const startLocationStr = preferences.useCurrentLocation 
    ? 'Minha localização atual (lat/long fornecida)' 
    : preferences.startLocation;

  const endLocationStr = preferences.returnToStart 
    ? startLocationStr 
    : preferences.endLocation;

  const prompt = `
    Atue como um especialista avançado em logística e roteirização urbana.
    
    OBJETIVO: Criar um cronograma de visitas otimizado, DIVIDIDO EM MÚLTIPLOS DIAS se necessário, respeitando estritamente os horários limites e as PRIORIDADES definidas.
    
    DADOS DO PLANEJAMENTO:
    - Data de Início: ${preferences.departureDate}
    - Horário de Saída Diária: ${preferences.departureTime}
    - Horário MÁXIMO de Retorno (Fim da jornada): ${preferences.returnTime}
    - Duração Fixa por Visita: ${preferences.visitDurationMinutes} minutos
    - Local de Partida (Início): ${startLocationStr}
    - Local de Chegada (Fim): ${endLocationStr}
    
    PARADAS OBRIGATÓRIAS (Inserir estrategicamente a cada dia se necessário):
    - Abastecer? ${preferences.needsFuel ? 'SIM' : 'NÃO'}
    - Passar no escritório? ${preferences.needsOfficePickup ? 'SIM' : 'NÃO'}
    - Almoço? ${preferences.needsLunch ? 'SIM (1 hora)' : 'NÃO'}
    - Preferência de Estacionamento: ${preferences.parkingPreference === 'blue_zone' ? 'Zona Azul' : preferences.parkingPreference === 'paid' ? 'Estacionamento Pago' : 'Rua/Livre'}

    LISTA DE CLIENTES E PRIORIDADES:
    ${stopsList}

    REGRAS DE OURO:
    1. **Prioridades**: Respeite RIGOROSAMENTE as marcações [PRIORIDADE ALTA], [VISITA DE ALMOÇO] e [FIM DO DIA]. Se um cliente tem prioridade alta, ele deve ser um dos primeiros.
    2. **Respeito ao Tempo**: Você deve somar o tempo de deslocamento + tempo de visita (${preferences.visitDurationMinutes} min) para cada parada.
    3. **Ponto de Partida e Chegada**: A rota de CADA dia deve começar no "Local de Partida" e deve ser desenhada para terminar próxima ao "Local de Chegada" no final do expediente.
    4. **Divisão em Dias**: Se a soma dos tempos ultrapassar o Horário Máximo de Retorno (${preferences.returnTime}), encerre o dia, mande o motorista para o Local de Chegada, e inicie um "Dia 2" (dia seguinte) com as visitas restantes. Continue criando dias até zerar a lista.
    5. **Geolocalização**: Use a ferramenta Google Maps para validar endereços e estimar tempos reais de trânsito. Agrupe visitas próximas no mesmo dia para economizar tempo, desde que não viole as prioridades.
    6. **Riscos**: Verifique alagamentos e zonas de guincho.
    7. **Formato**: Retorne APENAS o JSON. Não use markdown. Não escreva introduções.

    FORMATO DE RESPOSTA (JSON Array):
    [
      {
        "dayLabel": "Dia 1",
        "date": "YYYY-MM-DD",
        "summary": "Resumo da rota do dia 1",
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
            "durationMinutes": ${preferences.visitDurationMinutes}, // (ou tempo de almoço/posto)
            "notes": "Nota sobre deslocamento ou parada",
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