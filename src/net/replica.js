// On a guest the town is a copy that follows the host's. These stand in for
// the simulation and the building sites there: they keep everything that only
// makes the picture (villagers going about their day, builders at work, a
// clock that runs smoothly between updates) but never change the town itself.
// Money, construction progress, jobs, school places, arrivals and departures
// all come from the host (see sync.js).

import { CONFIG } from '../config.js';
import { BUILDINGS } from '../defs.js';
import { isOpen, capOf } from '../world/world.js';
import { Sim } from '../sim/sim.js';
import { Construction } from '../sim/construction.js';
import { yearsOf, stageForAge } from '../sim/people.js';

export class ReplicaSim extends Sim {
  // The host's clock, as of its last update (in game hours since day 0).
  syncClock(day, hours) { this.clock = { t: day * 24 + hours, ahead: 0 }; }

  // Run the clock on at the host's speed, easing towards the host's time. If
  // the host's updates stop coming, so does the clock (after a second).
  update(dt) {
    if (this.dirty) this.recompute();
    const w = this.world, c = this.clock;
    const run = !c || c.ahead < 1 ? dt : 0;
    const rate = (this.speed * 24) / CONFIG.DAY_SECONDS;
    let dh = run * rate;
    if (c) {
      c.ahead += dt;
      c.t += dh;
      const err = c.t - (w.day * 24 + w.hours + dh);
      dh = Math.abs(err) > 3 ? dh + err : Math.max(0, dh + err * Math.min(1, dt * 2));
    }
    if (!dh) return 0;
    let h = w.hours + dh, day = w.day;
    while (h >= 24) { h -= 24; day++; }
    while (h < 0) { h += 24; day--; }
    w.hours = h;
    if (day !== w.day) { w.day = day; if (dh > 0) this.game.emit('day', day); }
    return Math.max(0, dh);
  }

  // Shop visits and fares still pop up coins here, but the money is the host's.
  recordVisit(b, fare = null) { return fare ?? (BUILDINGS[b.type].levels[b.level].visit || 0); }

  // The host rehouses (or loses) the people of a demolished building.
  _onRemoved() { this.dirty = true; }

  // The host announces new titles.
  _milestones() {}

  // Jobs come from the host: just count them.
  assignJobs() {
    const w = this.world;
    let total = 0, filled = 0;
    this.jobsNeedingSkill = 0;
    for (const b of w.buildings.values()) {
      const j = this.jobsOf(b);
      if (!j) continue;
      total += j;
      const n = Math.min(j, b.workers.length);
      filled += n;
      if (b.connected && n < j && BUILDINGS[b.type].levels[b.level].edu) this.jobsNeedingSkill += j - n;
    }
    this.jobs = { total, filled };
  }

  // School places come from the host too: fill in the class lists and counts.
  assignSchools() {
    const w = this.world;
    const schools = [...w.buildings.values()].filter(b => BUILDINGS[b.type].levels[b.level].seats);
    for (const s of schools) s.pupils = [];
    const stats = { kids: 0, placed: 0, seats: schools.filter(s => isOpen(s) && s.connected).reduce((n, s) => n + (this.seatsOf ? this.seatsOf(s) : capOf(s, 'seats')), 0), short: [0, 0, 0, 0, 0, 0], students: 0 };
    for (const r of w.residents.values()) {
      const s = r.school != null ? w.buildings.get(r.school) : null;
      if (r.age === 'child') {
        const st = stageForAge(yearsOf(r));
        if (!st) continue;
        stats.kids++;
        if (s && s.pupils) { s.pupils.push(r.id); stats.placed++; } else stats.short[st]++;
      } else if (s && s.pupils) { s.pupils.push(r.id); stats.students++; }
    }
    this.schooling = stats;
  }
}

export class ReplicaConstruction extends Construction {
  constructor(game) {
    // the base class settles carts that were on the road; that is the host's call
    const waits = [...game.world.buildings.values()].filter(b => b.con && b.con.wait).map(b => [b.con, b.con.wait]);
    super(game);
    for (const [con, wait] of waits) con.wait = wait;
    this.sites = new Set();
  }

  // Builders walk out and work as usual, but the progress is the host's.
  update(dt, gameHours) {
    const w = this.world, ag = this.game.agents;
    // a site the host has finished: its crew walks back, as on the host
    for (const id of this.sites) {
      const s = w.buildings.get(id);
      if (s && s.con) continue;
      for (const r of w.residents.values()) {
        if (r.site !== id) continue;
        r.site = null;
        if (r.loc === 'out' && r.at === id) ag.go(r, r.job ?? r.home);
      }
    }
    const progress = [];
    this.sites.clear();
    for (const b of w.buildings.values()) if (b.con) { progress.push([b.con, b.con.done]); this.sites.add(b.id); }
    super.update(dt, gameHours);
    for (const [con, done] of progress) con.done = done;
  }

  // Only the host finishes a job.
  _finish() {}
}
