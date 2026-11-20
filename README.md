# AIRE: a product showcase concept

A scroll-told launch site for an invented fragrance, Cumulus Nº 01. A glass bottle rises through real-time clouds; the scent notes arrive as bubbles you can pop.

Built with three.js, GSAP ScrollTrigger and Lenis. A concept by Art Halimi Studio.

## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # static site in dist/
```

## What happens on scroll

1. **Hero**: the bottle floats in cloud, the wordmark refracts through the glass.
2. **Rise**: the camera climbs through the cloud layer and comes out above it.
3. **Idea**: the bottle steps aside for the story.
4. **Notes**: three iridescent bubbles carry the notes. Click any bubble to pop it.
5. **Craft**: a macro pass over the glass.
6. **Finale**: the bottle settles on a cloud in warm light, with the pre-order button.

The bottle, clouds, bubbles and sky are generated in code (`src/gl/`). There are no image or model files.
