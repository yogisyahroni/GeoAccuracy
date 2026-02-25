/**
 * API Client — typed fetch wrapper with JWT injection
 * In development, Vite proxies /api/* to the Go backend on 8081.
 * In production, /api/* is served from the same origin (nginx reverse proxy).
 * No hardcoded ports — uses same-origin (empty string base URL).
 */

// In dev: Vite proxy forwards /api/* → http://localhost:8081
// In prod: reverse proxy (nginx) forwards /api/* → backend container
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

// ─── Typed Error ──────────────────────────────────────────────────────────────

export class ApiError extends Error {
    constructor(
        public readonly status: number,
        public readonly code: string,
        message: string,
    ) {
        super(message);
        this.name = 'ApiError';
    }
}

// ─── Token helpers ────────────────────────────────────────────────────────────

const TOKEN_KEY = 'geoaccuracy_token';

export function getStoredToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string): void {
    localStorage.setItem(TOKEN_KEY, token);
}

export function clearStoredToken(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem('geoaccuracy_user');
}

export function setStoredUser(user: AuthUser): void {
    localStorage.setItem('geoaccuracy_user', JSON.stringify(user));
}

export function getStoredUser(): AuthUser | null {
    const raw = localStorage.getItem('geoaccuracy_user');
    if (!raw) return null;
    try {
        return JSON.parse(raw) as AuthUser;
    } catch {
        return null;
    }
}

// ─── Core fetch ───────────────────────────────────────────────────────────────

export async function request<TResponse>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
    path: string,
    body?: unknown,
    requiresAuth = true,
): Promise<TResponse> {
    const headers: HeadersInit = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
    };

    if (requiresAuth) {
        const token = getStoredToken();
        if (!token) {
            throw new ApiError(401, 'UNAUTHENTICATED', 'No authentication token found. Please log in.');
        }
        headers['Authorization'] = `Bearer ${token}`;
    }

    let response: Response;
    try {
        response = await fetch(`${API_BASE_URL}${path}`, {
            method,
            headers,
            body: body !== undefined ? JSON.stringify(body) : undefined,
        });
    } catch (networkError) {
        throw new ApiError(0, 'NETWORK_ERROR', `Network request failed: ${String(networkError)}`);
    }

    // Parse JSON body regardless of status — backend always returns JSON
    let data: unknown;
    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
        data = await response.json();
    } else {
        data = { message: await response.text() };
    }

    if (!response.ok) {
        const errBody = data as { message?: string; error?: string; code?: string };
        const message = errBody.message ?? errBody.error ?? `HTTP ${response.status}`;
        const code = errBody.code ?? `HTTP_${response.status}`;
        throw new ApiError(response.status, code, message);
    }

    return data as TResponse;
}

// ─── Domain types ─────────────────────────────────────────────────────────────

export interface AuthUser {
    id: number;
    name: string;
    email: string;
    role: string;
}

export interface LoginRequest {
    email: string;
    password: string;
}

export interface LoginResponse {
    access_token: string;
    user: AuthUser;
}

export interface RegisterRequest {
    name: string;
    email: string;
    password: string;
}

export interface RegisterResponse {
    access_token: string;
    user: AuthUser;
}

export interface WebhookGenerateResponse {
    api_key: string;
    description: string;
}

// ---------------------------------------------------------
// ERP Integration APIs
// ---------------------------------------------------------

export interface ErpIntegration {
    id?: number;
    user_id?: number;
    name: string;
    url: string;
    method: 'GET' | 'POST' | string;
    auth_header_key?: string;
    auth_header_value?: string;
    cron_schedule?: string;
    last_sync_at?: string; // ISO datetime
    created_at?: string;
    updated_at?: string;
}

export interface ErpIntegrationRequest {
    name: string;
    url: string;
    method: string;
    auth_header_key?: string;
    auth_header_value?: string;
    cron_schedule?: string;
}

// Matches backend GeocodeRequest
export interface GeocodeRequest {
    address: string;
    city: string;
    province: string;
    country?: string;
}

// Matches backend GeocodeResponse
export interface GeocodeResponse {
    lat: number;
    lng: number;
    display_name: string;
    cached: boolean;
}

// Matches backend ValidationRequestItem
export interface ValidationRequestItem {
    id: string;
    system_address: string;
    field_lat: number;
    field_lng: number;
}

