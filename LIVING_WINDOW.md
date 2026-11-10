# Living Window - P1 observer

`/window/` is a deliberately narrow, read-only view of one Kinstead town. It
is not a second builder and it does not connect to multiplayer.

It must be served over HTTP, not opened as a `file://` URL. From the project
folder, run `powershell -ExecutionPolicy Bypass -File serve.ps1`, then open
`http://localhost:8080/window/`. Both local routes show this instruction
instead of inert controls when opened directly from disk.

## What opens

- The first visit creates the same local town every time: a 44 x 44 hilly
  valley, seed `442024`, name **Living Window**, and town id
  `livingwindow44`. The regular demo-town grower supplies its initial streets,
  buildings, residents, and activity.
- The normal renderer and simulation run at the standard Kinstead pace: one
  game day is eight real minutes at 1x. The compact plaque shows the town,
  day/time, season, population, and the simulation's local weather state.
- It advances only while the page is running. A closed or suspended tab does
  not keep simulating, and P1 has no real-world clock, weather feed, server,
  or external data source.

## Safety and persistence contract

- All builder controls are visually removed; canvas input is disabled; and the
  command dispatcher rejects observer commands. The builder route remains
  `/play/`.
- The observer never reads or writes Kinstead's legacy save slots. Its one
  browser-local record is the versioned envelope `living-window.v1`
  (`format: "living-window"`, `version: 1`).
- Fresh and valid observer towns are saved under that key. A malformed,
  unsupported, or newer record is left byte-for-byte intact. In that case the
  page shows a temporary scene but deliberately will not overwrite the record.
- This is an offline, device-local preview. Clearing browser site data clears
  its observer save; it does not create an account or cloud backup.

## Development checks

Run `npm install three@0.170.0 --no-save`, then `npm run window-check` for the
focused P1 boundary checks. `npm run check` includes those checks with the
existing Kinstead engine, multiplayer, and website checks.
