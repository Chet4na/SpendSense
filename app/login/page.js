'use client';
import { useState } from 'react';
import { api } from '@/lib/api';

export default function Login() {
  const [mode, setMode] = useState('login');
  const [f, setF] = useState({ name: '', email: '', password: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      const d = await api('/api/auth/' + mode, { method: 'POST', body: f });
      window.location.href = '/dashboard';
    } catch (x) { setErr(x.message); setBusy(false); }
  }

  return (
    <div className="login">
      <div className="box card">
        <h1>SpendSense</h1>
        <p className="sub">See where your money goes, and get warned before a budget runs out.</p>
        {err && <p className="msg err" role="alert">{err}</p>}
        <form onSubmit={submit}>
          {mode === 'register' && <label>Name<input value={f.name} onChange={set('name')} required minLength={2} autoComplete="name" /></label>}
          <label>Email<input type="email" value={f.email} onChange={set('email')} required autoComplete="email" /></label>
          <label>Password<input type="password" value={f.password} onChange={set('password')} required minLength={mode === 'register' ? 8 : 1} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} /></label>
          <button disabled={busy}>{mode === 'login' ? 'Sign in' : 'Create account'}</button>
        </form>
        <p className="sub" style={{ marginTop: 14 }}>
          {mode === 'login' ? 'New here? ' : 'Already registered? '}
          <a href="#" onClick={(e) => { e.preventDefault(); setErr(''); setMode(mode === 'login' ? 'register' : 'login'); }}>
            {mode === 'login' ? 'Create an account' : 'Sign in'}
          </a>
        </p>
        <p className="sub">Demo: demo@spendsense.com / Demo@123</p>
      </div>
    </div>
  );
}
