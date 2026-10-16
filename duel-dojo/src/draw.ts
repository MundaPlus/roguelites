/** Canvas drawing: stages, vector fighters, projectiles. */
import { STAGES } from './data';
import { GROUND, H, W, phase, type Fighter, type Proj } from './game';
import { Rng } from './rng';

type P = [number, number];

interface Pose {
  hip: P;
  neck: P;
  head: P;
  hF: P;
  hB: P;
  fF: P;
  fB: P;
  /** Rotation of the whole body around the feet (lying down). */
  rot: number;
  lift: number;
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const lp = (a: P, b: P, t: number): P => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];

function basePose(f: Fighter): Pose {
  const bob = Math.sin(f.t * 0.12) * 1.5;
  const idle: Pose = { hip: [0, 52 + bob], neck: [3, 84 + bob], head: [5, 95 + bob], hF: [22, 80 + bob], hB: [12, 75 + bob], fF: [13, 0], fB: [-13, 0], rot: 0, lift: 0 };
  const crouch: Pose = { hip: [0, 32], neck: [5, 60], head: [8, 71], hF: [21, 56], hB: [12, 50], fF: [18, 0], fB: [-16, 0], rot: 0, lift: 0 };
  switch (f.st) {
    case 'walk': {
      const w = f.t * 0.22 * (f.walk || 1);
      return { ...idle, fF: [13 + Math.sin(w) * 9, Math.max(0, Math.cos(w)) * 4], fB: [-13 - Math.sin(w) * 9, Math.max(0, -Math.cos(w)) * 4] };
    }
    case 'crouch':
    case 'prejump':
      return crouch;
    case 'land':
      return { ...crouch, hip: [0, 40], neck: [4, 70], head: [7, 81] };
    case 'air':
      return { hip: [0, 52], neck: [1, 82], head: [3, 93], hF: [18, 84], hB: [8, 78], fF: [6, 26], fB: [-12, 30], rot: 0, lift: 0 };
    case 'block':
      if (f.crouchBlock) return { ...crouch, neck: [2, 60], head: [3, 71], hF: [17, 70], hB: [13, 62] };
      return { ...idle, neck: [-1, 84], head: [-1, 95], hF: [16, 92], hB: [13, 84] };
    case 'hit':
    case 'thrown': {
      const k = f.st === 'thrown' ? 1 : Math.min(1, f.stun / 10);
      return { hip: [-2 * k, 50], neck: [-9 * k, 82], head: [-13 * k, 91], hF: [-2, 62], hB: [-14, 70], fF: [13, 0], fB: [-13, 0], rot: 0, lift: f.st === 'thrown' ? 10 : 0 };
    }
    case 'fall':
      return { hip: [-2, 50], neck: [-10, 82], head: [-14, 91], hF: [6, 92], hB: [-20, 86], fF: [16, 14], fB: [-6, 4], rot: Math.min(1.45, f.t * 0.1), lift: 0 };
    case 'down':
    case 'ko':
      return { hip: [-2, 50], neck: [-6, 84], head: [-8, 95], hF: [10, 80], hB: [-16, 88], fF: [16, 6], fB: [6, 0], rot: f.st === 'down' && f.t > 30 ? 1.45 - (f.t - 30) * 0.08 : 1.5, lift: 0 };
    default:
      return f.y > 0 ? { hip: [0, 52], neck: [1, 82], head: [3, 93], hF: [18, 84], hB: [8, 78], fF: [8, 24], fB: [-10, 30], rot: 0, lift: 0 } : f.move?.crouch ? crouch : idle;
  }
}

