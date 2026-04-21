import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { documentService } from '../services/documentService';
import { Document, SignatureField } from '../types';
import { SignatureData } from '../types';
import Navbar from '../components/ui/Navbar';
import SignatureModal from '../components/signature/SignatureModal';
import toast from 'react-hot-toast';
import api from '../services/api';
import { ArrowLeft, Plus, Pen, Stamp, Type, Trash2, Send, Save, ZoomIn, ZoomOut, UserRound, CalendarDays, AlignLeft } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { useAuth } from '../context/AuthContext';

declare global { interface Window { pdfjsLib: any; } }

const FIELD_TYPES = [
  { type: 'signature', label: 'Signature', icon: Pen, color: 'border-amber-400 bg-amber-400/10 text-amber-400' },
  { type: 'initials', label: 'Initials', icon: Type, color: 'border-blue-400 bg-blue-400/10 text-blue-400' },
  { type: 'name', label: 'Name', icon: UserRound, color: 'border-cyan-400 bg-cyan-400/10 text-cyan-400' },
  { type: 'date', label: 'Date', icon: CalendarDays, color: 'border-emerald-400 bg-emerald-400/10 text-emerald-400' },
  { type: 'text', label: 'Text', icon: AlignLeft, color: 'border-indigo-400 bg-indigo-400/10 text-indigo-400' },
  { type: 'stamp', label: 'Company Stamp', icon: Stamp, color: 'border-purple-400 bg-purple-400/10 text-purple-400' },
];

