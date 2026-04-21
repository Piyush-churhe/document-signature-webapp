import { Plus, Trash2 } from 'lucide-react';

export interface MultiSignerInput {
  name: string;
  email: string;
  order: number;
}

interface MultiSignerFormProps {
  value: MultiSignerInput[];
  onChange: (signers: MultiSignerInput[]) => void;
}

export default function MultiSignerForm({ value, onChange }: MultiSignerFormProps) {
  const signers = value.length > 0 ? value : [{ name: '', email: '', order: 1 }];

  const update = (index: number, patch: Partial<MultiSignerInput>) => {
    const next = signers.map((signer, i) => (i === index ? { ...signer, ...patch } : signer))
      .map((signer, i) => ({ ...signer, order: i + 1 }));
    onChange(next);
  };

  const addSigner = () => {
    onChange([...signers, { name: '', email: '', order: signers.length + 1 }]);
  };

  const removeSigner = (index: number) => {
    if (signers.length <= 1) return;
    const next = signers.filter((_, i) => i !== index).map((signer, i) => ({ ...signer, order: i + 1 }));
    onChange(next);
  };

  return (
    <div className="space-y-3">
      {signers.map((signer, index) => (
        <div key={index} className="glass rounded-xl p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Signer {index + 1}</p>
            <button
              type="button"
              onClick={() => removeSigner(index)}
              className="text-red-300 hover:text-red-200 disabled:opacity-40"
              disabled={signers.length <= 1}
              aria-label={`Remove signer ${index + 1}`}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
          <input
            value={signer.name}
            onChange={(e) => update(index, { name: e.target.value })}
            className="input-field"
            placeholder="Signer name"
          />
          <input
            value={signer.email}
            onChange={(e) => update(index, { email: e.target.value })}
            className="input-field"
            placeholder="Signer email"
            type="email"
          />
        </div>
      ))}

      <button type="button" onClick={addSigner} className="btn-secondary w-full flex items-center justify-center gap-2 text-sm">
        <Plus className="w-4 h-4" />
        Add signer
      </button>
    </div>
  );
}