function movePose(f: Fighter, base: Pose): Pose {
  const m = f.move;
  if (!m || f.st !== 'move') return base;
  const ph = phase(f);
  let p: number;
  if (ph === 'startup') p = Math.pow(f.mf / m.startup, 2);
  else if (ph === 'active') p = 1;
  else p = Math.max(0, 1 - (f.mf - m.startup - m.active) / Math.max(1, m.recovery * 0.7));
  const pose: Pose = { ...base, hF: [...base.hF], hB: [...base.hB], fF: [...base.fF], fB: [...base.fB] };
  const tgt: P = m.box[2] > 0 ? [m.box[0] + m.box[2] * 0.85, m.box[1] + m.box[3] / 2] : [36, 70];
  if (m.id === 'slide') {
    return { hip: [-4, 18], neck: [-24, 32], head: [-32, 40], hF: [-10, 16], hB: [-30, 6], fF: lp(base.fF, [48, 6], p), fB: [12, 2], rot: 0, lift: 0 };
  }
  if (m.parry) {
    const g = ph === 'active' ? 1 : p;
    pose.hF = lp(base.hF, [20, 88], g);
    pose.hB = lp(base.hB, [22, 70], g);
    return pose;
  }
  if (m.limb === 'body') {
    const a = f.mf * 0.55;
    pose.hF = [Math.cos(a) * 40, 76];
    pose.hB = [-Math.cos(a) * 40, 78];
    return pose;
  }
  if (m.body) pose.lift = m.body[1] * Math.min(1, f.mf / 6) * (ph === 'recovery' ? p : 1);
  if (m.limb === 'fist') {
    pose.hF = lp(base.hF, tgt, p);
    pose.neck = [base.neck[0] + 4 * p, base.neck[1]];
    pose.head = [base.head[0] + 4 * p, base.head[1]];
    pose.hB = lp(base.hB, [2, 66], p);
  } else if (m.limb === 'foot') {
    if (m.id === 'spinkick') {
      const a = f.mf * 0.6;
      pose.fF = [Math.cos(a) * 44, 52 + Math.sin(a) * 6];
      pose.fB = [-Math.cos(a) * 20, 18];
    } else {
      pose.fF = lp(base.fF, [tgt[0], tgt[1] - pose.lift], p);
      pose.neck = [base.neck[0] - 7 * p, base.neck[1] - 2 * p];
      pose.head = [base.head[0] - 9 * p, base.head[1] - 3 * p];
      pose.hF = lp(base.hF, [6, 74], p);
    }
  } else {
    pose.hF = lp(base.hF, [tgt[0], tgt[1] + 6], p);
    pose.hB = lp(base.hB, [tgt[0] - 4, tgt[1] - 6], p);
    pose.neck = [base.neck[0] + 5 * p, base.neck[1]];
    pose.head = [base.head[0] + 6 * p, base.head[1]];
  }
  return pose;
}

/** Two-bone IK. Returns the middle joint. `bend` picks the side. */
function ik(a: P, b: P, len: number, bend: number): P {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const d = Math.min(Math.hypot(dx, dy), len * 2 - 0.01);
  const h = Math.sqrt(Math.max(0, len * len - (d / 2) * (d / 2)));
  const n = Math.hypot(dx, dy) || 1;
  const mx = a[0] + dx / 2;
  const my = a[1] + dy / 2;
  return [mx + (-dy / n) * h * bend, my + (dx / n) * h * bend];
}

export interface Look {
  gi: string;
  belt: string;
  skin: string;
  hair: string;
  size: number;
}

