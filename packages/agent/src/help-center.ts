import { tokenize } from '@nexo/core';

export interface Article {
  id: string;
  title: string;
  body: string;
  /** Termos extras que ajudam a busca (sinônimos comuns). */
  keywords: string[];
}

/** Central de ajuda (Anexo B): artigos curtos. Os dois primeiros vêm literalmente do PDF. */
export const ARTICLES: Article[] = [
  {
    id: 'KB-001',
    title: 'VPN com erro 809',
    body: 'Reinstale o cliente de VPN pelo portal de softwares e reinicie o computador. Vale apenas para Windows 10; no Windows 11, abra um chamado.',
    keywords: ['vpn', '809', 'conectar', 'conecta', 'remoto', 'windows'],
  },
  {
    id: 'KB-002',
    title: 'Horário do service desk',
    body: 'De segunda a sexta, das 8h às 18h. Chamados críticos têm plantão 24 horas.',
    keywords: ['horario', 'atendimento', 'plantao', 'funciona', 'aberto', 'fim', 'semana'],
  },
  {
    id: 'KB-003',
    title: 'Redefinir a senha da rede',
    body: 'Acesse senha.nexo.com.br com seu e-mail corporativo e siga o código enviado ao celular cadastrado. A nova senha vale também para o Wi-Fi e o e-mail após até 15 minutos.',
    keywords: ['senha', 'rede', 'esqueci', 'expirou', 'expirada', 'trocar', 'redefinir', 'login'],
  },
  {
    id: 'KB-004',
    title: 'Senha do Wi-Fi de visitantes',
    body: 'A rede Nexo-Visitantes usa uma senha diária exibida na recepção de cada andar. Funcionários devem usar a rede Nexo-Corp com o login da rede.',
    keywords: ['wifi', 'wi-fi', 'visitante', 'internet', 'rede', 'convidado'],
  },
  {
    id: 'KB-005',
    title: 'Configurar o e-mail no celular',
    body: 'Instale o app Outlook, entre com o e-mail corporativo e aprove o acesso no Authenticator. Outros apps de e-mail não são suportados.',
    keywords: ['email', 'e-mail', 'outlook', 'celular', 'sincroniza', 'sincronizar', 'iphone', 'android'],
  },
  {
    id: 'KB-006',
    title: 'Instalar programas',
    body: 'Programas homologados ficam no portal de softwares (Central de Software no menu Iniciar) e instalam sem chamado. Programas fora do portal exigem uma requisição com aprovação do gestor.',
    keywords: ['instalar', 'programa', 'software', 'aplicativo', 'portal', 'licenca', 'baixar'],
  },
  {
    id: 'KB-007',
    title: 'Impressora não imprime',
    body: 'Verifique se a impressora aparece como "Nexo-Print" e reenvie o documento. Se aparecer erro de papel com a bandeja cheia, desligue e ligue a impressora. Persistindo, abra um chamado informando o andar.',
    keywords: ['impressora', 'imprimir', 'imprime', 'papel', 'impressao'],
  },
  {
    id: 'KB-008',
    title: 'Computador lento',
    body: 'Reinicie o computador e rode o "Diagnóstico Nexo" na Central de Software. Se a lentidão continuar, abra um chamado de Hardware informando desde quando acontece.',
    keywords: ['lento', 'lentidao', 'travando', 'trava', 'notebook', 'computador', 'devagar'],
  },
];

export interface ArticleHit {
  id: string;
  title: string;
  body: string;
  score: number;
}

/** Busca simples por sobreposição de termos (título + corpo + palavras-chave). */
export function searchArticles(query: string, limit = 3): ArticleHit[] {
  const q = tokenize(query);
  if (q.size === 0) return [];
  return ARTICLES.map((a) => {
    const terms = tokenize(`${a.title} ${a.body} ${a.keywords.join(' ')}`);
    const kw = tokenize(a.keywords.join(' '));
    let score = 0;
    for (const t of q) {
      if (kw.has(t)) score += 2;
      else if (terms.has(t)) score += 1;
    }
    return { id: a.id, title: a.title, body: a.body, score: score / (q.size + 1) };
  })
    .filter((h) => h.score > 0.25)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
