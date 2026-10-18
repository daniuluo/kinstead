# Hearthvale

A little isometric village builder that runs in your browser — pixel-art rendering in the spirit of *Metropolis 1998* and the late-90s city sims, with a living village of tiny people going about their day.

**Play it:** https://daniuluo.github.io/hearthvale/

## Features

- **Pixel-art isometric 3D** — the scene is rendered in real 3D (three.js), then drawn at low resolution with depth/normal outlines and crisp pixel upscaling, using a classic 2:1 isometric camera with a single fixed angle. Settings let you choose the pixel size or switch to a smooth, antialiased renderer with ambient occlusion.
- **Rotating view** — press `Q` / `E` or the rotate buttons beside `2D` to swing the camera a quarter turn around the middle of the screen and see the town from all four sides. The light turns with you, so every side is lit and shadowed the same way.
- **2D top-down map view** — press `T` or the `2D` button to swing the camera straight down for a grid-aligned map (it rotates too); zoom in and out with the wheel or the `+`/`−` buttons.
- **Procedural valley** — every seed grows a different landscape: rivers, lakes, hills, forests and rocky slopes, shown as a diorama. Pick a size: Small 32×32, Medium 48×48, Large 64×64 or Huge 80×80. Terraform by raising, lowering and levelling land, and plant trees.
- **Organic village** — no two buildings look the same. Each one is generated from a seed: walls, roofs (thatch, tile, slate, shingle), half-timbering, chimneys, dormers, shutters, flower boxes, gardens and fences. Paths are worn into the grass and meander a little.
- **Upgradable buildings** across homes, commerce (market, bakery, tavern), industry (farm, woodcutter, fishery, workshop, builder's yard), services (well, clinic, school, watch, chapel, town hall), and parks and decor. Most buildings have three or four levels, up to a Market Hall, Hospital, Academy or Minster. Upgrades need happiness and service coverage, and each option shows what changes (homes, jobs, earnings, reach, upkeep…) before you commit.
- **Branching homes** — a Cottage becomes a Family House, which then goes one of two ways: a **grand home** (Villa → Manor House → Grand Manor: few, wealthy residents who pay much more tax) or **flats** (Townhouse Flats → Tenement → Mansion Block: many households on one plot). Pick a **style** for any home or shop upgrade — timber frame, limewash, painted, brick, stone or clapboard — and tick **Preview in town** to see it in place before building. On a bigger plot a home can become a **Country Mansion** or a block of **Apartments**.
- **Construction** — nothing appears instantly. Builders from the **Builder's Yard** walk to each site and work round the scaffolding; a building goes up in stages (pegged-out plot and materials, foundations, walls rising, roof) and only progresses while builders are there. With no builders, slow hired hands come from the next village. A sandbox switch builds instantly.
- **Research tree** — press `K` for 47 projects in 14 branches (building works, homes, stone, brick, colour, trade, leisure, industry, farming, water, power, public services, learning and transport). Each branch has levels: unlocking a building gives its first levels, and later projects unlock its higher upgrades and other paths. Capabilities are researched too: **Joining** neighbours, **Plot Surveying** (expanding and buying garden strips), **House Moving** and **Great Plots** (2×2 estates). Click a project to see pictures of what it unlocks. Research points come from the town hall, schools, chapels and your villagers each day.
- **Water and electricity** — a **Utilities** menu (`U`) with wells, water towers and river pumps (each supplies a number of people), and power from water wheels, wind generators and coal power stations. Power runs along the streets on poles and wires to every road-connected building; when demand outstrips supply, some homes go dry or dark. Powered homes are happier, powered businesses earn more, and the grandest upgrades need electricity.
- **What it takes to work** — buildings need more than a road. Street lamps are electric and go dark without power; homes without it fall back to dim candlelight. Powered machinery (manufactories, foundries, paper mills, timber yards, furniture works, waterworks and pumping stations, hospitals, university laboratories) stops or slows without power, and shops and inns past their first levels do little trade after dark without electric light. Bakeries, taverns and inns, paper mills, cider works, clinics and almshouses, fire stations and fountains need running water; homes without it can't upgrade, expand or grow their family. Services, schools and utilities only work as well as they are staffed: a clinic with nobody in it cares for nobody, and a school has as many places as its teachers can manage. Stopped works go dark, their chimneys cold and their wheels still; a small badge marks every building that is missing something (red when it has stopped), the building panel says what is missing and what to do, and the Issues panel groups them ("2 workshops stopped — no power"). Early buildings — cottages, wells, farms, woodcutters, fishing huts, builders — need none of this. The rules for each type are in `NEEDS` in [`src/defs.js`](src/defs.js).
- **Expanding plots** — grow a building onto the plot beside or behind it: take empty land, buy a strip of a cottage's garden, or buy out and demolish a small neighbour (it asks twice, and shows the plot it would take). A double plot holds 50% more; with Great Plots researched it can grow again into a 2×2 estate. Bigger plots unlock bigger buildings, often more than one (a Country Mansion or Apartments, a High School or a College).
- **Demolition** — a crew pulls buildings down over time; the people inside move out first.
- **Joining and moving** — select a building next to another to **join** them on a double plot: two homes make a Terrace, a home and a shop a mixed-use **Shophouse** (shop below, flats above), two shops an Arcade, a tavern and a shop an Inn, a chapel and a school a Parish School, a clinic and a chapel or home an Almshouse, a well and a garden a Fountain Garden, two workshops or woodcutters a Joinery, and gardens, flowers and statues a Park. **Move** any building for a fee: builders take it down, a cart hauls the materials, and it goes back up on the new plot.
- **Streets** — buildings come forward into the verge of the street in front of them, while facing buildings and street corners stay clear of each other. Little paths run from each front door to the street, and villagers step out of real front doors and walk down them.
- **Gardens and land** — cottages sit at the front of their plot with a real back garden (vegetables, washing lines, sheds, hens). Big homes can buy a strip of a neighbouring cottage's garden; their owners pay the cottage's owners, both plots change size together and nothing ever overlaps.
- **Roads** — dirt paths, cobblestone and paved streets drawn as crisp surfaces with edging stones, plus wooden bridges over water with sloped approaches. Street lamps light up at night once the town has electricity.
- **Transit** — horse-drawn **coach lines** loop between coach stops. **Railways** have track (with curves), stations and steam trains. Trains never reverse, so a rail line needs a loop of track through its stations; trains drive forward around it, ease in and out of stations, and stop centred on each platform (up to three trains per loop). Villagers on long trips walk to a stop, wait there, ride, and pay a fare.
- **Animals** — a few deer and foxes roam the woods, rabbits the meadows, and mallards paddle on the lakes and river. Sheep, cows and chickens graze on the farms. They wander slowly and unpredictably, check the ground a step ahead so they steer around buildings, rarely cross roads, keep to their habitat, and bolt from villagers who get too close.
- **Villagers** — every resident has a name (families share a surname, and names rarely repeat), an age, an education, a home, maybe a job, a wage, savings, living costs, a family, friends (workmates, neighbours, classmates) and one or two personality traits (early riser, night owl, homebody, sociable, big spender, thrifty, outdoorsy, devout, hard-working…) that shape their daily routine. Press `P` for the **Villagers** directory: search, filter and sort everyone in town, then click a name to follow them. A building with several households lists its residents family by family.
- **Ages and schooling** — a year passes every two days. Babies are born, children grow up, young adults move out of their parents' home, older villagers retire and eventually die. Children go to the school that fits their age (elementary, middle, high school) and some young adults go on to college or university. Each school has a fixed number of seats. Better-educated workers earn more, and skilled jobs need them. A school upgrades two ways: **larger** (more seats at the same stage) or the **next stage** (Middle School → High School → College → University), and the later stages need a bigger plot.
- **Happiness** — click the happiness figure in the top bar to see what feeds it across the town (water, health care, schooling, safety, culture, electricity, scenery, shops, transport, smoke, taxes, crowding, work and road access): how many points each adds now, how many the average villager could gain, how many homes miss out, and a button that takes you to the fix. A home's panel lists its own gaps first with what to do, and each villager's page shows their mood and what would make them happier.
- **Windows and issues** — drag any window by its title bar and keep several open at once; `Esc` closes the front one. The **Issues** panel in the lower left (`I`) lists the town's bottlenecks: homes out of reach of services, school places short, power or water short, workplaces stopped or slowed for want of power, water or workers, sites waiting for builders, skilled jobs nobody can fill. Click an entry to jump to the buildings involved, one after another.
- **Economy** — money in dollars: taxes, shop visits, production, upkeep, a budget screen with charts, and RCI demand bars. New families arrive from the edge of the map when the village is attractive; unhappy households leave.
- **Time and seasons** — sunrise and sunset, lit windows, lamps, lantern-carrying villagers, fireflies, then spring blossom, autumn leaves and winter snow.
- **Speed and sandbox** — pause, or run at 1×, 2×, 4×, 8×, 16× or 32× (`[` and `]` step through them). Four sandbox switches, available for a new game or from Settings: unlimited money, unlock every building, upgrade without meeting needs, and instant construction.
- **Pop-ups** — money pop-ups, notices, hover tips, the name tag over a followed villager and the warning badges over buildings with no power, water or workers can each be switched off in Settings, or all at once with the bell button or `N`.
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
| `Enter` / `Backspace` | Finish / undo stops while creating a transit line |
| `Ctrl+S` · `Ctrl+Shift+S` | Quick save to the browser · download the save as `.json` |
| `Esc` / right-click | Cancel the tool or close the front window |

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
src/config.js, defs.js    tunables and the building catalogue
src/world/                terrain generation, world rules, demo-town grower
src/sim/                  economy & migration, villagers, transit, pathfinding
src/render/               renderer & pixel pass, sky, terrain painter,
                          procedural buildings, nature, particles, overlays
src/ui/                   HUD & dialogs, input/tools, thumbnails, sound
src/save/                 save format + local slots, Google Drive
scripts/check.js          headless smoke test
scripts/playtest.js       headless playtest bot
```

### Smoke test

```bash
npm install three@0.170.0 --no-save
node scripts/check.js
```

This builds every building model at every level, generates 25 valleys, simulates a town for six in-game days (walking villagers, a coach line, a train looping forward, a dead-end rail line refused), checks that animals never enter buildings or leave their habitat, checks the working rules (an unpowered manufactory makes nothing, street lamps go dark without power, a bakery and a clinic do less without water, a school without teachers has no places, and the Issues panel lists them), and round-trips a save.

### Playtest

```bash
node scripts/playtest.js 50 48 2024 economy
```

A bot plays a fresh town for a number of days (arguments: days, map size, seed, mode), building, laying roads, researching, upgrading, joining, expanding, moving and demolishing. Modes: `economy` (real money), `stress` (unlimited money, everything unlocked, lots of building every day), `chaos` (the same with instant construction, so far more upgrades, joins and moves) and `scale` (a big ready-grown town on an 80×80 map, to measure speed). Every day it audits the town (no overlapping buildings, no broken references, capacities respected, building sites always progressing, no builders idle while sites wait) and it prints anything wrong at the end, along with the day's budget and how many buildings are stopped or slowed and why. The bot researches water and power once the town grows, saves up for generators, puts wells by trades that need water, and builds homes rather than more of a workplace that already stands empty.

## Credits

- [three.js](https://threejs.org/) (MIT) for rendering and post-processing.
- Fonts: [Pixelify Sans](https://fonts.google.com/specimen/Pixelify+Sans) and [Silkscreen](https://fonts.google.com/specimen/Silkscreen) (OFL). Icons: [Material Symbols](https://fonts.google.com/icons) (Apache 2.0).
- Visual style inspired by *Metropolis 1998* and the classic isometric city builders.

## License

[MIT](LICENSE)
