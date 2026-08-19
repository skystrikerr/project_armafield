

> This repository also holds **[Claudefield](#claudefield)** — an unrelated
> low-poly combined-arms battle game that happens to share the toolchain. It is
> a separate game with its own entry point; the two do not touch.

## Running it

```bash
npm install
npm run dev      # http://localhost:5173             — Thronglets
                 # http://localhost:5173/ironfront.html — Claudefield
```

`npm run build` produces a static site in `dist/` — both games are pure
client-side apps, so that folder can be served from anywhere.

## Running it as a desktop app

Thronglets also ships as an ordinary Electron window — same sim, no browser
chrome, nothing it needs from a server.

**Download.** Every push to `main` rebuilds `Thronglets-*-win.exe` on a real
Windows runner (cross-building a Windows `.exe` from Linux needs Wine to stamp
the icon in; a Windows CI runner just does it natively) and republishes it to
the repo's **[Releases → latest](../../releases/tag/latest)**. It is a
portable executable — download it and run it, nothing to install.

**Build it yourself:**

```bash
npm install
npm run dist:win     # → release/Thronglets-*-win.exe   (needs Wine on Linux)
npm run dist:mac     # → release/Thronglets-*-mac.dmg
npm run dist:linux   # → release/Thronglets-*-linux.AppImage
```

`electron/main.cjs` is the entire desktop shell: one `BrowserWindow` loading
`dist/index.html` off disk. `npm run electron` runs it against a build you
already made; `npm run electron:dev` points it at the Vite dev server instead
(`npm run dev` in a second terminal) for a live-reloading window while you
work on the sim.

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
island. `plate`, `shadow` and `names` toggle the pixel look, the expensive
lighting, and the town names lettered onto the island — which are the words
the clans coined for themselves, so the island reads as a map of somewhere
rather than scenery.

## People, not agents

Each creature holds up to eight relationships with specific named individuals,
built out of things that actually happened between them: who fed it when it was
starving, who raised it, who it has children with, who struck it. The inspector
shows *“Vek — fed me when I was starving”*, not “sociability 0.7”.

It changes what they do. "Go and find a friend" used to mean *walk to the
nearest body*. Now one will walk past three neighbours to reach the person who
fed it once, and will not seek out somebody who hit it.

When somebody dies, everyone bonded to them takes it — they stop wanting to
play, they seek company, and the name keeps surfacing in their thoughts. A
clan losing someone who mattered is visible in the village without opening a
panel, because a dozen creatures go quiet at once.

Nobody is appointed to anything. Standing is earned by feeding the hungry,
raising children, laying stone and working things out, and a people simply
defers to whoever has most of it — *the Fenbough stop listening to Nazz and
turn to Flush.*

## Peoples and gods

The island fills with clans. Each is a village, a bloodline and a religion at
once — a god, a sacred thing, a creed, and a banner colour its members wear as
a tint. They build outward in rings from where they settled, gather at their
shrine at dawn and dusk, carry their god to neighbours who have not heard of
it, and split when they grow too big to agree with themselves.

The peoples panel lists who is alive, what they worship, who they defer to,
and what they hold against the others; click one to fly to its village.

## War, which takes weeks

A war is the end of a long argument, and it needs three things at once:

1. **Remembered injury**, with dates and names — a killing, a raid, a theft, a
   conversion, a border pressed, a god said wrong. Standing complaints accrue
   at a trickle and take days of sustained friction to become worth fighting
   over, and they fade if you leave a people alone.
2. **Organisation.** Mustering needs the age of Craft: kilns, carts, kept
   accounts, a people organised enough to send fifteen of its own somewhere
   and feed them when they get there.
3. **Nobody holding it back.** Every marriage across the line is a family with
   people on both sides, and it raises the bar.

The declaration names what it is actually about — *the Ashmire and the Margate
go to war over their dead* — and the grudges behind it are listed with their
dates. Grief wears a war out, written law wears it out faster.

In a verified 32-day run the first war broke out on **day 26**, one war at a
time, one killing in total.

## The long climb

Seventeen technologies over six ages, and none of them on a timer.

| Age | What they work out |
| --- | --- |
| **Wandering** | fire · knapping · burial |
| **Hearth** | cooking · baskets · weaving |
| **Settled** | sowing · pottery · masonry |
| **Craft** | the kiln · the wheel · counting |
| **Forge** | smelting · writing · medicine |
| **Watching** | astronomy · law |

A technology accrues effort only while somebody is *actually standing in the
situation that would suggest it* — awake and freezing beside a woodpile,
hungry within reach of a fire, hauling a load too heavy, burying a third
sibling, laying a stone that will not sit flat. A people on easy ground climbs
slowly because nothing is pressing it. An age is a floor: nothing above it
starts until the one below is finished, so the ladder is climbed in order.

Being taught beats inventing. Where two peoples on good terms live close
enough to see each other work, the one behind picks up the one ahead about
three times faster than working it out alone — so an island of feuds does not
climb, and a friendly neighbour is worth more than a good quarry. A schism
carries the whole toolkit out with it.

Each age brings buildings: hearths, then granaries and wells and grove plots,
then a kiln, then a forge and an archive, and finally a hall and an
observatory — which is a people deliberately looking for whatever is up there.

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

Hearths cannot be built by a people who have not worked fire out; wells and
watchtowers wait on masonry; grove plots on sowing. Nothing in the world is
available because a number went up.

Knowing a word is personal too: each creature only knows what it has said or
heard, and picks words up one at a time from whoever it is standing next to.
A coinage starts with one speaker and spreads through the clan — and slides
back when children are born who have not heard it yet. The first word, the
first snow, the first rain: each logged as news once, and never again.

## Being watched

The colony slowly works out that something is looking at it.

Attention is driven by how far they have **climbed** — the age the leading
people has reached — plus every monolith and observatory they finish. Scoring
it off raw activity made a big colony suspect it was watched inside a week
purely by laying a lot of blocks; an age is the honest measure, because it is
the thing that takes weeks to move. It eases towards its target rather than
jumping, so the island takes days to arrive at the idea.

As it climbs, individuals start catching it. One stops mid-job, turns to face
wherever your camera actually is, tips its head back and holds there, thinking:

> *the sky is close today. · something is above the sky. · it does not blink. ·
> it moved when I moved. · we are being counted. · why us. · it lifted Vek. it
> put him back. · hello? · you.*

The first few times the island reaches for the thought it is logged as news,
alongside first fire and first snow. A red line is struck through the
observer's own record — **they are aware of being observed** — with a count of
how many are looking up right now.

And then their words start appearing in the margins of your page: real
coinages out of their own lexicon, scrawled in red, more of them the higher it
goes, multiplied into the paper so they read as ink soaking through rather
than an overlay. The notebook stops being solely yours. Move the camera and
their heads follow it, because they are tracking the camera and not a marker
on the ground.

Picking one up and putting it back down feeds this. So does doing nothing at
all, eventually.

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

| Provider | Models offered | Notes |
| --- | --- | --- |
| **Claude** | Opus 5 · Sonnet 5 · Haiku 4.5 | Called from the browser with the direct-browser-access header. |
| OpenAI | GPT-4o · 4o-mini · 4.1-mini | The standard `/v1/chat/completions` API. |
| Gemini | 2.0 Flash · Flash-Lite · 1.5 Pro | Google AI Studio. A free-tier key works. |
| Local (Ollama) | whatever you have pulled | `ollama serve` with `OLLAMA_ORIGINS=*`. No key, nothing leaves the machine. |
| Anything OpenAI-compatible | — | LM Studio, vLLM, llama.cpp, OpenRouter, your own proxy. |

**Ask the endpoint** fetches the real model list where the API allows it, and
**test the connection** does one tiny round trip so you find out the key is
wrong now rather than the first time a clan tries to name its god. It can then
name the gods and word their creeds, speak for whichever creature you have
under observation, read the age they have reached, read a clan's invented
language back to you, or turn the record into a chronicle. It is off by default,
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
    colony.ts           the simulation — needs, AI, building, breeding, attention (no three.js)
    tech.ts             the ladder: 17 technologies over 6 ages
    scene.ts            rendering and input
    models.ts           every model, authored voxel by voxel
    voxel.ts            voxel grid → geometry baker
    world.ts            island heightmap, ponds, flora scattering
    clans.ts            clans, faiths, creeds, relations, discoveries
    language.ts         invented tongues: phonology, coining, borrowing, drift
    weather.ts          seasons, sky, warmth, lying snow
    llm.ts              optional language-model bridge
    emotes.ts           pixel-art emote icons drawn at runtime
    random.ts           seeded RNG
```

[src/thronglets/README.md](src/thronglets/README.md) goes into how the AI and
the renderer work.

The section above is Thronglets; Claudefield's own layout is listed below.

## Claudefield

A second, entirely separate game living in the same repository: low-poly
combined arms, somewhere between Arma and War Thunder. Infantry, tanks and
aircraft fighting over the same three capture points, and you can be any of
them. Open it at `/ironfront.html`.

You start on the deploy screen and pick what to be. **On foot** you get a
rifle, an AT launcher and grenades, with stances, stamina and sprinting; the
launcher is the only thing an infantryman has that will trouble a tank.
**Crewing a tank** gives you a 75 mm gun with AP and HE, a slow turret
traverse, a coaxial machine gun and a gunner's sight that zooms to a 12° field
of view. **Taking an aircraft** means rolling down the strip at your own
airfield until the wings bite, then 20 mm cannons and two bombs.

The armour model is the point of the tank half. Every plate has a thickness,
and what actually matters is the thickness divided by the cosine of the impact
angle — so a hull turned 40° off square is far harder to defeat than the same
plate face-on. Rounds lose penetration over distance, bounce off steeply angled
armour and carry on flying, and a round that does get through breaks something
specific: engine, tracks, driver, gunner, or the ammunition, which usually ends
the argument immediately. The HUD tells you which, and tells you the numbers
when a shot fails: `NO PENETRATION — 96 mm vs 141 mm effective`.

Shells are real projectiles with travel time and drop, not hitscan. The
gunner's sight ranges whatever is under the crosshair and elevates the barrel
for it, so hitting something 600 m away is a matter of putting the sight on it
and waiting out the traverse. Rifle rounds drop too, and crack past your head
when they miss.

Both sides field a squad of thirteen riflemen, three tank crews and a fighter,
all run by the same behaviour code. They advance on whichever objective is
worth taking, break line of sight when they are hurt or suppressed, go prone
under fire, and swap to a launcher when armour appears. Nothing about the match
is scripted: the fight goes where the AI takes it. Holding more of the three
points bleeds the other side's reinforcement tickets, and the match ends when
one side runs out.

A gamepad works too — plug one in and press any button; a controller and
the keyboard both drive the same movement and aim state, so nothing needs
switching, and the HUD's corner readout confirms one is connected.

### Controls

| Keyboard | Controller | |
| --- | --- | --- |
| WASD · Shift | Left stick · L3 | Move · sprint |
| C · Z | B · Y | Crouch · prone |
| LMB · RMB | RT · LT | Fire · aim down sights (gunner's sight in a tank) |
| R · G | X · LB | Reload · grenade |
| 1 / 2 / 3 | D-pad | Switch loadout slot, or AP · HE in a tank |
| F · V | RB · Back | Enter/leave a vehicle · first/third person |
| C (in a tank) | RT | Coaxial machine gun |
| — | Right-stick click | Gunner's sight toggle (in a tank) |
| Mouse · A/D · W/S (flying) | Right stick · A/D · W/S | Pitch and roll · rudder · throttle |
| B | D-pad down | Drop a bomb |
| Esc · M | Start · — | Pause · mute |

### Layout

```
src/
  Ironfront.tsx         the page: canvas + HUD, minimap, deploy screens (still Claudefield — the component and file are named for the internal module, not the game's title)
  ironfront/
    game.ts             world assembly, player control, match flow, camera
    combat.ts           projectiles, ballistics, armour penetration, blast
    ai.ts               squad, crew and pilot behaviour
    units.ts            unit records and every stat table
    terrain.ts          heightfield, roads, villages, line of sight
    models.ts           every model, baked from boxes and cylinders
    rigs.ts             the three.js nodes that animate a unit
    effects.ts          particles, tracers, scorch marks
    audio.ts            synthesised gunfire and engines — no audio files
    random.ts           seeded RNG and value noise
```

## Built with

React + TypeScript, Vite, Tailwind, three.js. No art assets in either game —
every model, texture, icon and sound is generated in code.
