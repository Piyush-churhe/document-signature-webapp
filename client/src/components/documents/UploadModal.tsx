import { useMemo, useState } from 'react';
import { X, Upload } from 'lucide-react';
import toast from 'react-hot-toast';
import { documentService } from '../../services/documentService';
import MultiSignerForm, { MultiSignerInput } from './MultiSignerForm';

interface UploadModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export default function UploadModal({ onClose, onSuccess }: UploadModalProps) {
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [signers, setSigners] = useState<MultiSignerInput[]>([{ name: '', email: '', order: 1 }]);
  const [submitting, setSubmitting] = useState(false);

  const normalizedSigners = useMemo(
    () => signers
      .map((signer, index) => ({ name: signer.name.trim(), email: signer.email.trim(), order: index + 1 }))
      .filter((signer) => signer.name || signer.email),
    [signers]
  );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!file) {
      toast.error('Please choose a PDF file');
      return;
    }

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      toast.error('Only PDF files are allowed');
      return;
    }

    if (normalizedSigners.some((signer) => !signer.name || !signer.email)) {
      toast.error('Please complete name and email for each signer');
      return;
    }

    setSubmitting(true);
    try {
      const form = new FormData();
      form.append('pdf', file);
      form.append('title', title.trim() || file.name.replace(/\.pdf$/i, ''));
      if (message.trim()) form.append('message', message.trim());
      if (normalizedSigners.length > 0) form.append('signers', JSON.stringify(normalizedSigners));

      await documentService.upload(form);
      toast.success('Document uploaded successfully');
      onSuccess();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to upload document');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(8px)' }}>
      <div className="glass-light rounded-3xl w-full max-w-xl p-6 md:p-8 border border-white/10">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-white text-xl font-semibold">Upload Document</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-sm text-slate-300 mb-2">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="input-field"
              placeholder="Employment Agreement"
            />
          </div>

          <div>
            <label className="block text-sm text-slate-300 mb-2">PDF file</label>
            <label className="input-field flex items-center justify-between cursor-pointer">
              <span className="truncate text-slate-300">{file?.name || 'Select PDF file'}</span>
              <Upload className="w-4 h-4 text-amber-300" />
              <input
                type="file"
                accept="application/pdf"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="hidden"
              />
            </label>
          </div>

          <div>
            <label className="block text-sm text-slate-300 mb-2">Signers</label>
            <MultiSignerForm value={signers} onChange={setSigners} />
          </div>

          <div>
            <label className="block text-sm text-slate-300 mb-2">Message (optional)</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="input-field resize-none"
              rows={3}
              placeholder="Please review and sign this document."
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" disabled={submitting} className="btn-primary flex-1">{submitting ? 'Uploading...' : 'Upload'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
