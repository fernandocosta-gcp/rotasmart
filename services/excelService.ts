
import { RawSheetRow, POSHealthData, PriorityLevel, Team } from '../types';

declare global {
  interface Window {
    XLSX: any;
  }
}

// Helper seguro para gerar IDs únicos (UUID fallback)
const generateUUID = (): string => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    // Fallback simples para ambientes inseguros/antigos
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
};

// Helper to convert Excel time fractions (e.g. 0.5) to "12:00"
const formatExcelTime = (value: any): string | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  
  let numValue = value;
  
  if (typeof value === 'string' && !isNaN(Number(value)) && value.trim() !== '') {
    numValue = Number(value);
  }

  if (typeof numValue === 'number') {
     if (numValue >= 0 && numValue <= 1.0) {
        const totalHours = numValue * 24;
        let hours = Math.floor(totalHours);
        let minutes = Math.round((totalHours - hours) * 60);
        
        if (minutes === 60) {
            hours += 1;
            minutes = 0;
        }
        
        const hStr = hours.toString().padStart(2, '0');
        const mStr = minutes.toString().padStart(2, '0');
        return `${hStr}:${mStr}`;
     }
  }

  return String(value).trim();
};

// Helper para converter texto da planilha em PriorityLevel
const parsePriority = (rawValue: any): PriorityLevel => {
    if (!rawValue) return 'normal';
    
    const text = String(rawValue).toLowerCase().trim();
    
    // 1. Mapeamento Numérico Comum (1=Alta, 2=Média, 3=Baixa)
    if (text === '1') return 'high';
    if (text === '2') return 'medium';
    
    // 2. Mapeamento de termos para High (Alta Prioridade)
    if (['alta', 'high', 'urgente', 'urgent', 'crítico', 'critico', 'importante', 'prioridade'].some(t => text.includes(t))) {
        return 'high';
    }

    // 2.1 Mapeamento para Medium (Média)
    if (['média', 'media', 'medium', 'moderada'].some(t => text.includes(t))) {
        return 'medium';
    }
    
    // 3. Mapeamento de termos para Lunch (Almoço)
    if (['almoço', 'almoco', 'lunch', 'refeição', 'meio dia', '12h', '13h'].some(t => text.includes(t))) {
        return 'lunch';
    }
    
    // 4. Mapeamento de termos para End of Day (Fim do dia)
    if (['fim', 'final', 'end', 'tarde', 'último', 'ultimo', '17h', '18h', 'fechamento'].some(t => text.includes(t))) {
        return 'end_of_day';
    }

    // 5. Termos explícitos para Normal/Baixa
    if (['normal', 'baixa', 'low', 'padrão', 'padrao', 'regular'].some(t => text.includes(t))) {
        return 'normal';
    }

    return 'normal';
};

// Helper interno de status para cálculo automático de prioridade
const getPosStatusForCalculation = (data: POSHealthData) => {
    if (data.errorRate >= 6) return 'CRITICO';
    if (data.paperStatus !== 'OK' || data.signalStrength < 20) return 'COMPROMETIDO';
    if (data.errorRate < 6 && data.signalStrength > 40) return 'OPERATIVO';
    return 'ATENCAO';
};