/** Draw one fighter in world space. */
export function drawFighter(c: CanvasRenderingContext2D, f: Fighter, look: Look, opts: { white: boolean; aura: string | null; win: boolean }): void {
  let pose = movePose(f, basePose(f));
  if (opts.win && (f.st === 'idle' || f.st === 'walk')) pose = { ...pose, hF: [10, 122], neck: [0, 84], head: [1, 96] };
  const s = look.size;
  const ox = f.x;
  const oy = GROUND - f.y;
  const cr = Math.cos(pose.rot);
  const sr = Math.sin(pose.rot);
  const tr = (p: P): P => {
    // rotate backwards around the feet when lying down
    const x = p[0] * cr - p[1] * sr;
    const y = p[0] * sr + p[1] * cr + (pose.rot > 0.5 ? 10 * Math.min(1, pose.rot) : 0) + pose.lift;
    return [ox + f.face * x * s, oy - y * s];
  };
  const hip = tr(pose.hip);
  const neck = tr(pose.neck);
  const head = tr(pose.head);
  const sh: P = [pose.neck[0], pose.neck[1] - 4];
  const shoulder = tr(sh);
  const eF = tr(ik(sh, pose.hF, 17, -1));
  const eB = tr(ik(sh, pose.hB, 17, -1));
  const kF = tr(ik(pose.hip, pose.fF, 27, 1));
  const kB = tr(ik(pose.hip, pose.fB, 27, 1));
  const hF = tr(pose.hF);
  const hB = tr(pose.hB);
  const fF = tr(pose.fF);
  const fB = tr(pose.fB);
  const W_ = opts.white;
  const gi = W_ ? '#fff' : look.gi;
  const skin = W_ ? '#fff' : look.skin;
  const out = W_ ? '#fff' : '#0d0a12';
  const shade = (col: string): string => (W_ ? '#ddd' : shadeColor(col, -0.25));

  c.lineCap = 'round';
  c.lineJoin = 'round';
  const seg = (pts: P[], w: number, col: string): void => {
    c.beginPath();
    c.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
    c.lineWidth = (w + 3.5) * s;
    c.strokeStyle = out;
    c.stroke();
    c.lineWidth = w * s;
    c.strokeStyle = col;
    c.stroke();
  };
  const dot = (p: P, r: number, col: string): void => {
    c.beginPath();
    c.arc(p[0], p[1], (r + 1.6) * s, 0, Math.PI * 2);
    c.fillStyle = out;
    c.fill();
    c.beginPath();
    c.arc(p[0], p[1], r * s, 0, Math.PI * 2);
    c.fillStyle = col;
    c.fill();
  };
  if (opts.aura) {
    c.save();
    c.globalAlpha = 0.35 + Math.sin(f.t * 0.4) * 0.15;
    c.shadowColor = opts.aura;
    c.shadowBlur = 24;
    c.fillStyle = opts.aura;
    c.beginPath();
    c.ellipse((hip[0] + neck[0]) / 2, (hip[1] + neck[1]) / 2, 30 * s, 62 * s, 0, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }
  // back limbs
  seg([shoulder, eB], 7, shade(gi));
  seg([eB, hB], 6, shade(skin));
  dot(hB, 4.2, shade(skin));
  seg([hip, kB, fB], 10, shade(gi));
  dot(fB, 3.6, shade(skin));
  // torso
  seg([hip, neck], 17, gi);
  // belt
  const bx = (neck[0] - hip[0]) * 0.12;
  const by = (neck[1] - hip[1]) * 0.12;
  c.beginPath();
  c.moveTo(hip[0] + bx - 9 * s, hip[1] + by);
  c.lineTo(hip[0] + bx + 9 * s, hip[1] + by);
  c.lineWidth = 4.5 * s;
  c.strokeStyle = W_ ? '#fff' : look.belt;
  c.stroke();
  // front leg
  seg([hip, kF, fF], 10, gi);
  dot(fF, 3.6, skin);
  // head
  dot(head, 10, skin);
  if (!W_) {
    c.beginPath();
    c.arc(head[0], head[1], 10 * s, Math.PI * 1.05, Math.PI * 1.95);
    c.lineWidth = 6 * s;
    c.strokeStyle = look.hair;
    c.stroke();
    // headband with tails
    c.beginPath();
    c.moveTo(head[0] - 10 * s, head[1] - 3 * s);
    c.lineTo(head[0] + 10 * s, head[1] - 3 * s);
    c.lineWidth = 3 * s;
    c.strokeStyle = look.belt;
    c.stroke();
    const tail = f.face * -1;
    const wave = Math.sin(f.t * 0.3) * 3;
    c.beginPath();
    c.moveTo(head[0] + tail * 9 * s, head[1] - 3 * s);
    c.quadraticCurveTo(head[0] + tail * 18 * s, head[1] - 1 * s + wave, head[0] + tail * 24 * s, head[1] + 4 * s - wave);
    c.lineWidth = 2.5 * s;
    c.stroke();
    // eye
    c.fillStyle = '#111';
    c.beginPath();
    c.arc(head[0] + f.face * 5 * s * Math.cos(pose.rot), head[1] - 1 * s, 1.6 * s, 0, Math.PI * 2);
    c.fill();
  }
  // front arm
  seg([shoulder, eF], 7, gi);
  seg([eF, hF], 6, skin);
  dot(hF, 4.8, skin);
}

function shadeColor(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number): number => Math.max(0, Math.min(255, Math.round(v + (k < 0 ? v * k : (255 - v) * k))));
  const r = ch((n >> 16) & 255);
  const g = ch((n >> 8) & 255);
  const b = ch(n & 255);
  return `rgb(${r},${g},${b})`;
}

