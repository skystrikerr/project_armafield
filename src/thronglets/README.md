# Thronglets — an autonomous voxel colony

A self-running three.js simulation. Nothing in it is
scripted: a handful of yellow creatures wake up on an island, and everything
that follows — where they settle, what they build, who they pair off with,
whether the colony grows or dwindles — falls out of each individual scoring its
own drives and acting on the loudest one.

The island is a bit over 140 units across, carrying five or six hundred trees
of four kinds, a couple of hundred boulders, a couple of dozen ponds, and up to
ten clans and three hundred and fifty creatures at once.

## Files

| File | What it holds |
| --- | --- |
| `voxel.ts` | Voxel grid → `BufferGeometry` baker. Culls hidden faces, bakes flat pixel-art colours into vertex colours. |
| `models.ts` | Every model in the world, authored voxel by voxel: the thronglet (body + head as separate pieces so the head can nod), eggs, apple trees, bushes, the enamel tub. |
| `world.ts` | Island heightmap, ponds, shoreline colouring, and the scatter passes that place trees, rocks, bushes and tubs. |
| `colony.ts` | The simulation. No three.js in here — agents, needs, utility AI, building, breeding, the day/night clock. |
| `emotes.ts` | Pixel-art emote icons drawn onto a canvas at runtime (no image assets). |
| `scene.ts` | Rendering and input: instanced meshes, the sun's arc, picking, camera. |
| `clans.ts` | Clans, faiths, creeds and the relations between peoples. Pure data and drift rules. |
| `language.ts` | Invented tongues: per-clan sound systems, coining, borrowing, sound change, drift. |
| `llm.ts` | Optional language-model bridge: provider clients, prompts, config in localStorage. |
| `weather.ts` | The turning year: seasons, sky, warmth, lying snow. |
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

**Knowing a word is personal.** The clan's lexicon holds the form, but each
creature only knows the words it has said or heard, and picks them up one at a
time from whoever it is standing next to. So a coinage starts at one speaker
and spreads: in one run the word for food went from a quarter of the clan to
all of it over a couple of days, while the word for cold slid back down as
children were born who had not heard it yet. The panel shows the percentage
who actually have each word.

Creatures also carry a short list of things that happened to them — what they
named, what they discovered, being lifted into the sky and set down somewhere
new — which the inspector shows.

## The island's materials

- **Four kinds of tree**, placed by where they belong rather than at random:
  palms on the outer ring by the shore, pines on the high ground, oaks through
  the deep inland, apples everywhere temperate. Only apples and palms fruit;
  oak and pine are what you build from, and give half again as much timber per
  trip.
- **Boulders** outcrop in fields rather than an even sprinkle, and hold stone
  that does not grow back. Quarrying is slower than chopping.
- **Two materials.** Every block in a plan is timber, stone or free thatch, and
  a site's cost is counted off the plan rather than guessed. Gatherers fetch
  whichever material their town is shortest of, and a builder can only lay the
  next block if that pile has something in it.

## Weather and the year

The island turns through four seasons on an eight-day year — the green season,
the high season, the fading, and the cold — and the sky does what the season
makes likely: rain and fog in the green, clear skies at the height, snow in
the cold. Snow settles on the ground, whitens the trees, stops things growing
and melts when the warmth comes back.

Weather is not decoration. Warmth falls with the season and again at night,
and an exposed creature on a cold night burns energy, loses condition, and
**cannot sleep through it**. That is the pressure everything else answers to.

## Invention

Nothing is unlocked by a progress bar. Somebody works a thing out, because of
the situation they happen to be standing in, and the island hears about it
afterwards with their name attached:

| Discovery | Who works it out |
| --- | --- |
| **Fire** | Somebody awake and freezing on a bitter night, with wood to hand. |
| **Cooking** | Somebody hungry sitting at a fire that already exists. |
| **Baskets** | Somebody who has hauled enough loads to resent it. |
| **Burial** | A clan that has buried enough of its own. |

Each is held by the clan that worked it out, and each changes what they can
do: fire lets them build hearths, which give warmth and light and make a
winter night survivable; cooking makes food go half again as far near one;
baskets raise how much a trip carries; burial has them stack a cairn where
somebody fell.

In one run *Snool of the Cinderhollow works out fire on a bitter night* on day
7, and *Thrum weaves something to carry more in* on day 8 — with hearths
appearing in the town only after Snool had the idea.

## Firsts

The first time anything happens on the island — the first word, the first
snow, the first rain, the first of each discovery — it is logged as news and
never again. That is the sentence worth screenshotting.

## Trades

Nobody is assigned a job. Each thronglet settles into one — forager, builder,
quarrier, farmer, priest or warrior — from its own traits crossed with what
its town is currently short of, and reconsiders now and then. A site short of
stone turns foragers into quarriers; a town with fields needs somebody on
them; a clan that has been raided three times starts producing warriors. The
trade is a leaning rather than a rule: it multiplies the matching drive by
half again, and a builder still stops to eat.

The same creature born into two different towns ends up doing different work,
which is the whole point.

## Towns

A clan's first settlement rings its shrine. Once a town has six finished
buildings and twenty people, it breaks ground on a second one — an outpost of
the same clan, not a schism — and builds around both. Three per clan is the
limit before they would rather split.

Towns are named in their own language the day they are founded, so the log
reads *the Bramcairn break ground on a new town and call it skoskep*.

Two buildings exist purely because colonies kept dying:

- A **well**, placed on the near side of the closest pond, so nobody has to
  cross the island for a drink.
- A **granary**, which anyone with a spare afternoon fills with fruit, and
  which the hungry eat from when the trees near town have been picked bare.
- **Grove plots**, which only yield if a farmer works them. Tended ground
  produces far more reliably than a wild grove, which is what lets a town
  outgrow the trees around it — the moment a colony stops being foragers.

## Roads

Ground remembers being walked on. Every step wears the patch underfoot a
little, wear fades if nobody uses that line, and the routes that survive get
drawn as bare earth — light scuffing at the edges, trodden dirt down the
middle. Nobody plans a road; they appear between the places people actually
go, and they fade when a town is abandoned. The first version of this wore
paths far too eagerly and paved the entire village, so it now takes sustained
traffic before anything shows.

## Trade

Clans on good terms send caravans. A trader loads food from their own granary,
walks it to a friendly clan's town, and hands it over: the receiving store
grows, both sides gain, relations improve by more than idle proximity ever
does, and a word crosses between the two languages on the way. It is the one
thing that reliably makes two peoples like each other, and the alternative to
the other thing two peoples do when they meet.

## What they learn

Each clan keeps a tally of what has actually killed its people — thirst,
famine, raids — and builds against it. Two deaths from thirst and they dig a
well before anything else; two from hunger and they raise a granary; three
raids and they put up a watchtower. Nothing tells them to; the counters come
from the deaths themselves, so a clan on good ground never bothers with any
of it and a clan on bad ground is all wells and stores.

## Colour schemes

Creatures come in seven morphs — amber, moss, tide, rose, ash, ember, dusk —
each baked as its own geometry rather than tinted, so a moss thronglet really
has a green body and a pale belly. Morph is inherited whole from one parent,
with a six percent chance of a child turning up wearing something neither of
them had, so a town drifts towards a look of its own over generations. The
clan's banner colour is washed lightly over the top so you can still tell who
belongs to whom.

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
