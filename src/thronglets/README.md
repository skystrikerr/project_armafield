# Thronglets — an autonomous voxel colony

A self-running three.js simulation. Nothing in it is
scripted: a handful of yellow creatures wake up on an island, and everything
that follows — where they settle, what they build, who they pair off with,
whether the colony grows or dwindles — falls out of each individual scoring its
own drives and acting on the loudest one.

## Files

| File | What it holds |
| --- | --- |
| `voxel.ts` | Voxel grid → `BufferGeometry` baker. Culls hidden faces, bakes flat pixel-art colours into vertex colours. |
| `models.ts` | Every model in the world, authored voxel by voxel: the thronglet (body + head as separate pieces so the head can nod), eggs, apple trees, bushes, the enamel tub. |
| `world.ts` | Island heightmap, ponds, shoreline colouring, and the scatter passes that place trees, bushes and tubs. |
| `colony.ts` | The simulation. No three.js in here — agents, needs, utility AI, building, breeding, the day/night clock. |
| `emotes.ts` | Pixel-art emote icons drawn onto a canvas at runtime (no image assets). |
| `scene.ts` | Rendering and input: instanced meshes, the sun's arc, picking, camera. |
| `random.ts` | Seeded RNG, so a given seed always grows the same island. |

The page that mounts it all is `src/Thronglets.tsx`.

## How a thronglet decides what to do

Every ~1s each agent scores a set of competing drives and takes the highest:

```
eat       hunger²  × 1.9
drink     thirst²  × 2.0
sleep     energy^2.4 × (night ? 1.15 : 0.5)
socialize social^1.6 × sociability
play      joy^1.8
gather    industry × calm     (when the current build site is short of wood)
build     industry × calm     (when the site has wood and unplaced blocks)
mate      sociability × calm  (adults, fed, off cooldown)
wander    0.1 + curiosity × 0.1
```

`calm = 1 - max(hunger, thirst)²` — hunger and thirst suppress work, tiredness
deliberately does not (it bids for sleep on its own; folding it in here left
nobody willing to work by mid-afternoon). A hysteresis check keeps an agent
from abandoning a job for a marginally better one, and a 30-second watchdog
abandons any goal that turns out to be unreachable.

Agents remember where they found food and water, and hand those memories over
when they stop to socialise — so knowledge of a good grove spreads through the
colony by word of mouth.

Neighbour lookups (the crowd separation that keeps everyone from stacking into
one pixel) go through a spatial grid rebuilt each tick, so a colony of a
hundred-odd costs a handful of cell lookups per agent rather than a scan of
everybody.

## The Throng

A shared knowledge pool grows with population, conversations, blocks laid and
finished buildings. Crossing a threshold unlocks the next thing the colony
knows how to make:

| Knowledge | Unlocks |
| --- | --- |
| 0 | Cairn |
| 25 | Hut |
| 90 | Grove plot |
| 220 | Watchtower |
| 450 | Monolith (feeds knowledge back, fastest of the lot) |

Housing comes first — a colony that has outgrown its huts builds another one —
and otherwise the planner leans towards the newest trick without making
everything a monolith. Structures rise one block at a time as wood is carried
in, and finished walls are solid: agents steer around them.

## Breeding and inheritance

Two well-fed adults who spend long enough together lay an egg, which hatches
into a baby carrying a mix of both genomes (speed, size, curiosity,
sociability, industry, lifespan, and a hue shift that tints the instance
colour) with a little mutation. Babies grow through child and adult stages into
elders and eventually die of old age, so the colony genuinely turns over
generations — the stats bar tracks which one you're on.

## Reading what's happening

- A thronglet hauling wood carries a visible bundle of logs, so the gather →
  build loop is legible without opening the inspector.
- The inspector names each creature's parents; the colony log records who
  hatched from whom, who laid the last block, and who died.
- The HUD charts population over the colony's life — booms, plateaus and the
  dips as a generation ages out.

## Rendering notes

- Everything draws through `InstancedMesh`: two per creature (body, head),
  plus eggs, blocks, apples, trees, bushes and tubs.
- The pixel look comes from rendering at a fraction of device resolution and
  letting the canvas upscale with `image-rendering: pixelated`.
- Selection uses a back-face outline shell plus a ground ring.
- Face winding matters: the top and bottom voxel faces have to be wound
  counter-clockwise or they get back-face culled and you can see straight
  through every model.

## Interacting

Drag to orbit, scroll to zoom, click a creature to inspect it (click again to
pet). `1/2/3` switch between inspect, dropping food and planting a tree,
`space` pauses, `f` focuses the selected creature.
