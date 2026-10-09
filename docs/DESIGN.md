# Hollow Tide: design document

A psychological horror game disguised as a school RPG, set on a campus modelled from the real KCSB site (Western Road, Nassau).

## Context
The user wants an extremely gory horror game set at King's College School, The Bahamas (KCSB) on Western Road, New Providence. The campus layout should be accurate, based on map data and the school's website. The repo `Kings-College-Horror` is empty: no commits, only `.claude/`.

The user chose:
- **Engine:** a browser game built with Three.js.
- **Scope:** a **vertical slice** (one chapter, 15–25 minutes).
- **School name:** a **lightly fictionalised** name, *King's Hollow College, Western Road*. The layout is real, the name is not.

**Characters are entirely fictional.** I am deliberately not pulling real staff names or likenesses from the school website. Putting identifiable real teachers into graphic gore (as victims or monsters) targets real private people and could cause real harm, including school discipline or defamation issues. Every character below is invented.

## Research findings (real-world reference)
**Campus location (OpenStreetMap):** a cluster mapped in 2024 just off Western Road, south of the Lyford Cay roundabout. Centre is about **25.0225 N, -77.5175 W**. It matches KCSB's published facility list (25 m pool, tennis and padel courts, full football pitch, two five-a-side pitches).

| OSM way | Footprint | Real feature | In-game role |
|---|---|---|---|
| 1492740447 | 51×50 m, 870 m² (NE) | Building | **Senior Academic Block**: science labs, library, classrooms. *Slice interior.* |
| 1492740446 | 52×49 m, 797 m² (SW) | Building | Arts and auditorium: drama and dance studios, music rooms |
| 1492740443 | 35×33 m, 589 m² (SE) | Building | Dining hall, café, junior art room with ceramics kiln |
| 1492740449 | 23×22 m, 190 m², `building=service` | Service building | **Plant room**: the way down to the sinkhole |
| 1492740459 | about 25×20 m | Swimming pool | Pool (blood-tide set piece) |
| 1492740458 | about 99 m bounding box | Football pitch (5G AstroTurf) | Open fog field, exterior chase |
| 1492740456/457 | 46×45 m | Five-a-side pitches | Exterior |
| 1492740450/451 | 15×25 m | Tennis courts | Exterior |
| 1492740452/453 | 12×18 m | Padel courts | Exterior |
| 1492740454/455 | Rings | Athletics track | Exterior |
| 554131295 / 1046710706 | Road | Western Road, gated access road | Locked front gate (the boundary) |

The surroundings come from OSM too: Mount Pleasant Village to the east, forest (`landuse=forest`, way 815703975) to the south and west, and Lyford Cay to the north.

**Facilities named by the school and Inspired** (used to furnish the interiors):
- science labs and library
- drama studio, dance studio, music rooms
- multi-purpose auditorium
- junior and senior art rooms with a kiln
- indoor and outdoor covered dining, café
- adventure playgrounds

**Known gap:** OSM only maps the four main buildings. Before modelling, the user should confirm the room layouts, colours and signage from their own photos or walk-through, or from Mapillary street imagery. Interiors will be authored to fit inside the real footprints.

## Concept: an RPG that isn't
*Added at the user's request:* the game is **disguised as a normal, friendly school RPG**. It slowly turns into a **psychological thriller** that messes with the player's head, and finally into the gory survival horror. The disguise follows the *Doki Doki Literature Club* / *Undertale* tradition. The title screen and first ten minutes present a cheerful "first week at your new school" life RPG.

**Lore hook:** a real "King's College School" existed in Nassau in the 1840s. In the game it was built over a limestone **blue hole** and closed after "the drowning term". The new campus sits on the same karst sinkhole. Under it lives a **Lusca**, the Bahamian blue-hole sea monster of folklore. It lures people in by showing them the life they want.

**The twist (revealed late):** Kai Rolle drowned in the blue hole on the beach-boarding orientation trip. The "RPG" is the Lusca's lure, a perfect school week built from Kai's memories to keep them under. The game's own UI is how the creature talks to the player.

**Fictional cast** (no real staff; names and likenesses are invented):
- **Kai Rolle**: the player, a new Year 12 boarder.
- **Amara Knowles**: a cheerful best-friend NPC with a friendship meter. Later she is erased, and nobody remembers her.
- **Theo Cartwright**: a football teammate and quest-giver. He repeats lines and drifts out of sync.
- **Ms. Ione Fairweather**: the chemistry teacher. Her "lesson" on the 1840s school is the first crack in the disguise.
- **Mr. Desmond Pratt**: the night security guard and first on-screen death.
- **Groundskeeper "Tally" Sands**: becomes **the Hollowed**, a puppet the Lusca wears.
- **The Lusca**: the main stalker, heard in drains, pipes and the UI itself.

