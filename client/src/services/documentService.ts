import api from './api';
import { Document, SignatureField, SigningProgress } from '../types';

export interface SigningLinkSignerInput {
  name: string;
  email: string;
  order: number;
}

export interface GenerateSigningLinkPayload {
  signerEmail?: string;
  signerName?: string;
  signers?: SigningLinkSignerInput[];
  message?: string;
}

export const documentService = {
  upload: (formData: FormData) => api.post<{ document: Document }>('/docs/upload', formData, {
    // Let the browser set multipart boundary automatically.
    // Override timeout for PDF parsing/upload on slower machines.
    timeout: 120000,
  }),
  
  getAll: (status?: string) => api.get<{ documents: Document[]; total: number; stats: { _id: string; count: number }[] }>('/docs', {
    params: status && status !== 'all' ? { status } : undefined
  }),
  
  getById: (id: string, options?: { trackView?: boolean }) =>
    api.get<{ document: Document }>(`/docs/${id}`, {
      params: options?.trackView === false ? { trackView: 'false' } : undefined,
    }),

  getSignersProgress: (id: string) => api.get<SigningProgress>(`/docs/${id}/signers`),
  
  updateFields: (id: string, fields: SignatureField[]) => api.put<{ document: Document }>(`/docs/${id}/fields`, { fields }),
  
  generateSigningLink: (id: string, data: GenerateSigningLinkPayload) =>
    api.post<{ signingLink: string; token: string; document: Document }>(`/docs/${id}/signing-link`, data),
  
  delete: (id: string) => api.delete(`/docs/${id}`),
  
  download: (id: string) => api.get(`/docs/${id}/download`, { responseType: 'blob' }),
};
