'use client';

import { ArrowRight, Eye, EyeOff, LoaderCircle, LockKeyhole, Mail } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('ana.souza@nexo.com.br');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = (await res.json()) as { redirect?: string; error?: { message: string } };
      if (!res.ok || !data.redirect) throw new Error(data.error?.message ?? 'Não foi possível entrar.');
      router.replace(data.redirect);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível entrar.');
      setLoading(false);
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <div>
        <h2>Entrar</h2>
        <p>Use seu e-mail corporativo e a senha da rede Nexo.</p>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <label className="field">
          <span className="row">E-mail corporativo</span>
          <span className="input">
            <Mail size={16} />
            <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </span>
        </label>
        <label className="field">
          <span className="row">
            Senha <a href="#" onClick={(e) => e.preventDefault()}>Esqueci minha senha</a>
          </span>
          <span className="input">
            <LockKeyhole size={16} />
            <input type={show ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••••" />
            <button type="button" className="btn btn-ghost" style={{ width: 30, height: 30, padding: 0, justifyContent: 'center' }} onClick={() => setShow((s) => !s)} aria-label={show ? 'Ocultar senha' : 'Mostrar senha'}>
              {show ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </span>
        </label>
        <label className="check">
          <input type="checkbox" defaultChecked /> Manter conectado neste computador
        </label>
      </div>
      {error && <div className="form-error" role="alert">{error}</div>}
      <button className="btn btn-primary btn-lg" type="submit" disabled={loading}>
        {loading ? <LoaderCircle size={16} className="spin" /> : null} Entrar {!loading && <ArrowRight size={16} />}
      </button>
      <div className="note">
        Ambiente de demonstração: qualquer senha funciona. Funcionária: <code>ana.souza@nexo.com.br</code> · analista: <code>rafael.lima@nexo.com.br</code>
      </div>
    </form>
  );
}
