import { GoogleGenAI } from "@google/genai";
import { RawSheetRow, UserPreferences, MultiDayPlan, Team } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// --- DEFAULT RULES CONSTANT ---
export const DEFAULT_DISTRIBUTION_RULES = `1. **Primary Match (Team):** If an activity's Neighborhood AND City match a Team's configured region, assign it to that Team.
2. **Secondary Match (Team):** If only the City matches, assign it.
3. **Fuzzy City Matching (CRITICAL):** Treat "São Bernardo" and "São Bernardo do Campo" as the EXACT SAME city. Treat "SP" as "São Paulo". Ignore capitalization and minor abbreviations.
4. **Member Selection (MANDATORY):** If a Team is selected, you MUST select the best **Member** from that team.
    a. **Availability:** Member must NOT be on vacation (isOnVacation: false).
    b. **Location Proximity:** Calculate the conceptual distance between the member's 'startLocation' and the activity address. "Centro, São Bernardo" is VERY close to "Centro, São Bernardo do Campo".
    c. **Fallback:** If multiple members are available and location is similar, pick any active member. DO NOT leave memberId null if the team has active members.
5. **Reasoning:** You must provide a short 'reason' string explaining why you chose that team/member (e.g., "City Match + Closest Start Location").`;

// Nova função para obter coordenadas de Bairros/Cidades em lote para o Mapa de Calor
export const getRegionCoordinates = async (regions: string[]): Promise<Record<string, { lat: number, lng: number }>> => {
  if (regions.length === 0) return {};

  // Remove duplicates and limit batch size if necessary (handling reasonably sized lists)
  const uniqueRegions = Array.from(new Set(regions));
  
  const prompt = `
    You are a geo-coding assistant.
    I have a list of regions (Neighborhoods/Cities).
    For each region, find the central Latitude and Longitude coordinates using Google Maps.

    REGIONS LIST:
    ${uniqueRegions.join('\n')}

    RETURN:
    A single JSON object where:
    - Keys are exactly the region strings provided.
    - Values are objects with "lat" and "lng" (numbers).
    - If not found, use a central coordinate for the city inferred or return null.

    Example Output format:
    {
      "Pinheiros, São Paulo": { "lat": -23.561, "lng": -46.685 },
      "Centro, Rio de Janeiro": { "lat": -22.906, "lng": -43.172 }
    }
    
    Return ONLY VALID JSON.
  `;

  try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          tools: [{ googleMaps: {} }],
        }
      });
      
      let text = response.text;
      if(!text) return {};

      // Manual JSON extraction
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
          text = jsonMatch[0];
      }

      return JSON.parse(text);
  } catch (e) {
      console.error("Geocoding failed", e);
      throw new Error("Falha ao geocodificar regiões.");
  }
};

// Nova função para verificar ônibus na fase de Setup
export const batchCheckBusStops = async (rows: RawSheetRow[]): Promise<Record<string, string>> => {
  // Filtra apenas linhas com endereço válido
  const validRows = rows.filter(r => r.Endereco && r.Endereco.length > 5);
  if (validRows.length === 0) return {};

  // Para evitar sobrecarregar o contexto, processamos em lotes de 15 se necessário, 
  // mas aqui faremos um prompt único otimizado.
  // UPDATE: Construção de endereço mais robusta (Endereço + Bairro + Município)
  const locations = validRows.map(r => {
      const fullAddress = [r.Endereco, r.Bairro, r.Municipio].filter(Boolean).join(", ");
      return `ID: ${r.id} | Address: ${fullAddress}`;
  }).join('\n');

  const prompt = `
    You are a geo-spatial analyst using Google Maps.
    For each of the following locations (identified by ID), check for a **Bus Stop** within a **300 meter radius**.
    
    LOCATIONS:
    ${locations}

    RETURN:
    A single JSON object where:
    - Keys are the IDs provided.
    - Values are the bus stop description (e.g., "Ponto na Rua X, 100") OR exactly "Nenhum ponto de ônibus a 300m" if none found.
    
    Important: Return ONLY the JSON object. Do not add markdown formatting.
  `;

  try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          tools: [{ googleMaps: {} }],
          // responseMimeType: 'application/json' // REMOVED: Unsupported with Google Maps tool
        }
      });
      
      let text = response.text;
      if(!text) return {};

      // Manual JSON extraction since we can't enforce MIME type
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
          text = jsonMatch[0];
      }

      return JSON.parse(text);
  } catch (e) {
      console.error("Batch Bus Check failed", e);
      throw new Error("Falha ao consultar Google Maps para transporte público.");
  }
};

