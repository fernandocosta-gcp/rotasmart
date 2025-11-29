export enum EstablishmentType {
  CLIENT = 'Cliente',
  OFFICE = 'Escritório',
  RESTAURANT = 'Restaurante',
  GAS_STATION = 'Posto de Gasolina',
  PARKING = 'Estacionamento',
  OTHER = 'Outro'
}

export type PriorityLevel = 'normal' | 'high' | 'lunch' | 'end_of_day';

export interface RawSheetRow {
  id: string;
  Nome: string;
  Endereco?: string;
  Observacoes?: string;
  Setor?: string;
  HorarioAbertura?: string;
  HorarioFechamento?: string;
  priority: PriorityLevel;
  [key: string]: any;
}

export interface UserPreferences {
  departureDate: string; // YYYY-MM-DD
  departureTime: string; // HH:MM
  returnTime: string; // HH:MM
  visitDurationMinutes: number;
  startLocation: string;
  useCurrentLocation: boolean;
  needsFuel: boolean;
  needsOfficePickup: boolean;
  needsLunch: boolean;
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
  durationMinutes: number; // Travel + Visit time
  notes: string;
  risks: {
    flood: boolean;
    towing: boolean;
    description?: string;
  };
  parkingSuggestion?: string;
  phoneNumber?: string;
  googleMapsLink?: string;
}

export interface DailyItinerary {
  dayLabel: string; // "Dia 1 - 25/10"
  date: string;
  summary: string;
  totalDistanceKm: string;
  totalTimeHours: string;
  stops: RouteStop[];
}

export type MultiDayPlan = DailyItinerary[];
