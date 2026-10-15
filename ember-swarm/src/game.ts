import type { Input } from './input';
import { PASSIVES, evolutions, ownedUpgrades, rollChoices, type Choice, type PassiveId } from './items';
import { eliteKind, makeBoss, makeEnemy, pickKind } from './enemies';
import { applyMeta, type CharacterDef, type SaveData } from './meta';
import { SpatialGrid } from './spatial';
import { TAU, type Effect, type Enemy, type FloatText, type Pickup, type PickupKind, type Projectile, type Stats, type Zone } from './types';
import { WEAPONS, newWeapon, type WeaponId, type WeaponInst } from './weapons';

/** The boss arrives at 10:00. */
export const RUN_LENGTH = 600;

const xpFor = (lvl: number): number => (lvl < 20 ? 5 + (lvl - 1) * 10 : 195 + (lvl - 20) * 13);

export interface RunResult {
  victory: boolean;
  time: number;
  level: number;
  kills: number;
  gold: number;
}

export interface GameHooks {
  levelUp(choices: Choice[]): void;
  gameOver(result: RunResult): void;
  toast(msg: string): void;
}

export class Game {
  readonly ctx: CanvasRenderingContext2D;
  w = 0;
  h = 0;

  player = { x: 0, y: 0, r: 12, hp: 100, iframes: 0, faceX: 1, mx: 0, my: 0 };
  stats: Stats;
  level = 1;
  xp = 0;
  xpNext = xpFor(1);
  time = 0;
  kills = 0;
  gold = 0;

  enemies: Enemy[] = [];
  projectiles: Projectile[] = [];
  pickups: Pickup[] = [];
  zones: Zone[] = [];
  effects: Effect[] = [];
  texts: FloatText[] = [];
  weapons: WeaponInst[] = [];
  passives = new Map<PassiveId, number>();
  grid = new SpatialGrid(64);

  state: 'playing' | 'levelup' | 'paused' | 'over' = 'playing';
  choices: Choice[] = [];
  rerolls: number;
  boss: Enemy | null = null;