### Act I: "Welcome to King's Hollow!" (the disguise, about 10 min)
The game is bright, sunny and hyper-realistic, styled as a polished RPG:
- quest log, XP and levels, Charm/Grit/Wits stats
- friendship meters, dialogue choices, inventory, timetable, minimap
- cheerful music

Quests:
- Find your form room.
- Return a library book.
- Football trials on the 5G pitch.
- Get a smoothie at the café.
- Make a friend.

Wrongness is planted almost subliminally:
- the pool is always "closed for maintenance";
- the plant-room door hums;
- a background NPC is always dripping wet;
- Fairweather's lesson pauses one beat too long.

### Act II: "Week 1, Day 1" again (the drift, about 10 min)
The day loops and the RPG systems start to lie and turn on the player. These are the "messes with your mind" mechanics:
- **The day repeats.** NPCs swear it is the first day. Only Kai's inventory, and a growing water stain on every ceiling, prove otherwise.
- **The quest log writes back.** New entries appear in second person: "Stop looking at the pool." Completed quests un-complete themselves. One quest is just "Remember Amara".
- **Amara is erased.** Her friendship meter drains to 0. She vanishes from dialogue, then from the photos on the noticeboard. Her name is struck from the save display, and NPCs ask "who?".
- **The UI is unreliable.** The minimap shows corridors that aren't there. The compass points to the plant room. Stat names change (Charm → Breath). The HP bar shows "oxygen".
- **The game remembers.** Meta-memory lives only in the game's own localStorage. Choosing *New Game* doesn't fully reset: NPCs reference the last playthrough and the title screen changes.
- **Fake crashes and corrupted saves.** These are in-canvas fakes only: a "save corrupted" screen whose text slowly rearranges, and a "game crashed, restarting…" screen that restarts into the wrong place.
- **Audio gaslighting.** Binaural whispers placed behind the player, footsteps that stop when you stop, and the cheerful theme slowed half a semitone each loop.
- **The pause menu doesn't pause.** Something moves at the edge of the frame while it's open.

### Act III: "Lock-In" (the gory finale, about 10–15 min)
The sun sets mid-sentence, a storm hits and the gates mag-lock.
1. **Library.** Flashlight; hide under desks. The power cuts.
2. **Corridor.** Pratt is dragged up through a floor drain on the radio, then found disembowelled at the stairwell.
3. **Science labs.** Read Fairweather's real notes (the 1840s truth). Craft a flare. The Hollowed chases you.
4. **Courtyard and pool.** The pool runs red. The Lusca surfaces and tears the Hollowed apart: the dismemberment showcase.
5. **Plant room.** The stairs lead *down* into the blue hole. The RPG UI reboots one last time, "Welcome to King's Hollow! Day 1", over an underwater shot of Kai. Cut to "Chapter 2".

### Boundaries (mind games stay in the fiction)
- **Everything stays inside the game.** No real files are touched. The game reads no real names or accounts and uses no webcam, mic or location. There are no fake OS, browser or antivirus alerts and nothing that looks like a real scam pop-up. "Crashes" are drawn in the page.
- **An honest warning at launch, despite the disguise** (the DDLC approach): "This game contains extreme gore and disturbing psychological content and is not suitable for children or those easily disturbed", plus a **photosensitivity warning**. Glitch flashes stay under 3 per second.
- **Settings always tell the truth:**
  - the **gore level** setting (Off / Moderate / Extreme) always works;
  - a real **"Erase all game memory"** option is always available.
- The gore is graphic, but only on adults and creatures. No young children are harmed. The player never uses guns on people.
- The fourth-wall manipulation targets the player's *character and the game*. It never tells the real player to harm themselves.

## Visual target: hyper-realistic
The user wants photoreal textures, lighting and people. That sets every asset and rendering choice below. Act I is a bright, photoreal sunny tropical day with a clear-sky HDRI and real sun shadows, so it sells the disguise. Acts II–III degrade into overcast, dusk, then a flashlight-lit storm night, where darkness, fog and rain hide the browser's limits.