// Updated Mock Generator to return an ARRAY of machines
const generateMockPOSData = (seed: string): POSHealthData[] => {
    const random = (offset: number) => {
        const x = Math.sin(seed.length + offset) * 10000;
        return x - Math.floor(x);
    };
    
    // Randomize number of machines between 1 and 3
    const numMachines = Math.floor(random(0) * 3) + 1;
    const machines: POSHealthData[] = [];

    for(let i=0; i < numMachines; i++) {
        const offset = i * 10;
        const signal = Math.floor(random(1 + offset) * 100);
        const battery = Math.floor(random(2 + offset) * 100);
        const errors = Math.floor(random(3 + offset) * 10); 
        
        const models = ['Point Smart 2', 'Point Mini'];
        const paperStatus = ['OK', 'OK', 'OK', 'Pouco', 'Vazio'];

        machines.push({
            machineId: `MOCK-${Math.floor(random(99) * 1000)}`,
            signalStrength: signal,
            batteryLevel: battery,
            errorRate: errors,
            connectivity: 'Wifi', // Assuming Wifi based on prompt
            model: models[Math.floor(random(5 + offset) * models.length)],
            lastTransaction: `${Math.floor(random(6 + offset) * 12)}h atrás`,
            paperStatus: paperStatus[Math.floor(random(7 + offset) * paperStatus.length)] as any,
            firmwareVersion: `v${Math.floor(random(8 + offset) * 5)}.${Math.floor(random(9 + offset) * 9)}`,
            incidents: errors > 5 ? 1 : 0,
            lastUpdate: '2023-10-25',
            avgUptime: Math.floor(random(10 + offset) * 72) + 1 // MOCK Uptime between 1 and 72 hours
        });
    }

    return machines;
};

// Helper to generate mock sales data if columns are missing
const generateMockSalesData = () => {
    const days = ['Segunda', 'Sexta', 'Sábado', 'Sábado', 'Sábado', 'Domingo'];
    const sales = Math.floor(Math.random() * 5000) + 1200; // 1200 to 6200
    const bestDay = days[Math.floor(Math.random() * days.length)];
    return { sales, bestDay };
};

