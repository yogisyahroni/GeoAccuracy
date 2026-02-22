import { request } from '@/lib/api';

export interface Area {
    id: string;
    name: string;
    description: string;
    geoJson: any;
    createdAt: string;
    updatedAt: string;
}

export interface CreateAreaRequest {
    name: string;
    description: string;
    geoJson: any; // Must be GeoJSON Polygon or MultiPolygon
}

export interface PointCheckResponse {
    contains: boolean;
    areas: Area[];
}

export const areaAPI = {
    createArea: async (req: CreateAreaRequest): Promise<Area> => {
        return request<Area>('POST', '/api/areas', req);
    },

    getAreaById: async (id: string): Promise<Area> => {
        return request<Area>('GET', `/api/areas/${id}`);
    },

    listAreas: async (): Promise<Area[]> => {
        return request<Area[]>('GET', '/api/areas');
    },

    deleteArea: async (id: string): Promise<void> => {
        return request<void>('DELETE', `/api/areas/${id}`);
    },

    checkPoint: async (lat: number, lng: number): Promise<PointCheckResponse> => {
        return request<PointCheckResponse>('GET', `/api/areas/check?lat=${lat}&lng=${lng}`);
    },
};
