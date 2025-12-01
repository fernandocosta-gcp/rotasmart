import { RawSheetRow, POSHealthData } from '../types';

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
            lastUpdate: '2023-10-25'
        });
    }

    return machines;
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
        let addrIdx = findIdx(['endereço', 'endereco', 'rua', 'local', 'address']);
        
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
        
        // Optional columns
        let obsIdx = findIdx(['obs', 'nota', 'comentário', 'observacoes', 'notes']);
        let sectorIdx = findIdx(['setor', 'segmento', 'categoria', 'ramo']);
        let openIdx = findIdx(['abertura', 'inicio', 'abre', 'open']);
        let closeIdx = findIdx(['fechamento', 'fim', 'fecha', 'encerra', 'close']);

        const formattedData: RawSheetRow[] = dataRows.map((row: any[]): RawSheetRow | null => {
          if (!row || row.length === 0) return null;

          const rawName = row[nameIdx];
          const rawAddr = row[addrIdx];

          // Relaxed check: Accept if name exists OR address exists
          if (!rawName && !rawAddr) return null;

          const name = rawName ? String(rawName).trim() : 'Sem Nome';

          return {
            id: generateUUID(),
            Nome: name,
            Endereco: rawAddr ? String(rawAddr).trim() : 'Endereço não informado',
            Observacoes: (obsIdx !== -1 && row[obsIdx]) ? String(row[obsIdx]).trim() : '',
            Setor: (sectorIdx !== -1 && row[sectorIdx]) ? String(row[sectorIdx]).trim() : undefined,
            HorarioAbertura: (openIdx !== -1) ? formatExcelTime(row[openIdx]) : undefined,
            HorarioFechamento: (closeIdx !== -1) ? formatExcelTime(row[closeIdx]) : undefined,
            priority: 'normal',
            posData: undefined // Will be merged later
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
            // If we have a map but didn't find the company, we purposely leave finalPosData as undefined.
        }
        // If NO map is available (Demo Mode), we generate mocks for everything.
        else {
            finalPosData = generateMockPOSData(row.Nome);
        }

        return { ...row, posData: finalPosData };
    });
};