# Guide videos

Records the short how-to videos of the user guide ([`docs/guide/`](../../docs/guide/)) from the running
studio: Edge opens the admin in Persian, does the steps, and draws captions, click markers and
highlight boxes. Videos go to `docs/guide/media/` (WebM, 1280×720), which is **not in Git**: record
them again on any machine with the command below.

## Run
Needs the studio running (http://admin.localhost), Microsoft Edge, and once:
```bash
cd tools/guide-videos
npm install
npx playwright-core install ffmpeg
```
Then:
```bash
node record.mjs                    # every scene
node record.mjs payment-gateway    # one scene
```
Signs in with `CONTROL_ADMIN_EMAIL` / `CONTROL_ADMIN_PASSWORD` from `deploy/.env`.

## Add a video
1. Copy `scenes/payment-gateway.mjs` to `scenes/<name>.mjs`.
2. `reset(api)` puts the studio in the state the video starts from; it runs again afterwards, so
   the studio is left as it was. Use a sample site (e.g. `mobl-test`), never a client's data.
3. `play(guide)` does the steps with `open`, `caption`, `click`, `type`, `show`, `highlight`, `pause`
   (see `lib.mjs`). Find elements by their Persian text or role, as the viewer sees them.
4. Record it and add the page in `docs/guide/` with `<video src="media/<name>.webm" controls>`.

When the panel changes, record again: a scene that can no longer find a button fails with the
name of what it was looking for.
