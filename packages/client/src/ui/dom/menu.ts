/**
 * Z5: o MENU. Os botões soltos do topo (carteira, Perfil, Habilidades, Mochila, Doutrina, Mapa,
 * Bordão) viram UM botão redondo no canto de cima à direita, que abre uma gaveta pela direita com
 * botões grandes. Pendência (ala, talento, novidade, dívida) acende um selo no MENU em vez de virar
 * botão extra na tela.
 */
import { versionLabel } from '../../app/appInfo';
import { button, el } from './styles';

export interface MenuItem {
  label: string;
  onTap: () => void;
  /** pisca (escolha pendente) */
  pisca?: boolean;
  /** selo "!" no item */
  selo?: boolean;
  /** cor de alerta (dívida, aluguel atrasado) */
  alerta?: boolean;
}

export interface MenuFrame {
  /** centro e raio do botão, em px de CSS */
  x: number;
  y: number;
  r: number;
  show: boolean;
  /** selo no botão: '!' ou o número de pendências; '' sem selo */
  selo: string;
}

export class MenuUi {
  private readonly btn: HTMLButtonElement;
  private readonly seloEl: HTMLSpanElement;
  private fundo: HTMLDivElement | null = null;
  private sig = '';

  constructor(
    private readonly root: HTMLElement,
    private readonly items: () => MenuItem[],
  ) {
    // SUGESTÃO: ícone do MENU (três traços) e o nome lido pelo leitor de tela
    this.btn = button('☰', 'menu-btn', () => this.open());
    this.btn.setAttribute('aria-label', 'Menu');
    this.seloEl = el('span', 'selo');
    this.seloEl.style.display = 'none';
    this.btn.appendChild(this.seloEl);
    this.btn.style.display = 'none';
    root.appendChild(this.btn);
  }

  get isOpen(): boolean {
    return this.fundo !== null;
  }

  open(): void {
    this.close();
    const fundo = el('div', 'gaveta-fundo');
    fundo.addEventListener('click', (ev) => {
      if (ev.target === fundo) {
        ev.preventDefault();
        this.close();
      }
    });
    const g = el('div', 'gaveta painel');
    // SUGESTÃO: título da gaveta
    g.appendChild(el('h1', 'sombra', 'Menu'));
    for (const it of this.items()) {
      const b = button(it.label, `${it.pisca ? 'pisca' : 'sec'}${it.alerta ? ' alerta' : ''}`, () => {
        this.close();
        it.onTap();
      });
      if (it.selo) b.appendChild(el('span', 'selo', '!'));
      g.appendChild(b);
    }
    const sp = el('div', '');
    sp.style.flex = '1';
    g.appendChild(sp);
    g.appendChild(el('div', 'versao', `Ponte que Partiu ${versionLabel()}`));
    g.appendChild(button('Fechar', 'sec', () => this.close()));
    fundo.appendChild(g);
    this.root.appendChild(fundo);
    this.fundo = fundo;
  }

  close(): void {
    this.fundo?.remove();
    this.fundo = null;
  }

  update(f: MenuFrame): void {
    const show = f.show && !this.fundo;
    this.btn.style.display = show ? '' : 'none';
    if (!show) return;
    const d = Math.round(f.r * 2);
    const sig = `${Math.round(f.x)}|${Math.round(f.y)}|${d}|${f.selo}`;
    if (sig === this.sig) return;
    this.sig = sig;
    const s = this.btn.style;
    s.left = `${Math.round(f.x - f.r)}px`;
    s.top = `${Math.round(f.y - f.r)}px`;
    s.width = `${d}px`;
    s.height = `${d}px`;
    this.seloEl.textContent = f.selo;
    this.seloEl.style.display = f.selo ? '' : 'none';
  }
}
