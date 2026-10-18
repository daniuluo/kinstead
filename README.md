# Hearthvale

A little isometric village builder that runs in your browser — pixel-art rendering in the spirit of *Metropolis 1998* and the late-90s city sims, with a living village of tiny people going about their day.

**Play it:** https://daniuluo.github.io/hearthvale/

## Features

- **Pixel-art isometric 3D** — the scene is rendered in real 3D (three.js), then drawn at low resolution with depth/normal outlines and crisp pixel upscaling, using a classic 2:1 isometric camera with a single fixed angle. Settings let you choose the pixel size or switch to a smooth, antialiased renderer with ambient occlusion.
- **Rotating view** — press `Q` / `E` or the rotate buttons beside `2D` to swing the camera a quarter turn around the ground at the middle of the screen and see the town from all four sides. The light turns with you, so every side is lit and shadowed the same way.
- **2D top-down map view** — press `T` or the `2D` button to swing the camera straight down for a grid-aligned map (it rotates too); zoom in and out with the wheel or the `+`/`−` buttons.
- **Procedural valley** — every seed grows a different landscape: rivers, lakes, hills, forests and rocky slopes, shown as a diorama. Pick a size: Small 32×32, Medium 48×48, Large 64×64 or Huge 80×80. Terraform by raising, lowering and levelling land, and plant trees.
- **Starter towns** — found a village in an empty valley, or take over one that's a few weeks along: a **riverside hamlet** (cottages, a woodcutter and a fishing hut by the river), a **market village** (a cobbled high street with a bakery, tavern, school and family houses), a **mill town** (farms, a workshop, a chapel and a water wheel powering the town) or a **crossroads village** (a coaching tavern, a smithy and a coach line out to every corner). Each card in the new-village window shows a little map of the town, its size, villagers and money, and picking one shows it behind the window.
- **Organic village** — no two buildings look the same. Each one is generated from a seed: walls, roofs (thatch, tile, slate, shingle), half-timbering, chimneys, dormers, shutters, flower boxes, gardens and fences. Paths are worn into the grass and meander a little.
- **Upgradable buildings** across homes, commerce (market, bakery, tavern), industry (farm, woodcutter, fishery, workshop, builder's yard), services (well, clinic, school, watch, chapel, town hall), and parks and decor. Most buildings have three or four levels, up to a Market Hall, Hospital, Academy or Minster. Upgrades need happiness and service coverage, and each option shows what changes (homes, jobs, earnings, reach, upkeep…) before you commit.
- **Branching homes** — a Cottage becomes a Family House, which then goes one of two ways: a **grand home** (Villa → Manor House → Grand Manor: few, wealthy residents who pay much more tax) or **flats** (Townhouse Flats → Tenement → Mansion Block: many households on one plot). Pick a **style** for any home or shop upgrade — timber frame, limewash, painted, brick, stone or clapboard — and tick **Preview in town** to see it in place before building. Each style builds differently, not just in different colours: timber frame has steep roofs, a jettied upper floor and a central stack; limewash has thatch or half-hipped roofs, a chimney up the outside wall and a deep front garden; painted is a symmetrical Georgian front with a hipped roof, a centred door and a chimney at each end; brick has gables, bay windows, arched window heads and paired stacks; stone has low slate or saltbox roofs, deep-set arched windows and an outside stack; clapboard has a saltbox roof, dormers, shutters and a deep porch. On a bigger plot a home can become a **Country Mansion** or a block of **Apartments**.
- **Construction** — nothing appears instantly. Builders from the **Builder's Yard** walk to each site and work round the scaffolding; a building goes up in stages (pegged-out plot and materials, foundations, walls rising, roof) and only progresses while builders are there. With no builders, slow hired hands come from the next village. A sandbox switch builds instantly.
- **Research tree** — press `K` for 47 projects in 14 branches (building works, homes, stone, brick, colour, trade, leisure, industry, farming, water, power, public services, learning and transport). Each branch has levels: unlocking a building gives its first levels, and later projects unlock its higher upgrades and other paths. Capabilities are researched too: **Joining** neighbours, **Plot Surveying** (expanding and buying garden strips), **House Moving** and **Great Plots** (2×2 estates). Click a project to see pictures of what it unlocks. Research points come from the town hall, schools, chapels and your villagers each day.
- **Water and electricity** — a **Utilities** menu (`U`) with wells, water towers and river pumps (each supplies a number of people), and power from water wheels, wind generators and coal power stations. Power runs along the streets on poles and wires to every road-connected building; when demand outstrips supply, some homes go dry or dark. Powered homes are happier, powered businesses earn more, and the grandest upgrades need electricity.
- **Expanding plots** — grow a building onto the plot beside or behind it: take empty land, buy a strip of a cottage's garden, or buy out and demolish a small neighbour (it asks twice, and shows the plot it would take). A double plot holds 50% more; with Great Plots researched it can grow again into a 2×2 estate. Bigger plots unlock bigger buildings, often more than one (a Country Mansion or Apartments, a High School or a College).
- **Demolition** — a crew pulls buildings down over time; the people inside move out first.
- **Joining and moving** — select a building next to another to **join** them on a double plot: two homes make a Terrace, a home and a shop a mixed-use **Shophouse** (shop below, flats above), two shops an Arcade, a tavern and a shop an Inn, a chapel and a school a Parish School, a clinic and a chapel or home an Almshouse, a well and a garden a Fountain Garden, two workshops or woodcutters a Joinery, and gardens, flowers and statues a Park. **Move** any building for a fee: builders take it down, a cart hauls the materials, and it goes back up on the new plot.
- **Streets** — buildings come forward into the verge of the street in front of them, while facing buildings and street corners stay clear of each other. Little paths run from each front door to the street, and villagers step out of real front doors and walk down them.
- **Gardens and land** — cottages sit at the front of their plot with a real back garden (vegetables, washing lines, sheds, hens). Big homes can buy a strip of a neighbouring cottage's garden; their owners pay the cottage's owners, both plots change size together and nothing ever overlaps.
- **Busy places** — parks, gardens and squares hold only so many visitors at once (more for bigger and upgraded ones; the park's panel shows how full it is). When one is full, villagers try the nearest park with room, or stay home. A park needs a road to it before anyone can visit.
- **Roads** — dirt paths, cobblestone and paved streets drawn as crisp surfaces with edging stones, plus wooden bridges over water with sloped approaches. Street lamps light up at night.
- **Transit** — horse-drawn **coach lines** loop between coach stops. **Railways** have track (with curves), stations and steam trains. Trains never reverse, so a rail line needs a loop of track through its stations; trains drive forward around it, ease in and out of stations, and stop centred on each platform (up to three trains per loop). Villagers on long trips walk to a stop, wait there, ride, and pay a fare.
- **Animals** — a few deer and foxes roam the woods, rabbits the meadows, and mallards paddle on the lakes and river. Sheep, cows and chickens graze on the farms. They wander slowly and unpredictably, check the ground a step ahead so they steer around buildings, rarely cross roads, keep to their habitat, and bolt from villagers who get too close. Animals are drawn life-size next to the villagers.
- **Villagers** — little abstract figures drawn to scale with the buildings (about half a storey tall), walking at an unhurried pace on two stubby legs with a soft shadow at their feet. Every resident has a name (families share a surname, and names rarely repeat), an age, an education, a home, maybe a job, a wage, savings, living costs, a family, friends (workmates, neighbours, classmates) and one or two personality traits (early riser, night owl, homebody, sociable, big spender, thrifty, outdoorsy, devout, hard-working…) that shape their daily routine. Press `P` for the **Villagers** directory: search, filter and sort everyone in town, then click a name to follow them. A building with several households lists its residents family by family.
- **Ages and schooling** — a year passes every two days. Babies are born, children grow up, young adults move out of their parents' home, older villagers retire and eventually die. Children go to the school that fits their age (elementary, middle, high school) and some young adults go on to college or university. Each school has a fixed number of seats. Better-educated workers earn more, and skilled jobs need them. A school upgrades two ways: **larger** (more seats at the same stage) or the **next stage** (Middle School → High School → College → University), and the later stages need a bigger plot.
- **Happiness** — click the happiness figure in the top bar to see what feeds it across the town (water, health care, schooling, safety, culture, electricity, scenery, shops, transport, smoke, taxes, crowding, work and road access): how many points each adds now, how many the average villager could gain, how many homes miss out, and a button that takes you to the fix. A home's panel lists its own gaps first with what to do, and each villager's page shows their mood and what would make them happier.
- **Windows and issues** — drag any window by its title bar and keep several open at once; `Esc` closes the front one. The **Issues** panel in the lower left (`I`) lists the town's bottlenecks: homes out of reach of services, school places short, power or water short, sites waiting for builders, skilled jobs nobody can fill.
- **Economy** — money in dollars: taxes, shop visits, production, upkeep, a budget screen with charts, and RCI demand bars. New families arrive from the edge of the map when the village is attractive; unhappy households leave.
- **Time and seasons** — a day lasts 8 minutes at 1×; sunrise and sunset, lit windows, lamps, lantern-carrying villagers, fireflies, then spring blossom, autumn leaves and winter snow.
- **Weather** — most days are fair, but now and then clouds roll in for a few hours and the heaviest spells bring rain (snow in winter), with a soft hiss of rain. The weather follows the town's seed and clock, so everyone in a multiplayer town sees the same sky.
- **Soundtrack** — a gentle folk soundtrack made up as it plays: a lute picking out chords, a flute or bells on top and a warm pad underneath. It slows into a minor key at night and plays quieter in the rain. It is synthesised in the browser, so there are no music files. Turn it off with the note button in the top bar, or set its volume in Settings.
- **Building guide** — hover over a card in the build menu for a summary of what the building does (cost, jobs, homes, reach, visitors, upkeep, what it grows into). Pick one and the Building guide window shows every level with its needs, and the other paths it can take.
- **Crowds** — every place villagers visit holds only so many at once: shops, pubs and theatres, chapels, clinics (villagers now go to see the doctor, the old most often) and parks. A full place sends people on to the nearest one of the same kind with room, or they stay home. Hover over a building or open it to see its visitors.
- **Speed and sandbox** — pause, or run at 1×, 2×, 4×, 8×, 16× or 32× (`[` and `]` step through them). Four sandbox switches, available for a new game or from Settings: unlimited money, unlock every building, upgrade without meeting needs, and instant construction.
- **Pop-ups** — money pop-ups, notices, hover tips and the name tag over a followed villager can each be switched off in Settings, or all at once with the bell button or `N`.
- **Multiplayer** — host your town and send friends a short invite code; they join from their own browsers and build the same town with you, live. Everyone sees each other's cursors and what they are building. See [Multiplayer](#multiplayer).
- **Saves** — in this browser (with an autosave every day), as plain `.json` files, or to **Google Drive**. **Download save (.json)** sits at the top of the Save window (or press `Ctrl+Shift+S`), every saved slot has its own download button, and you can drop a `.json` save onto the game to load it.

## Controls

| Input | Action |
| --- | --- |
| Right / middle drag, or left drag with Select | Pan |
| Mouse wheel, `+` / `−` | Zoom |
| `W` `A` `S` `D` / arrow keys | Pan |
| `T` | Toggle 2D top-down / isometric |
| `Q` / `E` | Rotate the view a quarter turn anticlockwise / clockwise |
| `1` – `8`, `R`, `X` | Tool menus: select, homes, commerce, industry, services, parks, transit, terrain · roads · demolish |
| `Tab` | Flip a building's entrance before placing |
| `Space` | Pause / resume |
| `[` / `]` | Slower / faster |
| `O` · `B` · `L` · `P` · `H` | Overlays · budget · transit lines · villagers · help |
| `N` | Hide / show pop-ups |
| `U` · `K` · `I` | Utilities menu · research · issues panel |
| `M` | Multiplayer: host this town or join one |
| `Enter` / `Backspace` | Finish / undo stops while creating a transit line |
| `Ctrl+S` · `Ctrl+Shift+S` | Quick save to the browser · download the save as `.json` |
| `Esc` / right-click | Cancel the tool or close the front window |

## Multiplayer

Build one town together, live, with up to eight players.

**To host:** open the town you want to share and press `M` (or the people button in the top bar), then **Host this town**. On the title screen, **Multiplayer…** offers *New village and host* or *Continue and host*. You get a six-character invite code such as `K7Q-M2P`. Send it to your friends, or use **Copy invite link** to send a link that opens the game with the code filled in. Keep your tab open: your computer runs the town for everyone.

**To join:** open the game, choose **Multiplayer…** on the title screen (or press `M` in a town of your own, which is autosaved first), type your name and the code, and press **Join**. The host's town loads and from then on follows the host's live. Everything you do (building, roads, track, terrain and trees, demolishing, upgrades with a chosen style, expanding, joining and moving buildings, research, taxes, transit lines, the town's name and the game speed) is sent to the host and applied for everyone. The sandbox switches stay with the host.

The players box in the top bar shows who is connected. Each player's cursor appears in the others' towns as a ring in their colour with their name and what they are holding, and whatever building they have selected is outlined. If a guest leaves, everyone else carries on. If the host stops hosting or closes the tab, the guests are told and can keep playing the town on their own, save it in their browser or download it.

### How it works

- **Host-authoritative.** Only the host runs the simulation: the clock and speed, money, construction, villagers' homes, jobs and schools, arrivals and departures, transit and research. Guests don't run their own copy of the economy, which would drift apart (the simulation uses `Math.random` in many places).
- **One command dispatcher.** Every player action, in single-player too, is a small command object such as `{ t: 'place', type: 'house', x: 10, z: 12 }`, handled by [`src/commands.js`](src/commands.js). Single-player and the host apply it at once. A guest sends it to the host, which checks it with exactly the same `World` rules it uses for its own actions. A command carries only what the player chose, never options that bend the rules, and malformed ones are refused.
- **Snapshot, then deltas.** A guest joins with a snapshot of the town: an ordinary save plus each building's entrance and each villager's school place. Five times a second the host compares the town with what it last sent and sends only what changed: buildings and building sites, villagers, roads, track, land heights, trees per tile, transit lines, money, research and the clock. Every 15 seconds it sends every building and villager in full (a keyframe), so nothing can drift for long. A ready-grown town of 200 buildings and 650 villagers costs the host about 0.6 ms per update and under 20 KB/s at 32× speed ([`src/net/sync.js`](src/net/sync.js)).
- **Villagers on guests are simulated locally, for looks.** Who lives and works where, and who arrives, leaves, is born or dies, comes from the host. A guest's own copy of the routines then walks them about, puts builders to work on the scaffolding and runs the coaches and trains, so its streets look alive without streaming hundreds of positions. Individual villagers may therefore be in a different spot on each screen. The money from shop visits and fares is always the host's ([`src/net/replica.js`](src/net/replica.js)).
- **A tab in the background.** A browser gives a background tab no animation frames, so a host whose tab is hidden keeps the town running for its guests in larger, undrawn steps. Browsers may slow such a tab down further after a while, so a host should keep the game in view.

### Why PeerJS

The site is static (GitHub Pages), so players need a public way to find each other. Hearthvale uses [PeerJS](https://peerjs.com/) 1.5.5, loaded from jsDelivr with a pinned version and a Subresource Integrity checksum, the first time someone hosts or joins. It was picked over Trystero and similar options for three reasons:

- Its free cloud signalling server lets the host claim a chosen peer id, so the invite code simply *is* the peer id: `K7Q-M2P` is the peer `hearthvale-K7QM2P`.
- It reports an unknown id explicitly, so a wrong or expired code gets a clear "no town is open with that code" message rather than an empty room.
- It configures STUN and PeerJS's public TURN relay by default, so players behind awkward home networks can usually still connect.

The signalling server only introduces the browsers. The town itself travels directly between them over a WebRTC data channel, or through the TURN relay when no direct route exists. Problems get a plain message: the library couldn't load, the PeerJS server can't be reached, no town has that code, the connection couldn't be opened (a strict firewall), or the town is full.

## How the buildings are made

Everything is generated in code — there are no model files, textures or sprites. [`src/render/geo.js`](src/render/geo.js) builds low-poly shapes (boxes, bevelled boxes, roof prisms, cylinders) and merges them into one mesh per building with per-vertex colours and a glow channel for lit windows. [`src/render/buildings.js`](src/render/buildings.js) has a recipe per building type and level, and every building's random seed picks its materials, colours, roof, windows and yard. Brick courses and roof tiles are drawn by a shader, and the pixel-art look comes from a low-resolution post-process pass.

## Running locally

There is no build step: it's plain ES modules plus three.js from a CDN. It only needs to be served over HTTP, because modules don't load from `file://`.

On Windows, use the bundled PowerShell server (no Node or Python needed):

```powershell
powershell -ExecutionPolicy Bypass -File serve.ps1
```

Then open http://localhost:8080. Any static server also works, for example `npx serve .` or `python -m http.server 8080`.

## Google Drive saves

Cloud saves use your own Google account through Google Identity Services and the Drive REST API. They use the narrow `drive.file` scope, so the game can only see files it created itself. Those files live in a **Hearthvale Saves** folder in your Drive.

You need your own OAuth Client ID (it's free):

1. In [Google Cloud Console](https://console.cloud.google.com/), create a project.
2. Go to **APIs & Services → Library**, find **Google Drive API** and enable it.
3. Go to **APIs & Services → OAuth consent screen**, choose **External**, and fill in the app name and your email. Add the scope `.../auth/drive.file`. While the app is in *Testing*, add your Google account under **Test users**.
4. Go to **APIs & Services → Credentials → Create credentials → OAuth client ID** and pick **Web application**. Under **Authorized JavaScript origins**, add:
   - `https://daniuluo.github.io`
   - `http://localhost:8080` (for local play)
5. Copy the Client ID (`…apps.googleusercontent.com`), then do one of:
   - paste it into `GOOGLE_CLIENT_ID` in [`src/config.js`](src/config.js) and push, so it works for everyone, or
   - paste it in-game under **Save → Google Drive**, or in **Settings**. This stores it in your browser only.

A Client ID isn't a secret, so committing it is fine.

## Project layout

```
index.html, style.css     page shell and the 90s-desktop UI
src/main.js, game.js      boot + game orchestrator (loop, saving, overlays)
src/commands.js           every player action as a checked command (local and multiplayer)
src/config.js, defs.js    tunables and the building catalogue
src/world/                terrain generation, world rules, demo-town grower,
                          starter towns
src/sim/                  economy & migration, villagers, transit, pathfinding
src/render/               renderer & pixel pass, sky, terrain painter,
                          procedural buildings, nature, particles, overlays
src/ui/                   HUD & dialogs, input/tools, thumbnails, sound
src/save/                 save format + local slots, Google Drive
src/net/                  multiplayer: sessions, sync, guests' replica sim, PeerJS links, cursors
scripts/check.js          headless smoke test
scripts/net-check.js      headless multiplayer test
scripts/playtest.js       headless playtest bot
scripts/starters.js       headless test of the starter towns
scripts/audit.js          town invariants shared by the headless tests
```

### Smoke test

```bash
npm install three@0.170.0 --no-save
node scripts/check.js
```

This builds every building model at every level, generates 25 valleys, simulates a town for six in-game days (walking villagers, a coach line, a train looping forward, a dead-end rail line refused), checks that animals never enter buildings or leave their habitat, and round-trips a save.

```bash
node scripts/net-check.js
```

The multiplayer test runs a host and two guests in one process, joined by in-memory links. It checks the command dispatcher (malformed or rule-bending commands are refused, the sandbox switches are host-only), has a guest build, lay roads, research, set taxes and speed, upgrade in a style, join, expand, move, terraform, plant and demolish, and open a coach line. It runs three days at 8× and checks that the towns stay identical throughout, that a keyframe repairs anything that drifted, that a second guest can join mid-game, that cursors are relayed, and that guests are told when the host closes the town. `npm run check` runs both tests.

### Playtest

```bash
node scripts/playtest.js 50 48 2024 economy
```

A bot plays a fresh town for a number of days (arguments: days, map size, seed, mode), building, laying roads, researching, upgrading, joining, expanding, moving and demolishing. Modes: `economy` (real money), `stress` (unlimited money, everything unlocked, lots of building every day), `chaos` (the same with instant construction, so far more upgrades, joins and moves) and `scale` (a big ready-grown town on an 80×80 map, to measure speed). Every day it audits the town (no overlapping buildings, no broken references, capacities respected, building sites always progressing, no builders idle while sites wait) and it prints anything wrong at the end.

### Starter towns

```bash
node scripts/starters.js
```

Each starter town in [`src/world/starters.js`](src/world/starters.js) is a fixed map seed plus a short build script (streets, buildings, upgrades with styles, cobbles, a coach line, the order of research). The town is **grown when you pick it**, in about 50 ms: every step goes through the normal world rules (it costs money and waits for the villagers and research it needs; buildings go up with instant construction), and between steps the real simulation runs a day at a time, so families move in, find jobs and school places, age, have children, pay taxes and research. The result is saved and loaded back through the normal save format, so a new game starts from exactly what a save of that town would load. The sim's dice are seeded, so a town comes out the same every time.

Growing the towns at runtime was chosen over shipping saved `.json` towns because a saved town is a snapshot of the rules at the time it was made: when buildings, capacities or the save format change, it goes stale and has to be regenerated by hand, while a grown town always follows the current rules. The test checks that this still works: it grows each town twice and compares them, fails if any script step could no longer be carried out, checks that research covers everything built and that homes are within capacity, then plays each town on for a few days with the full simulation, running the playtest audits every day, and round-trips a save. Add `--map` to print each town day by day and as a map, which helps when changing a build script.

## Credits

- [three.js](https://threejs.org/) (MIT) for rendering and post-processing.
- Fonts: [Pixelify Sans](https://fonts.google.com/specimen/Pixelify+Sans) and [Silkscreen](https://fonts.google.com/specimen/Silkscreen) (OFL). Icons: [Material Symbols](https://fonts.google.com/icons) (Apache 2.0).
- Visual style inspired by *Metropolis 1998* and the classic isometric city builders.

## License

[MIT](LICENSE)
