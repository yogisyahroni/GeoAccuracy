import { request } from '@/lib/api';

export interface ExternalAPIKey {
    id: string;
    userId: number;
    name: string;
    prefix: string;
    lastUsedAt: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface GenerateAPIKeyResponse extends ExternalAPIKey {
    rawKey: string;
}

export const webhookAPI = {
    createAPIKey: async (name: string): Promise<GenerateAPIKeyResponse> => {
        return request<GenerateAPIKeyResponse>('POST', '/api/settings/api-keys', { name });
    },

    listAPIKeys: async (): Promise<ExternalAPIKey[]> => {
        return request<ExternalAPIKey[]>('GET', '/api/settings/api-keys');
    },

    revokeAPIKey: async (id: string): Promise<void> => {
        return request<void>('DELETE', `/api/settings/api-keys/${id}`);
    },
};
