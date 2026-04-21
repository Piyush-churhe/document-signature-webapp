import { Document } from '../../types';
import { formatDistanceToNow } from 'date-fns';
import { Clock, CheckCircle, XCircle, FileText, Trash2 } from 'lucide-react';
import { documentService } from '../../services/documentService';
import toast from 'react-hot-toast';

interface DocumentCardProps {
  document: Document;
  onUpdate?: () => void | Promise<void>;
  onClick?: () => void;
}

const statusMap: Record<Document['status'], { label: string; cls: string; icon: any }> = {
  pending: { label: 'Pending', cls: 'status-pending', icon: Clock },
  signed: { label: 'Signed', cls: 'status-signed', icon: CheckCircle },
  rejected: { label: 'Rejected', cls: 'status-rejected', icon: XCircle },
  expired: { label: 'Expired', cls: 'status-expired', icon: Clock },
};

export default function DocumentCard({ document, onUpdate, onClick }: DocumentCardProps) {
  const status = statusMap[document.status];

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const confirmed = window.confirm(`Delete "${document.title}"?`);
    if (!confirmed) return;

    try {
      await documentService.delete(document._id);
      toast.success('Document deleted');
      await onUpdate?.();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to delete document');
    }
  };

  return (
    <article onClick={onClick} className="card border border-white/5 cursor-pointer group">
      <div className="flex items-start justify-between gap-2 mb-4">
        <div className="min-w-0">
          <h3 className="text-white font-semibold truncate">{document.title}</h3>
          <p className="text-xs text-slate-500 truncate mt-1">{document.originalName}</p>
        </div>
        <button onClick={handleDelete} className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-300 transition-opacity" aria-label="Delete document">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      <div className="flex items-center gap-2 mb-3">
        <span className={`px-2.5 py-1 rounded-full text-xs font-medium inline-flex items-center gap-1.5 ${status.cls}`}>
          <status.icon className="w-3 h-3" />
          {status.label}
        </span>
        <span className="text-xs text-slate-500">{document.pageCount} page{document.pageCount !== 1 ? 's' : ''}</span>
      </div>

      <div className="space-y-1 text-xs text-slate-400">
        <p className="flex items-center gap-1.5"><FileText className="w-3.5 h-3.5 text-slate-500" />{(document.fileSize / 1024 / 1024).toFixed(2)} MB</p>
        <p>Updated {formatDistanceToNow(new Date(document.updatedAt), { addSuffix: true })}</p>
        {document.signers && document.signers.length > 0 && (
          <p>{document.signers.length} signer{document.signers.length !== 1 ? 's' : ''}</p>
        )}
      </div>
    </article>
  );
}