// --- NEW FUNCTION: AI Distribution ---
export const distributeActivities = async (
    activities: RawSheetRow[], 
    teams: Team[],
    customRules?: string // Optional custom rules injection
): Promise<Record<string, { teamId: string, memberId: string, reason: string }>> => {
    
    // Simplificar dados para o prompt (economia de tokens)
    const simplifiedActivities = activities.map(a => ({
        id: a.id,
        // Send FULL address concatenated to avoid separation issues
        fullAddress: [a.Endereco, a.Bairro, a.Municipio].filter(Boolean).join(", "),
        businessHours: a.HorarioAbertura && a.HorarioFechamento ? `${a.HorarioAbertura}-${a.HorarioFechamento}` : 'Any'
    }));

    const simplifiedTeams = teams.map(t => ({
        id: t.id,
        name: t.name,
        regions: t.regions.map(r => `${r.neighborhood} (${r.city})`).join(', '),
        // Include detailed member info for selection logic
        members: t.members.map(m => ({
            id: m.id,
            name: m.name,
            isOnVacation: m.isOnVacation,
            startLocation: m.preferredStartLocation || 'Headquarters',
            endLocation: m.preferredEndLocation || 'Headquarters',
            // Summarize schedule (just Mon-Fri for brevity context)
            scheduleSummary: m.schedule
                .filter(s => !s.isDayOff)
                .map(s => `${s.dayOfWeek.substr(0,3)}:${s.startTime}-${s.endTime}`)
                .join(', ')
        }))
    }));

    // Use custom rules if provided, otherwise default
    const activeRules = customRules && customRules.trim().length > 0 
        ? customRules 
        : DEFAULT_DISTRIBUTION_RULES;

    const prompt = `
      Act as a Logistics Dispatcher AI.
      
      GOAL: Distribute the following ACTIVITIES among the available TEAMS and specifically assign the best MEMBER.

      RULES TO FOLLOW:
      ${activeRules}

      TEAMS & MEMBERS CONFIGURATION:
      ${JSON.stringify(simplifiedTeams, null, 2)}

      ACTIVITIES TO DISTRIBUTE:
      ${JSON.stringify(simplifiedActivities, null, 2)}

      RETURN:
      A pure JSON object where:
      - Key: Activity ID
      - Value: Object { "teamId": "...", "memberId": "...", "reason": "Short explanation of logic" }
      
      Example: 
      { 
        "activity_id_1": { "teamId": "t1", "memberId": "m1", "reason": "Match City São Bernardo" }, 
        "activity_id_2": { "teamId": "t1", "memberId": "m2", "reason": "Closest start location" } 
      }
    `;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                // responseMimeType: 'application/json' 
            }
        });

        let text = response.text;
        if (!text) return {};

        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            text = jsonMatch[0];
        }

        return JSON.parse(text);

    } catch (e) {
        console.error("Distribution failed", e);
        throw new Error("Falha na distribuição inteligente via IA.");
    }
};

