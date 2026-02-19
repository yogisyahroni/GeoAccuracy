export type AccuracyCategory = 'accurate' | 'fairly_accurate' | 'inaccurate' | 'pending' | 'error';

export interface SystemRecord {
  connote: string;
  recipientName: string;
  address: string;
  city: string;
  province: string;
  lat?: number;
  lng?: number;
  geocodeStatus: 'pending' | 'loading' | 'done' | 'error';
}

export interface FieldRecord {
  connote: string;
  lat: number;
  lng: number;
  reportedBy?: string;
  reportDate?: string;
}

export interface ComparisonResult {
  connote: string;
  recipientName: string;
  systemAddress: string;
  systemLat?: number;
  systemLng?: number;
  fieldLat?: number;
  fieldLng?: number;
  distanceMeters?: number;
  category: AccuracyCategory;
  geocodeStatus: 'pending' | 'loading' | 'done' | 'error';
}

export interface DashboardStats {
  total: number;
  accurate: number;
  fairlyAccurate: number;
  inaccurate: number;
  pending: number;
  error: number;
}