export function drawShadow(c: CanvasRenderingContext2D, f: Fighter): void {
  const k = Math.max(0.3, 1 - f.y / 160);
  c.fillStyle = `rgba(0,0,0,${0.35 * k})`;
  c.beginPath();
  c.ellipse(f.x, GROUND + 2, 26 * k * f.def.size, 6 * k, 0, 0, Math.PI * 2);
  c.fill();
}

export function drawProj(c: CanvasRenderingContext2D, p: Proj, t: number): void {
  const d = p.def;
  const cx = p.x;
  const cy = GROUND - d.y - d.h / 2;
  const dir = Math.sign(p.vx) || 1;
  c.save();
  c.shadowColor = d.color;
  c.shadowBlur = 16;
  if (d.kind === 'orb' || d.kind === 'big') {
    const r = d.w / 2 + Math.sin(t * 0.5) * 1.5;
    const g = c.createRadialGradient(cx, cy, 2, cx, cy, r);
    g.addColorStop(0, '#fff');
    g.addColorStop(0.45, d.color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g;
    c.beginPath();
    c.arc(cx, cy, r, 0, Math.PI * 2);
    c.fill();
    // trail
    c.globalAlpha = 0.4;
    c.fillStyle = d.color;
    for (let i = 1; i <= 3; i++) {
      c.beginPath();
      c.arc(cx - dir * i * 9, cy, r * (0.6 - i * 0.12), 0, Math.PI * 2);
      c.fill();
    }
    if (d.kind === 'big') {
      c.globalAlpha = 0.8;
      c.strokeStyle = '#fff';
      c.lineWidth = 2;
      c.beginPath();
      c.arc(cx, cy, r + 4 + (t % 10), 0, Math.PI * 2);
      c.stroke();
    }
  } else if (d.kind === 'blade') {
    c.fillStyle = d.color;
    c.beginPath();
    c.ellipse(cx, cy, d.w / 2, d.h / 2, 0, -Math.PI / 2, Math.PI / 2, dir < 0);
    c.ellipse(cx - dir * 6, cy, d.w / 3, d.h / 2.4, 0, Math.PI / 2, -Math.PI / 2, dir > 0);
    c.fill();
  } else if (d.kind === 'wave') {
    c.fillStyle = d.color;
    for (let i = 0; i < 4; i++) {
      const x = cx - dir * i * 9;
      const h = (d.h + 6) * (1 - i * 0.2) * (0.8 + 0.2 * Math.sin(t * 0.8 + i));
      c.beginPath();
      c.moveTo(x - 6, GROUND);
      c.lineTo(x, GROUND - h);
      c.lineTo(x + 6, GROUND);
      c.fill();
    }
  } else {
    const g = c.createLinearGradient(cx, cy - d.h / 2, cx, cy + d.h / 2);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, '#fff');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = d.color;
    c.fillRect(cx - d.w / 2, cy - d.h / 2, d.w, d.h);
    c.fillStyle = g;
    c.fillRect(cx - d.w / 2, cy - d.h / 4, d.w, d.h / 2);
  }
  c.restore();
}

