// Résolution automatique du rendu 3D du doom-like : fps.js lance ses rayons dans un tampon de 384 × 216 × scale,
// puis l'agrandit. Deux profils : au doigt (téléphone, tablette) on part bas (0,5 : quatre fois moins de pixels)
// et on descend dès que les images traînent ; sur PC on part à pleine résolution, on tolère un peu de lenteur
// (une grande rue dégagée coûte plus cher qu'une carte fermée) et on ne descend jamais sous 0,75.
// On remonte prudemment quand tout tient les 60 images/s.
// Les images sont plafonnées à 60/s (due60) : l'écart entre deux images ne descend jamais sous ~16,7 ms,
// donc « ça tient » veut dire ~60/s pendant un bon moment, pas « plus vite que 60/s ».

const PROFILES = {
  touch: { levels: [0.5, 0.75, 1], start: 0, slow: 20 }, // ms en moyenne au-delà desquels on descend d'un cran
  pc: { levels: [0.75, 1], start: 1, slow: 25 },
};
const OK = 17.6; // ms en moyenne : la cadence tient les 60/s
const CLIMB_MS = 5000; // temps passé à 60/s avant d'essayer le cran au-dessus
const SETTLE_MS = 1500; // après un changement, le temps que la moyenne se refasse
const BAN_MS = 20000; // un cran qui a fait ramer n'est pas retenté avant 20 s (puis 40 s, 60 s…)

export class AutoRes {
  constructor(touch) {
    const p = PROFILES[touch ? 'touch' : 'pc'];
    this.levels = p.levels;
    this.slow = p.slow;
    this.i = p.start;
    this.avg = 1000 / 60;
    this.settle = SETTLE_MS;
    this.good = 0;
    this.clock = 0;
    this.ban = this.levels.map(() => ({ until: 0, n: 0 }));
  }

  get scale() { return this.levels[this.i]; }

  // À chaque image, avec l'écart en ms depuis la précédente.
  frame(dt) {
    if (!(dt > 0)) return;
    this.clock += dt;
    if (dt > 250) return; // onglet en arrière-plan, chargement : rien à voir avec le rendu
    this.avg += (Math.min(dt, 60) - this.avg) * 0.06;
    if (this.settle > 0) { this.settle -= dt; return; }
    if (this.avg > this.slow && this.i > 0) {
      const b = this.ban[this.i];
      b.n++;
      b.until = this.clock + BAN_MS * b.n;
      this.set(this.i - 1);
    } else if (this.avg < OK && this.i < this.levels.length - 1 && this.clock >= this.ban[this.i + 1].until) {
      this.good += dt;
      if (this.good >= CLIMB_MS) this.set(this.i + 1);
    } else this.good = 0;
  }

  set(i) {
    this.i = i;
    this.good = 0;
    this.settle = SETTLE_MS;
    this.avg = 1000 / 60;
  }
}