export const parseSheetFile = async (file: File): Promise<RawSheetRow[]> => {
  return new Promise((resolve, reject) => {
    if (!window.XLSX) {
        reject(new Error("Biblioteca XLSX não carregada. Verifique sua conexão."));
        return;
    }

    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const rawData = e.target?.result;
        
        if (!rawData) {
            throw new Error("Falha na leitura do arquivo (Buffer vazio).");
        }

        // Standard ArrayBuffer reading
        const workbook = window.XLSX.read(rawData, { type: 'array' });
        
        if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
            throw new Error("Arquivo Excel inválido ou sem planilhas.");
        }

        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        
        // Read as array of arrays to have full control over headers
        const rows = window.XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

        if (!rows || rows.length === 0) {
          resolve([]);
          return;
        }

        // --- INTELLIGENT HEADER DETECTION ---
        
        // Attempt to find header row (first row with string content)
        const headerRow = rows[0].map((cell: any) => String(cell || '').toLowerCase().trim());

        const findIdx = (keywords: string[]) => headerRow.findIndex((h: string) => 
          keywords.some(k => h.includes(k))
        );

        let nameIdx = findIdx(['nome', 'cliente', 'estabelecimento', 'empresa', 'name']);
        // O campo "Endereço (Fictício)" será capturado aqui pelo 'endereço' ou 'endereco'
        let addrIdx = findIdx(['endereço', 'endereco', 'rua', 'local', 'address']);
        
        // Novos campos para composição de endereço completo
        let neighborIdx = findIdx(['bairro', 'neighborhood', 'distrito']);
        let cityIdx = findIdx(['município', 'municipio', 'cidade', 'city']);
        
        // Optional columns
        let obsIdx = findIdx(['obs', 'nota', 'comentário', 'observacoes', 'notes']);
        let sectorIdx = findIdx(['setor', 'segmento', 'categoria', 'ramo']);
        let openIdx = findIdx(['abertura', 'inicio', 'abre', 'open']);
        let closeIdx = findIdx(['fechamento', 'fim', 'fecha', 'encerra', 'close']);
        
        // Priority Column Detection (Expanded Keywords)
        let priorityIdx = findIdx(['prioridade', 'priority', 'urgencia', 'urgência', 'nível', 'nivel', 'status', 'classificação', 'classificacao']);

        // Analytics Columns Detection
        let salesIdx = findIdx(['média', 'vendas', 'faturamento', 'receita', 'average']);
        let bestDayIdx = findIdx(['melhor dia', 'pico', 'best day']);

        // --- FALLBACK STRATEGY ---
        let dataRows = rows;
        
        // Case 1: Headers found properly
        if (nameIdx !== -1 || addrIdx !== -1) {
            dataRows = rows.slice(1); // Skip header row
            // Fill missing partials with defaults
            if (nameIdx === -1) nameIdx = 0;
            if (addrIdx === -1) addrIdx = 1;
        } 
        // Case 2: No headers found (Assuming data starts at Row 0)
        else {
             console.warn("Headers not detected. Assuming Row 0 is data and using Col 0=Name, Col 1=Addr.");
             nameIdx = 0;
             addrIdx = 1;
             // Do NOT slice, because row 0 might be the first client
        }

        const formattedData: RawSheetRow[] = dataRows.map((row: any[]): RawSheetRow | null => {
          if (!row || row.length === 0) return null;

          const rawName = row[nameIdx];
          const rawAddr = row[addrIdx];

          // Relaxed check: Accept if name exists OR address exists
          if (!rawName && !rawAddr) return null;

          const name = rawName ? String(rawName).trim() : 'Sem Nome';

          // Extract or Mock Analytics Data
          let avgSales = (salesIdx !== -1 && row[salesIdx]) ? parseFloat(row[salesIdx]) : 0;
          let bestDay = (bestDayIdx !== -1 && row[bestDayIdx]) ? String(row[bestDayIdx]).trim() : '';
          
          // If no data found, generate Mock for demonstration purposes
          if (avgSales === 0 || bestDay === '') {
              const mock = generateMockSalesData();
              if(avgSales === 0) avgSales = mock.sales;
              if(bestDay === '') bestDay = mock.bestDay;
          }

          // Resolve Priority from File
          let finalPriority: PriorityLevel = 'normal';
          let finalSource: 'file' | 'auto' = 'auto';

          // Se a coluna existir e tiver valor, usamos ela e marcamos como 'file'.
          if (priorityIdx !== -1 && row[priorityIdx]) {
              finalPriority = parsePriority(row[priorityIdx]);
              finalSource = 'file';
          }

          return {
            id: generateUUID(),
            Nome: name,
            Endereco: rawAddr ? String(rawAddr).trim() : 'Endereço não informado',
            Bairro: (neighborIdx !== -1 && row[neighborIdx]) ? String(row[neighborIdx]).trim() : undefined,
            Municipio: (cityIdx !== -1 && row[cityIdx]) ? String(row[cityIdx]).trim() : undefined,
            Observacoes: (obsIdx !== -1 && row[obsIdx]) ? String(row[obsIdx]).trim() : '',
            Setor: (sectorIdx !== -1 && row[sectorIdx]) ? String(row[sectorIdx]).trim() : undefined,
            HorarioAbertura: (openIdx !== -1) ? formatExcelTime(row[openIdx]) : undefined,
            HorarioFechamento: (closeIdx !== -1) ? formatExcelTime(row[closeIdx]) : undefined,
            priority: finalPriority,
            prioritySource: finalSource,
            posData: undefined, // Will be merged later
            AverageSales: avgSales,
            BestDay: bestDay
          };
        }).filter((item): item is RawSheetRow => item !== null);
        
        resolve(formattedData);

      } catch (error) {
        console.error("Excel parsing error:", error);
        reject(error);
      }
    };

    reader.onerror = (error) => reject(error);
    reader.readAsArrayBuffer(file);
  });
};

