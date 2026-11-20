# AIRE: a product showcase concept

A scroll-told launch site for an invented fragrance, Cumulus Nº 01. A day passes as you scroll: dawn over a sea of cloud, a bright morning, a warm studio, pearl light, golden hour, then sunset on a stone plinth.

Built with three.js, GSAP ScrollTrigger and Lenis. A concept by Art Halimi Studio.

## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # static site in dist/
```

## What's inside

- **Opening**: the bottle rises out of the cloud on a spring; the cloud parts around it.
- **Glass** (`src/gl/bottle.js`): a cushion-shaped body with thick walls and a heavy base. A custom shader refracts the scene through two surfaces (front, then the back face or the inner cavity wall), with dispersion, Fresnel reflections and a sun glint.
- **Liquid** (`src/gl/liquid.js`): the surface stays level with gravity plus the bottle's own acceleration, sloshes on a damped spring, and is placed every frame so the volume never changes. Spinning the bottle pulls the surface into a whirlpool. Bubbles rise along true up at a speed that grows with their size.
- **Sky and clouds** (`src/gl/sky.js`, `src/gl/clouds.js`): six palettes, one per chapter. Reflections are re-captured as the light changes. About 4,000 cloud puffs lit from the sun's side, with silver linings.
- **Finish** (`src/gl/post.js`): depth of field, sun rays, bloom, a neutral tone map and grade.
- **Interaction**: drag the bottle to spin it, pop the bubbles, and the clock in the corner shows the time of day.

There are no image or model files: the bottle, stopper, clouds, sky and stone are all generated in code.
