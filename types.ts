
export enum EstablishmentType {
  CLIENT = 'Cliente',
  OFFICE = 'Escritório',
  RESTAURANT = 'Restaurante',
  GAS_STATION = 'Posto de Gasolina',
  PARKING = 'Estacionamento',
  OTHER = 'Outro'
}

export type PriorityLevel = 'normal' | 'high' | 'medium' | 'lunch' | 'end_of_day';

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
  prioritySource?: 'file' | 'auto'; // Rastreia se veio do arquivo ou calculado
  customParkingInfo?: string; 
  posData?: POSHealthData[]; // Changed from single object to Array
  nearbyBusStop?: string; // New field for pre-route check
  busStatus?: 'found' | 'not_found'; // Status da verificação de ponto de ônibus
  
  // New Analytics Fields
  AverageSales?: number; // Média de vendas (R$)
  BestDay?: string; // Dia da semana (Sábado, Sexta, etc)
  
  // New Distribution Field
  assignedTeamId?: string; // ID da equipe atribuída via IA
  assignedMemberId?: string; // ID do membro da equipe atribuído via IA
  distributionReason?: string; // Explicação da IA para a atribuição

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
  // Novos campos de deslocamento
  distanceToNext?: string; // ex: "5.2 km"
  travelTimeToNext?: string; // ex: "15 min"
  // ---
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
  // Campos adicionados para filtro de UI
  collaboratorName?: string;
  collaboratorId?: string;
  teamName?: string;
  // ---
  summary: string;
  totalDistanceKm: string;
  totalTimeHours: string;
  estimatedFuelCost: string; 
  estimatedParkingCost: string; 
  stops: RouteStop[];
}

export type MultiDayPlan = DailyItinerary[];

// --- TEAM MANAGEMENT INTERFACES ---

export interface WorkSchedule {
  dayOfWeek: 'Segunda' | 'Terça' | 'Quarta' | 'Quinta' | 'Sexta' | 'Sábado' | 'Domingo';
  startTime: string; // "08:00"
  endTime: string;   // "18:00"
  isDayOff: boolean;
}

export type TransportMode = 'public_transport' | 'bicycle' | 'walking' | 'motorcycle' | 'car';

export interface TeamMember {
  id: string;
  name: string;
  isOnVacation: boolean;
  schedule: WorkSchedule[];
  // Novos campos de cadastro
  phoneNumber?: string;
  usesCar: boolean; // Mantido para compatibilidade, mas derivado de transportMode na UI
  transportMode?: TransportMode; // Novo campo expandido
  rotationDay: 'Nenhum' | 'Segunda-feira' | 'Terça-feira' | 'Quarta-feira' | 'Quinta-feira' | 'Sexta-feira';
  // Novos campos de Logística
  preferredStartLocation?: string;
  preferredEndLocation?: string;
  returnToStart?: boolean; // Checkbox para retorno igual partida
  // Novo campo de Carteira
  portfolio?: string[]; // Lista de nomes de empresas vinculadas
}

export interface ServiceRegion {
  city: string;
  neighborhood: string;
}

export interface Team {
  id: string;
  name: string;
  officeAddress?: string; // Novo Campo: Endereço da base
  isActive: boolean;
  maxActivitiesPerRoute?: number; // Novo Campo
  regions: ServiceRegion[];
  members: TeamMember[];
}