// Updated function to load from assets folder and group by establishment
export const loadHealthBaseFromAssets = async (): Promise<Map<string, POSHealthData[]>> => {
    try {
        const response = await fetch('/assets/base_saude.xlsx');
        
        if (!response.ok) {
            console.warn("Base de saúde não encontrada em /assets/base_saude.xlsx. Usando mocks.");
            return new Map();
        }

        const arrayBuffer = await response.arrayBuffer();
        if (!window.XLSX) return new Map();

        const workbook = window.XLSX.read(arrayBuffer, { type: 'array' });
        
        if (!workbook.SheetNames.length) return new Map();

        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = window.XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
        
        if (!rows || rows.length === 0) return new Map();

        const header = rows[0].map((c: any) => String(c || '').toLowerCase());
        
        // Mapeamento baseado nos campos fornecidos pelo usuário
        const nameIdx = header.findIndex((h: string) => h.includes('nome do estabelecimento'));
        const idMacIdx = header.findIndex((h: string) => h.includes('id máquina') || h.includes('id maquina'));
        const modelIdx = header.findIndex((h: string) => h.includes('modelo'));
        const signalIdx = header.findIndex((h: string) => h.includes('sinal wifi'));
        const errIdx = header.findIndex((h: string) => h.includes('taxa de erros'));
        const battIdx = header.findIndex((h: string) => h.includes('bateria'));
        const paperIdx = header.findIndex((h: string) => h.includes('bobina'));
        const uptimeIdx = header.findIndex((h: string) => h.includes('tempo médio ligado'));
        const incidentsIdx = header.findIndex((h: string) => h.includes('incidentes abertos'));
        const firmwareIdx = header.findIndex((h: string) => h.includes('firmware'));
        const updateIdx = header.findIndex((h: string) => h.includes('ultima atualização') || h.includes('última atualização'));


        const healthMap = new Map<string, POSHealthData[]>();

        rows.slice(1).forEach(row => {
            if(!row[nameIdx]) return;
            
            const name = String(row[nameIdx]).trim().toLowerCase();
            
            // Validação de Modelo
            let model = row[modelIdx] ? String(row[modelIdx]).trim() : 'Point Smart 2';
            // Simple standardization logic
            if (model.toLowerCase().includes('mini')) model = 'Point Mini';
            else if (model.toLowerCase().includes('smart')) model = 'Point Smart 2';
            else model = 'Point Smart 2'; // Default fallback

            // Status da Bobina - Normalização
            let rawPaper = row[paperIdx] ? String(row[paperIdx]).toLowerCase() : 'ok';
            let paperStatus: 'OK' | 'Pouco' | 'Vazio' = 'OK';
            if (rawPaper.includes('nok') || rawPaper.includes('vazio') || rawPaper.includes('acabando')) paperStatus = 'Vazio';
            else if (rawPaper.includes('pouco')) paperStatus = 'Pouco';

            const posData: POSHealthData = {
                machineId: row[idMacIdx] ? String(row[idMacIdx]) : `UNK-${Math.random().toString(36).substr(2,5)}`,
                model: model,
                signalStrength: parseInt(row[signalIdx]) || 0,
                batteryLevel: parseInt(row[battIdx]) || 0,
                errorRate: parseInt(row[errIdx]) || 0,
                paperStatus: paperStatus,
                connectivity: 'Wifi', // Baseado no nome da coluna "Sinal Wifi"
                firmwareVersion: row[firmwareIdx] ? String(row[firmwareIdx]) : 'v?.?',
                lastUpdate: row[updateIdx] ? String(row[updateIdx]) : undefined,
                incidents: parseInt(row[incidentsIdx]) || 0,
                avgUptime: parseFloat(row[uptimeIdx]) || 0,
                lastTransaction: 'N/A' // Not in new spec, keep placeholder
            };
            
            const existing = healthMap.get(name) || [];
            existing.push(posData);
            healthMap.set(name, existing);
        });

        console.log(`Base de saúde carregada: ${healthMap.size} estabelecimentos encontrados.`);
        return healthMap;

    } catch (err) {
        console.error("Erro ao carregar base de saúde estática:", err);
        return new Map();
    }
};

