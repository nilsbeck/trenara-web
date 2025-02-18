import type { Integration } from './types';
import { apiClient } from './config';

export const integrationsApi = {
async getIntegrations(): Promise<Integration[]> {
    const response = await apiClient.getAxios().get<Integration[]>('/api/integrations');
    return response.data;
},

async connectStrava(code: string): Promise<Integration> {
    const response = await apiClient.getAxios().post<Integration>('/api/integrations/strava', { code });
    return response.data;
},

async connectGarmin(username: string, password: string): Promise<Integration> {
    const response = await apiClient.getAxios().post<Integration>('/api/integrations/garmin', { username, password });
    return response.data;
},

async connectPolar(code: string): Promise<Integration> {
    const response = await apiClient.getAxios().post<Integration>('/api/integrations/polar', { code });
    return response.data;
},

async disconnectIntegration(provider: string): Promise<void> {
    await apiClient.getAxios().delete(`/api/integrations/${provider}`);
},

async syncIntegration(provider: string): Promise<void> {
    await apiClient.getAxios().post(`/api/integrations/${provider}/sync`);
}
};

