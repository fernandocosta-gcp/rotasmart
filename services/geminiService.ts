
import { GoogleGenAI } from "@google/genai";
import { RawSheetRow, UserPreferences, MultiDayPlan, Team, TeamMember, DailyItinerary } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// --- HELPERS ---
const getDayOfWeekPT = (dateString: string): string => {
    // Cria data garantindo timezone correto (append T12:00 para evitar flutuação de fuso)
    const date = new Date(`${dateString}T12:00:00`);
    const days = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
    return days[date.getDay()];
};

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

export const batchCheckBusStops = async (rows: RawSheetRow[]): Promise<Record<string, string>> => {
  const validRows = rows.filter(r => r.Endereco && r.Endereco.length > 5);
  if (validRows.length === 0) return {};

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
        }
      });
      
      let text = response.text;
      if(!text) return {};

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

export const distributeActivities = async (
    activities: RawSheetRow[], 
    teams: Team[],
    customRules?: string
): Promise<Record<string, { teamId: string, memberId: string, reason: string }>> => {
    
    const simplifiedActivities = activities.map(a => ({
        id: a.id,
        fullAddress: [a.Endereco, a.Bairro, a.Municipio].filter(Boolean).join(", "),
        businessHours: a.HorarioAbertura && a.HorarioFechamento ? `${a.HorarioAbertura}-${a.HorarioFechamento}` : 'Any'
    }));

    const simplifiedTeams = teams.map(t => ({
        id: t.id,
        name: t.name,
        regions: t.regions.map(r => `${r.neighborhood} (${r.city})`).join(', '),
        members: t.members.map(m => ({
            id: m.id,
            name: m.name,
            isOnVacation: m.isOnVacation,
            startLocation: m.preferredStartLocation || 'Headquarters',
            endLocation: m.preferredEndLocation || 'Headquarters',
            scheduleSummary: m.schedule
                .filter(s => !s.isDayOff)
                .map(s => `${s.dayOfWeek.substr(0,3)}:${s.startTime}-${s.endTime}`)
                .join(', ')
        }))
    }));

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
            config: {}
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
  currentCoords?: { lat: number; lng: number },
  teams: Team[] = [] 
): Promise<MultiDayPlan> => {
  
  // 1. Agrupar dados por Membro Atribuído
  const assignedData = sheetData.filter(r => r.assignedMemberId);
  const memberGroups: Record<string, RawSheetRow[]> = {};
  
  assignedData.forEach(row => {
      const mId = row.assignedMemberId!;
      if (!memberGroups[mId]) memberGroups[mId] = [];
      memberGroups[mId].push(row);
  });

  // 2. Preparar Prompts em Paralelo para cada Membro
  const groupKeys = Object.keys(memberGroups);
  
  const routePromises = groupKeys.map(async (memberId) => {
      const rows = memberGroups[memberId];
      if (rows.length === 0) return null;

      // Buscar dados do membro e equipe
      let memberName = "Roteiro Geral";
      let teamName = "Equipe Padrão";
      let memberContext = "";
      let transportMode = "Carro (Padrão)";
      let scheduleWarnings = "";
      
      // Encontrar membro na estrutura de times
      let foundMember: TeamMember | undefined;
      let foundTeam: Team | undefined;
      
      for (const t of teams) {
          const m = t.members.find(x => x.id === memberId);
          if (m) {
              foundMember = m;
              foundTeam = t;
              break;
          }
      }

      if (foundMember) {
          memberName = foundMember.name;
          teamName = foundTeam?.name || "Equipe";
          transportMode = foundMember.transportMode || (foundMember.usesCar ? 'Carro' : 'Transporte Público');
          
          const workingDays = foundMember.schedule.filter(s => !s.isDayOff).map(s => s.dayOfWeek);
          const offDays = foundMember.schedule.filter(s => s.isDayOff).map(s => s.dayOfWeek);
          
          const scheduleStr = foundMember.schedule
              .filter(s => !s.isDayOff)
              .map(s => `${s.dayOfWeek}: ${s.startTime}-${s.endTime}`)
              .join('; ');

          // VERIFICAÇÃO DE FOLGA (CRÍTICO)
          const startDayOfWeek = getDayOfWeekPT(preferences.departureDate);
          const isStartingOnDayOff = offDays.includes(startDayOfWeek as any);
          
          let dayOffInstruction = "";
          if (isStartingOnDayOff) {
              dayOffInstruction = `ATENÇÃO: A data solicitada (${preferences.departureDate} - ${startDayOfWeek}) é um dia de FOLGA para ${foundMember.name}. NÃO GERE ROTEIRO PARA ${startDayOfWeek}. Comece o agendamento no próximo dia útil permitido (${workingDays.join(', ')}).`;
          }

          memberContext = `
          - **NOME COLABORADOR:** ${foundMember.name}
          - **MEIO DE LOCOMOÇÃO:** ${transportMode} (Afeta velocidade média e estacionamento).
          - **JORNADA DE TRABALHO:** ${scheduleStr}.
          - **DIAS DE FOLGA (PROIBIDO AGENDAR):** ${offDays.join(', ')}.
          - **PONTO DE PARTIDA:** ${foundMember.preferredStartLocation || preferences.startLocation || 'Sede'}.
          - **PONTO DE RETORNO:** ${foundMember.returnToStart ? (foundMember.preferredStartLocation || preferences.startLocation) : (foundMember.preferredEndLocation || preferences.endLocation)}.
          - **INSTRUÇÃO DE DATA:** ${dayOffInstruction}
          `;
      }

      // Preparar lista de paradas com metadados para a IA
      const stopsList = rows.map(row => {
        let priorityNote = "";
        if (row.priority === 'high') priorityNote = " [PRIORIDADE ALTA]";
        if (row.priority === 'lunch') priorityNote = " [ALMOÇO]";
        
        const timeConstraints = (row.HorarioAbertura || row.HorarioFechamento) 
          ? ` (Janela: ${row.HorarioAbertura || '?'} - ${row.HorarioFechamento || '?'})` 
          : '';
          
        const fullAddress = [row.Endereco, row.Bairro, row.Municipio].filter(Boolean).join(", ");
        const posInfo = row.posData ? `POS:${row.posData.length}` : 'POS:0';

        return `- ID: ${row.id} | ${row.Nome} (${fullAddress}) | ${posInfo} | Obs: ${row.Observacoes || ''}${timeConstraints}${priorityNote}`;
      }).join('\n');

      const lunchInstruction = preferences.needsLunch 
        ? `SIM (${preferences.lunchDurationMinutes} min).` 
        : 'NÃO';

      const prompt = `
        Atue como um **Arquiteto de Soluções de Otimização Logística**.

        **OBJETIVO:** Gerar um roteiro para o colaborador **${memberName}**.

        **CONTEXTO:**
        ${memberContext || `- Horários: Saída ${preferences.departureTime}, Retorno ${preferences.returnTime}.`}
        - Data Início: ${preferences.departureDate} (${getDayOfWeekPT(preferences.departureDate)})
        - Tempo Médio Visita: ${preferences.visitDurationMinutes} min
        - Almoço: ${lunchInstruction}

        **REGRAS OBRIGATÓRIAS (HARD RULES):**
        1. **LISTA COMPLETA:** Você recebeu ${rows.length} locais. Você DEVE retornar um roteiro contendo EXATAMENTE ${rows.length} visitas.
        2. **DIAS DE FOLGA:** Respeite rigorosamente os dias de folga do colaborador. Se a data de início for folga, pule para o próximo dia útil.
        3. **NÃO FILTRE:** Não remova empresas por falta de tempo. Se a jornada estourar, agende como hora extra ou mova para o dia seguinte (desde que seja dia útil), mas NÃO OMITA a visita do JSON.
        4. **SEQUÊNCIA:** Use lógica "Nearest Neighbor" e "Cluster-First" para minimizar deslocamento.

        **LISTA DE ATIVIDADES (OBRIGATÓRIO VISITAR TODAS):**
        ${stopsList}

        **FORMATO DE SAÍDA (JSON):**
        Retorne um Array de Dias.
        [
          {
            "dayLabel": "Dia 1 - Seg (ou o dia correto)",
            "date": "YYYY-MM-DD",
            "summary": "Resumo...",
            "totalDistanceKm": "X km",
            "totalTimeHours": "X h",
            "estimatedFuelCost": "R$ 0,00",
            "estimatedParkingCost": "R$ 0,00",
            "stops": [
              {
                "id": "ID da atividade fornecido",
                "order": 1,
                "name": "Nome",
                "type": "Cliente",
                "address": "Endereço Completo",
                "estimatedArrival": "HH:MM",
                "durationMinutes": 45,
                "distanceToNext": "5.2 km",  // NOVA REGRA: Calcule a distância para a PRÓXIMA parada. Se for a última, pode ser null ou distância para o retorno.
                "travelTimeToNext": "15 min", // NOVA REGRA: Calcule o tempo de viagem para a PRÓXIMA parada.
                "notes": "Justificativa",
                "risks": { "flood": false, "towing": false, "security": false },
                "weather": { "temp": "25°C", "condition": "Sol" }
              }
            ]
          }
        ]
      `;

      const toolConfig = currentCoords ? {
        retrievalConfig: {
          latLng: { latitude: currentCoords.lat, longitude: currentCoords.lng }
        }
      } : undefined;

      // IMPLEMENTAÇÃO DE RETRY COM DEGRADAÇÃO DE FERRAMENTAS
      let attempts = 0;
      const maxAttempts = 3;
      
      while (attempts < maxAttempts) {
        try {
            // Estratégia: 
            // Tentativa 1: Todas as ferramentas (Maps + Search)
            // Tentativa 2+: Apenas Maps (Maior estabilidade, menos risco de timeout 500)
            const currentTools = (attempts === 0) 
                ? [{ googleMaps: {}, googleSearch: {} }]
                : [{ googleMaps: {} }];

            const response = await ai.models.generateContent({
              model: 'gemini-2.5-flash',
              contents: prompt,
              config: {
                tools: currentTools,
                toolConfig: toolConfig,
              }
            });

            let text = response.text;
            if (!text) throw new Error("Sem resposta do Gemini");

            let data: DailyItinerary[] = [];
            const arrayMatch = text.match(/\[[\s\S]*\]/);
            
            if (arrayMatch) {
                data = JSON.parse(arrayMatch[0]);
            } else {
                const objectMatch = text.match(/\{[\s\S]*\}/);
                if (objectMatch) {
                     const obj = JSON.parse(objectMatch[0]);
                     data = Array.isArray(obj) ? obj : [obj];
                }
            }

            if (data && Array.isArray(data)) {
                return data.map(day => ({
                    ...day,
                    collaboratorId: memberId,
                    collaboratorName: memberName,
                    teamName: teamName,
                    dayLabel: day.dayLabel.includes(memberName) ? day.dayLabel : `${day.dayLabel} - ${memberName}`
                }));
            }
            
            // Se chegou aqui e não parseou, lança erro para tentar novamente
            throw new Error("Formato JSON inválido ou vazio");

        } catch (error) {
            attempts++;
            console.warn(`Tentativa ${attempts} falhou para ${memberName}:`, error);
            
            if (attempts >= maxAttempts) {
                 console.error(`Erro final ao roteirizar para ${memberName} após ${maxAttempts} tentativas.`);
                 return [];
            }
            
            // Exponential Backoff (2s, 4s, etc)
            await new Promise(res => setTimeout(res, 2000 * attempts));
        }
      }
      return [];
  });

  try {
      const results = await Promise.all(routePromises);
      
      const combinedPlan: MultiDayPlan = results.flat().filter(Boolean) as MultiDayPlan;
      
      if (combinedPlan.length === 0) {
          throw new Error("Não foi possível gerar roteiros. Verifique se as equipes estão atribuídas corretamente e se o serviço está disponível.");
      }

      combinedPlan.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      return combinedPlan;

  } catch (error) {
    console.error("Critical Error generating consolidated route:", error);
    throw new Error("Falha crítica na geração do roteiro consolidado. " + (error as Error).message);
  }
};