export const mergeRouteAndHealthData = (routeData: RawSheetRow[], healthMap: Map<string, POSHealthData[]> | null): RawSheetRow[] => {
    return routeData.map(row => {
        let finalPosData: POSHealthData[] | undefined = undefined;

        // Try to match with Health Map if available (Real Data Mode)
        if (healthMap && healthMap.size > 0) {
            const normalizedName = row.Nome.toLowerCase().trim();
            // Exact match
            if (healthMap.has(normalizedName)) {
                finalPosData = healthMap.get(normalizedName);
            } else {
                // Fuzzy match (contains)
                for (const [key, val] of healthMap.entries()) {
                    if (normalizedName.includes(key) || key.includes(normalizedName)) {
                        finalPosData = val;
                        break;
                    }
                }
            }
        }
        // If NO map is available (Demo Mode), we generate mocks for everything.
        else {
            finalPosData = generateMockPOSData(row.Nome);
        }

        // --- AUTOMATIC PRIORITY CALCULATION ---
        // Se a prioridade NÃO veio do arquivo (source='auto'), calculamos baseada na saúde
        if (row.prioritySource === 'auto' && finalPosData && finalPosData.length > 0) {
            const total = finalPosData.length;
            const operativeCount = finalPosData.filter(d => getPosStatusForCalculation(d) === 'OPERATIVO').length;
            const score = Math.round((operativeCount / total) * 100);

            if (score <= 25) {
                row.priority = 'high';
            } else if (score <= 50) {
                row.priority = 'medium';
            } 
            // score > 50 permanece 'normal'
        }

        return { ...row, posData: finalPosData };
    });
};

// Nova função para aplicar regras de carteira (Portfolio) automaticamente
export const applyPortfolioRules = (rows: RawSheetRow[], teams: Team[]): RawSheetRow[] => {
    const normalize = (s: string) => s ? s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "") : "";

    return rows.map(row => {
        // Se já estiver atribuído (ex: via coluna do arquivo), pula
        if (row.assignedTeamId) return row;

        const rowName = normalize(row.Nome);
        const rowCity = normalize(row.Municipio || "");
        const rowHood = normalize(row.Bairro || "");

        // Find matches
        for (const team of teams) {
            if (!team.isActive) continue;

            // 1. Verificação de Cobertura Geográfica da Equipe (Obrigatória para segurança)
            // Se a equipe tem regiões definidas, verificamos se a linha se encaixa.
            // Se não tem regiões, assumimos cobertura total (ou ignoramos, dependendo da regra de negócio).
            // Aqui, para evitar homônimos em cidades diferentes, exigiremos o match se houver regiões.

            let locationMatch = false;
            
            if (team.regions.length === 0) {
                locationMatch = true; // Equipe "global" ou sem restrição geográfica configurada
            } else {
                locationMatch = team.regions.some(reg => {
                    const regCity = normalize(reg.city);
                    const regHood = normalize(reg.neighborhood);

                    // Lógica de Match Geográfico:
                    // Se a região tem Cidade E Bairro definidos -> Ambos devem bater (contido ou exato)
                    // Se a região só tem Cidade -> Bate cidade
                    // Se a região só tem Bairro -> Bate bairro

                    const matchCity = !regCity || (rowCity && rowCity.includes(regCity)) || (regCity && regCity.includes(rowCity));
                    const matchHood = !regHood || (rowHood && rowHood.includes(regHood)) || (regHood && regHood.includes(rowHood));

                    return matchCity && matchHood;
                });
            }

            // Se a equipe não cobre a região da atividade, não atribuímos mesmo que o nome bata na carteira.
            // Isso evita atribuir o "McDonalds do Rio" para o colaborador que atende "McDonalds de SP".
            if (!locationMatch) continue; 

            // 2. Verificação de Carteira dos Membros
            for (const member of team.members) {
                if (!member.portfolio || member.portfolio.length === 0) continue;

                // Check if name is in portfolio (fuzzy normalized match)
                const hasPortfolioMatch = member.portfolio.some(pName => normalize(pName) === rowName);

                if (hasPortfolioMatch) {
                    return {
                        ...row,
                        assignedTeamId: team.id,
                        assignedMemberId: member.id,
                        distributionReason: "Carteira Fixa (Portfolio)"
                    };
                }
            }
        }

        return row;
    });
};
