export enum EstablishmentType {
  CLIENT = 'Cliente',
  OFFICE = 'Escritório',
  RESTAURANT = 'Restaurante',
  GAS_STATION = 'Posto de Gasolina',
  PARKING = 'Estacionamento',
  OTHER = 'Outro'
}

export type PriorityLevel = 'normal' | 'high' | 'lunch' | 'end_of_day';

export interface POSHealthData {
  machineId: string; // Id Máquina
  model: string; // Modelo (Point Smart 2 / Point Mini)
  signalStrength: number; // Sinal Wifi (%)
  batteryLevel: number; // Bateria (%)
  errorRate: number; // Taxa De Erros (%)
  connectivity: string; // Derivado ou fixo
  lastTransaction: string; // (Mantido para compatibilidade ou mock)
  paperStatus: 'OK' | 'Pouco' | 'Vazio'; // Bobina
  firmwareVersion: string; // Firmware
  lastUpdate?: string; // Ultima Atualização
  incidents?: number; // Incidentes Abertos
  avgUptime?: number; // Tempo Médio Ligado
}

export interface RawSheetRow {
  id: string;
  Nome: string;
  Endereco?: string;
  Bairro?: string;     // Novo campo
  Municipio?: string;  // Novo campo
  Observacoes?: string;
  Setor?: string;
  HorarioAbertura?: string;
  HorarioFechamento?: string;
  priority: PriorityLevel;
  customParkingInfo?: string; 
  posData?: POSHealthData[]; // Changed from single object to Array
  nearbyBusStop?: string; // New field for pre-route check
  [key: string]: any;
}

export interface OfficeSettings {
  enabled: boolean;
  frequency: 'all_days' | 'first_day' | 'last_day';
  timing: 'morning' | 'lunch' | 'afternoon';
  durationMinutes: number;
}

export interface UserPreferences {
  departureDate: string; // YYYY-MM-DD
  departureTime: string; // HH:MM
  returnTime: string; // HH:MM
  visitDurationMinutes: number;
  startLocation: string;
  useCurrentLocation: boolean;
  returnToStart: boolean; 
  endLocation: string;    
  needsFuel: boolean;
  officeSettings: OfficeSettings;
  needsLunch: boolean;
  lunchDurationMinutes: number; 
  parkingPreference: 'street' | 'paid' | 'blue_zone';
}

export interface RouteStop {
  id: string;
  order: number;
  name: string;
  type: EstablishmentType;
  address: string;
  coordinates?: {
    lat: number;
    lng: number;
  };
  estimatedArrival: string;
  durationMinutes: number; 
  notes: string;
  risks: {
    flood: boolean;
    towing: boolean;
    security: boolean; 
    description?: string;
  };
  weather?: {
    temp: string; 
    condition: string; 
    chanceOfRain: string; 
    isStormy: boolean; 
  };
  parkingSuggestion?: string;
  nearbyBusStop?: string;
  phoneNumber?: string;
  googleMapsLink?: string;
}

export interface DailyItinerary {
  dayLabel: string; 
  date: string;
  summary: string;
  totalDistanceKm: string;
  totalTimeHours: string;
  estimatedFuelCost: string; 
  estimatedParkingCost: string; 
  stops: RouteStop[];
}

export type MultiDayPlan = DailyItinerary[];