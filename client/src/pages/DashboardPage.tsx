import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { documentService } from '../services/documentService';
import { Document, DocumentStatus } from '../types';
import Navbar from '../components/ui/Navbar';
import UploadModal from '../components/documents/UploadModal';
import DocumentCard from '../components/documents/DocumentCard';
import toast from 'react-hot-toast';
import { Plus, FileText, CheckCircle, Clock, XCircle, TrendingUp } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const STATUS_TABS: { key: DocumentStatus; label: string; icon: any; color: string }[] = [
  { key: 'all', label: 'All', icon: FileText, color: 'text-slate-400' },
  { key: 'pending', label: 'Pending', icon: Clock, color: 'text-amber-400' },
  { key: 'signed', label: 'Signed', icon: CheckCircle, color: 'text-emerald-400' },
  { key: 'rejected', label: 'Rejected', icon: XCircle, color: 'text-red-400' },
];

export default function DashboardPage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [filter, setFilter] = useState<DocumentStatus>('all');
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();

  const loadDocuments = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await documentService.getAll(filter);
      setDocuments(data.documents);
      const statsMap: Record<string, number> = {};
      data.stats.forEach(s => { statsMap[s._id] = s.count; });
      setStats(statsMap);
    } catch { toast.error('Failed to load documents'); }
    finally { setLoading(false); }
  }, [filter]);

  useEffect(() => { loadDocuments(); }, [loadDocuments]);

  useEffect(() => {
    const interval = setInterval(() => {
      loadDocuments();
    }, 10000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadDocuments();
      }
    };

    window.document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      clearInterval(interval);
      window.document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [loadDocuments]);

  const totalDocs = Object.values(stats).reduce((a, b) => a + b, 0);

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(135deg, #0f0f17 0%, #1a1a2e 100%)' }}>
      <Navbar />
      <main className="max-w-7xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="flex items-start justify-between mb-10 animate-slide-up">
          <div>
            <h1 className="font-display text-4xl font-semibold text-white mb-2">
              Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'},{' '}
              <span className="text-amber-400">{user?.name.split(' ')[0]}</span>
            </h1>
            <p className="text-slate-400">Manage and track your document signatures</p>
          </div>
          <button onClick={() => setShowUpload(true)} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Upload Document
          </button>
        </div>

        {/* Stats cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10 animate-slide-up">
          {[
            { label: 'Total Docs', value: totalDocs, icon: FileText, color: 'from-indigo-500 to-purple-600' },
            { label: 'Pending', value: stats.pending || 0, icon: Clock, color: 'from-amber-500 to-orange-500' },
            { label: 'Signed', value: stats.signed || 0, icon: CheckCircle, color: 'from-emerald-500 to-teal-500' },
            { label: 'Rejected', value: stats.rejected || 0, icon: XCircle, color: 'from-red-500 to-rose-500' },
          ].map(stat => (
            <div key={stat.label} className="card group cursor-default">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-slate-400 text-sm mb-1">{stat.label}</p>
                  <p className="text-3xl font-bold text-white">{stat.value}</p>
                </div>
                <div className={`w-10 h-10 bg-gradient-to-br ${stat.color} rounded-xl flex items-center justify-center opacity-80`}>
                  <stat.icon className="w-5 h-5 text-white" />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
          {STATUS_TABS.map(tab => (
            <button key={tab.key} onClick={() => setFilter(tab.key)}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium text-sm transition-all whitespace-nowrap ${
                filter === tab.key ? 'bg-amber-400/20 text-amber-400 border border-amber-400/30' : 'glass text-slate-400 hover:text-white'
              }`}>
              <tab.icon className="w-4 h-4" />
              {tab.label}
              {tab.key !== 'all' && stats[tab.key] ? (
                <span className="ml-1 text-xs glass rounded-full px-2 py-0.5">{stats[tab.key]}</span>
              ) : null}
            </button>
          ))}
        </div>

        {/* Documents grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({length: 6}).map((_, i) => (
              <div key={i} className="card h-48 animate-pulse">
                <div className="h-4 bg-white/5 rounded mb-4 w-3/4" />
                <div className="h-3 bg-white/5 rounded mb-2 w-1/2" />
                <div className="h-3 bg-white/5 rounded w-1/3" />
              </div>
            ))}
          </div>
        ) : documents.length === 0 ? (
          <div className="text-center py-24 animate-fade-in">
            <div className="w-20 h-20 glass rounded-3xl flex items-center justify-center mx-auto mb-6">
              <FileText className="w-10 h-10 text-slate-500" />
            </div>
            <h3 className="text-xl font-semibold text-slate-300 mb-2">No documents yet</h3>
            <p className="text-slate-500 mb-6">Upload your first PDF to get started</p>
            <button onClick={() => setShowUpload(true)} className="btn-primary">Upload Document</button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-fade-in">
            {documents.map(doc => (
              <DocumentCard key={doc._id} document={doc} onUpdate={loadDocuments} onClick={() => navigate(`/docs/${doc._id}`)} />
            ))}
          </div>
        )}
      </main>
      {showUpload && <UploadModal onClose={() => setShowUpload(false)} onSuccess={() => { setShowUpload(false); loadDocuments(); }} />}
    </div>
  );
}