// Matches backend ValidationResult
export interface ValidationResultItem {
    id: string;
    system_address: string;
    geo_lat: number;
    geo_lng: number;
    field_lat: number;
    field_lng: number;
    distance_km: number;
    accuracy_level: 'accurate' | 'fairly_accurate' | 'inaccurate' | 'error';
    provider: string;
    error?: string;
}

export interface BatchValidationRequest {
    items: ValidationRequestItem[];
}

export interface BatchValidationResponse {
    results: ValidationResultItem[];
}

// ─── API Surface ──────────────────────────────────────────────────────────────

export const authApi = {
    login(payload: LoginRequest): Promise<LoginResponse> {
        return request<LoginResponse>('POST', '/api/auth/login', payload, false);
    },

    register(payload: RegisterRequest): Promise<RegisterResponse> {
        return request<RegisterResponse>('POST', '/api/auth/register', payload, false);
    },
};

export const geocodeApi = {
    geocode(payload: GeocodeRequest): Promise<GeocodeResponse> {
        return request<GeocodeResponse>('POST', '/api/geocode', payload);
    },
};

export const comparisonApi = {
    compareBatch(payload: BatchValidationRequest): Promise<BatchValidationResponse> {
        return request<BatchValidationResponse>('POST', '/api/compare', payload);
    },
};

// ─── Settings types & API ─────────────────────────────────────────────────────

export interface UserSettings {
    user_id: number;
    maps_key: string;
    geoapify_key: string;
    position_stack_key: string;
    updated_at: string;
}

export interface TestProviderKeyResult {
    provider: string;
    valid: boolean;
    message: string;
}

export const settingsApi = {
    getSettings(): Promise<UserSettings> {
        return request<UserSettings>('GET', '/api/settings');
    },
    updateSettings(payload: { maps_key: string; geoapify_key: string; position_stack_key: string }): Promise<{ message: string }> {
        return request<{ message: string }>('PUT', '/api/settings/keys', payload);
    },
    testProviderKey(provider: string, key: string): Promise<TestProviderKeyResult> {
        return request<TestProviderKeyResult>('POST', '/api/settings/keys/test', { provider, key });
    },
};

// ─── History types & API ──────────────────────────────────────────────────────

export interface ComparisonSession {
    id: number;
    user_id: number;
    total_count: number;
    accurate_count: number;
    fairly_count: number;
    inaccurate_count: number;
    error_count: number;
    created_at: string;
}

export interface ListSessionsResponse {
    sessions: ComparisonSession[];
    total: number;
    page: number;
    page_size: number;
}

export const historyApi = {
    listSessions(page = 1, pageSize = 20): Promise<ListSessionsResponse> {
        return request<ListSessionsResponse>(
            'GET',
            `/api/history?page=${page}&page_size=${pageSize}`,
        );
    },
};

// ─── Health check (unauthenticated) ──────────────────────────────────────────

export async function checkHealth(): Promise<boolean> {
    try {
        const response = await fetch('/api/health');
        return response.ok;
    } catch {
        return false;
    }
}

// ─── Analytics API ────────────────────────────────────────────────────────────

export interface AnalyticsData {
    totalSessions: number;
    totalRecords: number;
    totalAccurate: number;
    totalFairly: number;
    totalInaccurate: number;
    totalError: number;
    avgAccuracyRate: number;
    recentSessions: ComparisonSession[];
}

export const analyticsApi = {
    getAnalytics(): Promise<AnalyticsData> {
        return request<AnalyticsData>('GET', '/api/analytics');
    },
};

// ─── Data Integration API ────────────────────────────────────────────────────────

export interface DataSource {
    id: number;
    name: string;
    provider: 'postgresql' | 'mysql';
    host: string;
    port: number;
    database: string;
    username: string;
    password?: string;
    created_at: string;
}

export type DataSourceInput = Omit<DataSource, 'id' | 'created_at'>;

export interface ColumnSchema {
    name: string;
    data_type: string;
}

export interface TableSchema {
    name: string;
    columns: ColumnSchema[];
}

export interface JoinConfig {
    type: string;
    table: string;
    on_source: string;
    on_target: string;
}

export interface ColumnMapping {
    target_column: string;
    expression: string;
}

export interface PipelineConfig {
    base_table: string;
    joins: JoinConfig[];
    mappings: ColumnMapping[];
    filters?: {
        column: string;
        operator: string;
        value: string;
    }[];
    limit?: number;
    cron_active?: boolean;
    cron?: string;
}

