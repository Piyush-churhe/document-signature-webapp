import { useEffect, useRef, useState } from 'react';
import { UploadCloud, Pencil, Type, X } from 'lucide-react';
import { SignatureData } from '../../types';

interface SignatureModalProps {
  defaultCategory?: 'signature' | 'initials' | 'stamp';
  signerName?: string;
  onApply: (signature: SignatureData) => void;
  onClose: () => void;
}

type InputMode = 'typed' | 'drawn' | 'uploaded';

export default function SignatureModal({
  defaultCategory = 'signature',
  signerName = '',
  onApply,
  onClose,
}: SignatureModalProps) {
  const [category, setCategory] = useState<'signature' | 'initials' | 'stamp'>(defaultCategory);
  const [mode, setMode] = useState<InputMode>('typed');
  const [typedValue, setTypedValue] = useState(signerName || '');
  const [color, setColor] = useState('#111111');
  const [uploadedData, setUploadedData] = useState<string>('');
  const [drawing, setDrawing] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    setCategory(defaultCategory);
    if (defaultCategory === 'initials') {
      const initials = signerName
        .split(' ')
        .map((part) => part[0])
        .join('')
        .slice(0, 3)
        .toUpperCase();
      if (initials) setTypedValue(initials);
    } else if (signerName) {
      setTypedValue(signerName);
    }
  }, [defaultCategory, signerName]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#111111';
    ctx.lineCap = 'round';
  }, []);

  const getPos = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * event.currentTarget.width;
    const y = ((event.clientY - rect.top) / rect.height) * event.currentTarget.height;
    return { x, y };
  };

  const startDraw = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { x, y } = getPos(event);
    ctx.beginPath();
    ctx.moveTo(x, y);
    setDrawing(true);
  };

  const draw = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!drawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { x, y } = getPos(event);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const endDraw = () => setDrawing(false);

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  };

  const handleUpload = (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setUploadedData(String(reader.result || ''));
    reader.readAsDataURL(file);
  };

  const apply = () => {
    if (mode === 'typed') {
      if (!typedValue.trim()) return;
      onApply({
        type: 'typed',
        category,
        data: typedValue.trim(),
        color,
        fields: [],
      });
      return;
    }

    if (mode === 'drawn') {
      const data = canvasRef.current?.toDataURL('image/png') || '';
      if (!data) return;
      onApply({
        type: 'drawn',
        category,
        data,
        fields: [],
      });
      return;
    }

    if (!uploadedData) return;
    onApply({
      type: 'uploaded',
      category,
      data: uploadedData,
      fields: [],
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(8px)' }}>
      <div className="glass-light rounded-3xl w-full max-w-xl p-6 md:p-8 border border-white/10">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-white text-xl font-semibold">Apply {category}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-4">
          {(['signature', 'initials', 'stamp'] as const).map((item) => (
            <button key={item} onClick={() => setCategory(item)} className={`px-3 py-2 rounded-xl text-sm capitalize ${category === item ? 'bg-amber-400/20 text-amber-300 border border-amber-400/30' : 'glass text-slate-300'}`}>
              {item}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-2 mb-4">
          <button onClick={() => setMode('typed')} className={`px-3 py-2 rounded-xl text-sm flex items-center justify-center gap-2 ${mode === 'typed' ? 'bg-blue-500/20 text-blue-200 border border-blue-500/30' : 'glass text-slate-300'}`}><Type className="w-4 h-4" />Typed</button>
          <button onClick={() => setMode('drawn')} className={`px-3 py-2 rounded-xl text-sm flex items-center justify-center gap-2 ${mode === 'drawn' ? 'bg-blue-500/20 text-blue-200 border border-blue-500/30' : 'glass text-slate-300'}`}><Pencil className="w-4 h-4" />Draw</button>
          <button onClick={() => setMode('uploaded')} className={`px-3 py-2 rounded-xl text-sm flex items-center justify-center gap-2 ${mode === 'uploaded' ? 'bg-blue-500/20 text-blue-200 border border-blue-500/30' : 'glass text-slate-300'}`}><UploadCloud className="w-4 h-4" />Upload</button>
        </div>

        {mode === 'typed' && (
          <div className="space-y-3">
            <input
              value={typedValue}
              onChange={(e) => setTypedValue(e.target.value)}
              className="input-field"
              placeholder={category === 'initials' ? 'Your initials' : 'Type your signature'}
            />
            <div className="flex items-center gap-2">
              <label className="text-sm text-slate-400">Color</label>
              <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-9 w-14 rounded border border-white/20 bg-transparent" />
            </div>
          </div>
        )}

        {mode === 'drawn' && (
          <div className="space-y-3">
            <canvas
              ref={canvasRef}
              width={760}
              height={220}
              className="w-full rounded-xl bg-white touch-none"
              onMouseDown={startDraw}
              onMouseMove={draw}
              onMouseUp={endDraw}
              onMouseLeave={endDraw}
            />
            <button onClick={clearCanvas} className="btn-secondary text-sm">Clear</button>
          </div>
        )}

        {mode === 'uploaded' && (
          <div className="space-y-3">
            <label className="input-field flex items-center justify-between cursor-pointer">
              <span className="text-slate-300">Choose image</span>
              <UploadCloud className="w-4 h-4 text-amber-300" />
              <input type="file" accept="image/*" className="hidden" onChange={(e) => handleUpload(e.target.files?.[0] || null)} />
            </label>
            {uploadedData && <img src={uploadedData} alt="Uploaded signature" className="max-h-32 rounded-lg bg-white p-2" />}
          </div>
        )}

        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button onClick={apply} className="btn-primary flex-1">Apply</button>
        </div>
      </div>
    </div>
  );
}
