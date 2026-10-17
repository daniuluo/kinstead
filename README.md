# Hearthvale

A little isometric village builder that runs in your browser — pixel-art rendering in the spirit of *Metropolis 1998* and the late-90s city sims, with a living village of tiny people going about their day.

**Play it:** https://daniuluo.github.io/hearthvale/

## Features

- **Pixel-art isometric 3D** — the scene is rendered in real 3D (three.js), then drawn at low resolution with depth/normal outlines and crisp pixel upscaling, using a classic 2:1 isometric camera with a single fixed angle. Settings let you choose the pixel size or switch to a smooth, antialiased renderer with ambient occlusion.
- **2D top-down map view** — press `T` or the `2D` button to swing the camera straight down for a grid-aligned map; zoom in and out with the wheel or the `+`/`−` buttons.
- **Procedural valley** — every seed grows a different landscape: rivers, lakes, hills, forests and rocky slopes, shown as a diorama. Pick a size: Small 32×32, Medium 48×48, Large 64×64 or Huge 80×80. Terraform by raising, lowering and levelling land, and plant trees.
- **Organic village** — no two buildings look the same. Each one is generated from a seed: walls, roofs (thatch, tile, slate, shingle), half-timbering, chimneys, dormers, shutters, flower boxes, gardens and fences. Paths are worn into the grass and meander a little.
- **Upgradable buildings** across homes, commerce (market, bakery, tavern), industry (farm, woodcutter, fishery, workshop), services (well, clinic, school, watch, chapel, town hall), and parks and decor. Homes have five levels: Cottage, Family House, Townhouse, Manor House and Grand Manor. Most other buildings have three or four levels, up to a Market Hall, Hospital, Academy or Minster. Upgrades need happiness and service coverage.
- **Roads** — dirt paths, cobblestone and paved streets, plus wooden bridges over water. Street lamps light up at night.
- **Transit** — horse-drawn **coach lines** loop between coach stops. **Railways** have track (with curves), stations, and a push-pull steam train that shuttles end to end and stops centred on each platform. Villagers on long trips walk to a stop, wait there, ride, and pay a fare.
- **Animals** — deer and foxes roam the woods, rabbits the meadows, and mallards paddle on the lakes and river. Sheep, cows and chickens graze on the farms. Animals steer around buildings, mostly avoid roads and track, keep to their habitat, and bolt from villagers who get too close.
- **Villagers** — every resident has a name, a home and maybe a job. They follow daily routines: work, school, shopping, the tavern, strolls in the park, and going home at night. Click anyone to see what they're doing, or follow them around.
- **Economy** — taxes, shop visits, production, upkeep, a budget screen with charts, and RCI demand bars. New families arrive from the edge of the map when the village is attractive; unhappy households leave.
- **Time and seasons** — sunrise and sunset, lit windows, lamps, lantern-carrying villagers, fireflies, then spring blossom, autumn leaves and winter snow.
- **Speed and sandbox** — pause, or run at 1×, 2×, 4×, 8×, 16× or 32× (`[` and `]` step through them). Three sandbox switches, available for a new game or from Settings: unlimited coins, unlock every building, and upgrade without meeting needs.
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
| `O` · `B` · `L` · `H` | Overlays · budget · transit lines · help |
| `Enter` / `Backspace` | Finish / undo stops while creating a transit line |
| `Ctrl+S` · `Ctrl+Shift+S` | Quick save to the browser · download the save as `.json` |
| `Esc` / right-click | Cancel the tool or close a window |

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

This builds every building model at every level, generates 25 valleys, simulates a town for six in-game days (walking villagers, a coach line, a shuttling train), checks that animals never enter buildings or leave their habitat, and round-trips a save.

## Credits

- [three.js](https://threejs.org/) (MIT) for rendering and post-processing.
- Fonts: [Pixelify Sans](https://fonts.google.com/specimen/Pixelify+Sans) and [Silkscreen](https://fonts.google.com/specimen/Silkscreen) (OFL). Icons: [Material Symbols](https://fonts.google.com/icons) (Apache 2.0).
- Visual style inspired by *Metropolis 1998* and the classic isometric city builders.

## License

[MIT](LICENSE)
