/**
 * Hand-made pixel pictures. A dot is an empty cell. Every other letter is a filled cell.
 * The letter only sets the color of the revealed picture (see PALETTE).
 */

export type PicKind = 'monster' | 'chest' | 'key' | 'treasure' | 'potion' | 'mana' | 'charm';

export interface Picture {
  id: string;
  name: string;
  kind: PicKind;
  pack: 'base' | 'sea' | 'star';
  rows: string[];
}

export const PALETTE: Record<string, string> = {
  g: '#5bd36a',
  k: '#3d3a55',
  w: '#f4f1ff',
  y: '#ffd166',
  r: '#ef476f',
  b: '#a0663a',
  p: '#9b6dff',
  c: '#4cc9f0',
  s: '#9aa5b8',
  o: '#ff8c42',
  u: '#4f7cff',
  l: '#a9d6ff',
  m: '#ff70c8',
};

const P = (id: string, name: string, kind: PicKind, rows: string[], pack: Picture['pack'] = 'base'): Picture => ({ id, name, kind, pack, rows });

export const PICTURES: Picture[] = [
  // ---------- 5×5 ----------
  P('slime', 'Green Slime', 'monster', ['..g..', '.ggg.', 'gwgwg', 'ggggg', '.ggg.']),
  P('bat', 'Cave Bat', 'monster', ['b.b.b', 'bbbbb', 'bwbwb', '.bbb.', '..b..']),
  P('spider', 'Spider', 'monster', ['s.s.s', '.sss.', 'ssrss', '.sss.', 's.s.s']),
  P('rat', 'Rat', 'monster', ['ss...', 'sssss', 'skss.', 'sssss', '.s.ss']),
  P('chest5', 'Small Chest', 'chest', ['.bbb.', 'bbbbb', 'yyyyy', 'bbybb', 'bbbbb']),
  P('key5', 'Brass Key', 'key', ['.yyy.', 'y...y', '.yyy.', '..y..', '..yyy']),
  P('potion5', 'Red Potion', 'potion', ['..w..', '..w..', '.rrr.', 'rrrrr', '.rrr.']),
  P('heart5', 'Heart', 'potion', ['.r.r.', 'rrrrr', 'rrrrr', '.rrr.', '..r..']),
  P('gem5', 'Gem', 'treasure', ['.ccc.', 'c.c.c', 'ccccc', '.ccc.', '..c..']),
  P('shroom5', 'Mushroom', 'mana', ['.rrr.', 'rwrwr', 'rrrrr', '..w..', '.www.']),
  P('crab', 'Crab', 'monster', ['r...r', 'rr.rr', '.rrr.', 'rrrrr', 'r.r.r'], 'sea'),
  P('shell5', 'Shell', 'treasure', ['..m..', '.mmm.', 'm.m.m', 'mmmmm', '.mmm.'], 'sea'),
  P('star5', 'Falling Star', 'mana', ['..y..', 'yyyyy', '.yyy.', '.y.y.', 'y...y'], 'star'),

  // ---------- 8×8 ----------
  P('goblin', 'Goblin', 'monster', ['g.gggg.g', 'gggggggg', '.gkggkg.', '.gggggg.', '.gwwwwg.', '..gggg..', '...gg...', '..g..g..']),
  P('skull', 'Skeleton', 'monster', ['.wwwwww.', 'wwwwwwww', 'w..ww..w', 'w..ww..w', 'wwwwwwww', '.www.ww.', '..w.w.w.', '..wwwww.']),
  P('ghost', 'Ghost', 'monster', ['..wwww..', '.wwwwww.', 'ww.ww.ww', 'ww.ww.ww', 'wwwwwwww', 'wwwwwwww', 'wwwwwwww', 'ww.ww.ww']),
  P('snake', 'Viper', 'monster', ['.gggg...', 'gkggkg..', 'gggggg..', '.rr.gg..', '.r..gg..', '...gg...', '..gg..gg', '.gggggg.']),
  P('kingslime', 'King Slime', 'monster', ['..y.y.y.', '..yyyyy.', '.gggggg.', 'gwkggwkg', 'gggggggg', 'ggrrrrgg', 'gggggggg', '.gggggg.']),
  P('spiderqueen', 'Spider Queen', 'monster', ['s..ss..s', '.s.ss.s.', '..ssss..', 'ssrssrss', '..ssss..', '.ssssss.', 's.s..s.s', 's......s']),
  P('chest8', 'Iron Chest', 'chest', ['.bbbbbb.', 'bbbbbbbb', 'bb.bb.bb', 'yyyyyyyy', 'bbbyybbb', 'bbbkkbbb', 'bbbbbbbb', '.b....b.']),
  P('key8', 'Silver Key', 'key', ['..yyy...', '.y...y..', '.y...y..', '..yyy...', '...y....', '...yyy..', '...y....', '...yyy..']),
  P('potion8', 'Elixir', 'potion', ['...ww...', '...ww...', '..wwww..', '...pp...', '..pppp..', '.pppppp.', '.pppppp.', '..pppp..']),
  P('heart8', 'Big Heart', 'potion', ['.rr..rr.', 'rrrrrrrr', 'rwrrrrrr', 'rrrrrrrr', 'rrrrrrrr', '.rrrrrr.', '..rrrr..', '...rr...']),
  P('moon8', 'Moon', 'mana', ['..yyyy..', '.yyy....', 'yyy.....', 'yyy.....', 'yyy.....', 'yyy.....', '.yyy....', '..yyyy..']),
  P('book8', 'Spell Book', 'mana', ['uuuuuuu.', 'uwwwwwwu', 'uwkkkkwu', 'uwwwwwwu', 'uwkkkwwu', 'uwwwwwwu', 'uwwwwwwu', '.uuuuuuu']),
  P('fish', 'Angler Fish', 'monster', ['...bb...', '..bbbb.b', '.bkbbbbb', 'bbbbbbb.', 'bbbbbbb.', '.bbbbbbb', '..bbbb.b', '...bb...'], 'sea'),
  P('ufo', 'Saucer', 'monster', ['...cc...', '..cccc..', '.gggggg.', 'gggggggg', 'gyggyggy', '.gggggg.', '..y..y..', '.y....y.'], 'star'),
  P('star8', 'Star', 'mana', ['...yy...', '...yy...', 'yyyyyyyy', '.yyyyyy.', '..yyyy..', '.yyyyyy.', '.yy..yy.', 'yy....yy'], 'star'),

  // ---------- 10×10 ----------
  P('golem', 'Stone Golem', 'monster', ['...ssss...', '..ssssss..', '..sussus..', '..ssssss..', '.ssssssss.', 'ssssssssss', 'ss.ssss.ss', 'ss.ssss.ss', '...ss.ss..', '..sss.sss.']),
  P('wolf', 'Dire Wolf', 'monster', ['.s......s.', '.ss....ss.', '.ssssssss.', 'ssssssssss', 'ssyssssyss', 'ssssssssss', '.ssswwsss.', '..sskkss..', '...ssss...', '....ss....']),
  P('wraith', 'Wraith', 'monster', ['...pppp...', '..pppppp..', '.ppyppypp.', '.pppppppp.', '.ppp..ppp.', 'pppppppppp', 'pppppppppp', '.pppppppp.', '..pp.pp.p.', '.p..p..p..']),
  P('mimic', 'Mimic', 'monster', ['.bbbbbbbb.', 'bbbbbbbbbb', 'bbrbbbbrbb', 'bbbbbbbbbb', 'wbwbwbwbwb', 'rrrrrrrrrr', 'bwbwbwbwbw', 'bbbbbbbbbb', 'bbbbyybbbb', '.bbbbbbbb.']),
  P('troll', 'Cave Troll', 'monster', ['..gggggg..', '.gggggggg.', '.gyggggyg.', '.gggggggg.', '.gwgggwgg.', '..gggggg..', 'gggggggggg', 'g.gggggg.g', '..gg..gg..', '.ggg..ggg.']),
  P('boneknight', 'Bone Knight', 'monster', ['...ssss...', '..ssssss..', '..s.ss.s..', '..ssssss..', '...wwww...', '.uuuuuuuu.', 'uu.uuuu.uu', 'uu.uuuu.uu', '...u..u...', '..uu..uu..']),
  P('chest10', 'Gold Chest', 'chest', ['..bbbbbb..', '.bbbbbbbb.', 'bbbbbbbbbb', 'bbbbbbbbbb', 'yyyyyyyyyy', 'bbbbyybbbb', 'bbbykkybbb', 'bbbbyybbbb', 'bbbbbbbbbb', '.bbbbbbbb.']),
  P('key10', 'Gold Key', 'key', ['..yyyy....', '.yyyyyy...', 'yy....yy..', 'yy....yy..', '.yyyyyy...', '..yyyy....', '...yy.....', '...yyyy...', '...yy.....', '...yyyyy..']),
  P('crown', 'Crown', 'treasure', ['....rr....', 'y...yy...y', 'yy..yy..yy', 'yyy.yy.yyy', 'yyyyyyyyyy', 'yryyuuyyry', 'yyyyyyyyyy', '.yyyyyyyy.', '.pppppppp.', 'pppppppppp']),
  P('sword', 'Old Sword', 'charm', ['.........w', '........ww', '.......ww.', '......ww..', '.....ww...', '.y..ww....', '..yww.....', '..by......', '.b..y.....', 'b.........']),
  P('shield', 'Shield', 'charm', ['.uuuuuuuu.', 'uuuuyyuuuu', 'uuuuyyuuuu', 'uyyyyyyyyu', 'uyyyyyyyyu', 'uuuuyyuuuu', '.uuuyyuuu.', '..uuyyuu..', '...uuuu...', '....uu....']),
  P('heart10', 'Life Heart', 'potion', ['.rrr..rrr.', 'rrwrrrrrrr', 'rwrrrrrrrr', 'rrrrrrrrrr', 'rrrrrrrrrr', 'rrrrrrrrrr', '.rrrrrrrr.', '..rrrrrr..', '...rrrr...', '....rr....']),
  P('potion10', 'Great Potion', 'potion', ['...wwww...', '....ww....', '....ww....', '...wwww...', '..mmmmmm..', '.mmmmmmmm.', 'mmwmmmmmmm', 'mmwmmmmmmm', '.mmmmmmmm.', '..mmmmmm..']),
  P('squid', 'Kraken Spawn', 'monster', ['....pp....', '...pppp...', '..pppppp..', '.pppppppp.', '.pwppppwp.', '.pppppppp.', '..pppppp..', '.p.p..p.p.', 'p..p..p..p', 'p.p....p.p'], 'sea'),
  P('rocket', 'Rocket', 'charm', ['....rr....', '...wwww...', '...wuuw...', '...wuuw...', '...wwww...', '...wwww...', '..rwwwwr..', '.rrwwwwrr.', '.r.oooo.r.', '....oo....'], 'star'),

  // ---------- 12×12 ----------
  P('demon', 'Demon', 'monster', ['r..........r', 'rr........rr', '.rr.rrrr.rr.', '..rrrrrrrr..', '.rrrrrrrrrr.', '.rryyrryyrr.', '.rrrrrrrrrr.', '..rrrrrrrr..', '..rwrwwrwr..', '...rrrrrr...', '....rrrr....', '.....rr.....']),
  P('dragon', 'Dragon', 'monster', ['...g....g...', '...gg..gg...', '..gggggggg..', '.gggggggggg.', '.ggyggggygg.', 'gggggggggggg', 'ggg.gggg.ggg', '.gggggggggg.', '.gwgwggwgwg.', '..gggggggg..', '.o.oo..oo.o.', 'o..o.oo.o..o']),
  P('eye', 'Beholder', 'monster', ['.p..p..p..p.', '..p.p..p.p..', '...pppppp...', '..pppppppp..', '.ppwwwwwwpp.', 'ppwwuuuuwwpp', 'ppwwukkuwwpp', 'ppwwuuuuwwpp', '.ppwwwwwwpp.', '..pppppppp..', '...pppppp...', '....pppp....']),
  P('lich', 'Lich', 'monster', ['....yyyy....', '...y.yy.y...', '...yyyyyy...', '..wwwwwwww..', '..w..ww..w..', '..wwwwwwww..', '...ww..ww...', '.pp.wwww.pp.', 'pppppppppppp', '.pppppppppp.', '..pppppppp..', '.pp......pp.']),
  P('firegolem', 'Fire Golem', 'monster', ['....oooo....', '...oooooo...', '...oyooyo...', '...oooooo...', '....rrrr....', '.oooooooooo.', 'oooorrrroooo', 'oo.oooooo.oo', 'oo.oooooo.oo', 'oo.oo..oo.oo', '...oo..oo...', '..ooo..ooo..']),
  P('serpent', 'Star Serpent', 'monster', ['....cccc....', '...cccccc...', '..ccyccycc..', '..cccccccc..', '...crrrrc...', '....cccc....', '.....cc.....', '....cc......', '...cc....y..', '..cc....yyy.', '..cccccccy..', '...ccccc....']),
  P('chest12', 'Royal Chest', 'chest', ['..bbbbbbbb..', '.bbbbbbbbbb.', 'bbbbbbbbbbbb', 'bbbbbbbbbbbb', 'yyyyyyyyyyyy', 'bbbbbyybbbbb', 'bbbbykkybbbb', 'bbbbykkybbbb', 'bbbbbyybbbbb', 'bbbbbbbbbbbb', 'bbbbbbbbbbbb', '.bb......bb.']),
  P('whale', 'Leviathan', 'monster', ['.........u.u', '..........u.', '...uuuuu..u.', '.uuuuuuuuuu.', 'uuuuuuuuuuu.', 'uwuuuuuuuuu.', 'uuuuuuuuuuuu', 'uullllllluuu', '.ullllllluu.', '..uuuuuuuu..', '...uu.......', 'cc.cc.cc.cc.'], 'sea'),
  P('planet', 'Ringed Planet', 'treasure', ['....oooo...y', '..oooooooo..', '.oooooooooo.', 'oooooooooooo', 'yyyyyyyyyyyy', 'oooooooooooo', '.oooooooooo.', '..oooooooo..', '....oooo....', 'y...........', '........y...', '..y.........'], 'star'),

  // ---------- 15×15 ----------
  P('voideye', 'Void Eye', 'monster', ['..p....p....p..', '...p...p...p...', '....ppppppp....', '..ppppppppppp..', '.ppwwwwwwwwwpp.', 'ppwwwmmmmmwwwpp', 'pwwwmmkkkmmwwwp', 'pwwwmmkkkmmwwwp', 'pwwwmmkkkmmwwwp', 'ppwwwmmmmmwwwpp', '.ppwwwwwwwwwpp.', '..ppppppppppp..', '....ppppppp....', '...p..p.p..p...', '..p..p...p..p..']),
  P('shadow', "Oracle's Shadow", 'monster', ['......ppp......', '....ppppppp....', '...ppppppppp...', '..ppp.....ppp..', '..pp.y...y.pp..', '..pp.......pp..', '..ppp.....ppp..', '...ppppppppp...', '..ppppppppppp..', '.pppppcccppppp.', 'pppppcclccppppp', 'ppppppcccpppppp', 'ppppppppppppppp', '.ppppppppppppp.', 'ppp.ppp.ppp.ppp']),
  P('chest15', 'Dragon Hoard', 'chest', ['...bbbbbbbbb...', '..bbbbbbbbbbb..', '.bbbbbbbbbbbbb.', 'bbbbbbbbbbbbbbb', 'bbbbbbbbbbbbbbb', 'yyyyyyyyyyyyyyy', 'bbbbbbyyybbbbbb', 'bbbbbykkkybbbbb', 'bbbbbykkkybbbbb', 'bbbbbbyyybbbbbb', 'bbbbbbbbbbbbbbb', 'bbbbbbbbbbbbbbb', 'yyyyyyyyyyyyyyy', 'bbbbbbbbbbbbbbb', '.bbb.......bbb.']),
];

export const PIC_BY_ID: Record<string, Picture> = Object.fromEntries(PICTURES.map((p) => [p.id, p]));

export const picSize = (p: Picture): number => p.rows.length;

/** The picture as a 0/1 solution string, row by row. */
export const picSolution = (p: Picture): string => p.rows.map((r) => r.replace(/[^.]/g, '1').replace(/\./g, '0')).join('');
