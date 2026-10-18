// Town simulation: time, economy, services, happiness, jobs and migration.

import { CONFIG, ROAD_LEVELS, TITLES, titleFor, seasonOf } from '../config.js';
import { BUILDINGS, SERVICES, TRANSIT, RESEARCH_SOURCES, servicesOf } from '../defs.js';
import { RNG, hash2 } from '../util/rng.js';
import { fw, fd, isOpen, capOf } from '../world/world.js';
import { firstName, lastName } from '../util/names.js';
import { settleDay, startingWealth, yearsOf, eduOf, arrivingEdu, YEAR_DAYS } from './people.js';

const SERVICE_KEYS = Object.keys(SERVICES);

export class Sim {
  constructor(game) {
    this.game = game;
    this.world = game.world;
    const N = this.world.N;
    this.coverage = {};
    for (const s of SERVICE_KEYS) this.coverage[s] = new Uint8Array(N * N);
    this.appeal = new Float32Array(N * N);
    this.pollution = new Float32Array(N * N);
    this.budget = { income: {}, expense: {}, net: 0 };
    this.demand = { r: 0.5, c: 0.5, i: 0.5 };
    this.jobs = { total: 0, filled: 0 };
    this.housing = { cap: 0, used: 0 };
    this.happiness = 60;
    this.arrivals = [];
    this.rng = new RNG((Math.random() * 1e9) | 0);
    this.dirty = true;
    this._hourAcc = 0;
    const mark = () => { this.dirty = true; };
    for (const e of ['building:add', 'building:remove', 'building:change', 'building:refit', 'roads', 'trees', 'rails']) this.world.on(e, mark);
    this.world.on('building:remove', (b) => this._onRemoved(b));
    this.world.on('building:vacate', (b) => { this.dirty = true; this._onRemoved(b); });
  }

  get speed() { return this.game.speed; }

  // ------------------------------------------------------------------ time
  update(dt) {
    const w = this.world;
    if (this.dirty) this.recompute();
    const speed = this.speed;
    if (!speed) return 0;
    const dh = (dt * speed * 24) / CONFIG.DAY_SECONDS;
    const prevH = w.hours;
    w.hours += dh;
    this._hourAcc += dh;
    while (this._hourAcc >= 1) { this._hourAcc -= 1; this.hourly(); }
    // scheduled arrivals
    for (let i = this.arrivals.length - 1; i >= 0; i--) {
      const a = this.arrivals[i];
      if (a.day === w.day && w.hours >= a.t) { this.arrivals.splice(i, 1); this._arrive(a); }
    }
    if (w.hours >= 24) {
      w.hours -= 24;
      w.day++;
      this.daily();
    }
    if (prevH < 12 && w.hours >= 12) this.game.emit('noon');
    return dh;
  }

  hourly() {
    const w = this.world;
    w.money += this.budget.net / 24;
  }

  daily() {
    const w = this.world;
    this.recompute();
    w.history.push({ day: w.day - 1, pop: w.population, money: Number.isFinite(w.money) ? Math.round(w.money) : null, happy: Math.round(this.happiness), net: Math.round(this.budget.net + w.stats.todayVisitIncome) });
    if (w.history.length > 400) w.history.shift();
    w.stats.todayVisitIncome = 0;
    const life = this.ageDay();
    if (life.born.length) this.game.emit('born', life.born);
    if (life.died.length) this.game.emit('died', life.died);
    settleDay(w);
    w.addResearch(this.researchRate());
    w.encroachPass(() => this.rng.next());
    this.planMigration();
    this.game.emit('day', w.day);
    const s = seasonOf(w.day), ps = seasonOf(w.day - 1);
    if (s !== ps) this.game.emit('season', s);
  }

  // ------------------------------------------------------------ recompute
  recompute() {
    this.dirty = false;
    this._coverage();
    this._links();
    this.assignSchools();
    this.assignJobs();
    this._happiness();
    this._budget();
    this._demand();
    this._milestones();
  }

  _links() {
    const w = this.world;
    for (const b of w.buildings.values()) { b.residents = []; b.workers = []; }
    for (const r of w.residents.values()) {
      const h = r.home != null ? w.buildings.get(r.home) : null;
      if (h) h.residents.push(r.id); else r.home = null;
      const j = r.job != null ? w.buildings.get(r.job) : null;
      if (j) j.workers.push(r.id); else r.job = null;
    }
  }

