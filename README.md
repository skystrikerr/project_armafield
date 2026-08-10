# Thronglets

A colony of little yellow voxel creatures that live, learn and build on their
own, rendered in three.js. Inspired by the Tamagotchi-like creatures in the
*Black Mirror* episode "Plaything" — an unaffiliated fan project.

Nothing about the colony is scripted. Every creature scores its own drives once
a second and acts on whichever shouts loudest, so where they settle, what they
build, who they pair off with and whether the colony thrives are all emergent.
Watch long enough and you'll see a village appear, generations turn over, and
inherited traits drift across the population.

![the colony from above](docs/colony.png)

## Running it

```bash
npm install
npm run dev      # http://localhost:5173
```

`npm run build` produces a static site in `dist/` — it's a pure client-side
app, so that folder can be served from anywhere.

## Playing

The sim opens on a top-down view of the island.

| Input | Does |
| --- | --- |
| Drag | Orbit the camera |
| Scroll / pinch | Zoom |
| Click a creature | Inspect its needs, traits and current thought |
| Click it again | Pet it |
| `1` / `2` / `3` | Inspect · drop food · plant a tree |
| `space` | Pause |
| `f` | Focus the selected creature |

Speed runs up to 8×, and the refresh button in the corner grows a brand new
island. `pixel` and `shadows` toggle the look and the expensive lighting.

## What the creatures actually do

Each one carries hunger, thirst, tiredness, loneliness and a need to play,
plus inherited traits for speed, size, curiosity, sociability, industry and
lifespan. Once a second they score every option available to them — eat,
drink, sleep, socialise, play, gather wood, build, court a partner, wander —
and commit to the winner.

- They **remember** where they found food and water, and hand those memories
  over when they stop to chat, so a good grove spreads by word of mouth.
- A shared knowledge pool, **the Throng**, grows with population,
  conversations and finished buildings. Crossing a threshold teaches the
  colony something new to make: cairn → hut → grove plot → watchtower →
  monolith.
- **Building** is real work: wood gets chopped from trees, carried to the
  site and stacked one block at a time. Finished walls are solid.
- Two well-fed adults who spend enough time together lay an **egg**, and the
  baby inherits a mix of both genomes with a little mutation — including a hue
  shift you can see. It grows through child and adult into an elder, and
  eventually dies of old age.

There's a per-creature inspector for all of this, and a colony log in the
corner recording births, deaths and finished buildings.

## Layout

```
src/
  Thronglets.tsx        the page: canvas + HUD
  thronglets/
    colony.ts           the simulation — needs, AI, building, breeding (no three.js)
    scene.ts            rendering and input
    models.ts           every model, authored voxel by voxel
    voxel.ts            voxel grid → geometry baker
    world.ts            island heightmap, ponds, flora scattering
    emotes.ts           pixel-art emote icons drawn at runtime
    random.ts           seeded RNG
```

[src/thronglets/README.md](src/thronglets/README.md) goes into how the AI and
the renderer work.

## Built with

React + TypeScript, Vite, Tailwind, three.js. No art assets — every model,
texture and icon is generated in code.