export interface TransformationPipeline {
    id?: number;
    data_source_id: number;
    name: string;
    config: PipelineConfig;
}



export const integrationApi = {
    createDataSource(payload: DataSourceInput): Promise<DataSource> {
        return request<DataSource>('POST', '/api/datasources', payload);
    },
    testConnection(payload: DataSourceInput): Promise<{ message: string }> {
        return request<{ message: string }>('POST', '/api/datasources/test', payload);
    },
    listDataSources(): Promise<DataSource[]> {
        return request<DataSource[]>('GET', '/api/datasources');
    },
    getSchema(id: number): Promise<TableSchema[]> {
        return request<TableSchema[]>('GET', `/api/datasources/${id}/schema`);
    },
    previewPipeline(payload: TransformationPipeline): Promise<{ data: Record<string, unknown>[] }> {
        return request<{ data: Record<string, unknown>[] }>('POST', '/api/pipelines/preview', payload);
    },
    runPipeline(payload: TransformationPipeline): Promise<BatchValidationResponse> {
        return request<BatchValidationResponse>('POST', '/api/pipelines/run', payload);
    },
    savePipeline(payload: TransformationPipeline): Promise<TransformationPipeline> {
        return request<TransformationPipeline>('POST', '/api/pipelines', payload);
    },
    getPipelines(dataSourceId: number): Promise<TransformationPipeline[]> {
        return request<TransformationPipeline[]>('GET', `/api/datasources/${dataSourceId}/pipelines`);
    },
    deletePipeline(id: number): Promise<void> {
        return request<void>('DELETE', `/api/pipelines/${id}`);
    },

    // --- ERP Integrations ---
    listErpIntegrations: async (): Promise<ErpIntegration[]> => {
        return request<ErpIntegration[]>('GET', '/api/erp-integrations');
    },
    createErpIntegration: async (data: ErpIntegrationRequest): Promise<ErpIntegration> => {
        return request<ErpIntegration>('POST', '/api/erp-integrations', data);
    },
    updateErpIntegration: async (id: number, data: Partial<ErpIntegrationRequest>): Promise<ErpIntegration> => {
        return request<ErpIntegration>('PUT', `/api/erp-integrations/${id}`, data);
    },
    deleteErpIntegration: async (id: number): Promise<void> => {
        return request<void>('DELETE', `/api/erp-integrations/${id}`);
    },
    syncErpIntegration: async (id: number): Promise<void> => {
        return request<void>('POST', `/api/erp-integrations/${id}/sync`);
    }
};

// ─── Batch Processing API ────────────────────────────────────────────────────────

export interface Batch {
    id: string;
    user_id: number;
    name: string;
    status: 'draft' | 'processing' | 'completed' | 'failed';
    created_at: string;
    updated_at: string;
}

export interface BatchItem {
    id: string;
    batch_id: string;
    connote: string;
    recipient_name: string;
    system_address: string;
    system_lat: number | null;
    system_lng: number | null;
    field_lat: number | null;
    field_lng: number | null;
    distance_km: number | null;
    accuracy_level: string;
    error: string;
    geocode_status: string;
    created_at: string;
    updated_at: string;
}

export interface SystemRecord {
    connote: string;
    recipient_name: string;
    system_address: string;
}

export interface FieldRecord {
    connote: string;
    field_lat: number;
    field_lng: number;
}

export const batchApi = {
    createBatch: async (name: string): Promise<Batch> => {
        return request<Batch>('POST', '/api/batches', { name });
    },
    listBatches: async (): Promise<Batch[]> => {
        return request<Batch[]>('GET', '/api/batches');
    },
    uploadSystemData: async (batchId: string, records: SystemRecord[]): Promise<void> => {
        return request<void>('POST', `/api/batches/${batchId}/system-data`, records);
    },
    uploadFieldData: async (batchId: string, records: FieldRecord[]): Promise<void> => {
        return request<void>('POST', `/api/batches/${batchId}/field-data`, records);
    },
    processBatch: async (batchId: string): Promise<void> => {
        return request<void>('POST', `/api/batches/${batchId}/process`);
    },
    getBatchResults: async (batchId: string): Promise<BatchItem[]> => {
        return request<BatchItem[]>('GET', `/api/batches/${batchId}/results`);
    },
};
