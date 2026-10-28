/**
 * Simula o legado que "de vez em quando fica indisponível por alguns segundos".
 * Com probabilidade `rate`, uma requisição derruba o serviço por `durationMs`;
 * durante a janela, toda requisição recebe 503.
 */
export class OutageSimulator {
  private downUntil = 0;

  constructor(
    private readonly rate: number,
    private readonly durationMs: number,
    private readonly random: () => number = Math.random,
    private readonly now: () => number = Date.now,
  ) {}

  /** Retorna true se a requisição deve falhar. */
  shouldFail(): boolean {
    const t = this.now();
    if (t < this.downUntil) return true;
    if (this.rate > 0 && this.random() < this.rate) {
      this.downUntil = t + this.durationMs;
      return true;
    }
    return false;
  }

  forceOutage(ms: number): void {
    this.downUntil = this.now() + ms;
  }
}