export const generateRoutePlan = async (
  sheetData: RawSheetRow[],
  preferences: UserPreferences,
  currentCoords?: { lat: number; lng: number }
): Promise<MultiDayPlan> => {
  
  const stopsList = sheetData.map(row => {
    let priorityNote = "";
    if (row.priority === 'high') priorityNote = " [PRIORIDADE ALTA: Visitar no início do roteiro]";
    if (row.priority === 'medium') priorityNote = " [PRIORIDADE MÉDIA: Importante mas flexível]";
    if (row.priority === 'lunch') priorityNote = " [VISITA DE ALMOÇO: Agendar próximo de 12:00-13:00]";
    if (row.priority === 'end_of_day') priorityNote = " [FIM DO DIA: Agendar como uma das últimas visitas]";
    
    const timeConstraints = (row.HorarioAbertura || row.HorarioFechamento) 
      ? ` (Horário: ${row.HorarioAbertura || '?'} às ${row.HorarioFechamento || '?'})` 
      : '';
      
    // Include custom parking info if present
    const parkingInfo = row.customParkingInfo 
      ? ` [INFO ESTACIONAMENTO: ${row.customParkingInfo}]` 
      : '';
    
    // Pass pre-checked bus info to Gemini to save tokens/time
    const busInfo = row.nearbyBusStop 
      ? ` [BUS STOP CHECKED: ${row.nearbyBusStop}]` 
      : '';

    // Pass assigned team info if available (Gemini can use this to group or filter if we wanted, but mainly for context)
    const teamInfo = row.assignedTeamId ? ` [EQUIPE ATRIBUIDA ID: ${row.assignedTeamId}]` : '';

    // Utilizar endereço completo também na geração de rota para melhor precisão
    const fullAddress = [row.Endereco, row.Bairro, row.Municipio].filter(Boolean).join(", ") || 'Endereço não especificado';

    return `- ${row.Nome} (${fullAddress}) - Obs: ${row.Observacoes || ''}${timeConstraints}${priorityNote}${parkingInfo}${busInfo}${teamInfo}`;
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

  // Lunch constraint logic
  const lunchInstruction = preferences.needsLunch 
    ? `SIM (Duração: ${preferences.lunchDurationMinutes} min).
       *** REGRA CRÍTICA DE ALMOÇO (HARD CONSTRAINT) ***
       - O intervalo de almoço DEVE OBRIGATORIAMENTE ocorrer DENTRO da janela das 11:50 às 14:00.
       - É PROIBIDO agendar o almoço antes das 11:50 (ex: 10:55 é inaceitável).
       - É PROIBIDO que o almoço termine após as 14:00.
       - Você deve manipular a ordem das visitas para que haja um "buraco" na agenda neste horário. Se necessário, insira tempo de deslocamento ou espera.` 
    : 'NÃO';

  const prompt = `
    Atue como um Solver de Roteirização Avançado (VRP) E um Especialista em Meteorologia Logística.
    
    OBJETIVO: Criar um cronograma de visitas otimizado, minimizando tempo/distância e MAXIMIZANDO A SEGURANÇA e PRECISÃO CLIMÁTICA.
    
    DADOS DO PLANEJAMENTO:
    - Data da Rota: ${preferences.departureDate} (CRÍTICO: Busque a previsão específica para esta data)
    - Início: ${preferences.departureTime}
    - Fim Máximo: ${preferences.returnTime}
    - Duração Visita: ${preferences.visitDurationMinutes} min
    - Partida: ${startLocationStr}
    - Chegada: ${endLocationStr}
    
    PARADAS ESPECIAIS:
    - Almoço: ${lunchInstruction}
    - Escritório: ${officeInstruction}
    - Estacionamento Preferido: ${preferences.parkingPreference}

    LISTA DE CLIENTES:
    ${stopsList}

    --- INSTRUÇÕES DE CUSTOS (FINANCEIRO) ---
    Você deve estimar os custos do dia baseando-se nestes parâmetros:
    1. **Combustível:** Considere um Carro Popular 1.0 a Gasolina (10 km/L, R$ 6,00/L).
    2. **Estacionamento:** 'paid' (R$ 15/parada), 'blue_zone' (R$ 6/parada), 'street' (R$ 0).

    --- INSTRUÇÕES METEOROLÓGICAS (CRÍTICO - VARIAÇÃO TEMPORAL) ---
    Para CADA parada, você DEVE fornecer a temperatura EXATA prevista para o HORÁRIO DE CHEGADA estimado.
    NÃO utilize faixas de temperatura (ex: "25-30°C") e NÃO repita a mesma temperatura para o dia todo.
    
    Lógica Obrigatória:
    1. Use a ferramenta de busca para: "hourly weather forecast [City] [Date]".
    2. Se não encontrar o dado exato, aplique a curva térmica padrão:
       - Manhã (08:00-10:00): Temperatura mais baixa.
       - Meio do Dia (12:00-15:00): Pico de calor (Temperatura Máxima).
       - Final da Tarde (16:00+): Ligeira queda.
    
    Preencha o objeto 'weather':
    - temp: Valor único (ex: "19°C" para uma visita às 08:30, "29°C" para uma visita às 14:00).
    - condition: Condição real do horário (ex: "Neblina" de manhã, "Sol Forte" à tarde).
    - chanceOfRain: Probabilidade de chuva (ex: "10%", "80%").
    - isStormy: true se houver previsão de tempestade, chuva torrencial ou granizo naquele horário específico.

    --- INSTRUÇÕES DE MOBILIDADE URBANA (TRANSPORTE PÚBLICO) ---
    Para CADA endereço:
    1. Se o campo "BUS STOP CHECKED" já estiver presente na descrição do cliente, USE-O.
    2. Se NÃO estiver presente, UTILIZE a ferramenta do Google Maps para investigar arredores (raio 300m).
    
    Campo 'nearbyBusStop' (OBRIGATÓRIO):
    - Se encontrar: Retorne o nome do ponto ou "Ponto na [Nome da Rua] (aprox. Xm)".
    - Se NÃO encontrar no raio de 300m: Retorne exatamente a string "Nenhum ponto de ônibus num raio de 300m".

    --- INSTRUÇÕES DE ANÁLISE DE RISCO ---
    Para CADA parada, avalie o endereço e horário:
    1. **Security:** Bairro perigoso ou horário de risco?
    2. **Flood:** Área de alagamento? (Cruze com a previsão do tempo: Se isStormy=true E flood=true, destaque o risco na descrição).
    3. **Towing:** Risco de guincho?
    4. **Description:** Explique o risco.

    --- ALGORITMO DE OTIMIZAÇÃO APLICADO ---
    1. **Cluster-First:** Agrupe por bairros.
    2. **Time-Windows:** Verifique RIGOROSAMENTE a janela de almoço (11:50-14:00). Se a sequência natural colocar o almoço às 11:00, force uma troca de ordem para empurrá-lo para depois das 11:50.
    3. **Nearest Neighbor:** Minimize deslocamentos.

    FORMATO DE RESPOSTA (JSON Array):
    Retorne APENAS o JSON.
    [
      {
        "dayLabel": "Dia 1",
        "date": "YYYY-MM-DD",
        "summary": "Resumo da rota...",
        "totalDistanceKm": "X km",
        "totalTimeHours": "X h",
        "estimatedFuelCost": "R$ XX,XX",
        "estimatedParkingCost": "R$ XX,XX",
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
                "description": "Texto explicativo" 
            },
            "weather": {
                "temp": "25°C", 
                "condition": "Nublado",
                "chanceOfRain": "10%",
                "isStormy": false
            },
            "nearbyBusStop": "String OBRIGATÓRIA (Descrição ou 'Nenhum ponto...')",
            "parkingSuggestion": "Dica de estacionamento",
            "phoneNumber": "Telefone",
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
        // Habilitamos googleSearch para permitir busca de previsão do tempo em tempo real se necessário
        tools: [{ googleMaps: {}, googleSearch: {} }],
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
