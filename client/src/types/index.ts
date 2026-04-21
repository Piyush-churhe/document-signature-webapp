export interface User {
  _id: string;
  name: string;
  email: string;
  role: 'user' | 'admin';
  company?: string;
  createdAt: string;
}

export interface SignatureField {
  id: string;
  type: 'signature' | 'initials' | 'stamp' | 'name' | 'date' | 'text';
  signerOrder?: number;
  x: number; // percentage
  y: number; // percentage
  width: number;
  height: number;
  page: number;
  required: boolean;
  label?: string;
  value?: string;
}

export interface DocumentSigner {
  name: string;
  email: string;
  order: number;
  status: 'pending' | 'signed' | 'rejected';
  signedAt?: string;
  rejectionReason?: string;
  ipAddress?: string;
}

export interface RiskyClause {
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high';
}

export interface AIAnalysis {
  summary: string;
  riskScore: 'low' | 'medium' | 'high';
  riskReason: string;
  riskyClauses: RiskyClause[];
  keyObligations: string[];
  missingElements: string[];
  documentType: string;
  signerRights: string[];
  recommendation: string;
}

export interface Document {
  _id: string;
  title: string;
  originalName: string;
  filePath: string;
  fileSize: number;
  owner: User | string;
  status: 'pending' | 'signed' | 'rejected' | 'expired';
  signers?: DocumentSigner[];
  currentSignerIndex?: number;
  signerEmail?: string;
  signerName?: string;
  signatureFields: SignatureField[];
  signedFilePath?: string;
  signingToken?: string;
  tokenExpiry?: string;
  rejectionReason?: string;
  message?: string;
  aiAnalysis?: AIAnalysis;
  aiAnalyzedAt?: string;
  pageCount: number;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SigningProgress {
  signers: DocumentSigner[];
  currentSignerIndex: number;
  signedCount: number;
  totalSigners: number;
  status: Document['status'];
}

export interface SignatureData {
  type: 'typed' | 'drawn' | 'uploaded';
  category: 'signature' | 'initials' | 'stamp';
  data: string; // base64 or text
  fontStyle?: string;
  color?: string;
  fields: { fieldId: string; x: number; y: number; page: number; width: number; height: number; }[];
}

export interface AuditLog {
  _id: string;
  document: string;
  action: string;
  actor?: User;
  actorEmail?: string;
  actorName?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
}

export type DocumentStatus = 'all' | 'pending' | 'signed' | 'rejected' | 'expired';
