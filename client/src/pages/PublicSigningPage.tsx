import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import api, { resolveUploadsUrlFromFilePath } from '../services/api';
import { AIAnalysis, Document, SignatureField } from '../types';
import AIAnalysisPanel from '../components/ai/AIAnalysisPanel';
import SignatureModal from '../components/signature/SignatureModal';
import toast from 'react-hot-toast';
import { Pen, CheckCircle, XCircle, Clock, Shield, Globe, Sparkles, Loader2, GripVertical, Type, Stamp, UserRound, CalendarDays, AlignLeft } from 'lucide-react';
import { aiService } from '../services/aiService';

declare global { interface Window { pdfjsLib: any; } }

type PageState = 'loading' | 'otp' | 'form' | 'signing' | 'signed' | 'rejected' | 'expired' | 'error';

export default function PublicSigningPage() {
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<PageState>('loading');
  const [document, setDocument] = useState<Document | null>(null);
  const [signerInfo, setSignerInfo] = useState({ name: '', email: '' });
  const [otp, setOtp] = useState('');
  const [otpError, setOtpError] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);
  const [maskedEmail, setMaskedEmail] = useState('');
  const [resendTimer, setResendTimer] = useState(0);
  const [signatures, setSignatures] = useState<any[]>([]);
  const [showSigModal, setShowSigModal] = useState(false);
  const [sigCategory, setSigCategory] = useState<'signature' | 'initials' | 'stamp'>('signature');
  const [submitting, setSubmitting] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [analysis, setAnalysis] = useState<AIAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [pdfLoaded, setPdfLoaded] = useState(false);
  const [activeFields, setActiveFields] = useState<SignatureField[]>([]);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [draggingFieldId, setDraggingFieldId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pdfContainerRef = useRef<HTMLDivElement>(null);
  const pdfDocRef = useRef<any>(null);
  const [currentPage, setCurrentPage] = useState(1);

  const getFieldSignerOrder = (field: any) => Number(field?.signerOrder || 1);
  const formatSigningDate = () => new Date().toLocaleDateString('en-GB');
  const isSignatureCategoryField = (type: SignatureField['type']) => type === 'signature' || type === 'initials' || type === 'stamp';
  const getFieldCategory = (type: SignatureField['type']) => (type === 'initials' ? 'initials' : type === 'stamp' ? 'stamp' : 'signature');
  const createFallbackSignatureField = (category: 'signature' | 'initials' | 'stamp') => ({
    id: `fallback-${category}-${Date.now()}`,
    type: category,
    signerOrder: Number((document as any)?.activeSignerOrder || getActiveSignerOrder(document)),
    x: 65,
    y: 78,
    width: category === 'stamp' ? 180 : 220,
    height: category === 'stamp' ? 70 : 80,
    page: currentPage,
    required: true,
    label: category,
    value: '',
  } as SignatureField);
  const getFieldTypeMeta = (type: SignatureField['type']) => {
    if (type === 'signature') return { label: 'Signature', icon: Pen };
    if (type === 'initials') return { label: 'Initials', icon: Type };
    if (type === 'stamp') return { label: 'Company Stamp', icon: Stamp };
    if (type === 'name') return { label: 'Name', icon: UserRound };
    if (type === 'date') return { label: 'Date', icon: CalendarDays };
    return { label: 'Text', icon: AlignLeft };
  };
  const getActiveSignerOrder = (doc: Document | null) => {
    if (!doc) return 1;
    const signers = Array.isArray(doc.signers) ? doc.signers : [];
    if (signers.length === 0) return 1;
    const index = Math.min(Math.max(Number(doc.currentSignerIndex || 0), 0), signers.length - 1);
    return Number(signers[index]?.order || 1);
  };

  const sendOTP = useCallback(async (showToast = false) => {
    if (!token) return;
    setOtpError('');
    setOtpLoading(true);
    try {
      const { data } = await api.post('/public/otp/send', { token });
      setMaskedEmail(data.maskedEmail || '');
      setResendTimer(30);
      if (showToast) toast.success('OTP sent to your email');
    } catch (err: any) {
      const message = err.response?.data?.message || 'Failed to send OTP';
      setOtpError(message);
      if (showToast) toast.error(message);
    } finally {
      setOtpLoading(false);
    }
  }, [token]);

  const verifyOTP = async () => {
    if (!token) return;
    if (!/^\d{6}$/.test(otp)) {
      setOtpError('Please enter a valid 6-digit OTP');
      return;
    }

    setOtpError('');
    setOtpLoading(true);
    try {
      await api.post('/public/otp/verify', { token, otp });
      setState('form');
      setOtp('');
      toast.success('Identity verified successfully');
    } catch (err: any) {
      setOtpError(err.response?.data?.message || 'OTP verification failed');
    } finally {
      setOtpLoading(false);
    }
  };

  useEffect(() => {
    if (resendTimer <= 0) return;
    const interval = setInterval(() => {
      setResendTimer((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => clearInterval(interval);
  }, [resendTimer]);

  useEffect(() => {
    const abortController = new AbortController();

    const loadPdfLib = async () => {
      if (!window.pdfjsLib) {
        const script = window.document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
        await new Promise(res => { script.onload = res; window.document.head.appendChild(script); });
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      }
    };
    const loadDoc = async () => {
      try {
        await loadPdfLib();
        const { data } = await api.get(`/public/sign/${token}`, { signal: abortController.signal });
        setDocument(data.document);
        if (data.document?.aiAnalysis) {
          setAnalysis(data.document.aiAnalysis);
        }
        setSignerInfo({ name: data.document.signerName || '', email: data.document.signerEmail || '' });
        if (data.document.signerEmail) {
          await sendOTP();
          setState('otp');
        } else {
          setState('form');
        }
      } catch (err: any) {
        if (err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED') return;
        const status = err.response?.data?.status;
        if (status === 'signed') setState('signed');
        else if (status === 'rejected') setState('rejected');
        else if (status === 'expired') setState('expired');
        else setState('error');
      }
    };
    loadDoc();

    return () => {
      abortController.abort();
    };
  }, [token, sendOTP]);

  useEffect(() => {
    if (!document) {
      setActiveFields([]);
      return;
    }

    const activeSignerOrder = Number((document as any).activeSignerOrder || getActiveSignerOrder(document));
    const signerFields = (document.signatureFields || []).filter(field => getFieldSignerOrder(field) === activeSignerOrder);
    setActiveFields(signerFields);
    setFieldValues(prev => {
      const next = { ...prev };
      signerFields.forEach(field => {
        if (next[field.id]) return;
        if (field.type === 'name') next[field.id] = signerInfo.name || '';
        else if (field.type === 'date') next[field.id] = formatSigningDate();
        else if (field.type === 'text') next[field.id] = field.value || '';
      });
      return next;
    });
  }, [document, signerInfo.name]);

  useEffect(() => {
    setFieldValues(prev => {
      const next = { ...prev };
      activeFields.forEach(field => {
        if (field.type === 'name' && !next[field.id]) next[field.id] = signerInfo.name || '';
        if (field.type === 'date' && !next[field.id]) next[field.id] = formatSigningDate();
      });
      return next;
    });
  }, [activeFields, signerInfo.name]);

  const renderPDF = useCallback(async (doc: Document) => {
    if (!window.pdfjsLib || !canvasRef.current) return;
    try {
      const sourcePath = doc.signedFilePath || doc.filePath;
      
      // Validate file path exists
      if (!sourcePath) {
        console.error('❌ No file path found in document:', doc);
        toast.error('Document file not found. Please contact support.');
        return;
      }

      // Safely construct URL
      const url = resolveUploadsUrlFromFilePath(sourcePath);
      if (!url) {
        console.error('❌ Invalid file path format:', sourcePath);
        toast.error('Invalid document file path format.');
        return;
      }
      console.log(`📄 Loading PDF from: ${url}`);
      
      pdfDocRef.current = await window.pdfjsLib.getDocument(url).promise;
      const page = await pdfDocRef.current.getPage(currentPage);
      const viewport = page.getViewport({ scale: 1.2 });
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d')!;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: ctx, viewport }).promise;
      setPdfLoaded(true);
      console.log(`✅ PDF loaded successfully from: ${url}`);
    } catch (e: any) { 
      console.error('❌ PDF render error:', e);
      toast.error(`Failed to load PDF: ${e?.message || 'Unknown error'}`);
    }
  }, [currentPage]);

  useEffect(() => {
    if (document && state === 'signing') {
      setTimeout(() => renderPDF(document), 300);
    }
  }, [document, state, currentPage, renderPDF]);

  const startSigning = () => {
    if (!signerInfo.name.trim()) { toast.error('Please enter your name'); return; }
    setState('signing');
  };

  const handleAnalyze = async (force = false) => {
    if (!token) return;

    setAnalyzing(true);
    setShowAnalysis(true);
    try {
      const { data } = await aiService.analyzePublicDocument(token, force);
      setAnalysis(data.analysis);
      toast.success('Analysis complete!');
    } catch (err: any) {
      console.error('Public analysis failed:', err);
      toast.error(err.response?.data?.message || 'Failed to analyze document');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleApplySig = (sig: any) => {
    setSignatures(prev => {
      const existing = prev.findIndex(s => s.category === sig.category);
      const updated = [...prev];
      const fieldsForCategory = activeFields.filter(f => f.type === sig.category || (sig.category === 'signature' && f.type === 'signature'));

      const resolvedFields = fieldsForCategory.length > 0
        ? fieldsForCategory
        : [createFallbackSignatureField(sig.category)];

      if (fieldsForCategory.length === 0) {
        setActiveFields(prevFields => {
          const fallbackField = resolvedFields[0];
          if (prevFields.some(field => field.id === fallbackField.id)) return prevFields;
          return [...prevFields, fallbackField];
        });
      }

      const sigWithFields = { ...sig, fields: resolvedFields.map(f => ({ fieldId: f.id, x: f.x, y: f.y, page: f.page, width: f.width, height: f.height })) };
      if (existing >= 0) updated[existing] = sigWithFields;
      else updated.push(sigWithFields);
      return updated;
    });
    toast.success(`${sig.category} applied!`);
  };

  const handleFieldMouseDown = (e: React.MouseEvent, fieldId: string) => {
    e.stopPropagation();
    const container = pdfContainerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const targetField = activeFields.find(field => field.id === fieldId);
    if (!targetField) return;

    const rect = container.getBoundingClientRect();
    const fieldLeftPx = (targetField.x / 100) * rect.width;
    const fieldTopPx = (targetField.y / 100) * canvas.height;
    setDragOffset({ x: e.clientX - rect.left - fieldLeftPx, y: e.clientY - rect.top - fieldTopPx });
    setSelectedFieldId(fieldId);
    setDraggingFieldId(fieldId);
  };

  const handleFieldDrag = useCallback((e: React.MouseEvent) => {
    if (!draggingFieldId || !pdfContainerRef.current || !canvasRef.current) return;

    const rect = pdfContainerRef.current.getBoundingClientRect();
    const canvas = canvasRef.current;

    const targetField = activeFields.find(field => field.id === draggingFieldId);
    if (!targetField) return;

    const maxX = 100 - (targetField.width / rect.width) * 100;
    const maxY = 100 - (targetField.height / canvas.height) * 100;

    const x = Math.max(0, Math.min(maxX, ((e.clientX - rect.left - dragOffset.x) / rect.width) * 100));
    const y = Math.max(0, Math.min(maxY, ((e.clientY - rect.top - dragOffset.y) / canvas.height) * 100));

    setActiveFields(prev => prev.map(field => (field.id === draggingFieldId ? { ...field, x, y } : field)));
  }, [activeFields, dragOffset, draggingFieldId]);

  const submit = async () => {
    const requiredFields = activeFields.filter(field => field.required);
    const missingRequiredField = requiredFields.find(field => {
      if (isSignatureCategoryField(field.type)) {
        return !signatures.some(sig => sig.category === getFieldCategory(field.type));
      }
      return !String(fieldValues[field.id] || '').trim();
    });

    if (missingRequiredField) {
      const { label } = getFieldTypeMeta(missingRequiredField.type);
      toast.error(`Please complete required field: ${label}`);
      return;
    }

    if (signatures.length === 0) { toast.error('Please add at least one signature'); return; }
    const validSignatures = signatures
      .map(sig => ({
        ...sig,
        fields: activeFields
          .filter(field => field.type === sig.category || (sig.category === 'signature' && field.type === 'signature'))
          .map(field => ({ fieldId: field.id, x: field.x, y: field.y, page: field.page, width: field.width, height: field.height })),
      }))
      .filter(sig => Array.isArray(sig.fields) && sig.fields.length > 0);

    if (validSignatures.length === 0) { toast.error('No assigned signature fields found for you'); return; }

    const textFieldsPayload = activeFields
      .filter(field => field.type === 'name' || field.type === 'date' || field.type === 'text')
      .map(field => ({
        fieldId: field.id,
        type: field.type,
        value: String(fieldValues[field.id] || '').trim(),
        x: field.x,
        y: field.y,
        page: field.page,
        width: field.width,
        height: field.height,
        required: Boolean(field.required),
      }));

    setSubmitting(true);
    try {
      await api.post(`/public/sign/${token}`, {
        signerName: signerInfo.name,
        signerEmail: signerInfo.email,
        signatures: validSignatures,
        fieldValues: textFieldsPayload,
        action: 'sign',
      });
      setState('signed');
    } catch (err: any) { toast.error(err.response?.data?.message || 'Failed to submit'); }
    finally { setSubmitting(false); }
  };

  const reject = async () => {
    if (!rejectionReason.trim()) { toast.error('Please provide a reason'); return; }
    setSubmitting(true);
    try {
      await api.post(`/public/sign/${token}`, { signerName: signerInfo.name, signerEmail: signerInfo.email, signatures: [], action: 'reject', rejectionReason });
      setState('rejected');
    } catch { toast.error('Failed to submit'); }
    finally { setSubmitting(false); }
  };

  const StatusPage = ({ icon: Icon, color, title, message }: { icon: any; color: string; title: string; message: string }) => (
    <div className="min-h-screen flex items-center justify-center p-8" style={{ background: 'linear-gradient(135deg, #0f0f17 0%, #1a1a2e 100%)' }}>
      <div className="text-center max-w-md">
        <div className={`w-24 h-24 rounded-full ${color} flex items-center justify-center mx-auto mb-6`}>
          <Icon className="w-12 h-12 text-white" />
        </div>
        <h1 className="text-3xl font-bold text-white mb-3">{title}</h1>
        <p className="text-slate-400 text-lg">{message}</p>
        <div className="mt-8 flex items-center justify-center gap-2 text-slate-500 text-sm">
          <Shield className="w-4 h-4" />
          <span>Secured by SignatureFlow</span>
        </div>
      </div>
    </div>
  );

  if (state === 'loading') return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#0f0f17' }}>
      <div className="text-center">
        <div className="w-16 h-16 border-2 border-amber-400/20 border-t-amber-400 rounded-full animate-spin mx-auto mb-4" />
        <p className="text-slate-400">Loading document...</p>
      </div>
    </div>
  );

  if (state === 'signed') return <StatusPage icon={CheckCircle} color="bg-emerald-500" title="Document Signed" message="The document has been successfully signed. The sender has been notified." />;
  if (state === 'rejected') return <StatusPage icon={XCircle} color="bg-red-500" title="Document Rejected" message="You have declined to sign this document. The sender has been notified." />;
  if (state === 'expired') return <StatusPage icon={Clock} color="bg-slate-500" title="Link Expired" message="This signing link has expired. Please contact the document sender." />;
  if (state === 'error') return <StatusPage icon={XCircle} color="bg-red-500" title="Invalid Link" message="This signing link is invalid or no longer active." />;
  if (state === 'otp') return (
    <div className="min-h-screen flex items-center justify-center px-6 py-10" style={{ background: 'linear-gradient(135deg, #0f0f17 0%, #1a1a2e 100%)' }}>
      <div className="w-full max-w-lg glass-light rounded-3xl p-8 md:p-10 border border-white/10 animate-fade-in">
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-10 h-10 bg-gradient-to-br from-amber-400 to-yellow-600 rounded-xl flex items-center justify-center">
            <Pen className="w-5 h-5 text-gray-900" />
          </div>
          <span className="font-display text-2xl font-semibold text-white">SignatureFlow</span>
        </div>

        <div className="w-16 h-16 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center mx-auto mb-5">
          <Shield className="w-8 h-8 text-amber-400" />
        </div>

        <h1 className="text-3xl font-bold text-center text-white mb-3">Verify Your Identity</h1>
        <p className="text-center text-slate-400 mb-1">We sent a 6-digit OTP to</p>
        <p className="text-center text-amber-300 font-medium mb-8">{maskedEmail || signerInfo.email || 'your email'}</p>

        <input
          value={otp}
          onChange={(e) => {
            const value = e.target.value.replace(/\D/g, '').slice(0, 6);
            setOtp(value);
            if (otpError) setOtpError('');
          }}
          className="input-field text-center text-2xl font-semibold tracking-[0.55em]"
          placeholder="000000"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
        />

        {otpError && <p className="text-sm text-red-400 mt-3 text-center">{otpError}</p>}

        <button
          onClick={verifyOTP}
          disabled={otpLoading || otp.length !== 6}
          className="btn-primary w-full mt-6"
        >
          {otpLoading ? 'Verifying...' : 'Verify OTP'}
        </button>

        <button
          onClick={() => sendOTP(true)}
          disabled={otpLoading || resendTimer > 0}
          className="btn-secondary w-full mt-3"
        >
          {resendTimer > 0 ? `Resend OTP in ${resendTimer}s` : 'Resend OTP'}
        </button>

        <p className="text-center text-xs text-slate-500 mt-6">OTP expires in 10 minutes</p>
      </div>
    </div>
  );

  const pageFields = activeFields.filter(field => field.page === currentPage);
  const requiredFields = activeFields.filter(field => field.required);
  const hasSignatureFields = activeFields.some((field) => isSignatureCategoryField(field.type));
  const optionalFields = activeFields.filter(field => !field.required);
  const canvasWidth = canvasRef.current?.width || 860;
  const canvasHeight = canvasRef.current?.height || 1120;

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(135deg, #0f0f17 0%, #1a1a2e 100%)' }}>
      {/* Header */}
      <div className="border-b border-white/5 px-6 py-4 flex items-center justify-between" style={{ background: 'rgba(15,15,23,0.9)', backdropFilter: 'blur(20px)' }}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-gradient-to-br from-amber-400 to-yellow-600 rounded-xl flex items-center justify-center">
            <Pen className="w-4 h-4 text-gray-900" />
          </div>
          <span className="font-display text-xl font-semibold text-white">SignatureFlow</span>
        </div>
        <div className="flex items-center gap-2 text-slate-400 text-sm">
          <Shield className="w-4 h-4 text-emerald-400" />
          <span>Secure Signing</span>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-10">
        {/* Doc info */}
        {document && (
          <div className="card border border-white/5 mb-6 animate-fade-in">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-gradient-to-br from-red-500/20 to-orange-500/20 rounded-xl flex items-center justify-center border border-red-500/20 flex-shrink-0">
                <Pen className="w-6 h-6 text-red-400" />
              </div>
              <div className="flex-1">
                <h1 className="text-xl font-bold text-white">{document.title}</h1>
                <p className="text-slate-400 text-sm mt-1">Requested by: <span className="text-slate-200">{(document.owner as any)?.name}</span></p>
                {document.message && <p className="mt-2 text-slate-300 text-sm italic bg-white/5 rounded-lg px-4 py-2">"{document.message}"</p>}
              </div>
              <div className="flex items-center gap-2 text-amber-400 text-sm glass rounded-lg px-3 py-1.5">
                <Clock className="w-4 h-4" />
                <span>Awaiting signature</span>
              </div>
            </div>
          </div>
        )}

        {state === 'form' ? (
          <div className="max-w-md mx-auto animate-slide-up">
            <div className="card border border-white/5">
              <h2 className="text-xl font-bold text-white mb-2">Your Information</h2>
              <p className="text-slate-400 text-sm mb-6">Please confirm your details before signing</p>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Full Name *</label>
                  <input value={signerInfo.name} onChange={e => setSignerInfo({...signerInfo, name: e.target.value})} className="input-field" placeholder="Your full name" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Email</label>
                  <input type="email" value={signerInfo.email} onChange={e => setSignerInfo({...signerInfo, email: e.target.value})} className="input-field" placeholder="your@email.com" />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={() => setShowRejectModal(true)} className="btn-secondary flex-1 flex items-center justify-center gap-2">
                  <XCircle className="w-4 h-4" /> Decline
                </button>
                <button onClick={startSigning} className="btn-primary flex-1 flex items-center justify-center gap-2">
                  <Pen className="w-4 h-4" /> Review & Sign
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* AI Analysis Section */}
            {analysis && (
              <div className="mb-8 animate-fade-in">
                <AIAnalysisPanel analysis={analysis} loading={analyzing} onAnalyze={handleAnalyze} />
              </div>
            )}

            <div className="flex gap-6 animate-fade-in">
              <div className="flex-1">
                {document && (document as any).pageCount > 1 && (
                  <div className="flex items-center justify-center gap-4 mb-4">
                  <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="btn-secondary px-3 py-1 text-sm">Prev</button>
                    <span className="text-slate-300 text-sm">Page {currentPage} of {(document as any).pageCount}</span>
                    <button onClick={() => setCurrentPage(p => Math.min((document as any).pageCount, p + 1))} disabled={currentPage === (document as any).pageCount} className="btn-secondary px-3 py-1 text-sm">Next</button>
                  </div>
                )}
                <div className="flex justify-center">
                <div
                  ref={pdfContainerRef}
                  className="relative shadow-2xl"
                  onMouseMove={handleFieldDrag}
                  onMouseUp={() => setDraggingFieldId(null)}
                  onMouseLeave={() => setDraggingFieldId(null)}
                  style={{ cursor: draggingFieldId ? 'grabbing' : 'default' }}
                >
                  <canvas ref={canvasRef} />
                  {!pdfLoaded && (
                    <div className="absolute inset-0 bg-white flex items-center justify-center min-h-64 min-w-64">
                      <div className="w-8 h-8 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
                    </div>
                  )}

                  {pageFields.map(field => {
                    const category = getFieldCategory(field.type);
                    const appliedSignature = isSignatureCategoryField(field.type)
                      ? signatures.find(sig => sig.category === category)
                      : null;
                    const fieldValue = fieldValues[field.id] || '';
                    const isTextLike = field.type === 'name' || field.type === 'date' || field.type === 'text';

                    return (
                      <div
                        key={field.id}
                        style={{
                          position: 'absolute',
                          left: `${field.x}%`,
                          top: `${field.y}%`,
                          width: `${(field.width / canvasWidth) * 100}%`,
                          height: `${(field.height / canvasHeight) * 100}%`,
                          minWidth: '120px',
                          minHeight: '38px',
                          zIndex: 10,
                          cursor: 'grab',
                        }}
                        className={`rounded-lg border-2 backdrop-blur-sm ${selectedFieldId === field.id ? 'border-amber-300 bg-amber-300/10' : 'border-blue-300/60 bg-blue-300/10'} transition-colors`}
                        onMouseDown={(e) => handleFieldMouseDown(e, field.id)}
                        onClick={() => {
                          setSelectedFieldId(field.id);
                          if (field.page !== currentPage) setCurrentPage(field.page);
                          if (isSignatureCategoryField(field.type)) {
                            setSigCategory(category);
                            setShowSigModal(true);
                          }
                        }}
                      >
                        <div className="absolute top-1 left-1 text-[10px] px-1.5 py-0.5 rounded bg-black/60 text-slate-100 border border-white/10 flex items-center gap-1">
                          <GripVertical className="w-2.5 h-2.5" />
                          <span>{getFieldTypeMeta(field.type).label}</span>
                        </div>
                        {field.required && (
                          <span className="absolute top-1 right-1 text-[10px] px-1.5 py-0.5 rounded bg-red-500/80 text-white">Required</span>
                        )}

                        <div className="w-full h-full flex items-center justify-center overflow-hidden px-2 pt-4">
                          {isTextLike ? (
                            <span className={`text-sm ${fieldValue ? 'text-gray-900' : 'text-gray-500'}`}>{fieldValue || getFieldTypeMeta(field.type).label}</span>
                          ) : appliedSignature ? (
                            appliedSignature.type === 'typed' ? (
                              <span className="text-base italic" style={{ color: appliedSignature.color || '#111111' }}>{appliedSignature.data}</span>
                            ) : (
                              <img src={appliedSignature.data} alt="" className="w-full h-full object-contain" />
                            )
                          ) : (
                            <span className="text-xs uppercase tracking-wide text-slate-200">Click to add {getFieldTypeMeta(field.type).label}</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="w-[360px] flex-shrink-0">
              <div className="card border border-white/5 sticky top-4 max-h-[calc(100vh-2rem)] overflow-y-auto">
                <h3 className="font-semibold text-white mb-4">Required fields</h3>
                <div className="space-y-2 mb-6">
                  {requiredFields.length === 0 && <p className="text-xs text-slate-400">No required fields assigned.</p>}
                  {requiredFields.map(field => {
                    const { label, icon: Icon } = getFieldTypeMeta(field.type);
                    const category = getFieldCategory(field.type);
                    const appliedSignature = isSignatureCategoryField(field.type)
                      ? signatures.find(sig => sig.category === category)
                      : null;

                    return (
                      <div key={field.id} className="rounded-xl border border-blue-200/40 bg-white/5 p-3">
                        <div className="flex items-center gap-2">
                          <GripVertical className="w-4 h-4 text-slate-400" />
                          <div className="w-8 h-8 rounded-lg bg-blue-500/70 text-white flex items-center justify-center"><Icon className="w-4 h-4" /></div>
                          <div className="flex-1">
                            <p className="text-sm text-white font-medium">{label}</p>
                            <p className="text-xs text-slate-400">Page {field.page}</p>
                          </div>
                          <button
                            onClick={() => {
                              setCurrentPage(field.page);
                              setSelectedFieldId(field.id);
                              if (isSignatureCategoryField(field.type)) {
                                setSigCategory(category);
                                setShowSigModal(true);
                              }
                            }}
                            className="text-xs px-2 py-1 rounded-md bg-blue-500/25 text-blue-100 hover:bg-blue-500/35"
                          >
                            Edit
                          </button>
                        </div>
                        {isSignatureCategoryField(field.type) ? (
                          <p className="mt-2 text-xs text-emerald-300">{appliedSignature ? 'Applied' : 'Pending'}</p>
                        ) : (
                          <input
                            value={fieldValues[field.id] || ''}
                            onChange={(e) => setFieldValues(prev => ({ ...prev, [field.id]: e.target.value }))}
                            className="input-field mt-2"
                            placeholder={`Enter ${label.toLowerCase()}`}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>

                {!hasSignatureFields && (
                  <div className="mb-6 rounded-2xl border border-amber-400/20 bg-amber-400/10 p-4">
                    <p className="text-sm text-amber-200 font-medium mb-2">No signature field was assigned for you.</p>
                    <p className="text-xs text-slate-300 mb-3">Create a fallback signature placement so you can sign this document.</p>
                    <button
                      onClick={() => {
                        setSigCategory('signature');
                        setShowSigModal(true);
                      }}
                      className="btn-primary w-full"
                    >
                      Add Signature
                    </button>
                  </div>
                )}

                <h3 className="font-semibold text-white mb-4">Optional fields</h3>
                <div className="space-y-2 mb-6">
                  {optionalFields.length === 0 && <p className="text-xs text-slate-400">No optional fields assigned.</p>}
                  {optionalFields.map(field => {
                    const { label, icon: Icon } = getFieldTypeMeta(field.type);
                    const category = getFieldCategory(field.type);
                    const appliedSignature = isSignatureCategoryField(field.type)
                      ? signatures.find(sig => sig.category === category)
                      : null;

                    return (
                      <div key={field.id} className="rounded-xl border border-blue-200/30 bg-white/5 p-3">
                        <div className="flex items-center gap-2">
                          <GripVertical className="w-4 h-4 text-slate-400" />
                          <div className="w-8 h-8 rounded-lg bg-blue-500/60 text-white flex items-center justify-center"><Icon className="w-4 h-4" /></div>
                          <div className="flex-1">
                            <p className="text-sm text-white font-medium">{label}</p>
                            <p className="text-xs text-slate-400">Page {field.page}</p>
                          </div>
                          <button
                            onClick={() => {
                              setCurrentPage(field.page);
                              setSelectedFieldId(field.id);
                              if (isSignatureCategoryField(field.type)) {
                                setSigCategory(category);
                                setShowSigModal(true);
                              }
                            }}
                            className="text-xs px-2 py-1 rounded-md bg-blue-500/20 text-blue-100 hover:bg-blue-500/30"
                          >
                            Edit
                          </button>
                        </div>
                        {isSignatureCategoryField(field.type) ? (
                          <p className="mt-2 text-xs text-emerald-300">{appliedSignature ? 'Applied' : 'Not applied'}</p>
                        ) : (
                          <input
                            value={fieldValues[field.id] || ''}
                            onChange={(e) => setFieldValues(prev => ({ ...prev, [field.id]: e.target.value }))}
                            className="input-field mt-2"
                            placeholder={`Enter ${label.toLowerCase()}`}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="space-y-3">
                  <button
                    onClick={() => handleAnalyze(false)}
                    disabled={analyzing}
                    className="btn-secondary w-full flex items-center justify-center gap-2"
                  >
                    {analyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : analysis ? <CheckCircle className="w-4 h-4 text-emerald-400" /> : <Sparkles className="w-4 h-4 text-amber-300" />}
                    {analyzing ? 'Analyzing...' : analysis ? 'Re-analyze' : 'AI Risk Analysis'}
                  </button>
                  <button onClick={submit} disabled={submitting || signatures.length === 0} className="btn-primary w-full flex items-center justify-center gap-2">
                    <CheckCircle className="w-4 h-4" />
                    {submitting ? 'Signing...' : 'Sign Document'}
                  </button>
                  <button onClick={() => setShowRejectModal(true)} className="w-full flex items-center justify-center gap-2 text-sm text-red-400 hover:text-red-300 py-2 transition-colors">
                    <XCircle className="w-4 h-4" /> Decline to Sign
                  </button>
                </div>
                <div className="mt-4 flex items-center gap-2 text-xs text-slate-500">
                  <Globe className="w-3 h-3" />
                  <span>Your IP is logged for audit purposes</span>
                </div>
              </div>
            </div>
            </div>
          </>
        )}
      </div>

      {showSigModal && <SignatureModal defaultCategory={sigCategory} signerName={signerInfo.name} onApply={handleApplySig} onClose={() => setShowSigModal(false)} />}

      {/* Reject modal */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}>
          <div className="glass-light rounded-3xl w-full max-w-md p-8 animate-scale-in">
            <h3 className="text-xl font-bold text-white mb-2">Decline to Sign</h3>
            <p className="text-slate-400 text-sm mb-6">Please provide a reason for declining</p>
            <textarea value={rejectionReason} onChange={e => setRejectionReason(e.target.value)} className="input-field resize-none" rows={4} placeholder="I'm declining because..." />
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowRejectModal(false)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={reject} disabled={submitting} className="flex-1 px-6 py-2.5 bg-red-500 hover:bg-red-400 text-white font-semibold rounded-xl transition-colors disabled:opacity-50">
                {submitting ? 'Submitting...' : 'Decline'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
