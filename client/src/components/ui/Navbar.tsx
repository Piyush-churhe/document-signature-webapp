import { Link, useNavigate } from 'react-router-dom';
import { PenLine, LogOut, LayoutDashboard } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export default function Navbar() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <header className="sticky top-0 z-40 border-b border-white/5" style={{ background: 'rgba(15,15,23,0.9)', backdropFilter: 'blur(16px)' }}>
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link to="/dashboard" className="flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-yellow-600 text-gray-900 flex items-center justify-center">
            <PenLine className="w-4 h-4" />
          </span>
          <span className="font-display text-lg font-semibold text-white">SignatureFlow</span>
        </Link>

        <div className="flex items-center gap-3">
          <Link to="/dashboard" className="btn-secondary flex items-center gap-2 text-sm py-2 px-3.5">
            <LayoutDashboard className="w-4 h-4" />
            Dashboard
          </Link>
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl glass text-sm text-slate-300">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            {user?.name || 'User'}
          </div>
          <button onClick={handleLogout} className="btn-secondary flex items-center gap-2 text-sm py-2 px-3.5">
            <LogOut className="w-4 h-4" />
            Logout
          </button>
        </div>
      </div>
    </header>
  );
}
