// Résolution automatique du rendu 3D du doom-like : fps.js lance ses rayons dans un tampon de 384 × 216 × scale,
// puis l'agrandit. Deux profils : au doigt (téléphone, tablette) on part bas (0,5 : quatre fois moins de pixels)
// et on descend dès que le calcul des images déborde ; sur PC on part à pleine résolution, on tolère un peu plus
// (une grande rue dégagée coûte plus cher qu'une carte fermée) et on ne descend jamais sous 0,75.
// On se règle sur le travail de l'image (update + render, mesuré par fps.js), pas sur l'écart entre deux images :
// celui-ci est borné à 50 ms en amont (miniscene.js) et calé sur l'écran (33 ms sur un écran à 30 Hz ou un iPhone
// en économie d'énergie, quoi qu'on fasse), il ne dit pas si une résolution plus basse irait plus vite.
// Un à-coup isolé (une image qui se dessine pour la première fois, le ramasse-miettes) ne compte presque pas :
// chaque mesure est plafonnée, et il faut que la moyenne déborde pendant une bonne seconde pour descendre.
// On remonte prudemment : quand le travail estimé au cran au-dessus tient largement dans le budget.

const PROFILES = {
  touch: { levels: [0.5, 0.75, 1], start: 0, budget: 12 }, // ms de travail par image au-delà desquelles on descend
  pc: { levels: [0.75, 1], start: 1, budget: 15 },
};
const SPIKE = 2; // une mesure compte au plus pour 2 budgets
const TAU_MS = 300; // la moyenne glisse sur ~0,3 s
const OVER_MS = 1200; // temps passé au-dessus du budget avant de descendre d'un cran
const CLIMB = 0.8; // on remonte si le travail estimé au cran au-dessus tient dans 80 % du budget…
const CLIMB_MS = 5000; // … pendant 5 s
const SETTLE_MS = 1000; // après un changement (tampons et ciel refaits), le temps que la moyenne se refasse
const BAN_MS = 20000; // un cran qui a fait ramer n'est pas retenté avant 20 s (puis 40 s, 60 s…)

export class AutoRes {
  constructor(touch) {
    const p = PROFILES[touch ? 'touch' : 'pc'];
    this.levels = p.levels;
    this.budget = p.budget;
    this.i = p.start;
    this.dt = 1000 / 60;
    this.clock = 0;
    this.ban = this.levels.map(() => ({ until: 0, n: 0 }));
    this.set(this.i);
  }

  get scale() { return this.levels[this.i]; }

  // À chaque image (update), avec l'écart en ms depuis la précédente : l'horloge des délais.
  frame(dt) {
    if (!(dt > 0)) return;
    this.dt = dt;
    this.clock += dt;
  }

  // À chaque image (fin de render), avec le travail de l'image en ms.
  work(ms) {
    if (!(ms >= 0)) return;
    const dt = this.dt;
    if (this.settle > 0) { this.settle -= dt; this.avg = Math.min(ms, this.budget); return; }
    this.avg += (Math.min(ms, this.budget * SPIKE) - this.avg) * (1 - Math.exp(-dt / TAU_MS));
    if (this.avg > this.budget) {
      this.good = 0;
      this.over += dt;
      if (this.over >= OVER_MS && this.i > 0) {
        const b = this.ban[this.i];
        b.n++;
        b.until = this.clock + BAN_MS * b.n;
        this.set(this.i - 1);
      }
      return;
    }
    this.over = 0;
    const up = this.levels[this.i + 1];
    // estimation : la moitié du travail croît comme le nombre de pixels (rayons, sols, sprites), l'autre non (HUD,
    // logique, agrandissement de l'image) ; si elle se trompe, on redescend au bout d'OVER_MS et le cran est banni
    if (up && this.clock >= this.ban[this.i + 1].until && this.avg * (0.5 + 0.5 * (up / this.scale) ** 2) < this.budget * CLIMB) {
      this.good += dt;
      if (this.good >= CLIMB_MS) this.set(this.i + 1);
    } else this.good = 0;
  }

  set(i) {
    this.i = i;
    this.good = 0;
    this.over = 0;
    this.settle = SETTLE_MS;
    this.avg = 0;
  }
}
