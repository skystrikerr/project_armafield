# Thronglets

A colony of little yellow voxel creatures that live, learn and build on their
own, rendered in three.js. Inspired by the Tamagotchi-like creatures in the
*Black Mirror* episode "Plaything" — an unaffiliated fan project.

The island runs a bit over 140 units across, with five or six hundred apple
trees, a couple of dozen ponds, room for ten clans and up to three hundred and
fifty creatures at once.

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

## Peoples, gods and war

The island fills with clans. Each is a village, a bloodline and a religion at
once — a god, a sacred thing, a creed, and a banner colour its members wear as
a tint. They build their villages outward in rings from where they settled,
gather at their shrine at dawn and dusk, carry their god to neighbours who
have not heard of it, split when they grow too big to agree with themselves,
and eventually come to blows over whose god is real. Most fights end with
somebody running. Grief is the only thing that reliably ends a war.

The peoples panel lists who is alive, what they worship, and how each clan
feels about the others; click one to fly to its village.

## Weather, and working things out

The island turns through four seasons on an eight-day year. Snow settles in
the cold, whitens the trees, stops things growing and melts when the warmth
comes back. Warmth falls at night, and an exposed creature on a cold night
burns energy, loses condition, and cannot sleep through it.

That pressure is what makes them invent. Nothing is unlocked by a progress
bar — somebody works a thing out because of where they happen to be standing,
and it is logged with their name:

> **First fire on the island — Snool of the Cinderhollow.**
> *Snool of the Cinderhollow works out fire on a bitter night.*

Fire, then cooking at a fire, then baskets from somebody who has hauled enough
loads to resent it, then burial from a clan that has buried enough of its own.
Hearths cannot be built by a people who have not worked fire out.

Knowing a word is personal too: each creature only knows what it has said or
heard, and picks words up one at a time from whoever it is standing next to.
A coinage starts with one speaker and spreads through the clan — and slides
back when children are born who have not heard it yet. The first word, the
first snow, the first rain: each logged as news once, and never again.

## An island with materials

Four kinds of tree, placed where they belong: palms along the shore, pines on
the high ground, oaks through the deep inland, apples everywhere temperate.
Only apples and palms fruit — oak and pine are what you build from. Boulders
outcrop in fields and hold stone that does not grow back.

Every block in a building is timber, stone or free thatch, so gatherers fetch
whichever their town is short of, and quarrying stone is slower than chopping
wood. A town that fills its rings breaks ground on a second settlement nearby.
Wells go by the water; granaries get filled on good days and emptied on bad
ones.

Each clan tallies what has actually killed its people and builds against it —
two deaths from thirst and they dig a well before anything else, three raids
and they put up a watchtower. A clan on good ground never bothers with any of
it.

Creatures come in seven colour schemes, inherited from a parent with a small
chance of something new, so towns drift towards a look of their own.

## A working civilisation

Nobody is assigned a job. Each creature settles into forager, builder,
quarrier, farmer, priest or warrior from its own traits crossed with what its
town is short of, and reconsiders as things change — a site short of stone
turns foragers into quarriers, three raids and a clan starts producing
warriors.

Grove plots yield only if a farmer works them, and tended ground beats a wild
grove by a mile: that is the step that lets a town outgrow the trees around
it. Towns are named in their founders' own language the day they are founded.

Roads are not planned. Ground remembers being walked on, wear fades where
nobody goes, and the routes that survive show up as bare earth between the
places people actually go.

Clans on good terms send caravans of food to each other, which raises
relations by more than proximity ever does and carries a word across between
their languages on the way — the alternative to the other thing two peoples do
when they meet.

## Their own language

Each clan invents its own words. It gets a sound system when it is founded,
coins words for whatever its members actually do, and swaps words with
neighbouring clans — where they come out changed, run through the borrower's
own sounds. Words drift as they travel: in one run `shongmir` (sleep) was
borrowed as `sheengmir` and passed on as `sheengming`, while `moungou` (food)
crossed three villages intact. The peoples panel lists every clan's
vocabulary, marks the loanwords, and reports how far their tongues have
drifted apart.

## Picking them up

Press and hold on a creature and it dangles from the cursor. Drag it anywhere
and let go — the camera stays put while you have hold of one. Dropped in water
it panics out; dropped far from home it turns round and walks back.

## The Oracle: bring your own model

There are two modes, and the default needs nothing: **no model**, where they
name their own gods, word their own creeds and invent their own vocabulary
procedurally. Or connect a **language model** and it writes the scripture
instead. Open the brain icon and pick:

| Provider | Endpoint | Notes |
| --- | --- | --- |
| Local (Ollama) | `http://localhost:11434` | `ollama serve`, `ollama pull llama3.2`. Start with `OLLAMA_ORIGINS=*` so the page may call it. No key needed. |
| OpenAI-compatible | `/v1/chat/completions` | OpenAI, LM Studio, vLLM, OpenRouter. |
| Anthropic | `/v1/messages` | Called from the browser with the direct-browser-access header. |

It can name the gods and word their creeds, speak for whichever creature you
have selected, read a clan's invented language back to you, or turn the event
log into a chronicle. It is off by default,
every piece of text has a procedural fallback, and the endpoint, model and key
stay in your browser's localStorage.

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
  colony something new to make: cairn → hut → shrine → grove plot →
  watchtower → monolith.
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
