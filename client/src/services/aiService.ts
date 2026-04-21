import api from './api';
import { AIAnalysis } from '../types';

export const aiService = {
  analyzeDocument: (id: string, force = false) =>
    api.post<{ analysis: AIAnalysis }>(`/ai/analyze/${id}${force ? '?force=true' : ''}`),

  analyzePublicDocument: (token: string, force = false) =>
    api.post<{ analysis: AIAnalysis }>(`/ai/analyze-public/${token}${force ? '?force=true' : ''}`),
};