**Lighting:**
- Physically based lights (`renderer.useLegacyLights` off, physical units) with **AgX tone mapping**.
- A night-sky **HDRI** from Poly Haven drives image-based lighting.
- **Baked lightmaps and ambient occlusion** for static campus geometry. These are baked headless in Blender (`tools/bake_lightmaps.py`, run with `blender -b`) when Blender is installed; otherwise light probes plus screen-space AO are the fallback.
- The flashlight is a spotlight with a gobo/cookie texture and soft PCSS shadows.
- Red emergency lights flicker, lightning flashes drive whole-scene light changes, and volumetric light shafts show through the fog.

**Materials:**
- Only photoscanned **PBR** sets (albedo, normal, roughness, AO, height) at 2K–4K from Poly Haven and ambientCG: render, terrazzo, ceramic tile, wet asphalt, AstroTurf, limestone, rusted steel.
- A wetness shader lowers roughness and darkens albedo on rain-exposed surfaces, with animated rain ripples on the ground.
- Blood is a PBR material with a clearcoat wet sheen that dries over time (roughness up, colour darkens toward brown).

**Post-processing** (pmndrs `postprocessing` + `n8ao`):
- ambient occlusion (N8AO)
- screen-space reflections on wet floors and the pool
- bloom on emissives only
- depth of field during cutscenes
- motion blur
- lens distortion, chromatic aberration and film grain
- vignette
- a colour-grade lookup table (LUT)

**People:**
- Realistic rigged human models, all **fictional**, exported to glTF:
  - **MetaHuman**: check the current MetaHuman licence permits non-Unreal use first.
  - **Reallusion Character Creator 4** or **Renderpeople** scanned rigged samples as alternatives.
- Skin uses `MeshPhysicalMaterial` with sheen and transmission-based subsurface approximation, and detail normal maps for pores.
- Hair uses alpha-tested strip cards. Eyes have a separate cornea mesh with clearcoat.
- Body animation comes from Mixamo or motion-capture clips. Face animation uses blendshapes (ARKit 52) for the few close-ups.
- Victims get swappable **damage variants**: a clean mesh, a wounded mesh with wound decals and normal maps, and gib pieces with exposed-tissue materials.
- The Lusca and the Hollowed are sculpted or kitbashed creature models with wet, translucent skin shaders.

**Gore realism:**
- GPU blood particles with screen-space fluid-style rendering (a depth-smoothing pass).
- Projected decals that drip down walls (shader-animated).
- Arterial spray as particle ribbons.
- Gib meshes with cap geometry at the cut points.
- Pooling blood that spreads on floors as an expanding decal with SSR.
- Screen blood on the camera lens.

**Performance:**
- KTX2/Basis texture compression and meshopt-compressed glTF.
- LOD levels for each model and instanced props.
- Lighting baked wherever possible.
- **Quality presets** (Low / High / Ultra) so it still runs on laptops.

**Honest limit:** buildings, materials and lighting can look near-photographic. People will look good under flashlight and fog but not film-quality. Shots are framed to hide this: darkness, distance and motion blur.

## Technical plan
**Stack:**
- Vite + TypeScript + Three.js (exact versions pinned).
- pmndrs `postprocessing` and `n8ao`.
- `three/examples` loaders: GLTF, KTX2, RGBE/EXR, meshopt.
- `gltf-transform` CLI for the asset pipeline.
- Howler.js for audio and Vitest for tests.
- Optional Blender command line for lightmap baking.

It deploys as a static site.

```
tools/fetch-osm.mjs          Overpass query (bbox 25.0195,-77.5205 → 25.0255,-77.5135) → data/campus.json
                             projects lat/lon to local metres around ref (25.0225,-77.5175)
data/campus.json             baked footprints/pitches/roads (committed; ODbL attribution in credits)
src/main.ts                  bootstrap, game loop, state machine (menu → play → death → chapter end)
src/engine/                  renderer (fog, post-FX: film grain, chromatic aberration, vignette), input, audio
src/world/buildCampus.ts     extrude footprints, lay pitches/pool/track/roads/fence/forest edge, nav grid
src/world/academicBlock.ts   hand-authored 2-storey interior fitted inside way 1492740447's polygon
src/world/props.ts           desks, lab benches, lockers, shelves (instanced, low-poly)
src/player/controller.ts     pointer-lock FPS, crouch/hide, stamina, flashlight battery, flare item
src/ai/                      A* on nav grid; Hollowed FSM (patrol→hear→chase→search); Lusca scripted + drain ambush
src/gore/                    blood particles, decal splats, gib swap (mesh → pieces + physics-lite),
                             wound decals, screen blood, intensity scaling from settings
src/rpg/                     quests, dialogue trees, stats/XP, friendship, inventory, day-loop clock, save system
src/mind/                    corruption director: per-act script that mutates UI text, quests, map, audio,
                             meta-memory (localStorage), fake crash/corrupt-save screens
src/story/                   trigger volumes, scripted sequences, notes/collectibles, subtitles
src/ui/                      cheerful RPG HUD (quest log, minimap, stats, dialogue box), content + photosensitivity
                             warning, settings (gore level, erase memory, sensitivity, volume), pause, credits
tests/                       projection + OSM parse tests, nav-grid pathfinding tests
```

