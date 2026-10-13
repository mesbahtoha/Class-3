import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { FaRobot } from 'react-icons/fa';
import { MdVisibility, MdVisibilityOff } from 'react-icons/md';
import { useAuthStore } from '@/store/auth.store';
import { getErrorMessage } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Form';
import { useLang } from '@/lib/i18n';

export function LoginPage() {
  const login = useAuthStore((s) => s.login);
  const loginAdmin = useAuthStore((s) => s.loginAdmin);
  const navigate = useNavigate();
  const location = useLocation();
  const { lang } = useLang();
  const bn = lang === 'bn';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [adminMode, setAdminMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fieldError, setFieldError] = useState<{ email?: string; password?: string }>({});

  const from = (location.state as { from?: string } | null)?.from;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const fe: typeof fieldError = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) fe.email = bn ? 'সঠিক ইমেইল লেখো।' : 'Enter a valid email.';
    if (password.length < 8) fe.password = bn ? 'পাসওয়ার্ড কমপক্ষে ৮ অক্ষর হতে হবে।' : 'Password must be at least 8 characters.';
    setFieldError(fe);
    if (Object.keys(fe).length) return;
    setLoading(true);
    try {
      const user = adminMode ? await loginAdmin(email.trim(), password) : await login(email.trim(), password);
      toast.success(bn ? `ফিরে আসায় খুশি, ${user.name}!` : `Welcome back, ${user.name}!`);
      navigate(from ?? (adminMode ? '/admin' : '/chat'), { replace: true });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center auth-wrap">
      <div className="card auth-card">
        <div className="text-center mb-4">
          <div className="flex items-center justify-center mx-auto auth-icon"><FaRobot /></div>
          <h1 style={{ fontSize: 22, margin: 0 }}>{bn ? 'ফিরে আসায় খুশি' : 'Welcome back'}</h1>
          <p className="text-sm text-muted" style={{ margin: '6px 0 0' }}>{bn ? 'চালিয়ে যেতে লগইন করো' : 'Log in to continue learning'}</p>
        </div>
        <form onSubmit={(e) => void submit(e)} noValidate>
          <Field label={bn ? 'ইমেইল' : 'Email'} error={fieldError.email}>
            <Input id="login-email" type="email" required placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" aria-label={bn ? 'ইমেইল' : 'Email'} />
          </Field>
          <Field label={bn ? 'পাসওয়ার্ড' : 'Password'} error={fieldError.password}>
            <div className="password-wrap">
              <Input id="login-password" type={show ? 'text' : 'password'} required minLength={8} placeholder="********" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" aria-label={bn ? 'পাসওয়ার্ড' : 'Password'} />
              <button type="button" className="password-eye" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'}>{show ? <MdVisibilityOff /> : <MdVisibility />}</button>
            </div>
          </Field>
          <div className="flex items-center justify-between mb-3">
            <label className="flex items-center gap-2 text-sm" style={{ cursor: 'pointer' }}>
              <input type="checkbox" checked={adminMode} onChange={(e) => setAdminMode(e.target.checked)} style={{ cursor: 'pointer' }} />
              {bn ? 'অ্যাডমিন হিসেবে প্রবেশ' : 'Sign in as administrator'}
            </label>
            <Link to="/forgot-password" className="text-sm">{bn ? 'পাসওয়ার্ড ভুলে গেছো?' : 'Forgot password?'}</Link>
          </div>
          {error && <div className="card form-error-card"><span className="text-sm text-danger">{error}</span></div>}
          <Button type="submit" className="w-full" loading={loading}>{bn ? 'লগইন' : 'Log in'}</Button>
        </form>
        <p className="text-sm text-center text-muted mt-4" style={{ marginBottom: 0 }}>
          {bn ? 'অ্যাকাউন্ট নেই? ' : 'No account? '}<Link to="/register" className="font-semibold">{bn ? 'তৈরি করো' : 'Create one'}</Link>
        </p>
      </div>
    </div>
  );
}
