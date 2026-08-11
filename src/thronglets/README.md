# Thronglets — an autonomous voxel colony

A self-running three.js simulation. Nothing in it is
scripted: a handful of yellow creatures wake up on an island, and everything
that follows — where they settle, what they build, who they pair off with,
whether the colony grows or dwindles — falls out of each individual scoring its
own drives and acting on the loudest one.

The island is a bit over 140 units across, carries five or six hundred apple
trees, a couple of dozen ponds and pools, and supports up to ten clans and
around three hundred and fifty creatures at once.

## Files

| File | What it holds |
| --- | --- |
| `voxel.ts` | Voxel grid → `BufferGeometry` baker. Culls hidden faces, bakes flat pixel-art colours into vertex colours. |
| `models.ts` | Every model in the world, authored voxel by voxel: the thronglet (body + head as separate pieces so the head can nod), eggs, apple trees, bushes, the enamel tub. |
| `world.ts` | Island heightmap, ponds, shoreline colouring, and the scatter passes that place trees, bushes and tubs. |
| `colony.ts` | The simulation. No three.js in here — agents, needs, utility AI, building, breeding, the day/night clock. |
| `emotes.ts` | Pixel-art emote icons drawn onto a canvas at runtime (no image assets). |
| `scene.ts` | Rendering and input: instanced meshes, the sun's arc, picking, camera. |
| `clans.ts` | Clans, faiths, creeds and the relations between peoples. Pure data and drift rules. |
| `language.ts` | Invented tongues: per-clan sound systems, coining, borrowing, sound change, drift. |
| `llm.ts` | Optional language-model bridge: provider clients, prompts, config in localStorage. |
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
worship   spirit^1.7 × devotion × (dawn or dusk ? 1.9 : 0.8)
gather    industry × calm     (when the current build site is short of wood)
build     industry × calm     (when the site has wood and unplaced blocks)
mate      sociability × calm  (adults, fed, off cooldown)
raid      aggression × zeal   (adults over 0.45 temper, only during a war)
flee      2.2                 (whenever health drops below half)
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

## Peoples, faith and war

A clan is a village, a bloodline pool and a religion at once.

- **Villages.** Every clan builds outward in rings from the spot it settled, so
  a place grows instead of scattering. Settlement picks ground within reach of
  water and trees — a clan founded on a dry hill starves — and keeps thirty
  units clear of every other village, so the island fills up with distinct
  places rather than one sprawl. Villagers stay near home unless they are
  curious, which is what keeps them meeting each other.
- **Faith.** Each clan has a god, a sacred thing (the sun, water, the grove,
  stone, the throng, the egg) and a creed. Devotion builds up like any other
  need and is spent at the clan's shrine; at dawn and dusk the whole village
  converges on it.
- **Conversion.** Wherever two clans rub shoulders, the more devout may carry
  their god home with the other — defections are logged, and they make the
  losing clan resent the winner.
- **Schism.** A clan that grows past thirty stops agreeing with itself. Its
  most devout member walks out with whoever is standing nearby and founds a
  new village around a sharper version of the old god. Heresies run hotter
  than the orthodoxy they left, which is what turns theology into feuds.
- **War.** Relations drift on shared gods, heresy and how crowded the island
  is. Past a threshold a feud is declared and commits both sides. Warriors —
  adults with the temper for it — march on the rival village, fight whoever
  they meet, and pull stones out of the enemy's shrine when there is nobody
  left to fight. Most fights end with somebody running; it is the chasing
  down afterwards that kills. Grief is the only thing that reliably ends a
  war.

## Their own language

Every clan gets its own sound system when it is founded — a handful of onsets,
vowels and codas drawn at random, and a typical word length. Nothing is
authored beyond that.

- **Coining.** When a creature does something worth naming — eats while
  starving, drinks, prays, chops wood, lays a block, meets a stranger, kills —
  it may invent a word for it, if its clan has none. The coiner is recorded and
  the log names them: *Pux of the Ashhearth calls it "moungou" — food.*
- **Borrowing.** Where two clans stand close enough to talk they swap a word.
  It comes out of the borrower's mouth changed, run through their own sound
  system: a vowel swapped, an ending lost, a first consonant hardened, a
  syllable doubled.
- **Drift.** So words travel and deform. In one run `shongmir` (sleep) was
  borrowed as `sheengmir` and passed on again as `sheengming`, while `moungou`
  (food) survived three villages intact. The peoples panel marks borrowed
  words with an asterisk and reports how far each pair of tongues has drifted
  apart.

Words are held with a strength that use reinforces, so a firmly-held word
resists replacement and a shaky one gets overwritten by the neighbours'.

## Living and surviving

- **Homes.** Once a village has huts, every creature claims the least crowded
  one in its own clan and goes back to it to sleep.
- **Seeds.** A creature that has just eaten somewhere the grove is thinning
  buries a seed near the village. This is the colony's entire answer to
  famine, and it works: groves regrow around settlements.
- **Sharing.** Anyone well fed who meets somebody starving from their own clan
  hands food over. It is the main reason babies survive a bad week.

## Picking them up

Press and hold on a creature and it dangles from the cursor; drag it anywhere
and let go. The camera stays put while you are holding one. Dropped in water
it panics and swims out; dropped far from home it turns round and walks back;
dropped in the village it shrugs and gets on with whatever it was doing.

## The Oracle: running your own model

The sim has two modes, chosen in the Oracle panel and defaulting to the first:

- **No model.** They name their own gods, word their own creeds and invent
  their own vocabulary, procedurally. Everything described above works.
- **Language model.** A model you connect writes the scripture instead, speaks
  for the creature you have selected, and reads their language back to you.

Nothing is sent anywhere unless you switch the second one on.

Open the brain icon in the corner and pick a provider:

| Provider | Endpoint | Notes |
| --- | --- | --- |
| Local (Ollama) | `http://localhost:11434` | `ollama serve`, `ollama pull llama3.2`. Start it with `OLLAMA_ORIGINS=*` so the page may call it. No key. |
| OpenAI-compatible | `/v1/chat/completions` | OpenAI, LM Studio, vLLM, OpenRouter — anything speaking that API. |
| Anthropic | `/v1/messages` | Called straight from the browser with the direct-browser-access header. |

Then it can:

- **name the gods** — rewrite every living clan's deity and creed,
- **voice** — speak for the creature you have selected, from its needs,
  lineage, faith and current job,
- **read their tongue** — a field note on the largest clan's vocabulary,
- **write the chronicle** — turn the event log into a passage of history.

The endpoint, model and key live in `localStorage` on your machine and are
never committed or transmitted anywhere except to the endpoint you name.

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

Drag the ground to orbit, scroll to zoom, click a creature to inspect it
(click again to pet), press and hold to pick it up and drag it anywhere.
`1/2/3` switch between inspect, dropping food and planting a tree, `space`
pauses, `f` focuses the selected creature.