  _coverage() {
    const w = this.world, N = w.N;
    for (const s of SERVICE_KEYS) this.coverage[s].fill(0);
    this.appeal.fill(0);
    this.pollution.fill(0);
    const stamp = (b, r, fn) => {
      const cx = b.x + fw(b) / 2, cz = b.z + fd(b) / 2;
      const R = Math.ceil(r);
      for (let z = Math.max(0, Math.floor(cz - R - 1)); z <= Math.min(N - 1, Math.ceil(cz + R)); z++) {
        for (let x = Math.max(0, Math.floor(cx - R - 1)); x <= Math.min(N - 1, Math.ceil(cx + R)); x++) {
          const d = Math.hypot(x + 0.5 - cx, z + 0.5 - cz);
          if (d <= r) fn(z * N + x, d);
        }
      }
    };
    for (const b of w.buildings.values()) {
      if (!isOpen(b)) continue;
      const def = BUILDINGS[b.type], L = def.levels[b.level];
      if (b.connected) for (const s of servicesOf(def)) stamp(b, L.radius, (i) => { this.coverage[s][i] = 1; });
      if (def.park || L.appeal) stamp(b, L.radius, (i, d) => { this.appeal[i] += L.appeal * (1 - d / (L.radius + 1)); });
      if (L.pollution) stamp(b, L.pollution, (i, d) => { this.pollution[i] += 16 * (1 - d / (L.pollution + 1)); });
    }
    // Utilities. Water: wells and pumps can only draw for so many people.
    // Power: generators feed every road-connected building through the
    // street wires. Short on either and some buildings go without.
    let wSup = 0, pGen = 0, pDem = 0;
    for (const b of w.buildings.values()) {
      if (!isOpen(b) || !b.connected) continue;
      const def = BUILDINGS[b.type], L = def.levels[b.level];
      if (L.supply && servicesOf(def).includes('water')) wSup += L.supply;
      if (L.kw) pGen += L.kw;
      else if (!def.park) pDem += 0.5 + 0.2 * (L.housing || 0) + 0.25 * (L.jobs || 0);
    }
    this.utility = { water: { supply: wSup, demand: w.population }, power: { gen: pGen, demand: Math.round(pDem) } };
    this.waterShare = w.population ? Math.min(1, wSup / w.population) : 1;
    this.powerShare = pGen ? Math.min(1, pDem ? pGen / pDem : 1) : 0;
    const P = this.coverage.power;
    for (const b of w.buildings.values()) {
      const L = BUILDINGS[b.type].levels[b.level];
      b.powered = !!(isOpen(b) && b.connected && this.powerShare > 0 && (L.kw || hash2(b.id, 11, 5) < this.powerShare));
      if (!b.powered) continue;
      for (let dz = -1; dz <= fd(b); dz++) for (let dx = -1; dx <= fw(b); dx++) {
        const x = b.x + dx, z = b.z + dz;
        if (x >= 0 && z >= 0 && x < N && z < N) P[z * N + x] = 1;
      }
    }
    // trees and water make places pleasant
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      const tc = w.treeCount[z * N + x];
      if (tc) {
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, nz = z + dz;
          if (nx >= 0 && nz >= 0 && nx < N && nz < N) this.appeal[nz * N + nx] += Math.min(3, tc) * (dx || dz ? 0.35 : 0.6);
        }
      }
    }
  }

  _near(b, pred, radius) {
    const cx = b.x + fw(b) / 2, cz = b.z + fd(b) / 2;
    for (const o of this.world.buildings.values()) {
      if (o === b || !isOpen(o) || !pred(o)) continue;
      if (Math.hypot(o.x + fw(o) / 2 - cx, o.z + fd(o) / 2 - cz) <= radius) return true;
    }
    return false;
  }

  _happiness() {
    const w = this.world, N = w.N;
    const tax = w.taxRate;
    let total = 0, count = 0;
    for (const b of w.buildings.values()) {
      const def = BUILDINGS[b.type];
      if (!def.levels[b.level].housing) continue;
      const i = (b.z) * N + b.x;
      const f = {};
      let h = 42;
      for (const s of SERVICE_KEYS) f[s] = !!this.coverage[s][i];
      // not enough water to go round: some homes in reach still go dry
      if (f.water && hash2(b.id, 3, 9) >= this.waterShare) { f.water = false; f.dry = true; }
      f.power = !!b.powered;
      if (f.water) h += 10;
      if (f.health) h += 9;
      if (f.education) h += 8;
      if (f.safety) h += 7;
      if (f.culture) h += 6;
      if (f.power) h += 4;
      f.appeal = Math.min(16, this.appeal[i] * 0.8);
      h += f.appeal;
      f.shops = this._near(b, o => BUILDINGS[o.type].shop || BUILDINGS[o.type].leisure, 7);
      if (f.shops) h += 5;
      f.transit = this._near(b, o => !!BUILDINGS[o.type].stop, 4);
      if (f.transit) h += 3;
      f.pollution = Math.min(22, this.pollution[i]);
      h -= f.pollution;
      // land deals: a bigger garden, or money in the bank for the seller
      f.land = b.leases && b.leases.length ? (b.leases.some(l => l.buyer) ? 'buyer' : 'seller') : null;
      if (f.land) h += f.land === 'buyer' ? 3 : 2;
      f.tax = tax > 10 ? -(tax - 10) * 1.6 : (10 - tax) * 0.8;
      h += f.tax;
      let adults = 0, unemployed = 0;
      for (const rid of b.residents) {
        const r = w.residents.get(rid);
        if (r && r.age === 'adult') { adults++; if (!r.job) unemployed++; }
      }
      f.unemployed = adults ? unemployed / adults : 0;
      h -= f.unemployed * 14;
      f.connected = b.connected;
      if (!b.connected) h -= 25;
      b.happiness = Math.max(0, Math.min(100, Math.round(h)));
      b.factors = f;
      total += b.happiness * b.residents.length;
      count += b.residents.length;
    }
    this.happiness = count ? total / count : 60;
    for (const r of w.residents.values()) {
      const h = r.home != null ? w.buildings.get(r.home) : null;
      r.mood = h ? h.happiness + (r.age === 'adult' ? (r.job ? 4 : -8) : 0) : 30;
    }
  }

  // Research points per day.
  researchRate() {
    const w = this.world;
    let p = Math.floor(w.population / 30);
    for (const b of w.buildings.values()) {
      const src = RESEARCH_SOURCES[b.type];
      if (src && isOpen(b) && b.connected) p += src[Math.min(b.level, src.length - 1)];
    }
    return p;
  }

  // Pupils fill the nearest schools with room; the oldest children get
  // places first (they're closest to finishing).
  assignSchools() {
    const w = this.world;
    const schools = [...w.buildings.values()].filter(b => BUILDINGS[b.type].levels[b.level].seats && isOpen(b) && b.connected);
    const left = new Map(schools.map(s => [s.id, capOf(s, 'seats')]));
    for (const s of schools) s.pupils = [];
    const kids = [...w.residents.values()].filter(r => r.age === 'child' && yearsOf(r) >= 6).sort((a, b) => yearsOf(b) - yearsOf(a));
    let placed = 0;
    for (const r of kids) {
      r.school = null;
      const home = r.home != null ? w.buildings.get(r.home) : null;
      if (!home) continue;
      let best = null, bd = Infinity;
      for (const s of schools) {
        if (!left.get(s.id)) continue;
        const d = Math.abs(s.x - home.x) + Math.abs(s.z - home.z);
        if (d < bd) { bd = d; best = s; }
      }
      if (!best) continue;
      left.set(best.id, left.get(best.id) - 1);
      best.pupils.push(r.id);
      r.school = best.id;
      placed++;
    }
    for (const r of w.residents.values()) if (r.age !== 'child' || yearsOf(r) < 6) r.school = null;
    this.schooling = { kids: kids.length, placed, seats: schools.reduce((n, s) => n + capOf(s, 'seats'), 0) };
  }

  // A day of life: everyone ages; at each birthday children learn at their
  // school, grow up at 18, retire at 65; the old may pass away and young
  // couples may have a baby.
  ageDay() {
    const w = this.world, rng = this.rng, ag = this.game.agents;
    const born = [], died = [];
    for (const r of [...w.residents.values()]) {
      const before = Math.floor(yearsOf(r));
      r.years = yearsOf(r) + 1 / YEAR_DAYS;
      const y = Math.floor(r.years);
      if (y === before) continue;
      eduOf(r);
      if (r.age === 'child') {
        const s = r.school != null ? w.buildings.get(r.school) : null;
        if (s && y > 6) {
          r.edXP = (r.edXP || 0) + 1;
          const lvl = BUILDINGS[s.type].levels[s.level].edu || 1;
          if (r.edXP >= 5) r.edu = Math.max(r.edu, 1);
          if (r.edXP >= 9 && lvl >= 2) r.edu = Math.max(r.edu, 2);
          if (r.edXP >= 11 && lvl >= 3) r.edu = Math.max(r.edu, 3);
        }
        if (y >= 18) { r.age = 'adult'; r.school = null; r.wealth = 0; ag?.refreshLook(r); }
      } else if (r.age === 'adult') {
        if (y >= 65) { r.age = 'elder'; r.job = null; ag?.refreshLook(r); }
        else if (y >= 20 && y <= 42 && r.home != null) {
          const home = w.buildings.get(r.home);
          const fam = [...w.residents.values()].filter(o => (o.fam ?? o.id) === (r.fam ?? r.id));
          const room = home && isOpen(home) && home.residents.length < capOf(home, 'housing');
          // one chance a year per household, taken by its youngest grown-up
          const youngest = fam.filter(o => o.age === 'adult').sort((a, b) => yearsOf(a) - yearsOf(b))[0];
          if (room && youngest === r && fam.length < 6 && rng.chance(0.16)) {
            const baby = { id: w.newId(), first: firstName(rng), last: r.last, age: 'child', years: 0, edu: 0, home: r.home, job: null, look: (rng.next() * 1e9) | 0, mood: 60, fam: r.fam ?? r.id, wealth: 0 };
            w.residents.set(baby.id, baby);
            home.residents.push(baby.id);
            born.push(baby);
          }
        }
      } else if (y >= 72 && rng.chance(Math.min(0.5, (y - 70) * 0.03))) died.push(r);
    }
    for (const r of died) {
      ag?.remove(r);
      w.residents.delete(r.id);
      // children left with no grown-up at home go to live with relatives elsewhere
      const kin = [...w.residents.values()].filter(o => o.home === r.home);
      if (kin.length && kin.every(o => o.age === 'child')) ag?.depart(kin.map(o => o.id));
    }
    if (born.length || died.length) this.dirty = true;
    return { born, died };
  }

  jobsOf(b) { return isOpen(b) ? capOf(b, 'jobs') : 0; }

  assignJobs() {
    const w = this.world;
    const open = [];
    let total = 0, filled = 0;
    this.jobsNeedingSkill = 0;
    for (const b of w.buildings.values()) {
      const j = this.jobsOf(b);
      if (!j) continue;
      total += j;
      const need = BUILDINGS[b.type].levels[b.level].edu || 0;
      // workers without the schooling this job now needs are let go
      if (need) for (const rid of [...b.workers]) { const r = w.residents.get(rid); if (r && eduOf(r) < need) { b.workers.splice(b.workers.indexOf(rid), 1); r.job = null; } }
      // drop surplus workers after a downgrade / disconnection
      while (b.workers.length > j || (!b.connected && b.workers.length)) {
        const rid = b.workers.pop();
        const r = w.residents.get(rid);
        if (r) r.job = null;
      }
      filled += b.workers.length;
      if (b.connected && b.workers.length < j) open.push(b);
    }
    if (open.length) {
      for (const r of w.residents.values()) {
        if (r.age !== 'adult' || r.job || r.home == null) continue;
        const home = w.buildings.get(r.home);
        if (!home || !home.connected) continue;
        let best = null, bd = Infinity;
        for (const b of open) {
          if (b.workers.length >= this.jobsOf(b)) continue;
          if (eduOf(r) < (BUILDINGS[b.type].levels[b.level].edu || 0)) continue;
          // builders are hired first: nothing gets built without them
          const d = Math.abs(b.x - home.x) + Math.abs(b.z - home.z) + this.rng.next() * 3 - (BUILDINGS[b.type].builders ? 1000 : 0);
          if (d < bd) { bd = d; best = b; }
        }
        if (!best) continue;
        r.job = best.id;
        best.workers.push(r.id);
        filled++;
      }
    }
    for (const b of open) if (b.workers.length < this.jobsOf(b) && BUILDINGS[b.type].levels[b.level].edu) this.jobsNeedingSkill += this.jobsOf(b) - b.workers.length;
    this.jobs = { total, filled };
  }

  _budget() {
    const w = this.world;
    const inc = { taxes: 0, commerce: 0, industry: 0 };
    const exp = { services: 0, buildings: 0, roads: 0, transit: 0 };
    let bonus = 0;
    for (const b of w.buildings.values()) if (b.type === 'townhall') bonus = BUILDINGS.townhall.levels[b.level].taxBonus || 0;
    const tk = (w.taxRate / 10) * (1 + bonus);
    for (const r of w.residents.values()) {
      const home = r.home != null ? w.buildings.get(r.home) : null;
      const hk = home ? (BUILDINGS[home.type].levels[home.level].tax ?? 1 + 0.25 * home.level) : 1;
      if (r.age === 'adult') inc.taxes += (r.job ? 6 * hk : 1) * tk;
      else if (r.age === 'elder') inc.taxes += 1.5 * tk;
    }
    for (const b of w.buildings.values()) {
      if (!isOpen(b)) continue;
      const def = BUILDINGS[b.type], L = def.levels[b.level];
      const workers = b.workers.length;
      if (L.income && workers) {
        let v = workers * L.income * (b.powered ? 1.15 : 1);
        if (def.nearTrees) v *= 0.6 + Math.min(1, this._treesNear(b, 3) / 18) * 0.8;
        if (def.cat === 'industry') inc.industry += v; else inc.commerce += v;
      }
      if (L.upkeep) {
        if (def.cat === 'services' || def.cat === 'transit') exp.services += L.upkeep;
        else exp.buildings += L.upkeep;
      }
    }
    for (let i = 0; i < w.roads.length; i++) {
      if (w.roads[i]) exp.roads += ROAD_LEVELS[w.roads[i]].upkeep;
      if (w.rails[i]) exp.roads += 0.25;
    }
    for (const line of w.lines) exp.transit += TRANSIT[line.mode].upkeep * line.vehicles;
    const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
    this.budget = { income: inc, expense: exp, net: sum(inc) - sum(exp), totalIn: sum(inc), totalOut: sum(exp) };
  }

  _treesNear(b, r) {
    const w = this.world;
    let n = 0;
    for (let z = b.z - r; z <= b.z + fd(b) - 1 + r; z++) for (let x = b.x - r; x <= b.x + fw(b) - 1 + r; x++) {
      if (w.inBounds(x, z)) n += w.treeCount[w.idx(x, z)];
    }
    return n;
  }

  _demand() {
    const w = this.world;
    let cap = 0, used = 0, comm = 0, ind = 0, adults = 0;
    for (const b of w.buildings.values()) {
      if (!isOpen(b)) continue;
      const def = BUILDINGS[b.type], L = def.levels[b.level];
      if (L.housing) { cap += capOf(b, 'housing'); used += b.residents.length; }
      if (def.cat === 'commercial') comm += capOf(b, 'jobs');
      if (def.cat === 'industry') ind += capOf(b, 'jobs');
    }
    for (const r of w.residents.values()) if (r.age === 'adult') adults++;
    this.housing = { cap, used };
    const pop = w.population;
    const freeJobs = this.jobs.total - this.jobs.filled;
    const vacancy = cap - used;
    const cl = (v) => Math.max(0, Math.min(1, v));
    this.demand = {
      r: cl(0.5 + (freeJobs - vacancy) / 16 + (this.happiness - 55) / 120),
      c: cl(0.5 + (pop * 0.13 + 2 - comm) / 10),
      i: cl(0.5 + (adults * 0.5 - ind) / 12),
    };
  }

  _milestones() {
    const w = this.world;
    const t = titleFor(w.population);
    const idx = TITLES.indexOf(t);
    if (idx > w.titleIdx) {
      w.titleIdx = idx;
      this.game.emit('milestone', t);
    }
  }

  // ------------------------------------------------------------ migration
  vacantHomes() {
    const w = this.world, out = [];
    for (const b of w.buildings.values()) {
      const L = BUILDINGS[b.type].levels[b.level];
      if (L.housing && b.connected && isOpen(b) && b.residents.length < capOf(b, 'housing')) out.push(b);
    }
    return out;
  }

  planMigration() {
    const w = this.world, rng = this.rng;
    const vac = this.vacantHomes().filter(b => b.happiness >= 38);
    const freeJobs = this.jobs.total - this.jobs.filled;
    const attract = Math.max(0, Math.min(1, (this.happiness - 38) / 40)) * 0.6 + (freeJobs > 0 ? 0.45 : 0.08);
    let n = Math.min(vac.length, Math.round(rng.next() * 0.8 + vac.length * attract * 0.55), 7);
    if (w.population < 8 && vac.length) n = Math.max(n, 1);
    for (let k = 0; k < n; k++) {
      const b = vac[k % vac.length];
      this.arrivals.push({ day: w.day, t: rng.float(7.5, 17.5), home: b.id });
    }
    // unhappy households may leave
    for (const b of w.buildings.values()) {
      if (!BUILDINGS[b.type].levels[b.level].housing || !b.residents.length) continue;
      if (b.happiness < 28 && rng.chance(0.35)) {
        const leaving = b.residents.slice(0, Math.max(1, Math.ceil(b.residents.length / 2)));
        this.game.agents.depart(leaving);
        this.game.emit('departed', { building: b, count: leaving.length });
      }
    }
  }

  makeFamily(home, maxSize) {
    const w = this.world, rng = this.rng;
    const last = lastName(rng);
    const fam = [];
    const size = Math.max(1, Math.min(maxSize, rng.chance(0.25) ? 1 : rng.int(2, 4)));
    for (let k = 0; k < size; k++) {
      let age = 'adult';
      if (k >= 2) age = rng.chance(0.8) ? 'child' : 'elder';
      else if (k === 1 && rng.chance(0.15)) age = 'elder';
      if (size === 1 && rng.chance(0.25)) age = 'elder';
      const r = { id: w.newId(), first: firstName(rng), last, age, home: home.id, job: null, look: (rng.next() * 1e9) | 0, mood: 60 };
      r.years = age === 'child' ? rng.int(0, 16) : age === 'elder' ? rng.int(65, 82) : rng.int(19, 58);
      r.edu = age === 'child' ? (r.years >= 12 ? 1 : 0) : arrivingEdu(w, rng);
      r.fam = fam.length ? fam[0].id : r.id;
      r.wealth = startingWealth(r, home);
      w.residents.set(r.id, r);
      home.residents.push(r.id);
      fam.push(r);
    }
    return fam;
  }

  _arrive(a) {
    const w = this.world;
    const b = w.buildings.get(a.home);
    if (!b || !b.connected || !isOpen(b)) return;
    const L = BUILDINGS[b.type].levels[b.level];
    const room = capOf(b, 'housing') - b.residents.length;
    if (room <= 0) return;
    const fam = this.makeFamily(b, room);
    w.stats.arrivals += fam.length;
    this.dirty = true;
    this.game.agents.arrive(fam, b);
    this.game.emit('arrived', { building: b, family: fam });
  }

  seedFounders() {
    const w = this.world;
    for (const b of w.buildings.values()) {
      if (BUILDINGS[b.type].levels[b.level].housing) this.makeFamily(b, 3);
    }
    this.recompute();
  }

  _onRemoved(b) {
    const w = this.world;
    const homeless = [];
    for (const r of w.residents.values()) {
      if (r.job === b.id) r.job = null;
      if (r.home === b.id) homeless.push(r);
    }
    if (!homeless.length) return;
    // try to rehouse, otherwise they leave town
    this._links();
    const vac = this.vacantHomes();
    const leaving = [];
    for (const r of homeless) {
      const h = vac.find(v => v.residents.length < capOf(v, 'housing'));
      if (h) { r.home = h.id; h.residents.push(r.id); this.game.agents.relocate(r, b); }
      else leaving.push(r.id);
    }
    if (leaving.length) this.game.agents.depart(leaving, b);
    this.dirty = true;
  }

  recordVisit(b, fare = null) {
    const w = this.world;
    const v = fare ?? (BUILDINGS[b.type].levels[b.level].visit || 0);
    if (!v) return 0;
    w.money += v;
    w.stats.visits++;
    w.stats.visitIncome += v;
    w.stats.todayVisitIncome += v;
    return v;
  }
}
