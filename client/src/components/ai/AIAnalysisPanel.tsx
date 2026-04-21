import { AIAnalysis } from '../../types';
import { AlertTriangle, CheckCircle2, RefreshCw, ShieldAlert, Sparkles } from 'lucide-react';

interface AIAnalysisPanelProps {
  analysis: AIAnalysis | null;
  loading?: boolean;
  onAnalyze?: (force?: boolean) => void | Promise<void>;
}

const scoreStyles: Record<NonNullable<AIAnalysis['riskScore']>, string> = {
  low: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30',
  medium: 'text-amber-300 bg-amber-500/10 border-amber-500/30',
  high: 'text-red-300 bg-red-500/10 border-red-500/30',
};

export default function AIAnalysisPanel({ analysis, loading = false, onAnalyze }: AIAnalysisPanelProps) {
  return (
    <section className="card border border-white/5">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-amber-300" />
          <h3 className="text-white font-semibold">AI Risk Analysis</h3>
        </div>
        {onAnalyze && (
          <button onClick={() => onAnalyze(Boolean(analysis))} disabled={loading} className="btn-secondary text-sm flex items-center gap-2">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Analyzing...' : analysis ? 'Re-analyze' : 'Analyze'}
          </button>
        )}
      </div>

      {!analysis ? (
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-slate-400">
          No analysis available yet.
        </div>
      ) : (
        <div className="space-y-4 text-sm">
          <div className="flex items-center gap-2">
            <span className={`px-3 py-1 rounded-full border text-xs font-semibold uppercase ${scoreStyles[analysis.riskScore]}`}>
              {analysis.riskScore} risk
            </span>
            <span className="text-slate-400">{analysis.documentType}</span>
          </div>

          <p className="text-slate-200">{analysis.summary}</p>
          <p className="text-slate-400">{analysis.riskReason}</p>

          {analysis.riskyClauses?.length > 0 && (
            <div>
              <h4 className="text-slate-200 font-medium mb-2 flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-amber-300" />Risky Clauses</h4>
              <ul className="space-y-2">
                {analysis.riskyClauses.slice(0, 4).map((clause, idx) => (
                  <li key={idx} className="rounded-lg border border-amber-400/20 bg-amber-400/5 p-3">
                    <p className="text-amber-200 font-medium">{clause.title}</p>
                    <p className="text-slate-300">{clause.description}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {analysis.keyObligations?.length > 0 && (
            <div>
              <h4 className="text-slate-200 font-medium mb-2 flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-300" />Key Obligations</h4>
              <ul className="space-y-1 text-slate-300">
                {analysis.keyObligations.slice(0, 5).map((item, idx) => (
                  <li key={idx}>- {item}</li>
                ))}
              </ul>
            </div>
          )}

          {analysis.recommendation && (
            <div className="rounded-lg border border-cyan-400/20 bg-cyan-400/5 p-3">
              <p className="text-cyan-200 font-medium mb-1 flex items-center gap-2"><ShieldAlert className="w-4 h-4" />Recommendation</p>
              <p className="text-slate-200">{analysis.recommendation}</p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