// ---------- Stages ----------

const stageCache = new Map<string, HTMLCanvasElement>();

/** Pre-renders the static stage background (W×H). */
export function stageCanvas(id: string): HTMLCanvasElement {
  const hit = stageCache.get(id);
  if (hit) return hit;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const c = cv.getContext('2d')!;
  const st = STAGES[id] ?? STAGES.dojo;
  const rng = new Rng(id.length * 977 + id.charCodeAt(0));
  const sky = c.createLinearGradient(0, 0, 0, GROUND);
  sky.addColorStop(0, st.sky[0]);
  sky.addColorStop(1, st.sky[1]);
  c.fillStyle = sky;
  c.fillRect(0, 0, W, GROUND);
  switch (id) {
    case 'dojo': {
      for (let i = 0; i < 5; i++) {
        const x = 40 + i * 140;
        c.fillStyle = 'rgba(255,236,200,0.16)';
        c.fillRect(x, 70, 90, 120);
        c.strokeStyle = 'rgba(60,35,20,0.8)';
        c.lineWidth = 3;
        c.strokeRect(x, 70, 90, 120);
        c.lineWidth = 1.5;
        for (let k = 1; k < 3; k++) {
          c.beginPath();
          c.moveTo(x + k * 30, 70);
          c.lineTo(x + k * 30, 190);
          c.stroke();
        }
        for (let k = 1; k < 4; k++) {
          c.beginPath();
          c.moveTo(x, 70 + k * 30);
          c.lineTo(x + 90, 70 + k * 30);
          c.stroke();
        }
      }
      c.fillStyle = '#2a1a0e';
      for (let i = 0; i < 6; i++) c.fillRect(i * 140 - 8, 0, 18, GROUND);
      c.fillRect(0, 40, W, 12);
      c.fillRect(0, 204, W, 8);
      // scroll
      c.fillStyle = '#efe3c2';
      c.fillRect(304, 56, 32, 100);
      c.fillStyle = '#7a1f1f';
      c.font = 'bold 22px serif';
      c.textAlign = 'center';
      c.fillText('道', 320, 90);
      c.fillText('場', 320, 124);
      break;
    }
    case 'bamboo': {
      c.fillStyle = 'rgba(255,255,230,0.85)';
      c.beginPath();
      c.arc(500, 70, 34, 0, Math.PI * 2);
      c.fill();
      for (let layer = 0; layer < 3; layer++) {
        const col = ['#1c4a32', '#2b6b45', '#3f8d58'][layer];
        for (let i = 0; i < 9 - layer * 2; i++) {
          const x = rng.int(0, W);
          const w = 8 + layer * 4;
          c.fillStyle = col;
          c.fillRect(x, 0, w, GROUND);
          c.fillStyle = 'rgba(0,0,0,0.25)';
          for (let y = rng.int(10, 50); y < GROUND; y += 46 + layer * 6) c.fillRect(x - 1, y, w + 2, 3);
          c.fillStyle = col;
          c.beginPath();
          c.ellipse(x + w + 10, rng.int(30, 200), 14, 4, -0.5, 0, Math.PI * 2);
          c.fill();
        }
      }
      break;
    }
    case 'roof': {
      for (let i = 0; i < 70; i++) {
        c.fillStyle = `rgba(255,255,255,${rng.next() * 0.7 + 0.2})`;
        c.fillRect(rng.int(0, W), rng.int(0, 150), 1.5, 1.5);
      }
      let x = 0;
      while (x < W) {
        const w = rng.int(40, 90);
        const h = rng.int(80, 200);
        c.fillStyle = '#120f26';
        c.fillRect(x, GROUND - 40 - h, w, h + 40);
        for (let wy = GROUND - 30 - h; wy < GROUND - 50; wy += 14) {
          for (let wx = x + 6; wx < x + w - 8; wx += 12) {
            if (rng.chance(0.35)) {
              c.fillStyle = rng.chance(0.5) ? 'rgba(255,214,102,0.7)' : 'rgba(120,220,255,0.6)';
              c.fillRect(wx, wy, 5, 7);
            }
          }
        }
        x += w + rng.int(2, 10);
      }
      c.save();
      c.shadowColor = '#ff4fd8';
      c.shadowBlur = 14;
      c.strokeStyle = '#ff7be5';
      c.lineWidth = 3;
      c.strokeRect(70, 60, 150, 40);
      c.fillStyle = '#ffb3f1';
      c.font = 'bold 22px sans-serif';
      c.textAlign = 'center';
      c.fillText('DOJO 24H', 145, 88);
      c.restore();
      c.fillStyle = '#26263a';
      c.fillRect(0, GROUND - 26, W, 26);
      break;
    }
    case 'temple': {
      c.fillStyle = 'rgba(255,240,200,0.9)';
      c.beginPath();
      c.arc(320, 170, 60, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#5a2a2a';
      c.beginPath();
      c.moveTo(0, 230);
      c.lineTo(120, 150);
      c.lineTo(230, 230);
      c.lineTo(380, 170);
      c.lineTo(520, 235);
      c.lineTo(640, 180);
      c.lineTo(640, GROUND);
      c.lineTo(0, GROUND);
      c.fill();
      c.fillStyle = '#c1121f';
      c.fillRect(200, 90, 18, GROUND - 90);
      c.fillRect(422, 90, 18, GROUND - 90);
      c.fillRect(176, 82, 288, 14);
      c.fillRect(190, 116, 260, 10);
      c.fillStyle = '#1b1b1b';
      c.fillRect(168, 74, 304, 9);
      for (const lx of [90, 550]) {
        c.fillStyle = '#ffb703';
        c.beginPath();
        c.ellipse(lx, 150, 12, 16, 0, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = '#7a3b10';
        c.fillRect(lx - 1, 100, 2, 34);
      }
      break;
    }
    default: {
      // volcano / Oni Gate
      c.fillStyle = '#240808';
      c.beginPath();
      c.moveTo(0, 260);
      c.lineTo(170, 110);
      c.lineTo(230, 90);
      c.lineTo(290, 110);
      c.lineTo(460, 250);
      c.lineTo(640, 200);
      c.lineTo(640, GROUND);
      c.lineTo(0, GROUND);
      c.fill();
      const lava = c.createRadialGradient(230, 90, 4, 230, 90, 90);
      lava.addColorStop(0, 'rgba(255,170,60,0.9)');
      lava.addColorStop(1, 'rgba(255,60,0,0)');
      c.fillStyle = lava;
      c.fillRect(120, 0, 220, 200);
      c.strokeStyle = 'rgba(255,90,20,0.8)';
      c.lineWidth = 3;
      c.beginPath();
      c.moveTo(230, 96);
      c.lineTo(215, 160);
      c.lineTo(235, 200);
      c.lineTo(220, 260);
      c.stroke();
      // gate
      c.fillStyle = '#120404';
      c.fillRect(470, 120, 16, GROUND - 120);
      c.fillRect(590, 120, 16, GROUND - 120);
      c.fillRect(456, 112, 164, 12);
    }
  }
  // floor
  const fl = c.createLinearGradient(0, GROUND, 0, H);
  fl.addColorStop(0, st.floor[0]);
  fl.addColorStop(1, st.floor[1]);
  c.fillStyle = fl;
  c.fillRect(0, GROUND, W, H - GROUND);
  c.strokeStyle = 'rgba(0,0,0,0.25)';
  c.lineWidth = 1;
  for (let i = -10; i < 20; i++) {
    c.beginPath();
    c.moveTo(320 + i * 30, GROUND);
    c.lineTo(320 + i * 60, H);
    c.stroke();
  }
  c.fillStyle = 'rgba(255,255,255,0.12)';
  c.fillRect(0, GROUND, W, 2);
  return cv;
}
