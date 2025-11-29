import { RawSheetRow } from '../types';

declare global {
  interface Window {
    XLSX: any;
  }
}

// Helper to convert Excel time fractions (e.g. 0.5) to "12:00"
const formatExcelTime = (value: any): string | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  
  let numValue = value;
  
  // If string looks like a number (e.g. "0.625")
  if (typeof value === 'string' && !isNaN(Number(value)) && value.trim() !== '') {
    numValue = Number(value);
  }

  if (typeof numValue === 'number') {
     // Excel time is a fraction of a day (0.0 to 1.0). 
     // E.g., 0.5 is 12:00, 0.25 is 06:00.
     // We allow slightly > 1 just in case of float errors, but typically it is 0-1.
     // We exclude large integers (like "8") which might just be typed as 8 hours.
     if (numValue >= 0 && numValue <= 1.0) {
        const totalHours = numValue * 24;
        let hours = Math.floor(totalHours);
        let minutes = Math.round((totalHours - hours) * 60);
        
        // Handle rounding edge case (e.g., 11:59.999 -> 12:00)
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

export const parseSheetFile = async (file: File): Promise<RawSheetRow[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = window.XLSX.read(data, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        
        // Use header: 1 to get an array of arrays (Row[])
        const rows = window.XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

        if (!rows || rows.length === 0) {
          resolve([]);
          return;
        }

        // Strategy:
        // 1. Identify Header Row (assume row 0)
        // 2. Identify Column Indices
        
        const headerRow = rows[0].map((cell: any) => String(cell || '').toLowerCase().trim());

        // Helper to find index by keywords
        const findIdx = (keywords: string[]) => headerRow.findIndex((h: string) => 
          keywords.some(k => h.includes(k))
        );

        let nameIdx = findIdx(['nome', 'cliente', 'estabelecimento', 'empresa']);
        let addrIdx = findIdx(['endereço', 'endereco', 'rua', 'local', 'address']);
        let obsIdx = findIdx(['obs', 'nota', 'comentário', 'observacoes']);
        
        // New columns
        let sectorIdx = findIdx(['setor', 'segmento', 'categoria', 'ramo']);
        let openIdx = findIdx(['abertura', 'inicio', 'abre', 'open']);
        let closeIdx = findIdx(['fechamento', 'fim', 'fecha', 'encerra', 'close']);

        // Fallback to User Specified Indices if headers aren't clear
        if (nameIdx === -1) nameIdx = 1; 
        if (addrIdx === -1) addrIdx = 2;

        // Process data rows (start from index 1 to skip header)
        const dataRows = rows.slice(1);

        const formattedData: RawSheetRow[] = dataRows.map((row: any[]): RawSheetRow | null => {
          // Safety check for row length or empty rows
          if (!row || row.length === 0) return null;

          const rawName = row[nameIdx];
          const rawAddr = row[addrIdx];

          // Essential data check
          if (!rawName && !rawAddr) return null;

          return {
            id: crypto.randomUUID(),
            Nome: rawName ? String(rawName).trim() : 'Nome Desconhecido',
            Endereco: rawAddr ? String(rawAddr).trim() : 'Endereço não informado',
            Observacoes: (obsIdx !== -1 && row[obsIdx]) ? String(row[obsIdx]).trim() : '',
            Setor: (sectorIdx !== -1 && row[sectorIdx]) ? String(row[sectorIdx]).trim() : undefined,
            HorarioAbertura: (openIdx !== -1) ? formatExcelTime(row[openIdx]) : undefined,
            HorarioFechamento: (closeIdx !== -1) ? formatExcelTime(row[closeIdx]) : undefined,
            priority: 'normal'
          };
        }).filter((item): item is RawSheetRow => item !== null);
        
        resolve(formattedData);

      } catch (error) {
        console.error("Excel parsing error:", error);
        reject(error);
      }
    };

    reader.onerror = (error) => reject(error);
    reader.readAsBinaryString(file);
  });
};
