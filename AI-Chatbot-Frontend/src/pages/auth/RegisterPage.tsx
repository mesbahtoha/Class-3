import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { FaRobot } from 'react-icons/fa';
import { MdVisibility, MdVisibilityOff } from 'react-icons/md';
import { useAuthStore } from '@/store/auth.store';
import { getErrorMessage } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Form';
import { useLang } from '@/lib/i18n';

export function RegisterPage() {
  const register = useAuthStore((s) => s.register);
  const navigate = useNavigate();
  const { lang } = useLang();
  const bn = lang === 'bn';
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fieldError, setFieldError] = useState<Record<string, string>>({});

  const strength = useMemo(() => {
    let s = 0;
    if (password.length >= 8) s++;
    if (/[A-Z]/.test(password) && /[a-z]/.test(password)) s++;
    if (/\d/.test(password)) s++;
    if (/[^A-Za-z0-9]/.test(password)) s++;
    return s;
  }, [password]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const fe: Record<string, string> = {};
    if (name.trim().length < 2) fe.name = bn ? 'তোমার নাম লেখো।' : 'Please write your name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) fe.email = bn ? 'সঠিক ইমেইল লেখো।' : 'Enter a valid email.';
    if (password.length < 8) fe.password = bn ? 'পাসওয়ার্ড কমপক্ষে ৮ অক্ষর হতে হবে।' : 'Password must be at least 8 characters.';
    if (password !== confirm) fe.confirm = bn ? 'পাসওয়ার্ড মিলছে না।' : 'Passwords do not match.';
    setFieldError(fe);
    if (Object.keys(fe).length) return;
    setLoading(true);
    try {
      const user = await register(name.trim(), email.trim(), password);
      toast.success(bn ? `স্বাগতম, ${user.name}!` : `Welcome, ${user.name}!`);
      navigate('/chat', { replace: true });
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
          <h1 style={{ fontSize: 22, margin: 0 }}>{bn ? 'তোমার অ্যাকাউন্ট খোলো' : 'Create your account'}</h1>
          <p className="text-sm text-muted" style={{ margin: '6px 0 0' }}>{bn ? 'এক মিনিটেই শুরু করো' : 'Start learning in under a minute'}</p>
        </div>
        <form onSubmit={(e) => void submit(e)} noValidate>
          <Field label={bn ? 'পুরো নাম' : 'Full name'} error={fieldError.name}>
            <Input id="reg-name" required minLength={2} placeholder={bn ? 'তোমার নাম' : 'Your name'} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" aria-label={bn ? 'পুরো নাম' : 'Full name'} />
          </Field>
          <Field label={bn ? 'ইমেইল' : 'Email'} error={fieldError.email}>
            <Input id="reg-email" type="email" required placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" aria-label="Email" />
          </Field>
          <Field label={bn ? 'পাসওয়ার্ড' : 'Password'} hint={bn ? 'কমপক্ষে ৮ অক্ষর' : 'At least 8 characters'} error={fieldError.password}>
            <div className="password-wrap">
              <Input id="reg-password" type={show ? 'text' : 'password'} required minLength={8} placeholder="********" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" aria-label={bn ? 'পাসওয়ার্ড' : 'Password'} />
              <button type="button" className="password-eye" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'}>{show ? <MdVisibilityOff /> : <MdVisibility />}</button>
            </div>
            {password && (
              <div className="strength" aria-hidden="true">
                {[0, 1, 2, 3].map((i) => <span key={i} className={i < strength ? 'on' : ''} />)}
              </div>
            )}
          </Field>
          <Field label={bn ? 'পাসওয়ার্ড নিশ্চিত করো' : 'Confirm password'} error={fieldError.confirm}>
            <Input id="reg-confirm" type={show ? 'text' : 'password'} required placeholder="********" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" aria-label={bn ? 'পাসওয়ার্ড নিশ্চিত করো' : 'Confirm password'} />
          </Field>
          {error && <div className="card form-error-card"><span className="text-sm text-danger">{error}</span></div>}
          <Button type="submit" className="w-full" loading={loading}>{bn ? 'অ্যাকাউন্ট খোলো' : 'Create account'}</Button>
        </form>
        <p className="text-sm text-center text-muted mt-4" style={{ marginBottom: 0 }}>
          {bn ? 'আগে থেকেই অ্যাকাউন্ট আছে? ' : 'Already have an account? '}<Link to="/login" className="font-semibold">{bn ? 'লগইন' : 'Log in'}</Link>
        </p>
      </div>
    </div>
  );
}