Two more files sit alongside the tree above:
- `tools/optimize-assets.mjs`: runs `gltf-transform` to apply KTX2, meshopt compression and LODs to everything in `assets/raw/`, writing to `public/assets/`.
- `tools/bake_lightmaps.py`: a Blender headless script that imports the generated campus and bakes AO and lightmaps into a second UV set.

**Assets:** realistic, licence-clean sources only.
- Textures and HDRIs: Poly Haven and ambientCG photoscans (CC0).
- Props: Poly Haven models and Sketchfab CC0 or CC-BY photoscanned furniture, lab equipment and lockers. CC-BY creators are attributed in the credits.
- Humans: MetaHuman, Character Creator 4 or Renderpeople, all fictional (see Visual target above).
- Animation: Mixamo.
- Sound: Freesound CC0 field recordings of rain, storm, water, wet impacts and radio static, mixed with Howler.js using spatial HRTF panning.
- `assets/CREDITS.md` tracks every asset's source and licence.

The art direction is real tropical-modern school architecture (white render, louvres, covered walkways, palms), caught in a night storm with flooding and red emergency lighting.

**Build order:**
1. Project scaffold, the `fetch-osm` tool and baked `campus.json`, plus projection tests.
2. Rendering foundation: physical lights, AgX tone mapping, HDRI, the post-processing chain, quality presets and the asset optimisation pipeline.
3. Campus exterior generated from OSM data, with PBR materials, wetness, rain, fog and lightning.
4. Player controller and flashlight with a cookie texture and PCSS shadows.
5. Academic Block interior inside the real footprint, with photoscanned props and a lightmap bake.
6. Character pipeline: import and optimise the human rigs, skin, eye and hair shaders, Mixamo animation, damage variants.
7. Nav grid, A* pathfinding and the Hollowed AI.
8. Gore system: fluid-style blood, drip decals, gibs with caps, pooling, lens blood, intensity settings.
9. RPG layer: quests, dialogue, stats, friendship and day loop for Act I.
10. Mind director: Act II corruption events, meta-memory, fake crash and corrupt-save screens, audio gaslighting.
11. Story triggers and the Act III five beats, notes and subtitles.
12. Lusca creature and the pool set piece (SSR and blood-tinted water), then the plant-room ending.
13. UI: content warning, settings, credits with OSM/ODbL and asset attribution.
14. Polish pass: colour grading with a LUT, audio mix, performance (60 fps on High on a mid-range laptop, 30 fps or better on Low).

**Needed from the user:**
- Photos of the real campus (building exteriors, corridors, signage colours) to match materials and layout.
- A MetaHuman (Epic account) or Character Creator export for the four fictional characters, or approval to use free Renderpeople samples.
- Blender installed if they want baked lightmaps.

## Verification
- `npm test`: Vitest covers the lat/lon→metre projection (pool area ≈ 500 m², pitch bounding box ≈ 99 m), OSM parsing and A* pathfinding.
- `npm run build` must succeed with no TypeScript errors.
- Run `npm run dev` and drive the game with Claude in Chrome:
  - screenshot the campus overhead debug camera next to the OSM map to check the layout matches;
  - read the console for errors;
  - play Act I → II → III and check each quest, corruption event and trigger fires in order;
  - reload and choose New Game, then check meta-memory persists; check "Erase all game memory" truly resets;
  - check gore level Off removes all blood and gibs.
- Vitest covers the mind director: events fire at the right act and loop, and "Erase all game memory" clears every key.
- **Realism check:** capture screenshots at fixed camera bookmarks (library, corridor, lab, pool, plant room) on Ultra and Low. Compare them side by side against the user's real campus photos and keep iterating on materials and lighting.
- Check FPS with the debug overlay; the target is 60 fps or better.
- The user playtests and checks the layout against their real-world knowledge of the campus.
