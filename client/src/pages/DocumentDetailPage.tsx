import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { documentService } from '../services/documentService';
import { Document, AuditLog, SigningProgress, AIAnalysis } from '../types';
import Navbar from '../components/ui/Navbar';
import MultiSignerForm, { MultiSignerInput } from '../components/documents/MultiSignerForm';
import AIAnalysisPanel from '../components/ai/AIAnalysisPanel';
import toast from 'react-hot-toast';
import api from '../services/api';
import { aiService } from '../services/aiService';
import { ArrowLeft, Edit3, Link as LinkIcon, Download, Clock, CheckCircle, XCircle, Shield, User, Globe, FileText, Lock } from 'lucide-react';
import { format } from 'date-fns';

const ACTION_LABELS: Record<string, { label: string; icon: any; color: string }> = {
  document_created: { label: 'Document Created', icon: FileText, color: 'text-blue-400' },
  document_viewed: { label: 'Document Viewed', icon: User, color: 'text-slate-400' },
  signing_link_generated: { label: 'Signing Link Generated', icon: LinkIcon, color: 'text-indigo-400' },
  document_opened: { label: 'Document Opened by Signer', icon: Globe, color: 'text-cyan-400' },
  signature_placed: { label: 'Signature Placed', icon: Edit3, color: 'text-yellow-400' },
  document_signed: { label: 'Document Signed', icon: CheckCircle, color: 'text-emerald-400' },
  document_rejected: { label: 'Document Rejected', icon: XCircle, color: 'text-red-400' },
  document_downloaded: { label: 'Document Downloaded', icon: Download, color: 'text-purple-400' },
};

