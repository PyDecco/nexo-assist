import { redirect } from 'next/navigation';
import { NexoMark } from '@/components/NexoMark';
import { currentUser } from '@/server/auth';
import { LoginForm } from './LoginForm';

export const dynamic = 'force-dynamic';

/** Tela 1 — Identificação. */
export default async function LoginPage() {
  const user = await currentUser();
  if (user) redirect(user.role === 'analyst' ? '/console' : '/atendimento');

  return (
    <div className="login">
      <section className="showcase">
        <div className="brand">
          <NexoMark size={24} color="#FFFFFF" /> Nexo Assist
        </div>
        <div>
          <div className="eyebrow">Service desk de TI da Nexo</div>
          <h1>Seu problema de TI, resolvido em uma conversa.</h1>
          <p className="lead">
            Descreva o que está acontecendo. O assistente consulta seus chamados, busca na central de ajuda e chama um analista quando precisa.
          </p>
          <div className="preview" aria-hidden="true">
            <div className="u">Meu notebook não conecta na VPN. Erro 809.</div>
            <div className="who">
              <b>Nexo Assist</b>
              <span>consultou seus chamados · criou um chamado</span>
            </div>
            <div className="a">Pronto: abri o chamado com prioridade alta. Um analista fala com você em até 4 h úteis.</div>
            <div className="chip">
              <span className="dot" style={{ background: 'var(--warning)', width: 7, height: 7 }} />
              <b>INC-20517</b>
              <span className="muted">Rede e VPN · Alta · em até 4 h</span>
            </div>
          </div>
        </div>
        <div className="stats">
          <div>
            <b>8 s</b>
            <span>primeira resposta, em média</span>
          </div>
          <div>
            <b>72%</b>
            <span>resolvidos sem fila</span>
          </div>
          <div>
            <b>
              6 <span className="dot" style={{ background: 'var(--success)', width: 8, height: 8 }} />
            </b>
            <span>analistas online agora</span>
          </div>
        </div>
      </section>
      <section className="signin">
        <div className="help">
          Problema para entrar? <b>Ligue no ramal 4000</b>
        </div>
        <LoginForm />
        <div className="footer">
          <span>© 2026 Nexo · Service desk de TI</span>
          <span>Privacidade e uso de dados</span>
        </div>
      </section>
    </div>
  );
}
