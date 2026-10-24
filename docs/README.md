# Device Floorplan documentation

The user guide, built with [VitePress](https://vitepress.dev) and published to GitHub Pages
by `.github/workflows/docs.yml` on every push to `main` that changes `docs/`.

```bash
cd docs
npm install
npm run dev      # live preview at http://localhost:5173/ha-device-floorplan/
npm run build    # static site in docs/.vitepress/dist
```

One-time setup on GitHub: **Settings → Pages → Source: GitHub Actions**.
If the repository is not called `ha-device-floorplan`, change `base` in `.vitepress/config.mts`.
Also replace the `https://github.com/` placeholders (GitHub icon, "Suggest a change") with the repository URL.

Screenshots live in `public/screens/`, the sketch guide images in `public/guide/`.