export default function DocumentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [document, setDocument] = useState<Document | null>(null);
  const [signingProgress, setSigningProgress] = useState<SigningProgress | null>(null);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [signingLink, setSigningLink] = useState('');
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [analysis, setAnalysis] = useState<AIAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [linkForm, setLinkForm] = useState<{ signers: MultiSignerInput[]; message: string }>({
    signers: [{ name: '', email: '', order: 1 }],
    message: ''
  });
  const [generatingLink, setGeneratingLink] = useState(false);

  const hydrateSignerForm = (doc: Document) => {
    const signersFromDoc = Array.isArray(doc.signers) && doc.signers.length > 0
      ? doc.signers.map((signer, index) => ({
        name: signer.name || '',
        email: signer.email || '',
        order: signer.order || index + 1,
      }))
      : (doc.signerEmail || doc.signerName
        ? [{ name: doc.signerName || '', email: doc.signerEmail || '', order: 1 }]
        : [{ name: '', email: '', order: 1 }]);

    setLinkForm(prev => ({
      ...prev,
      signers: signersFromDoc,
    }));
  };

  const loadSigningProgress = async (docId: string) => {
    try {
      const { data } = await documentService.getSignersProgress(docId);
      setSigningProgress(data);
    } catch {
      setSigningProgress(null);
    }
  };

  const loadAuditLogs = async (docId: string) => {
    try {
      const { data } = await api.get(`/audit/${docId}`);
      setLogs(data.logs || []);
    } catch {
      // Ignore polling errors to avoid noisy toasts.
    }
  };

  const refreshDocumentAndProgress = async () => {
    if (!id) return;
    try {
      const [{ data }, auditRes] = await Promise.all([
        documentService.getById(id, { trackView: false }),
        api.get(`/audit/${id}`),
      ]);
      setDocument(data.document);
      setLogs(auditRes.data.logs || []);
      await loadSigningProgress(id);
    } catch {
      // Ignore polling errors to avoid noisy toasts.
    }
  };

  useEffect(() => {
    const load = async () => {
      try {
        const [docRes] = await Promise.all([
          documentService.getById(id!),
        ]);
        const loadedDoc = docRes.data.document;
        setDocument(loadedDoc);
        if (loadedDoc.aiAnalysis) {
          setAnalysis(loadedDoc.aiAnalysis);
        }
        await loadAuditLogs(id!);
        hydrateSignerForm(loadedDoc);
        await loadSigningProgress(id!);
      } catch { toast.error('Failed to load document'); navigate('/dashboard'); }
      finally { setLoading(false); }
    };
    load();
  }, [id]);

  useEffect(() => {
    if (!id) return;
    const interval = setInterval(() => {
      refreshDocumentAndProgress();
    }, 8000);

    const handleVisibilityChange = () => {
      if (window.document.visibilityState === 'visible') {
        refreshDocumentAndProgress();
      }
    };

    window.document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      clearInterval(interval);
      window.document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [id]);

  const generateLink = async () => {
    const normalizedSigners = linkForm.signers
      .map((signer, index) => ({
        name: signer.name.trim(),
        email: signer.email.trim(),
        order: index + 1,
      }))
      .filter(signer => signer.name || signer.email);

    if (normalizedSigners.length === 0 || normalizedSigners.some(s => !s.name || !s.email)) {
      toast.error('Please add name and email for every signer');
      return;
    }

    const emailSet = new Set<string>();
    const hasDuplicateEmails = normalizedSigners.some((signer) => {
      const email = signer.email.toLowerCase();
      if (emailSet.has(email)) return true;
      emailSet.add(email);
      return false;
    });
    if (hasDuplicateEmails) {
      toast.error('Multiple signers cannot have the same email');
      return;
    }

    // Fields must be manually placed by the owner in the editor before sending.

    setGeneratingLink(true);
    try {
      const firstSigner = normalizedSigners[0];
      const { data } = await documentService.generateSigningLink(id!, {
        signerName: firstSigner.name,
        signerEmail: firstSigner.email,
        signers: normalizedSigners,
        message: linkForm.message,
      });
      setSigningLink(data.signingLink);
      setDocument(data.document);
      await loadSigningProgress(id!);
      toast.success('Signing link generated!');
      setShowLinkModal(false);
    } catch (err: any) { toast.error(err.response?.data?.message || 'Failed to generate link'); }
    finally { setGeneratingLink(false); }
  };

  const copyLink = () => { navigator.clipboard.writeText(signingLink || `${window.location.origin}/sign/${document?.signingToken}`); toast.success('Link copied!'); };

  const download = async () => {
    try {
      const res = await documentService.download(id!);
      const url = URL.createObjectURL(res.data);
      const a = window.document.createElement('a'); a.href = url; a.download = `${document?.title}.pdf`; a.click();
      URL.revokeObjectURL(url);
    } catch { toast.error('Failed to download'); }
  };

  const handleAnalyze = async (force = false) => {
    if (!id) return;
    setAnalyzing(true);
    try {
      const { data } = await aiService.analyzeDocument(id, force);
      setAnalysis(data.analysis);
      setDocument((prev) => prev ? { ...prev, aiAnalysis: data.analysis, aiAnalyzedAt: new Date().toISOString() } : prev);
      toast.success('Analysis complete!');
    } catch (err: any) {
      console.error('Document analysis failed:', err);
      toast.error(err.response?.data?.message || 'Failed to analyze document');
    } finally {
      setAnalyzing(false);
    }
  };

  if (loading) return (
    <div className="min-h-screen" style={{ background: '#0f0f17' }}>
      <Navbar />
      <div className="max-w-4xl mx-auto px-6 py-10">
        <div className="card h-96 animate-pulse" />
      </div>
    </div>
  );

  if (!document) return null;

  const progressSigners = signingProgress?.signers
    || (Array.isArray(document.signers) && document.signers.length > 0
      ? document.signers
      : (document.signerEmail || document.signerName
        ? [{
          name: document.signerName || 'Signer',
          email: document.signerEmail || '',
          order: 1,
          status: document.status === 'signed' ? 'signed' : (document.status === 'rejected' ? 'rejected' : 'pending')
        }]
        : []));
  const currentSignerIndex = signingProgress?.currentSignerIndex ?? document.currentSignerIndex ?? 0;
  const signedCount = signingProgress?.signedCount ?? progressSigners.filter(s => s.status === 'signed').length;

  const statusConf = { pending: { icon: Clock, cls: 'status-pending', label: 'Pending' }, signed: { icon: CheckCircle, cls: 'status-signed', label: 'Signed' }, rejected: { icon: XCircle, cls: 'status-rejected', label: 'Rejected' }, expired: { icon: Clock, cls: 'status-expired', label: 'Expired' } };
  const status = statusConf[document.status];

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(135deg, #0f0f17 0%, #1a1a2e 100%)' }}>
      <Navbar />
      <main className="max-w-5xl mx-auto px-6 py-10">
        {/* Breadcrumb */}
        <div className="flex items-center gap-3 mb-8 animate-fade-in">
          <Link to="/dashboard" className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm">
            <ArrowLeft className="w-4 h-4" /> Dashboard
          </Link>
          <span className="text-slate-600">/</span>
          <span className="text-slate-300 text-sm truncate">{document.title}</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main card */}
          <div className="lg:col-span-2 space-y-6 animate-slide-up">
            <div className="card border border-white/5">
              <div className="flex items-start gap-4 mb-6">
                <div className="w-14 h-14 bg-gradient-to-br from-red-500/20 to-orange-500/20 rounded-2xl flex items-center justify-center border border-red-500/20 flex-shrink-0">
                  <FileText className="w-7 h-7 text-red-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <h1 className="text-2xl font-bold text-white mb-1 truncate">{document.title}</h1>
                  <p className="text-slate-400 text-sm">{document.originalName}</p>
                  <div className="flex items-center gap-3 mt-3">
                    <span className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full ${status.cls}`}>
                      <status.icon className="w-3.5 h-3.5" />
                      {status.label}
                    </span>
                    <span className="text-xs text-slate-500">{document.pageCount} page{document.pageCount !== 1 ? 's' : ''}</span>
                    <span className="text-xs text-slate-500">{document.fileSize ? (document.fileSize / 1024 / 1024).toFixed(2) + ' MB' : ''}</span>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-wrap gap-3">
                {document.status === 'pending' && (
                  <Link to={`/docs/${document._id}/edit`} className="btn-primary flex items-center gap-2 text-sm">
                    <Edit3 className="w-4 h-4" /> Edit & Place Signatures
                  </Link>
                )}
                {document.signingToken && document.status === 'pending' && (
                  <button onClick={copyLink} className="btn-secondary flex items-center gap-2 text-sm">
                    <LinkIcon className="w-4 h-4" /> Copy Signing Link
                  </button>
                )}
                {!document.signingToken && document.status === 'pending' && (
                  <button onClick={() => setShowLinkModal(true)} className="btn-secondary flex items-center gap-2 text-sm">
                    <LinkIcon className="w-4 h-4" /> Generate Signing Link
                  </button>
                )}
                {(document.signedFilePath || document.filePath) && (
                  <button onClick={download} className="btn-secondary flex items-center gap-2 text-sm">
                    <Download className="w-4 h-4" /> Download {document.signedFilePath ? 'Signed PDF' : 'PDF'}
                  </button>
                )}
              </div>
            </div>

            {/* Details */}
            <div className="card border border-white/5">
              <h3 className="text-sm font-semibold text-slate-300 mb-4 uppercase tracking-wider">Document Details</h3>
              <div className="space-y-3">
                {[
                  { label: 'Created', value: format(new Date(document.createdAt), 'PPP') },
                  { label: 'Current Signer', value: progressSigners[currentSignerIndex]?.name || document.signerName || '—' },
                  { label: 'Current Signer Email', value: progressSigners[currentSignerIndex]?.email || document.signerEmail || '—' },
                  { label: 'Signature Fields', value: `${document.signatureFields.length} field${document.signatureFields.length !== 1 ? 's' : ''}` },
                  ...(document.completedAt ? [{ label: 'Completed', value: format(new Date(document.completedAt), 'PPP p') }] : []),
                  ...(document.rejectionReason ? [{ label: 'Rejection Reason', value: document.rejectionReason }] : []),
                ].map(item => (
                  <div key={item.label} className="flex items-start justify-between gap-4">
                    <span className="text-slate-500 text-sm">{item.label}</span>
                    <span className="text-slate-200 text-sm text-right">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="card border border-white/5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Signing Progress</h3>
                <span className="text-xs text-slate-400">{signedCount} of {progressSigners.length} signed</span>
              </div>
              {progressSigners.length === 0 ? (
                <p className="text-slate-500 text-sm">No signers configured yet.</p>
              ) : (
                <div className="space-y-3">
                  {progressSigners.map((signer, index) => {
                    const isCurrent = document.status === 'pending' && index === currentSignerIndex && signer.status === 'pending';
                    const state = signer.status === 'rejected' ? 'rejected' : signer.status === 'signed' ? 'signed' : isCurrent ? 'current' : 'waiting';
                    const conf = {
                      signed: { icon: CheckCircle, cls: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30', label: 'Signed' },
                      rejected: { icon: XCircle, cls: 'text-red-300 bg-red-500/10 border-red-500/30', label: 'Rejected' },
                      current: { icon: Clock, cls: 'text-amber-300 bg-amber-500/10 border-amber-500/30', label: 'Current' },
                      waiting: { icon: Lock, cls: 'text-slate-300 bg-white/5 border-white/10', label: 'Waiting' },
                    }[state];
                    return (
                      <div key={`${signer.email}-${index}`} className={`rounded-2xl border p-3 ${conf.cls}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium text-white">{signer.order}. {signer.name || 'Signer'}</p>
                            <p className="text-xs text-slate-300 mt-0.5">{signer.email}</p>
                            {signer.signedAt && (
                              <p className="text-xs text-slate-400 mt-1">Signed {format(new Date(signer.signedAt), 'PPp')}</p>
                            )}
                            {signer.rejectionReason && (
                              <p className="text-xs text-red-300 mt-1">Reason: {signer.rejectionReason}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 text-xs font-medium">
                            <conf.icon className="w-4 h-4" />
                            {conf.label}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Audit trail */}
          <div className="animate-slide-up">
            <div className="card border border-white/5 h-full">
              <div className="flex items-center gap-2 mb-6">
                <Shield className="w-5 h-5 text-amber-400" />
                <h3 className="font-semibold text-white">Audit Trail</h3>
              </div>
              {logs.length === 0 ? (
                <p className="text-slate-500 text-sm text-center py-8">No activity yet</p>
              ) : (
                <div className="space-y-4 max-h-96 overflow-y-auto pr-1">
                  {logs.map((log, i) => {
                    const conf = ACTION_LABELS[log.action] || { label: log.action, icon: Clock, color: 'text-slate-400' };
                    return (
                      <div key={log._id} className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <div className={`w-7 h-7 rounded-full bg-white/5 flex items-center justify-center ${conf.color}`}>
                            <conf.icon className="w-3.5 h-3.5" />
                          </div>
                          {i < logs.length - 1 && <div className="w-px flex-1 bg-white/5 mt-1" />}
                        </div>
                        <div className="pb-4">
                          <p className={`text-sm font-medium ${conf.color}`}>{conf.label}</p>
                          <p className="text-xs text-slate-500 mt-0.5">{log.actorName || log.actorEmail || 'System'}</p>
                          {log.ipAddress && <p className="text-xs text-slate-600 mt-0.5 font-mono">{log.ipAddress}</p>}
                          <p className="text-xs text-slate-600 mt-0.5">{format(new Date(log.timestamp), 'PPp')}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        <section className="mt-6 animate-slide-up">
          <AIAnalysisPanel analysis={analysis} loading={analyzing} onAnalyze={handleAnalyze} />
        </section>
      </main>

      {/* Generate Link Modal */}
      {showLinkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}>
          <div className="glass-light rounded-3xl w-full max-w-md shadow-2xl p-8 animate-scale-in">
            <h3 className="text-xl font-bold text-white mb-6">Generate Signing Link</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Signers</label>
                <MultiSignerForm value={linkForm.signers} onChange={(signers) => setLinkForm({ ...linkForm, signers })} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Message (optional)</label>
                <textarea
                  value={linkForm.message}
                  onChange={e => setLinkForm({ ...linkForm, message: e.target.value })}
                  className="input-field resize-none"
                  rows={2}
                  placeholder="Please review and sign..."
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowLinkModal(false)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={generateLink} disabled={generatingLink} className="btn-primary flex-1">{generatingLink ? 'Generating...' : 'Generate Link'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
