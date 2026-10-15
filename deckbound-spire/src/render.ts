import { getCard } from './cards';
import type { Combat } from './combat';
import { STATUSES } from './statuses';
import type { CardDef, CardInst, Fighter, Intent, Op, StatusId } from './types';

const TYPE_LABEL: Record<CardDef['type'], string> = { attack: 'Attack', skill: 'Skill', power: 'Power', status: 'Status', curse: 'Curse' };

const KEYWORDS = /\b(Vulnerable|Weak|Poison|Strength|Dexterity|Block|Exhaust|Ethereal|Thorns|Frail|Energy|Unplayable|Wounds?|Burn)\b/g;

export const INTENT_ICON: Record<Intent, string> = {
  attack: '🗡️',
  defend: '🛡️',
  buff: '⬆️',
  debuff: '🌀',
  attackDefend: '🗡️🛡️',
  attackDebuff: '🗡️🌀',
  attackBuff: '🗡️⬆️',
  defendBuff: '🛡️⬆️',
  defendDebuff: '🛡️🌀',
  unknown: '❓',
  special: '💥',
};

function baseValue(d: CardDef, kind: 'dmg' | 'block'): number | null {
  const op = d.ops.find((o): o is Extract<Op, { op: 'dmg' | 'block' }> => o.op === kind);
  return op ? op.n : null;
}

/** Fills {D} and {B}. In combat, the live value shows green when higher and red when lower. */
function describe(d: CardDef, c?: Combat, target?: Fighter | null): string {
  let text = d.desc;
  const live = c ? c.preview(d, target) : null;
  const fill = (token: string, base: number | null, value: number | null) => {
    if (base === null && value === null) return;
    const v = value ?? base!;
    const cls = live && base !== null && v > base ? 'buffed' : live && base !== null && v < base ? 'nerfed' : '';
    text = text.replace(token, `<b class="num ${cls}">${v}</b>`);
  };
  if (d.ops.some((o) => o.op === 'dmgBlock')) {
    if (live) fill('{D}', null, live.dmg);
    else text = text.replace(' ({D})', '');
  } else fill('{D}', baseValue(d, 'dmg'), live?.dmg ?? null);
  fill('{B}', baseValue(d, 'block'), live?.block ?? null);
  return text.replace(KEYWORDS, '<span class="kw">$1</span>');
}

export interface CardOpts {
  c?: Combat;
  target?: Fighter | null;
  attrs?: string;
  cls?: string;
}

export function cardHtml(inst: Pick<CardInst, 'id' | 'up'>, o: CardOpts = {}): string {
  const d = getCard(inst);
  const cost = d.cost === -1 ? 'X' : String(d.cost);
  const tooExpensive = o.c && d.cost > o.c.energy;
  return `<div class="card t-${d.type} r-${d.rarity}${inst.up ? ' up' : ''} ${o.cls ?? ''}" ${o.attrs ?? ''}>
    ${d.cost === -2 ? '' : `<div class="cost${tooExpensive ? ' short' : ''}">${cost}</div>`}
    <div class="cname">${d.name}</div>
    <div class="cart">${d.icon}</div>
    <div class="ctype">${TYPE_LABEL[d.type]}</div>
    <div class="cdesc"><span>${describe(d, o.c, o.target)}</span></div>
  </div>`;
}

export function statusRow(f: Fighter): string {
  const items = (Object.entries(f.status) as [StatusId, number][])
    .filter(([, n]) => n !== 0)
    .map(([s, n]) => {
      const def = STATUSES[s];
      const bad = def.debuff || n < 0;
      return `<span class="st ${bad ? 'bad' : 'good'}" title="${def.name}: ${def.desc(n)}">${def.icon}<b>${n}</b></span>`;
    });
  return `<div class="statuses">${items.join('')}</div>`;
}

export function hpBar(f: Fighter): string {
  const pct = (Math.max(0, f.hp) / f.maxHp) * 100;
  const poison = Math.min(f.status.poison ?? 0, f.hp);
  const poisonBar = poison > 0 ? `<div class="poisonfill" style="left:${((f.hp - poison) / f.maxHp) * 100}%;width:${(poison / f.maxHp) * 100}%"></div>` : '';
  return `<div class="hpbar${f.block ? ' has-block' : ''}">
    <div class="hpfill" style="width:${pct}%"></div>${poisonBar}
    <span class="hptxt">${Math.max(0, f.hp)}/${f.maxHp}</span>
    ${f.block ? `<div class="blockbadge" title="Block">${f.block}</div>` : ''}
  </div>`;
}
