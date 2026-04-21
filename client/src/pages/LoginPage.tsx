import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { Eye, EyeOff, Pen } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      toast.success('Welcome back!');
      navigate('/dashboard');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex" style={{ background: 'linear-gradient(135deg, #0f0f17 0%, #1a1a2e 50%, #16213e 100%)' }}>
      {/* Left panel */}
      <div className="hidden lg:flex flex-col justify-center items-center w-1/2 p-16 relative overflow-hidden">
        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(circle at 30% 40%, #fbbf24 0%, transparent 50%), radial-gradient(circle at 70% 60%, #6366f1 0%, transparent 50%)' }} />
        <div className="relative z-10 text-center">
          <div className="flex items-center gap-3 mb-12">
            <div className="w-12 h-12 bg-gradient-to-br from-amber-400 to-yellow-600 rounded-2xl flex items-center justify-center">
              <Pen className="w-6 h-6 text-gray-900" />
            </div>
            <span className="font-display text-3xl font-semibold text-white">SignatureFlow</span>
          </div>
          <h1 className="font-display text-5xl text-white mb-6 leading-tight">Enterprise<br/><em className="text-amber-400">Document</em><br/>Signatures</h1>
          <p className="text-slate-400 text-lg max-w-sm mx-auto leading-relaxed">Streamline your signing workflow with legally-binding digital signatures and full audit trails.</p>
          <div className="mt-12 grid grid-cols-3 gap-6">
            {[['100%', 'Secure'], ['SOC 2', 'Compliant'], ['Full', 'Audit Trail']].map(([val, label]) => (
              <div key={label} className="glass rounded-xl p-4 text-center">
                <p className="text-amber-400 font-bold text-xl">{val}</p>
                <p className="text-slate-400 text-sm mt-1">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <div className="glass rounded-3xl p-10 shadow-2xl">
            <div className="lg:hidden flex items-center gap-3 mb-8">
              <div className="w-10 h-10 bg-gradient-to-br from-amber-400 to-yellow-600 rounded-xl flex items-center justify-center">
                <Pen className="w-5 h-5 text-gray-900" />
              </div>
              <span className="font-display text-2xl text-white">SignatureFlow</span>
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Welcome back</h2>
            <p className="text-slate-400 mb-8">Sign in to your account</p>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} 
                  className="input-field" placeholder="you@company.com" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Password</label>
                <div className="relative">
                  <input type={showPass ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                    className="input-field pr-12" placeholder="••••••••" required />
                  <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors">
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <button type="submit" disabled={loading} className="btn-primary w-full py-3 text-base mt-2">
                {loading ? 'Signing in...' : 'Sign In'}
              </button>
            </form>
            <p className="text-center text-slate-400 mt-6 text-sm">
              Don't have an account?{' '}
              <Link to="/register" className="text-amber-400 hover:text-amber-300 font-medium transition-colors">Create one free</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
