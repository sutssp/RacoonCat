# Onigiri Dash

A Game Boy-style pixel platformer. The world is black and white — the only
colourful being is you, a little raccoon. Run, jump enemies, collect rice
balls, sip milk to heal, and grab the star at the end of each of the 5
stages (rural village → town square → forest → seaside → the city).

- 3 hearts of health; milk bottles restore one heart
- Rice balls score points; the stage star clears the stage
- Chiptune SFX + per-stage music (WebAudio, no assets needed)
- Keyboard: ← → / A D move, Space / Z / ↑ jump, P pause
- Touch controls on mobile

## Run locally

```bash
npm install
npm run dev
```

## Deploy to GitHub Pages (free)

The repo already contains a GitHub Actions workflow
(`.github/workflows/deploy.yml`) that builds the game with the correct
base path and deploys it to Pages on every push to `main`.

### One-time setup (about 2 minutes)

1. Create an empty repo on github.com (e.g. `onigiri-dash`).

2. Push this project to it:

   ```bash
   git init
   git add .
   git commit -m "onigiri dash"
   git branch -M main
   git remote add origin https://github.com/<your-username>/onigiri-dash.git
   git push -u origin main
   ```

   (If this project is already a git repo, skip `git init` / `git commit`.)

3. On the repo page on GitHub: **Settings → Pages → Source → “GitHub Actions”**.

4. Watch the workflow run under the **Actions** tab. When it goes green,
   your game is live at:

   ```
   https://<your-username>.github.io/onigiri-dash/
   ```

That's it. Every future `git push` to `main` rebuilds and redeploys
automatically, and you can also trigger a deploy manually from
Actions → “Deploy to GitHub Pages” → Run workflow.

## Build for other hosts

```bash
npx vite build                 # output in dist/ (base = /)
npx vite build --base=./       # relative base: works in subfolders, Netlify Drop, itch.io, etc.
```

`dist/` is a fully static site — drag it onto Netlify Drop, Vercel,
Cloudflare Pages, or zip it for itch.io.
