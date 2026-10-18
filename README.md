# Hearthvale

A little isometric village builder that runs in your browser — pixel-art rendering in the spirit of *Metropolis 1998* and the late-90s city sims, with a living village of tiny people going about their day.

**Play it:** https://daniuluo.github.io/hearthvale/

## Features

- **Pixel-art isometric 3D** — the scene is rendered in real 3D (three.js), then drawn at low resolution with depth/normal outlines and crisp pixel upscaling, using a classic 2:1 isometric camera with a single fixed angle. Settings let you choose the pixel size or switch to a smooth, antialiased renderer with ambient occlusion.
- **2D top-down map view** — press `T` or the `2D` button to swing the camera straight down for a grid-aligned map; zoom in and out with the wheel or the `+`/`−` buttons.
- **Procedural valley** — every seed grows a different landscape: rivers, lakes, hills, forests and rocky slopes, shown as a diorama. Pick a size: Small 32×32, Medium 48×48, Large 64×64 or Huge 80×80. Terraform by raising, lowering and levelling land, and plant trees.
- **Organic village** — no two buildings look the same. Each one is generated from a seed: walls, roofs (thatch, tile, slate, shingle), half-timbering, chimneys, dormers, shutters, flower boxes, gardens and fences. Paths are worn into the grass and meander a little.
- **Upgradable buildings** across homes, commerce (market, bakery, tavern), industry (farm, woodcutter, fishery, workshop, builder's yard), services (well, clinic, school, watch, chapel, town hall), and parks and decor. Most buildings have three or four levels, up to a Market Hall, Hospital, Academy or Minster. Upgrades need happiness and service coverage, and each option shows what changes (homes, jobs, earnings, reach, upkeep…) before you commit.
- **Branching homes** — a Cottage becomes a Family House, which then goes one of two ways: a **grand home** (Villa → Manor House → Grand Manor: few, wealthy residents who pay much more tax) or **flats** (Townhouse Flats → Tenement → Mansion Block: many households on one plot). Pick a **style** for any home or shop upgrade — timber frame, limewash, painted, brick, stone or clapboard — and preview it in town before building.
- **Construction** — nothing appears instantly. Builders from the **Builder's Yard** walk to each site and work round the scaffolding; a building goes up in stages (pegged-out plot and materials, foundations, walls rising, roof) and only progresses while builders are there. With no builders, slow hired hands come from the next village. A sandbox switch builds instantly.
- **Research** — press `K` to pick projects (Carpentry, Masonry, Brickmaking, Shopkeeping, Hydraulics, Architecture, Town Living, Electricity, Railways, Steam Power, Civic Planning, Tall Buildings). Research points come from the town hall, schools, chapels and your villagers each day; projects unlock buildings, upgrade levels, the villa and flats paths, joined buildings and building styles.
- **Water and electricity** — a **Utilities** menu (`U`) with wells, water towers and river pumps (each supplies a number of people), and power from water wheels, wind generators and coal power stations. Power runs along the streets on poles and wires to every road-connected building; when demand outstrips supply, some homes go dry or dark. Powered homes are happier, powered businesses earn more, and the grandest upgrades need electricity.
- **Expanding plots** — grow a building onto the plot beside or behind it: take empty land, buy a strip of a cottage's garden, or buy out and demolish a small neighbour (it asks twice, and shows the plot it would take). A double plot holds 50% more.
- **Demolition** — a crew pulls buildings down over time; the people inside move out first.
- **Joining and moving** — select a home next to another home or a shop to **join** them into a Terrace or a mixed-use **Shophouse** (shop below, flats above) on a double plot. **Move** any building for a fee: builders take it down, a cart hauls the materials, and it goes back up on the new plot.
- **Streets** — buildings come forward into the verge of the street in front of them, while facing buildings and street corners stay clear of each other. Villagers step out of real front doors and walk down the garden path.
- **Gardens and land** — cottages sit at the front of their plot with a real back garden (vegetables, washing lines, sheds, hens). Big homes can buy a strip of a neighbouring cottage's garden; their owners pay the cottage's owners, both plots change size together and nothing ever overlaps.
- **Roads** — dirt paths, cobblestone and paved streets drawn as crisp surfaces with edging stones, plus wooden bridges over water with sloped approaches. Street lamps light up at night.
- **Transit** — horse-drawn **coach lines** loop between coach stops. **Railways** have track (with curves), stations and steam trains. Trains never reverse, so a rail line needs a loop of track through its stations; trains drive forward around it, ease in and out of stations, and stop centred on each platform (up to three trains per loop). Villagers on long trips walk to a stop, wait there, ride, and pay a fare.
- **Animals** — a few deer and foxes roam the woods, rabbits the meadows, and mallards paddle on the lakes and river. Sheep, cows and chickens graze on the farms. They wander slowly and unpredictably, check the ground a step ahead so they steer around buildings, rarely cross roads, keep to their habitat, and bolt from villagers who get too close.
- **Villagers** — every resident has a name, a home, maybe a job, a wage, savings, living costs, a family, friends (workmates, neighbours, playmates) and one or two personality traits (early riser, night owl, homebody, sociable, big spender, thrifty, outdoorsy, devout, hard-working…) that shape their daily routine. Press `P` for the **Villagers** directory: search, filter and sort everyone in town, then click a name to follow them.
- **Economy** — taxes, shop visits, production, upkeep, a budget screen with charts, and RCI demand bars. New families arrive from the edge of the map when the village is attractive; unhappy households leave.
- **Time and seasons** — sunrise and sunset, lit windows, lamps, lantern-carrying villagers, fireflies, then spring blossom, autumn leaves and winter snow.
- **Speed and sandbox** — pause, or run at 1×, 2×, 4×, 8×, 16× or 32× (`[` and `]` step through them). Four sandbox switches, available for a new game or from Settings: unlimited coins, unlock every building, upgrade without meeting needs, and instant construction.
- **Pop-ups** — coin pop-ups, notices, hover tips and the name tag over a followed villager can each be switched off in Settings, or all at once with the bell button or `N`.
- **Saves** — in this browser (with an autosave every day), as plain `.json` files, or to **Google Drive**. **Download save (.json)** sits at the top of the Save window (or press `Ctrl+Shift+S`), every saved slot has its own download button, and you can drop a `.json` save onto the game to load it.

## Controls

| Input | Action |
| --- | --- |
| Right / middle drag, or left drag with Select | Pan |
| Mouse wheel, `+` / `−` | Zoom |
| `W` `A` `S` `D` / arrow keys | Pan |
| `T` | Toggle 2D top-down / isometric |
| `1` – `8`, `R`, `X` | Tool menus: select, homes, commerce, industry, services, parks, transit, terrain · roads · demolish |
| `Tab` | Flip a building's entrance before placing |
| `Space` | Pause / resume |
| `[` / `]` | Slower / faster |
| `O` · `B` · `L` · `P` · `H` | Overlays · budget · transit lines · villagers · help |
| `N` | Hide / show pop-ups |
| `U` · `K` | Utilities menu · research |
| `Enter` / `Backspace` | Finish / undo stops while creating a transit line |
| `Ctrl+S` · `Ctrl+Shift+S` | Quick save to the browser · download the save as `.json` |
| `Esc` / right-click | Cancel the tool or close a window |

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
```

### Smoke test

```bash
npm install three@0.170.0 --no-save
node scripts/check.js
```

This builds every building model at every level, generates 25 valleys, simulates a town for six in-game days (walking villagers, a coach line, a train looping forward, a dead-end rail line refused), checks that animals never enter buildings or leave their habitat, and round-trips a save.

## Credits

- [three.js](https://threejs.org/) (MIT) for rendering and post-processing.
- Fonts: [Pixelify Sans](https://fonts.google.com/specimen/Pixelify+Sans) and [Silkscreen](https://fonts.google.com/specimen/Silkscreen) (OFL). Icons: [Material Symbols](https://fonts.google.com/icons) (Apache 2.0).
- Visual style inspired by *Metropolis 1998* and the classic isometric city builders.

## License

[MIT](LICENSE)