  private pendingLevels = 0;
  private spawnAcc = 0;
  private nextElite = 60;
  private nextSwarm = 90;
  private bossSpawned = false;
  private victoryT = -1;
  private shake = 0;
  private hurtFlash = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    private input: Input,
    private save: SaveData,
    readonly character: CharacterDef,
    private hooks: GameHooks,
  ) {
    this.ctx = canvas.getContext('2d')!;
    this.rerolls = save.upgrades.reroll ?? 0;
    this.stats = this.computeStats();
    this.player.hp = this.stats.maxHp;
    this.weapons.push(newWeapon(character.weapon));
  }

  // ---------------------------------------------------------------- stats & choices

  private computeStats(): Stats {
    const s: Stats = { maxHp: 100, speed: 150, might: 1, cooldown: 1, area: 1, amount: 0, magnet: 60, regen: 0, armor: 0, growth: 1, greed: 1, duration: 1 };
    applyMeta(s, this.save);
    this.character.apply(s);
    for (const [id, lvl] of this.passives) PASSIVES[id].apply(s, lvl);
    return s;
  }

  private recomputeStats(): void {
    const oldMax = this.stats.maxHp;
    this.stats = this.computeStats();
    if (this.stats.maxHp > oldMax) this.player.hp += this.stats.maxHp - oldMax;
    this.player.hp = Math.min(this.player.hp, this.stats.maxHp);
  }

  weaponOf(id: WeaponId): WeaponInst | undefined {
    return this.weapons.find((w) => w.id === id);
  }

  applyChoice(c: Choice): void {
    switch (c.kind) {
      case 'weapon': {
        const w = this.weaponOf(c.id);
        if (w) w.level = c.level;
        else this.weapons.push(newWeapon(c.id));
        break;
      }
      case 'passive':
        this.passives.set(c.id, c.level);
        this.recomputeStats();
        break;
      case 'evolve': {
        const w = this.weaponOf(c.id);
        if (w) w.evolved = true;
        this.hooks.toast(`✨ ${WEAPONS[c.id].name} evolved into ${WEAPONS[c.id].evolvedName}!`);
        break;
      }
      case 'gold':
        this.gold += 25;
        break;
      case 'heal':
        this.heal(30, true);
        break;
    }
  }

  /** Called by the UI when the player picks a level-up card. */
  choose(index: number): void {
    if (this.state !== 'levelup') return;
    const c = this.choices[index];
    if (!c) return;
    this.applyChoice(c);
    this.pendingLevels--;
    if (this.pendingLevels > 0) this.openLevelUp();
    else this.state = 'playing';
  }

  reroll(): void {
    if (this.state !== 'levelup' || this.rerolls <= 0) return;
    this.rerolls--;
    this.openLevelUp();
  }

  private openLevelUp(): void {
    this.state = 'levelup';
    this.choices = rollChoices(this);
    this.hooks.levelUp(this.choices);
  }

  private openChest(): void {
    const names: string[] = [];
    const evo = evolutions(this);
    if (evo.length) {
      this.applyChoice(evo[0]);
    } else {
      const n = 1 + (Math.random() < 0.3 ? 1 : 0) + (Math.random() < 0.1 ? 1 : 0);
      for (let i = 0; i < n; i++) {
        const opts = ownedUpgrades(this);
        if (!opts.length) break;
        const c = opts[Math.floor(Math.random() * opts.length)];
        this.applyChoice(c);
        if (c.kind === 'weapon') names.push(`${WEAPONS[c.id].icon} ${WEAPONS[c.id].name} Lv${c.level}`);
        if (c.kind === 'passive') names.push(`${PASSIVES[c.id].icon} ${PASSIVES[c.id].name} Lv${c.level}`);
      }
      this.hooks.toast(`📦 Chest: ${names.length ? names.join(', ') : 'nothing left to upgrade'}`);
    }
    this.gold += 20 * this.stats.greed;
  }

  // ---------------------------------------------------------------- helpers used by weapons

  nearestEnemies(n: number, range: number): Enemy[] {
    const p = this.player;
    const r2 = range * range;
    const list: [number, Enemy][] = [];
    for (const e of this.enemies) {
      if (e.dead) continue;
      const d2 = (e.x - p.x) ** 2 + (e.y - p.y) ** 2;
      if (d2 < r2) list.push([d2, e]);
    }
    list.sort((a, b) => a[0] - b[0]);
    return list.slice(0, n).map((x) => x[1]);
  }

  randomEnemy(range: number): Enemy | null {
    const p = this.player;
    const near = this.grid.query(p.x, p.y, range).filter((e) => !e.dead && Math.abs(e.x - p.x) < range && Math.abs(e.y - p.y) < range);
    return near.length ? near[Math.floor(Math.random() * near.length)] : null;
  }

  damageEnemy(e: Enemy, dmg: number, kx: number, ky: number): void {
    if (e.dead) return;
    const amount = Math.max(1, Math.round(dmg * (0.9 + Math.random() * 0.2)));
    e.hp -= amount;
    e.flash = 0.1;
    const resist = e.boss ? 0.05 : Math.min(1, 12 / e.r);
    e.kx += kx * resist;
    e.ky += ky * resist;
    this.addText(e.x, e.y - e.r, String(amount), e.boss || e.elite ? '#ffd166' : '#ffffff', 13);
    if (e.hp <= 0) this.killEnemy(e);
  }

  heal(n: number, showText: boolean): void {
    const p = this.player;
    const before = p.hp;
    p.hp = Math.min(this.stats.maxHp, p.hp + n);
    if (showText && p.hp > before) this.addText(p.x, p.y - 24, `+${Math.round(p.hp - before)}`, '#80ed99', 16);
  }

  addEffect(fx: Effect): void {
    if (this.effects.length < 250) this.effects.push(fx);
  }

  private addText(x: number, y: number, text: string, color: string, size: number): void {
    if (this.texts.length > 90) this.texts.shift();
    this.texts.push({ x: x + (Math.random() - 0.5) * 10, y, text, life: 0.6, color, size });
  }

  private drop(kind: PickupKind, x: number, y: number, value: number): void {
    // Too many gems on the floor: fold the value into an existing gem instead.
    if (kind === 'gem' && this.pickups.length > 400) {
      const g = this.pickups[Math.floor(Math.random() * this.pickups.length)];
      if (g.kind === 'gem') {
        g.value += value;
        return;
      }
    }
    this.pickups.push({ kind, x, y, value, pulled: false, v: 0, t: 0, taken: false });
  }

  private killEnemy(e: Enemy): void {
    e.dead = true;
    this.kills++;
    this.addEffect({ kind: 'ring', x: e.x, y: e.y, r: e.r * 1.6, life: 0.25, maxLife: 0.25, color: e.color });
    if (e.boss) {
      this.boss = null;
      this.shake = 20;
      this.victoryT = 2.5;
      for (const o of this.enemies) {
        if (o.dead) continue;
        o.dead = true;
        this.addEffect({ kind: 'ring', x: o.x, y: o.y, r: o.r * 2, life: 0.6, maxLife: 0.6, color: '#ffba08' });
      }
      this.gold += 200 * this.stats.greed;
      this.hooks.toast('🏆 The Ash Colossus falls!');
      return;
    }
    this.drop('gem', e.x, e.y, e.xp);
    if (e.elite) {
      this.drop('chest', e.x, e.y, 1);
      for (let i = 0; i < 5; i++) this.drop('coin', e.x + (Math.random() - 0.5) * 40, e.y + (Math.random() - 0.5) * 40, 2);
      this.shake = Math.max(this.shake, 8);
      return;
    }
    const roll = Math.random();
    if (roll < 0.035) this.drop('coin', e.x + 6, e.y, 1);
    else if (roll < 0.041) this.drop('heal', e.x, e.y, 30);
    else if (roll < 0.0435) this.drop('magnet', e.x, e.y, 0);
  }

  private gainXp(v: number): void {
    this.xp += v * this.stats.growth;
    while (this.xp >= this.xpNext) {
      this.xp -= this.xpNext;
      this.level++;
      this.xpNext = xpFor(this.level);
      this.pendingLevels++;
    }
  }

  /** Give up from the pause menu. Gold collected so far is kept. */
  quit(): void {
    this.endRun(false);
  }

  private endRun(victory: boolean): void {
    this.state = 'over';
    this.hooks.gameOver({ victory, time: this.time, level: this.level, kills: this.kills, gold: Math.floor(this.gold) });
  }

  // ---------------------------------------------------------------- update

  frame(dt: number): void {
    if (this.state === 'playing') this.update(dt);
    this.render();
  }

  private spawnDist(): number {
    return Math.hypot(this.w / 2, this.h / 2) + 50;
  }

  private ringPos(angle: number, dist = this.spawnDist()): { x: number; y: number } {
    return { x: this.player.x + Math.cos(angle) * dist, y: this.player.y + Math.sin(angle) * dist };
  }

  private update(dt: number): void {
    this.time += dt;
    const p = this.player;
    const s = this.stats;

    const mv = this.input.move();
    p.mx = mv.x;
    p.my = mv.y;
    p.x += mv.x * s.speed * dt;
    p.y += mv.y * s.speed * dt;
    if (Math.abs(mv.x) > 0.1) p.faceX = Math.sign(mv.x);
    if (s.regen > 0) p.hp = Math.min(s.maxHp, p.hp + s.regen * dt);

    if (this.victoryT > 0) {
      this.victoryT -= dt;
      if (this.victoryT <= 0) return this.endRun(true);
    } else {
      this.direct(dt);
    }

    this.grid.rebuild(this.enemies);
    this.moveEnemies(dt);
    this.grid.rebuild(this.enemies);

    for (const w of this.weapons) WEAPONS[w.id].update(w, this, dt);
    this.updateProjectiles(dt);
    this.updateZones(dt);
    this.contactDamage(dt);
    this.updatePickups(dt);
    this.updateFx(dt);

    compact(this.enemies, (e) => !e.dead);

    if (p.hp <= 0) return this.endRun(false);
    if (this.pendingLevels > 0) this.openLevelUp();
  }

  /** Spawn director: steady stream, elites, swarm rings and the boss. */
  private direct(dt: number): void {
    const minute = this.time / 60;

    if (!this.bossSpawned && this.time >= RUN_LENGTH) {
      this.bossSpawned = true;
      const pos = this.ringPos(Math.random() * TAU);
      this.boss = makeBoss(pos.x, pos.y);
      this.enemies.push(this.boss);
      this.shake = 12;
      this.hooks.toast('💀 The Ash Colossus awakens!');
    }

    const target = this.bossSpawned ? 70 : Math.min(25 + minute * 40, 420);
    const rate = this.bossSpawned ? 3 : 2 + minute * 3.2;
    if (this.enemies.length < target) {
      this.spawnAcc += rate * dt;
      while (this.spawnAcc >= 1) {
        this.spawnAcc--;
        const pos = this.ringPos(Math.random() * TAU);
        this.enemies.push(makeEnemy(pickKind(minute), pos.x, pos.y, minute));
      }
    }

    if (this.bossSpawned) return;

    if (this.time >= this.nextElite) {
      this.nextElite = this.time + 75;
      const pos = this.ringPos(Math.random() * TAU);
      this.enemies.push(makeEnemy(eliteKind(minute), pos.x, pos.y, minute, true));
      this.hooks.toast('⚠️ An elite approaches. It carries a chest.');
    }

    if (this.time >= this.nextSwarm) {
      this.nextSwarm = this.time + 90;
      const kind = minute > 5 ? 'imp' : 'bat';
      const n = Math.floor(24 + minute * 5);
      for (let i = 0; i < n; i++) {
        const pos = this.ringPos((i / n) * TAU, this.spawnDist() * 0.95);
        this.enemies.push(makeEnemy(kind, pos.x, pos.y, minute));
      }
      this.hooks.toast('🦇 A swarm closes in!');
    }
  }

  private moveEnemies(dt: number): void {
    const p = this.player;
    const despawn = this.spawnDist() * 1.6;
    const decay = Math.min(1, 10 * dt);
    for (const e of this.enemies) {
      e.flash -= dt;
      e.slowT -= dt;
      e.wobble += dt * 8;
      const dx = p.x - e.x;
      const dy = p.y - e.y;
      const d = Math.hypot(dx, dy) || 1;

      // Enemies left far behind come back in front of the player.
      if (!e.boss && d > despawn) {
        const moving = p.mx || p.my;
        const a = moving ? Math.atan2(p.my, p.mx) + (Math.random() - 0.5) * 1.2 : Math.random() * TAU;
        const pos = this.ringPos(a);
        e.x = pos.x;
        e.y = pos.y;
        continue;
      }

      const sp = e.speed * (e.slowT > 0 ? 0.7 : 1);
      let vx = (dx / d) * sp;
      let vy = (dy / d) * sp;

      if (e.boss) {
        const enraged = this.time > RUN_LENGTH + 120;
        e.aiT -= dt * (enraged ? 1.5 : 1);
        e.summonT -= dt;
        if (e.dashT > 0) {
          e.dashT -= dt;
          vx = e.dx * 380;
          vy = e.dy * 380;
        } else if (e.aiT < 0.8) {
          // Wind-up: stand still and lock the dash direction.
          vx = vy = 0;
          e.dx = dx / d;
          e.dy = dy / d;
          e.flash = Math.sin(this.time * 40) > 0 ? 0.05 : 0;
          if (e.aiT <= 0) {
            e.dashT = 0.6;
            e.aiT = 4;
          }
        } else if (enraged) {
          vx *= 1.5;
          vy *= 1.5;
        }
        if (e.summonT <= 0) {
          e.summonT = 7;
          for (let i = 0; i < 12; i++) {
            const a = (i / 12) * TAU;
            this.enemies.push(makeEnemy('imp', e.x + Math.cos(a) * 70, e.y + Math.sin(a) * 70, this.time / 60));
          }
        }
      } else {
        // Separation keeps the swarm from collapsing into one blob.
        let sx = 0;
        let sy = 0;
        let checked = 0;
        for (const o of this.grid.query(e.x, e.y, e.r * 2)) {
          if (o === e) continue;
          const ox = e.x - o.x;
          const oy = e.y - o.y;
          const min = (e.r + o.r) * 0.9;
          const d2 = ox * ox + oy * oy;
          if (d2 < min * min && d2 > 0.01) {
            const dd = Math.sqrt(d2);
            const push = (min - dd) / min;
            sx += (ox / dd) * push;
            sy += (oy / dd) * push;
          }
          if (++checked > 12) break;
        }
        vx += sx * sp * 1.2;
        vy += sy * sp * 1.2;
      }

      e.x += (vx + e.kx) * dt;
      e.y += (vy + e.ky) * dt;
      e.kx -= e.kx * decay;
      e.ky -= e.ky * decay;
    }
  }

  private updateProjectiles(dt: number): void {
    for (const pr of this.projectiles) {
      pr.x += pr.vx * dt;
      pr.y += pr.vy * dt;
      pr.life -= dt;
      if (pr.life <= 0) continue;
      for (const e of this.grid.query(pr.x, pr.y, pr.r + 50)) {
        if (e.dead || pr.hits.has(e.id)) continue;
        if (Math.hypot(e.x - pr.x, e.y - pr.y) > pr.r + e.r) continue;
        pr.hits.add(e.id);
        const sp = Math.hypot(pr.vx, pr.vy) || 1;
        this.damageEnemy(e, pr.damage, (pr.vx / sp) * pr.knock, (pr.vy / sp) * pr.knock);
        if (--pr.pierce <= 0) {
          pr.life = 0;
          break;
        }
      }
    }
    compact(this.projectiles, (pr) => pr.life > 0);
  }

  private updateZones(dt: number): void {
    for (const z of this.zones) {
      z.life -= dt;
      z.timer -= dt;
      if (z.timer > 0) continue;
      z.timer += z.tick;
      for (const e of this.grid.query(z.x, z.y, z.r + 50)) {
        if (!e.dead && Math.hypot(e.x - z.x, e.y - z.y) < z.r + e.r * 0.5) this.damageEnemy(e, z.damage, 0, 0);
      }
    }
    compact(this.zones, (z) => z.life > 0);
  }

  private contactDamage(dt: number): void {
    const p = this.player;
    if (p.iframes > 0) {
      p.iframes -= dt;
      return;
    }
    for (const e of this.grid.query(p.x, p.y, p.r + 60)) {
      if (e.dead || Math.hypot(e.x - p.x, e.y - p.y) > p.r + e.r * 0.8) continue;
      const dmg = Math.max(1, Math.round(e.damage - this.stats.armor));
      p.hp -= dmg;
      p.iframes = 0.5;
      this.hurtFlash = 0.25;
      this.shake = Math.max(this.shake, e.boss ? 14 : 5);
      this.addText(p.x, p.y - 20, `-${dmg}`, '#ff4d6d', 16);
      break;
    }
  }

  private updatePickups(dt: number): void {
    const p = this.player;
    const range = this.stats.magnet;
    for (const pk of this.pickups) {
      pk.t += dt;
      const dx = p.x - pk.x;
      const dy = p.y - pk.y;
      const d = Math.hypot(dx, dy) || 1;
      if (!pk.pulled && d < range) pk.pulled = true;
      if (pk.pulled) {
        pk.v = Math.min(900, pk.v + 900 * dt);
        const step = Math.min(d, pk.v * dt);
        pk.x += (dx / d) * step;
        pk.y += (dy / d) * step;
      }
      if (d > p.r + 6) continue;
      pk.taken = true;
      switch (pk.kind) {
        case 'gem':
          this.gainXp(pk.value);
          break;
        case 'coin':
          this.gold += pk.value * this.stats.greed;
          break;
        case 'heal':
          this.heal(pk.value, true);
          break;
        case 'magnet':
          for (const o of this.pickups) if (o.kind === 'gem') o.pulled = true;
          break;
        case 'chest':
          this.openChest();
          break;
      }
    }
    compact(this.pickups, (pk) => !pk.taken);
  }

  private updateFx(dt: number): void {
    for (const fx of this.effects) fx.life -= dt;
    compact(this.effects, (fx) => fx.life > 0);
    for (const t of this.texts) {
      t.life -= dt;
      t.y -= 30 * dt;
    }
    compact(this.texts, (t) => t.life > 0);
    this.shake = Math.max(0, this.shake - 40 * dt);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt);
  }

  // ---------------------------------------------------------------- render

  private render(): void {
    const { ctx, canvas } = this;
    this.w = canvas.clientWidth;
    this.h = canvas.clientHeight;
    const dpr = canvas.width / this.w;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const p = this.player;
    const camX = p.x - this.w / 2 + (Math.random() - 0.5) * this.shake;
    const camY = p.y - this.h / 2 + (Math.random() - 0.5) * this.shake;
    drawBackground(ctx, camX, camY, this.w, this.h, this.time);

    ctx.save();
    ctx.translate(-camX, -camY);
    const inView = (x: number, y: number, r: number) =>
      x + r > camX && x - r < camX + this.w && y + r > camY && y - r < camY + this.h;

    this.drawZones(ctx);
    for (const w of this.weapons) WEAPONS[w.id].drawUnder?.(w, this, ctx);
    this.drawPickups(ctx, inView);
    this.drawEnemies(ctx, inView);
    this.drawPlayer(ctx);
    for (const w of this.weapons) WEAPONS[w.id].drawOver?.(w, this, ctx);
    this.drawProjectiles(ctx);
    this.drawEffects(ctx);
    this.drawTexts(ctx);
    ctx.restore();

    if (this.hurtFlash > 0) {
      const g = ctx.createRadialGradient(this.w / 2, this.h / 2, Math.min(this.w, this.h) * 0.3, this.w / 2, this.h / 2, Math.max(this.w, this.h) * 0.7);
      g.addColorStop(0, 'rgba(255,0,40,0)');
      g.addColorStop(1, `rgba(255,0,40,${this.hurtFlash * 1.4})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, this.w, this.h);
    }
    this.drawHud(ctx);
  }

  private drawZones(ctx: CanvasRenderingContext2D): void {
    for (const z of this.zones) {
      const fade = Math.min(1, z.life / 0.4, (z.maxLife - z.life) / 0.15 + 0.3);
      const flick = 0.85 + Math.sin(this.time * 25 + z.x) * 0.15;
      const g = ctx.createRadialGradient(z.x, z.y, 0, z.x, z.y, z.r);
      g.addColorStop(0, `rgba(255,220,120,${0.35 * fade * flick})`);
      g.addColorStop(0.6, `rgba(${z.color},${0.3 * fade * flick})`);
      g.addColorStop(1, `rgba(${z.color},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(z.x, z.y, z.r, 0, TAU);
      ctx.fill();
    }
  }

  private drawPickups(ctx: CanvasRenderingContext2D, inView: (x: number, y: number, r: number) => boolean): void {
    for (const pk of this.pickups) {
      if (!inView(pk.x, pk.y, 20)) continue;
      const bob = Math.sin(pk.t * 4 + pk.x) * 2;
      switch (pk.kind) {
        case 'gem': {
          const big = pk.value >= 10;
          ctx.fillStyle = big ? '#ff4d6d' : pk.value >= 3 ? '#80ed99' : '#4cc9f0';
          const s = big ? 7 : pk.value >= 3 ? 5.5 : 4.5;
          ctx.beginPath();
          ctx.moveTo(pk.x, pk.y - s + bob);
          ctx.lineTo(pk.x + s * 0.7, pk.y + bob);
          ctx.lineTo(pk.x, pk.y + s + bob);
          ctx.lineTo(pk.x - s * 0.7, pk.y + bob);
          ctx.closePath();
          ctx.fill();
          break;
        }
        case 'coin':
          ctx.fillStyle = '#ffd60a';
          ctx.beginPath();
          ctx.ellipse(pk.x, pk.y + bob, 5 * Math.abs(Math.cos(pk.t * 3)) + 1, 5, 0, 0, TAU);
          ctx.fill();
          break;
        default: {
          const icon = pk.kind === 'heal' ? '🍗' : pk.kind === 'magnet' ? '🧲' : '📦';
          ctx.font = pk.kind === 'chest' ? '26px system-ui' : '18px system-ui';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          if (pk.kind === 'chest') {
            ctx.fillStyle = `rgba(255,214,10,${0.25 + Math.sin(pk.t * 5) * 0.1})`;
            ctx.beginPath();
            ctx.arc(pk.x, pk.y + bob, 24, 0, TAU);
            ctx.fill();
          }
          ctx.fillText(icon, pk.x, pk.y + bob);
        }
      }
    }
  }

  private drawEnemies(ctx: CanvasRenderingContext2D, inView: (x: number, y: number, r: number) => boolean): void {
    const p = this.player;
    for (const e of this.enemies) {
      if (!inView(e.x, e.y, e.r + 10)) continue;
      const y = e.y + Math.sin(e.wobble) * 1.5;
      const body = e.flash > 0 ? '#ffffff' : e.color;

      if (e.kind === 'bat') {
        const flap = Math.sin(e.wobble * 2.5) * 5;
        ctx.fillStyle = body;
        ctx.beginPath();
        ctx.moveTo(e.x - e.r * 0.6, y);
        ctx.lineTo(e.x - e.r * 2, y - 4 - flap);
        ctx.lineTo(e.x - e.r * 1.2, y + 4);
        ctx.moveTo(e.x + e.r * 0.6, y);
        ctx.lineTo(e.x + e.r * 2, y - 4 - flap);
        ctx.lineTo(e.x + e.r * 1.2, y + 4);
        ctx.fill();
      }
      if (e.kind === 'brute' || e.kind === 'golem' || e.boss) {
        ctx.fillStyle = e.boss ? '#ffba08' : '#d8d8d8';
        ctx.beginPath();
        ctx.moveTo(e.x - e.r * 0.7, y - e.r * 0.5);
        ctx.lineTo(e.x - e.r * 0.9, y - e.r * 1.35);
        ctx.lineTo(e.x - e.r * 0.3, y - e.r * 0.8);
        ctx.moveTo(e.x + e.r * 0.7, y - e.r * 0.5);
        ctx.lineTo(e.x + e.r * 0.9, y - e.r * 1.35);
        ctx.lineTo(e.x + e.r * 0.3, y - e.r * 0.8);
        ctx.fill();
      }

      if (e.kind === 'wisp') ctx.globalAlpha = 0.75;
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.arc(e.x, y, e.r, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.lineWidth = e.elite || e.boss ? 3 : 2;
      ctx.strokeStyle = e.elite || e.boss ? '#ffd60a' : 'rgba(0,0,0,0.45)';
      ctx.stroke();

      // Eyes look at the player.
      const dx = p.x - e.x;
      const dy = p.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      const lx = (dx / d) * e.r * 0.25;
      const ly = (dy / d) * e.r * 0.25;
      ctx.fillStyle = e.elite || e.boss ? '#ff0a54' : '#fff8e7';
      const es = Math.max(1.6, e.r * 0.2);
      ctx.beginPath();
      ctx.arc(e.x - e.r * 0.33 + lx, y - e.r * 0.15 + ly, es, 0, TAU);
      ctx.arc(e.x + e.r * 0.33 + lx, y - e.r * 0.15 + ly, es, 0, TAU);
      ctx.fill();

      if (e.elite) {
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(e.x - e.r, y - e.r - 12, e.r * 2, 5);
        ctx.fillStyle = '#ffd60a';
        ctx.fillRect(e.x - e.r, y - e.r - 12, e.r * 2 * Math.max(0, e.hp / e.maxHp), 5);
      }
    }
  }

  private drawPlayer(ctx: CanvasRenderingContext2D): void {
    const p = this.player;
    if (p.iframes > 0 && Math.floor(p.iframes * 20) % 2 === 0) return;
    const t = this.time;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(255,140,40,0.18)';
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * 2.4 + Math.sin(t * 8) * 2, 0, TAU);
    ctx.fill();
    // Flame crown.
    for (let i = 0; i < 3; i++) {
      const fx = p.x + (i - 1) * 6;
      const h = 10 + Math.sin(t * 14 + i * 2) * 4;
      ctx.fillStyle = i === 1 ? 'rgba(255,220,100,0.9)' : 'rgba(255,120,40,0.8)';
      ctx.beginPath();
      ctx.moveTo(fx - 4, p.y - p.r + 4);
      ctx.quadraticCurveTo(fx, p.y - p.r - h * 1.4, fx + 4, p.y - p.r + 4);
      ctx.fill();
    }
    ctx.restore();

    ctx.fillStyle = this.character.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, TAU);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#2b0f00';
    ctx.stroke();
    ctx.fillStyle = '#2b0f00';
    ctx.beginPath();
    ctx.arc(p.x + p.faceX * 4 - 3, p.y - 2, 2, 0, TAU);
    ctx.arc(p.x + p.faceX * 4 + 3, p.y - 2, 2, 0, TAU);
    ctx.fill();

    // Small HP bar under the player.
    const ratio = Math.max(0, p.hp / this.stats.maxHp);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(p.x - 18, p.y + p.r + 6, 36, 5);
    ctx.fillStyle = ratio > 0.3 ? '#ef233c' : '#ff0a54';
    ctx.fillRect(p.x - 18, p.y + p.r + 6, 36 * ratio, 5);
  }

  private drawProjectiles(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const pr of this.projectiles) {
      const sp = Math.hypot(pr.vx, pr.vy) || 1;
      ctx.strokeStyle = pr.color;
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = pr.r * 1.4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(pr.x, pr.y);
      ctx.lineTo(pr.x - (pr.vx / sp) * pr.r * 3, pr.y - (pr.vy / sp) * pr.r * 3);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#fff4d6';
      ctx.beginPath();
      ctx.arc(pr.x, pr.y, pr.r * 0.7, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawEffects(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const fx of this.effects) {
      const k = fx.life / fx.maxLife;
      ctx.globalAlpha = k;
      if (fx.kind === 'ring') {
        ctx.strokeStyle = fx.color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(fx.x, fx.y, fx.r * (1.3 - k * 0.5), 0, TAU);
        ctx.stroke();
      } else if (fx.kind === 'slash') {
        const x0 = fx.x;
        const x1 = fx.x + fx.dir * fx.range * (1.1 - k * 0.3);
        const g = ctx.createLinearGradient(x0, 0, x1, 0);
        g.addColorStop(0, 'rgba(255,255,255,0)');
        g.addColorStop(0.5, fx.color);
        g.addColorStop(1, '#fff3b0');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(x0, fx.y - fx.height * 0.15);
        ctx.quadraticCurveTo((x0 + x1) / 2, fx.y - fx.height * 0.75, x1, fx.y);
        ctx.quadraticCurveTo((x0 + x1) / 2, fx.y + fx.height * 0.4, x0, fx.y + fx.height * 0.15);
        ctx.fill();
      } else {
        ctx.strokeStyle = fx.color;
        ctx.lineWidth = 3;
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(fx.pts[0], fx.pts[1]);
        for (let i = 2; i < fx.pts.length; i += 2) {
          // Jitter between nodes so it reads as lightning.
          const mx = (fx.pts[i - 2] + fx.pts[i]) / 2 + (Math.random() - 0.5) * 18;
          const my = (fx.pts[i - 1] + fx.pts[i + 1]) / 2 + (Math.random() - 0.5) * 18;
          ctx.lineTo(mx, my);
          ctx.lineTo(fx.pts[i], fx.pts[i + 1]);
        }
        ctx.stroke();
        ctx.lineWidth = 1;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  private drawTexts(ctx: CanvasRenderingContext2D): void {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const t of this.texts) {
      ctx.globalAlpha = Math.min(1, t.life * 3);
      ctx.font = `bold ${t.size}px system-ui, sans-serif`;
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.strokeText(t.text, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.globalAlpha = 1;
  }

  private drawHud(ctx: CanvasRenderingContext2D): void {
    const { w, h } = this;
    // XP bar.
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(0, 0, w, 14);
    ctx.fillStyle = '#4cc9f0';
    ctx.fillRect(0, 0, w * Math.min(1, this.xp / this.xpNext), 14);
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    ctx.fillText(`LV ${this.level}`, w - 8, 7.5);

    // Timer.
    const t = Math.floor(this.time);
    const label = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
    ctx.textAlign = 'center';
    ctx.font = 'bold 26px system-ui, sans-serif';
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.strokeText(label, w / 2, 38);
    ctx.fillStyle = this.time >= RUN_LENGTH ? '#ff4d6d' : '#fff';
    ctx.fillText(label, w / 2, 38);

    // Kills and gold.
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.textAlign = 'right';
    const stats = `💀 ${this.kills}   🪙 ${Math.floor(this.gold)}`;
    ctx.strokeText(stats, w - 56, 32);
    ctx.fillStyle = '#fff';
    ctx.fillText(stats, w - 56, 32);

    // Build icons.
    ctx.textAlign = 'left';
    ctx.font = '18px system-ui, sans-serif';
    let x = 10;
    for (const wp of this.weapons) {
      const def = WEAPONS[wp.id];
      this.drawSlot(ctx, x, 24, def.icon, wp.evolved ? '★' : String(wp.level), wp.evolved);
      x += 34;
    }
    x = 10;
    for (const [id, lvl] of this.passives) {
      this.drawSlot(ctx, x, 58, PASSIVES[id].icon, String(lvl), false);
      x += 34;
    }

    // Boss bar.
    if (this.boss) {
      const bw = Math.min(500, w - 40);
      const bx = (w - bw) / 2;
      const by = h - 34;
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(bx - 2, by - 2, bw + 4, 16);
      ctx.fillStyle = '#e85d04';
      ctx.fillRect(bx, by, bw * Math.max(0, this.boss.hp / this.boss.maxHp), 12);
      ctx.font = 'bold 13px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff';
      ctx.fillText('ASH COLOSSUS', w / 2, by - 10);
    }

    // Touch joystick.
    const j = this.input.joy;
    if (j.active) {
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(j.ox, j.oy, 50, 0, TAU);
      ctx.stroke();
      const dx = j.x - j.ox;
      const dy = j.y - j.oy;
      const d = Math.min(50, Math.hypot(dx, dy));
      const a = Math.atan2(dy, dx);
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath();
      ctx.arc(j.ox + Math.cos(a) * d, j.oy + Math.sin(a) * d, 20, 0, TAU);
      ctx.fill();
    }
  }

  private drawSlot(ctx: CanvasRenderingContext2D, x: number, y: number, icon: string, tag: string, gold: boolean): void {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(x, y, 30, 30);
    ctx.strokeStyle = gold ? '#ffd60a' : 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x, y, 30, 30);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '17px system-ui, sans-serif';
    ctx.fillStyle = '#fff';
    ctx.fillText(icon, x + 15, y + 16);
    ctx.font = 'bold 10px system-ui, sans-serif';
    ctx.fillStyle = gold ? '#ffd60a' : '#fff';
    ctx.fillText(tag, x + 25, y + 25);
  }
}

/** In-place filter. Avoids a new array every frame. */
function compact<T>(arr: T[], keep: (x: T) => boolean): void {
  let j = 0;
  for (let i = 0; i < arr.length; i++) if (keep(arr[i])) arr[j++] = arr[i];
  arr.length = j;
}

const hash = (x: number, y: number): number => (Math.imul(x, 73856093) ^ Math.imul(y, 19349663)) >>> 0;

export function drawBackground(ctx: CanvasRenderingContext2D, camX: number, camY: number, w: number, h: number, time: number): void {
  ctx.fillStyle = '#150d12';
  ctx.fillRect(0, 0, w, h);

  const gs = 80;
  ctx.strokeStyle = 'rgba(255,140,80,0.05)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = Math.floor(camX / gs) * gs; x < camX + w; x += gs) {
    ctx.moveTo(x - camX, 0);
    ctx.lineTo(x - camX, h);
  }
  for (let y = Math.floor(camY / gs) * gs; y < camY + h; y += gs) {
    ctx.moveTo(0, y - camY);
    ctx.lineTo(w, y - camY);
  }
  ctx.stroke();

  // Scattered rocks and glowing embers on the ground, fixed per tile.
  const ts = 160;
  for (let tx = Math.floor(camX / ts); tx * ts < camX + w; tx++) {
    for (let ty = Math.floor(camY / ts); ty * ts < camY + h; ty++) {
      const hv = hash(tx, ty);
      const x = tx * ts + (hv % ts) - camX;
      const y = ty * ts + ((hv >> 8) % ts) - camY;
      if (hv % 5 === 0) {
        ctx.fillStyle = 'rgba(60,35,40,0.8)';
        ctx.beginPath();
        ctx.ellipse(x, y, 10 + (hv % 9), 6 + (hv % 5), 0, 0, TAU);
        ctx.fill();
      } else if (hv % 7 === 0) {
        ctx.fillStyle = `rgba(255,${90 + (hv % 60)},30,${0.35 + Math.sin(time * 3 + hv) * 0.25})`;
        ctx.beginPath();
        ctx.arc(x, y, 2, 0, TAU);
        ctx.fill();
      }
    }
  }
}
