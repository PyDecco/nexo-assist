import { KeyRound, Lock, Mail, RotateCcwKey } from 'lucide-react';
import { redirect } from 'next/navigation';
import { TopBar } from '@/components/TopBar';
import { currentUser } from '@/server/auth';

export const dynamic = 'force-dynamic';

/** Tela 6 — Meu perfil. */
export default async function ProfilePage() {
  const user = await currentUser();
  if (!user) redirect('/login');
  return (
    <>
      <TopBar here="Meu perfil" />
      <div className="page">
        <div className="page-content">
          <div>
            <h1>Meu perfil</h1>
            <span className="muted">Seus dados de acesso ao service desk de TI.</span>
          </div>
          <div className="kv-card">
            <div className="kv-row">
              <span className="k">Nome</span>
              <span className="v">{user.name}</span>
            </div>
            <div className="kv-row">
              <span className="k">Departamento</span>
              <span className="v">{user.department}</span>
            </div>
            <div className="kv-row">
              <span className="k">E-mail corporativo</span>
              <span className="v">{user.email}</span>
              <span className="muted" style={{ display: 'inline-flex', gap: 5, alignItems: 'center', fontSize: 12.5 }}>
                <Lock size={13} /> Gerenciado pela TI
              </span>
            </div>
          </div>
          <div className="kv-card">
            <div className="kv-row">
              <span className="icon-wrap">
                <KeyRound size={18} />
              </span>
              <span className="v" style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                Senha
                <span className="muted" style={{ fontWeight: 400, fontSize: 13.5 }}>
                  Alterada há 42 dias
                </span>
              </span>
              <a className="btn btn-outline" href="https://senha.nexo.com.br" target="_blank" rel="noreferrer">
                <RotateCcwKey size={15} /> Redefinir senha
              </a>
            </div>
            <div className="card-note">
              <Mail size={14} /> Enviaremos um link de redefinição para {user.email}.
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