export default function DocumentEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [document, setDocument] = useState<Document | null>(null);
  const [fields, setFields] = useState<SignatureField[]>([]);
  const [selectedField, setSelectedField] = useState<string | null>(null);
  const [signatureData, setSignatureData] = useState<Record<string, any>>({});
  const [showSigModal, setShowSigModal] = useState(false);
  const [sigModalCategory, setSigModalCategory] = useState<'signature' | 'initials' | 'stamp'>('signature');
  const [sigModalFieldId, setSigModalFieldId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [pdfLoaded, setPdfLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [selectedSignerOrder, setSelectedSignerOrder] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const pdfContainerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pdfDocRef = useRef<any>(null);

  useEffect(() => {
    const loadPdfLib = async () => {
      if (!window.pdfjsLib) {
        const script = window.document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
        await new Promise(res => { script.onload = res; window.document.head.appendChild(script); });
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      }
    };
    loadPdfLib();
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await documentService.getById(id!);
        setDocument(data.document);
        setFields(data.document.signatureFields || []);
      } catch { toast.error('Failed to load document'); navigate('/dashboard'); }
    };
    load();
  }, [id]);

  const renderPage = useCallback(async (pageNum: number) => {
    if (!pdfDocRef.current || !canvasRef.current) return;
    const page = await pdfDocRef.current.getPage(pageNum);
    const viewport = page.getViewport({ scale: zoom });
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d')!;
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: ctx, viewport }).promise;
  }, [zoom]);

  useEffect(() => {
    if (!document?.filePath || !window.pdfjsLib) return;
    const timer = setTimeout(async () => {
      try {
        // Validate and safely construct file URL
        if (!document.filePath) {
          console.error('❌ No file path in document');
          toast.error('Document file path is missing.');
          return;
        }

        const uploadsMatch = document.filePath.match(/[\\/]uploads[\\/](.+)$/);
        if (!uploadsMatch) {
          console.error('❌ Invalid file path format:', document.filePath);
          toast.error('Invalid document file path format.');
          return;
        }

        const normalizedRelativePath = uploadsMatch[1].replace(/\\/g, '/');
        const url = `/uploads/${normalizedRelativePath}`;
        console.log(`📄 Loading PDF from: ${url}`);
        
        pdfDocRef.current = await window.pdfjsLib.getDocument(url).promise;
        setTotalPages(pdfDocRef.current.numPages);
        await renderPage(currentPage);
        setPdfLoaded(true);
        console.log(`✅ PDF loaded successfully from: ${url}`);
      } catch (e: any) { 
        console.error('❌ PDF load error:', e);
        toast.error(`Failed to load PDF: ${e?.message || 'Unknown error'}`);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [document, window.pdfjsLib]);


  useEffect(() => { if (pdfDocRef.current) renderPage(currentPage); }, [currentPage, zoom, renderPage]);

  const isTextLikeField = (type: SignatureField['type']) => type === 'name' || type === 'date' || type === 'text';
  const updateField = (fieldId: string, updates: Partial<SignatureField>) => {
    setFields(prev => prev.map(field => (field.id === fieldId ? { ...field, ...updates } : field)));
  };

  const addField = (type: string) => {
    const defaultValue = type === 'date'
      ? new Date().toLocaleDateString('en-GB')
      : type === 'name'
        ? (user?.name || '')
        : '';

    const baseWidth = type === 'initials' ? 120 : type === 'date' ? 160 : type === 'text' ? 240 : type === 'name' ? 200 : type === 'stamp' ? 170 : 200;
    const baseHeight = type === 'initials' ? 52 : type === 'name' || type === 'date' || type === 'text' ? 38 : type === 'stamp' ? 70 : 80;

    const newField: SignatureField = {
      id: uuidv4(),
      type: type as any,
      signerOrder: selectedSignerOrder,
      x: 20,
      y: 30,
      width: baseWidth,
      height: baseHeight,
      page: currentPage,
      required: type === 'signature',
      label: type,
      value: defaultValue,
    };
    setFields(prev => [...prev, newField]);
    setSelectedField(newField.id);
    if (type === 'signature' || type === 'initials' || type === 'stamp') {
      setSigModalCategory(type as any);
      setSigModalFieldId(newField.id);
      setShowSigModal(true);
    }
  };

  const handleMouseDown = (e: React.MouseEvent, fieldId: string) => {
    e.stopPropagation();
    setSelectedField(fieldId);
    const container = pdfContainerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const field = fields.find(f => f.id === fieldId)!;
    const containerW = rect.width;
    const containerH = canvasRef.current?.height || 800;
    setDragOffset({ x: e.clientX - rect.left - (field.x / 100) * containerW, y: e.clientY - rect.top - (field.y / 100) * containerH });
    setDragging(fieldId);
  };

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging || !pdfContainerRef.current) return;
    const rect = pdfContainerRef.current.getBoundingClientRect();
    const containerW = rect.width;
    const containerH = canvasRef.current?.height || 800;
    const x = Math.max(0, Math.min(100 - 10, ((e.clientX - rect.left - dragOffset.x) / containerW) * 100));
    const y = Math.max(0, Math.min(100 - 5, ((e.clientY - rect.top - dragOffset.y) / containerH) * 100));
    setFields(prev => prev.map(f => f.id === dragging ? { ...f, x, y } : f));
  }, [dragging, dragOffset]);

  const saveFields = async () => {
    setSaving(true);
    try {
      await documentService.updateFields(id!, fields);
      toast.success('Fields saved!');
    } catch { toast.error('Failed to save'); }
    finally { setSaving(false); }
  };

  const finalize = async () => {
    if (Object.keys(signatureData).length === 0) {
      toast.error('Please add signatures to all required fields');
      return;
    }
    setFinalizing(true);
    try {
      const signatures = Object.entries(signatureData)
        .map(([fieldId, sig]: [string, any]) => {
          const field = fields.find(f => f.id === fieldId);
          if (!field) return null;
          return {
            ...sig,
            fields: [{ fieldId: field.id, x: field.x, y: field.y, page: field.page, width: field.width, height: field.height }]
          };
        })
        .filter(Boolean);
      const fieldValues = fields
        .filter(field => field.type === 'name' || field.type === 'date' || field.type === 'text')
        .map(field => ({
          fieldId: field.id,
          type: field.type,
          value: String(field.value || '').trim(),
          x: field.x,
          y: field.y,
          page: field.page,
          width: field.width,
          height: field.height,
          required: Boolean(field.required),
        }));

      await api.post('/signatures/finalize', { documentId: id, signatures, fieldValues });
      toast.success('Document signed successfully!');
      navigate(`/docs/${id}`);
    } catch (err: any) { toast.error(err.response?.data?.message || 'Failed to finalize'); }
    finally { setFinalizing(false); }
  };

  const deleteField = (fieldId: string) => { setFields(prev => prev.filter(f => f.id !== fieldId)); if (selectedField === fieldId) setSelectedField(null); };

  const maxSignerOrder = Math.max(1, document?.signers?.length || 1);
  const selectedFieldData = fields.find(field => field.id === selectedField) || null;

  const pageFields = fields.filter(f => f.page === currentPage);
  const canvasH = canvasRef.current?.height || 800;
  const canvasW = canvasRef.current?.width || 600;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'linear-gradient(135deg, #0f0f17 0%, #1a1a2e 100%)' }}>
      <Navbar />
      <div className="flex-1 flex flex-col">
        {/* Toolbar */}
        <div className="border-b border-white/5 px-6 py-3 flex items-center justify-between" style={{ background: 'rgba(15,15,23,0.9)', backdropFilter: 'blur(10px)' }}>
          <div className="flex items-center gap-4">
            <Link to={`/docs/${id}`} className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm">
              <ArrowLeft className="w-4 h-4" /> Back
            </Link>
            <span className="text-slate-600">|</span>
            <h1 className="text-white font-medium truncate max-w-xs">{document?.title}</h1>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => setZoom(z => Math.max(0.5, z - 0.25))} className="btn-secondary p-2" title="Zoom out"><ZoomOut className="w-4 h-4" /></button>
            <span className="text-slate-400 text-sm w-12 text-center">{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoom(z => Math.min(2, z + 0.25))} className="btn-secondary p-2" title="Zoom in"><ZoomIn className="w-4 h-4" /></button>
            <button onClick={saveFields} disabled={saving} className="btn-secondary flex items-center gap-2 text-sm">
              <Save className="w-4 h-4" />{saving ? 'Saving...' : 'Save Fields'}
            </button>
            <button onClick={finalize} disabled={finalizing} className="btn-primary flex items-center gap-2 text-sm">
              <Send className="w-4 h-4" />{finalizing ? 'Signing...' : 'Sign & Finalize'}
            </button>
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* Left sidebar - field types */}
          <div className="w-64 border-r border-white/5 p-4 overflow-y-auto flex-shrink-0" style={{ background: 'rgba(15,15,23,0.6)' }}>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Add Fields</p>
            <div className="mb-3">
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Assign To Signer</label>
              <select
                value={selectedSignerOrder}
                onChange={(e) => setSelectedSignerOrder(Number(e.target.value))}
                className="input-field"
              >
                {Array.from({ length: maxSignerOrder }).map((_, idx) => {
                  const order = idx + 1;
                  const signer = document?.signers?.find(s => s.order === order);
                  return (
                    <option key={order} value={order}>
                      {signer ? `${order}. ${signer.name || signer.email}` : `Signer ${order}`}
                    </option>
                  );
                })}
              </select>
            </div>
            <div className="space-y-2">
              {FIELD_TYPES.map(ft => (
                <button key={ft.type} onClick={() => addField(ft.type)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all hover:scale-105 ${ft.color}`}>
                  <ft.icon className="w-4 h-4" />
                  <span className="text-sm font-medium">{ft.label}</span>
                  <Plus className="w-3 h-3 ml-auto" />
                </button>
              ))}
            </div>

            {Object.keys(signatureData).length > 0 && (
              <div className="mt-6">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Applied Signatures</p>
                <div className="space-y-2">
                  {Object.entries(signatureData).map(([fieldId, sig]: [string, any]) => {
                    const field = fields.find(f => f.id === fieldId);
                    return (
                    <div key={fieldId} className="glass rounded-xl p-3">
                      <p className="text-xs text-slate-400 capitalize">{sig.category} {field ? `(S${field.signerOrder || 1})` : ''}</p>
                      {sig.type === 'typed' ? (
                        <p className="text-sm text-white truncate" style={{ fontStyle: 'italic' }}>{sig.data}</p>
                      ) : (
                        <img src={sig.data} alt="sig" className="h-8 w-auto object-contain" />
                      )}
                    </div>
                  )})}
                </div>
              </div>
            )}

            {fields.length > 0 && (
              <div className="mt-6">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Fields ({fields.length})</p>
                <div className="space-y-1">
                  {fields.map(f => (
                    <div key={f.id} onClick={() => setSelectedField(f.id)} className={`flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-colors ${selectedField === f.id ? 'bg-amber-400/20 text-amber-400' : 'text-slate-400 hover:bg-white/5'}`}>
                      <span className="text-xs capitalize">{f.type} (p.{f.page}) · S{f.signerOrder || 1}</span>
                      <button onClick={e => { e.stopPropagation(); deleteField(f.id); }} className="text-red-400 hover:text-red-300"><Trash2 className="w-3 h-3" /></button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {selectedFieldData && (
              <div className="mt-6 glass rounded-xl p-3 border border-white/10">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Field Settings</p>
                <div className="space-y-2">
                  <label className="block text-xs text-slate-400">Label</label>
                  <input
                    value={selectedFieldData.label || ''}
                    onChange={(e) => updateField(selectedFieldData.id, { label: e.target.value })}
                    className="input-field"
                    placeholder="Field label"
                  />
                  <label className="flex items-center gap-2 text-xs text-slate-300 mt-2">
                    <input
                      type="checkbox"
                      checked={Boolean(selectedFieldData.required)}
                      onChange={(e) => updateField(selectedFieldData.id, { required: e.target.checked })}
                    />
                    Required field
                  </label>
                  {isTextLikeField(selectedFieldData.type) && (
                    <>
                      <label className="block text-xs text-slate-400 mt-2">Value</label>
                      <input
                        value={selectedFieldData.value || ''}
                        onChange={(e) => updateField(selectedFieldData.id, { value: e.target.value })}
                        className="input-field"
                        placeholder={`Enter ${selectedFieldData.type}`}
                      />
                    </>
                  )}
                  {(selectedFieldData.type === 'signature' || selectedFieldData.type === 'initials' || selectedFieldData.type === 'stamp') && (
                    <button
                      onClick={() => {
                        setSigModalFieldId(selectedFieldData.id);
                        setSigModalCategory(selectedFieldData.type === 'stamp' ? 'stamp' : selectedFieldData.type === 'initials' ? 'initials' : 'signature');
                        setShowSigModal(true);
                      }}
                      className="btn-secondary w-full mt-2 text-sm"
                    >
                      Edit {selectedFieldData.type}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* PDF Canvas area */}
          <div className="flex-1 overflow-auto p-6">
            {/* Page nav */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-4 mb-4">
                <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="btn-secondary px-3 py-1.5 text-sm">Prev</button>
                <span className="text-slate-300 text-sm">Page {currentPage} of {totalPages}</span>
                <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="btn-secondary px-3 py-1.5 text-sm">Next</button>
              </div>
            )}
            <div className="flex justify-center">
              <div
                ref={pdfContainerRef}
                className="relative inline-block shadow-2xl"
                onMouseMove={handleMouseMove}
                onMouseUp={() => setDragging(null)}
                onMouseLeave={() => setDragging(null)}
                style={{ cursor: dragging ? 'grabbing' : 'default' }}
              >
                <canvas ref={canvasRef} style={{ display: 'block' }} />
                {!pdfLoaded && (
                  <div className="absolute inset-0 flex items-center justify-center bg-white">
                    <div className="text-center">
                      <div className="w-10 h-10 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin mx-auto mb-2" />
                      <p className="text-gray-500 text-sm">Loading PDF...</p>
                    </div>
                  </div>
                )}
                {/* Signature fields overlay */}
                {pageFields.map(field => {
                  const left = `${field.x}%`;
                  const top = `${field.y}%`;
                  const w = `${(field.width / canvasW) * 100}%`;
                  const h = `${(field.height / canvasH) * 100}%`;
                  const applied = signatureData[field.id];
                  return (
                    <div
                      key={field.id}
                      style={{ position: 'absolute', left, top, width: w, height: h, minWidth: '120px', minHeight: '40px', cursor: 'grab', zIndex: 10 }}
                      className={`border-2 rounded-lg ${selectedField === field.id ? 'border-amber-400' : 'border-amber-400/70'} bg-white/95 hover:border-amber-400 transition-colors`}
                      onMouseDown={e => handleMouseDown(e, field.id)}
                      onClick={() => {
                        setSelectedField(field.id);
                        const isSignatureField = field.type === 'signature' || field.type === 'initials' || field.type === 'stamp';
                        if (isSignatureField) {
                          setSigModalFieldId(field.id);
                          setSigModalCategory(field.type === 'stamp' ? 'stamp' : field.type === 'initials' ? 'initials' : 'signature');
                          setShowSigModal(true);
                        }
                      }}
                    >
                      {applied ? (
                        applied.type === 'typed' ? (
                          <div className="w-full h-full flex items-center justify-center overflow-hidden">
                            <span style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic', color: field.type === 'initials' ? '#111111' : (applied.color || '#111111'), fontSize: '20px', padding: '4px' }}>{applied.data}</span>
                          </div>
                        ) : (
                          <img src={applied.data} alt="sig" className="w-full h-full object-contain p-1" />
                        )
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          {field.type === 'name' || field.type === 'date' || field.type === 'text' ? (
                            <span className="text-gray-900 text-xs font-medium">{field.value || field.type}</span>
                          ) : (
                            <span className="text-gray-700 text-xs font-medium uppercase tracking-wide">{field.type}</span>
                          )}
                        </div>
                      )}
                      <span className="absolute top-1 left-1 text-[10px] px-1.5 py-0.5 rounded bg-black/55 text-amber-200 border border-amber-300/30">
                        S{field.signerOrder || 1}
                      </span>
                      {selectedField === field.id && (
                        <button onClick={e => { e.stopPropagation(); deleteField(field.id); }}
                          className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-white hover:bg-red-400 transition-colors z-20">
                          <Trash2 className="w-2.5 h-2.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {showSigModal && (
        <SignatureModal
          defaultCategory={sigModalCategory}
          signerName={user?.name || ''}
          onApply={(sig) => {
            if (!sigModalFieldId) return;
            const field = fields.find(f => f.id === sigModalFieldId);
            setSignatureData(prev => ({ ...prev, [sigModalFieldId]: sig }));
            setShowSigModal(false);
            setSigModalFieldId(null);
            toast.success(`${sigModalCategory} applied${field ? ` to S${field.signerOrder || 1}` : ''}!`);
          }}
          onClose={() => setShowSigModal(false)}
        />
      )}
    </div>
  );
}
