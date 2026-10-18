# The sun and moon earrings: materials

> Since the first build the ear wire (hook, coil, bronze bead and their link) is left out of the model: the earrings hang from the star connector's top loop (SPEC.md section 0). Its materials are kept below for reference.

This note records what each part of the two earring models is made of, as the models themselves
describe it, and then says how to make them look like fine jewellery. It ends with ready-to-paste
retexturing prompts and the PBR values to use in three.js. It goes with `SPEC.md` (§2 lists the parts,
§6 the look).

The sources are `tools/earrings/source/earring-moon.glb` and `earring-sun.glb`: Meshy models, one fused
mesh and one material each, with a 2048 px WebP base colour, metallic-roughness and normal map. The
material sets no metallic or roughness factor, so the factors are 1 and the map values are the final
values. The metallic-roughness map's red channel is flat at 1 (there is no occlusion), the green
channel is roughness and the blue channel is metalness. The uv atlas is Meshy's automatic unwrap,
which is hundreds of small islands. Looking at the flat textures alone is not much use, so every value
below was read through the model (see "How this was measured" at the end).

## 0. What the models get wrong, in short

- **The metal is dark.** Every silver-coloured part has a base colour of about `#6a6968` to `#838280`,
  which is a linear reflectance of only 15 to 25%. Polished silver or platinum reflects 60 to 95%.
  With roughness 0.3 to 0.5 on top, the metal reads as pewter or antiqued, cast base metal. This is
  the main reason the earrings look costume rather than fine.
- **The stones are waxy.** The black beads, the white beads and the pearls have roughness 0.28 to
  0.41. Polished gems and pearls sit at 0.02 to 0.2.
- **Some parts are neither metal nor stone.** The pearls (metalness about 0.2 to 0.26), the star
  charms' fields (about 0.5 to 0.6) and the moon's square charm (0.67) have a metalness in between.
  That gives a murky, greyish result under any light.
- **Both sides are textured.** The backs repeat the front's materials (the crescent's black stones
  show on the back too; the back of the sun is the same warm metal as the front, without the
  hammering). A retexture must cover both sides, since the earrings swing and twist.

Corrections to `SPEC.md` §2, from the renders:

- The star connector under the bead is an **eight-point** star on both earrings (four long arms and
  four short diagonal ones), not a six-point one. The strand charms are six-point stars.
- The crescent's channel holds about **20** graduated round black cabochons, largest at the belly.
- The sun has **16** wavy, flame-like rays of alternating length.
- The moon's "cube charm" is a **square box charm** hung by one corner, with a recessed quatrefoil
  (four rounded lobes) on its face.
- The moon's star cabochon is a **white** disc engraved with concentric (slightly spiral) dark lines.
  There is no abalone colour in its texture.
- The sun's "black" beads are **navy-black** (`#12132a`), and the five dots in its dome are a very
  dark warm grey (`#2a2624`), not pure black.

## 1. The parts as modelled

Columns: base colour is the mean sRGB colour of the part's pixels in the base colour map. Metal and
rough are the median of the metalness and roughness maps over the part (0 to 1). "Front", "angled",
"base" and "MR" name the four close-up views each part was looked at in (lit front, lit at 28° yaw
and 14° pitch, unlit base colour, and metalness in red with roughness in green).

### The moon earring, top to bottom

| # | Part | Made of, as modelled | Finish | Base colour | Metal / rough | Evidence and alternatives |
|---|---|---|---|---|---|---|
| 1 | Ear wire (French hook, opens to the right) | Blackened metal: gunmetal or black-oxidised steel or brass | Satin, smooth round wire | `#413840`, a dark grey with a faint plum cast | 0.87 / 0.48 | Front: nearly black with a faint violet sheen; MR: fully metal, the roughest metal on the earring. Could also be black-plated brass, black rhodium or dark anodised niobium. |
| 2 | Coil (about 6 turns, under the hook's loop) | Antiqued copper or bronze | Polished crests, darker grooves | `#66544d`, warm brown | 0.89 / 0.35 | Front and angled: distinct wire turns, coppery highlights. The atlas has brown patches that belong to it and the bead. |
| 3 | Bead under the coil | Antiqued bronze or copper | Polished, faintly mottled | `#604f47` | 0.86 / 0.36 | Same colour family as the coil. Could be aged brass or rose-gold plate. |
| 4 | Two jump rings (bead to star) | Antiqued silver tone: oxidised sterling, or silver-plated base metal ("Tibetan silver") | Satin, speckled dark in the recesses | `#6a6968` | 0.76 / 0.37 | All the links share this material. |
| 5 | Star connector: eight-point star, loop top and bottom | Antiqued silver tone | Long arms: a row of small recessed oval cells, darkened. Short arms: plain, lightly scratched or hammered | Long arm `#656463`, short arm `#838280` | 0.71 / 0.36 and 0.76 / 0.34 | Front and angled: the cells read as oxidised dots; the lower base colour of the long arms is the dark cell outlines. |
| 6 | Star connector's cabochon | A glossy white disc engraved with three concentric, slightly spiral dark lines, in a heavy bezel | Glossy: the glossiest surface on either earring | `#9a9a98` mean (white with dark lines, p90 `#bababa`) | 0.00 / 0.14 | MR: a clean dielectric disc inside a metal bezel. No colour play in the base colour, so not abalone. Most likely a carved white shell or mother-of-pearl disc; could be white enamel with niello lines, or a Shiva-eye style shell. The back is a grey metal disc with a faint swirl (metal about 0.45). |
| 7 | Jump ring and S-link (star to crescent) | Antiqued silver tone | Satin | `#706f6e` | 0.74 / 0.37 | Front: a round ring, then an S-shaped link through the crescent's bail. |
| 8 | Crescent moon pendant | Antiqued silver tone, cast | Outer band: an embossed border of C-scrolls with darkened recesses, polished highs. Inner band: hammered and scratched | Outer `#81817f`, inner `#625f59` | 0.86 / 0.32 and 0.70 / 0.41 | Angled: the scroll border reads as repoussé. A bail at the top, a loop at the upper tip and three loops on the lower edge. |
| 9 | Crescent's channel of stones | About 20 round, domed black cabochons, graduated, between polished metal bars (a bar or channel setting) | Semi-gloss | `#101110` (pure black) | 0.19 / 0.41 | Base: solid black discs. MR: dielectric; the metalness of 0.19 is the bars bleeding into a soft map. Most likely black onyx; could be jet, black glass or black agate. The bars are `#7c7976`, 0.71 / 0.35. |
| 10 | Upper-tip drop: eye-pin link and black bead on a head pin | Bead: black stone. Pin: antiqued silver with a ball end | Bead semi-gloss | `#121211` | 0.00 / 0.39 | Front: the pin shows below the bead. Black onyx, black agate or black glass. |
| 11 | Strand A (left, short): loop and black bead on a head pin | Black stone | Semi-gloss | `#111111` | 0.00 / 0.39 | As 10. |
| 12 | Strand B (middle), first bead: speckled white bead on an eye pin | White stone with grey mottling and veining | Semi-gloss | `#8f8f8f` mean (p10 `#6d6d6d`, p90 `#b2b2b2`) | 0.01 / 0.32 | Front: white with grey "cratered" mottling. Howlite most likely; could be white marble, white jasper or crackle agate. The edges read slightly metallic in the map, which is bleed, not a coating. |
| 13 | Strand B, star charm (six points) | Antiqued silver rim around a recessed, blackened field scattered with tiny white points (a starry-sky motif) | Rim polished; field fibrous and dark | Field `#2e2e2e` | 0.52 / 0.44 | High zoom: the white points are soft specks, not faceted stones. The metalness of about 0.5 is the model hedging. It means oxidised silver with granulation, or a low-detail black marcasite or black spinel pavé; black enamel with silver flecks is also possible. |
| 14 | Strand B, end: black bead on a head pin | Black stone | Semi-gloss | `#101010` | 0.00 / 0.40 | As 10. |
| 15 | Strand C (right), star charm | As 13 | As 13 | Field `#333232` | 0.54 / 0.44 | As 13. |
| 16 | Strand C, speckled white bead on an eye pin | As 12 | As 12 | `#8c8c8d` | 0.01 / 0.38 | As 12. |
| 17 | Strand C, end: square box charm hung by a corner | Antiqued silver box; its face is a recessed panel with a taupe quatrefoil in a dark outline | Frame satin; panel matte and textured | Panel `#5a514b`, warm taupe | 0.67 / 0.48 | MR: the panel is modelled as metal, so a brown patina on metal; it reads as taupe enamel or a brown stone (jasper, sandstone, druzy) only at a glance. |

The links between the strand parts are plain round jump rings, eye pins and head pins, all in the
antiqued silver tone of row 4 (metal 0.74 to 0.82, rough about 0.37 to 0.39).

### The sun earring, top to bottom

| # | Part | Made of, as modelled | Finish | Base colour | Metal / rough | Evidence and alternatives |
|---|---|---|---|---|---|---|
| 1 | Ear wire (French hook, opens to the left, a mirror of the moon's) | Violet-tinted gunmetal | Satin, smooth round wire | `#433a56`, indigo-violet grey | 0.84 / 0.45 | Front: clearly violet-indigo, more saturated than the moon's wire. Anodised niobium (purple) is the closest real material; hematite- or gunmetal-plated wire is the alternative. |
| 2 | Coil | A tight, fine coil that reads almost as a tube (a crimp cover), in bronze or antique brass | Polished, fine ridges | `#6b5d52` | 0.84 / 0.36 | Front: fine horizontal ridges rather than distinct turns. |
| 3 | Bead | Bronze | Polished | `#6a5c52` | 0.76 / 0.34 | As the moon's bead. |
| 4 | Jump ring (bead to star) | Silver tone, slightly cooler than the moon's | Satin | `#746f70` | 0.80 / 0.39 | |
| 5 | Star connector: eight-point star | Silver tone. Long arms: a blackened recessed channel with a row of raised round silver dots. Short arms: plain, with a slight khaki cast | Rims polished; channel dark | Channel p50 `#2b2b2b`, short arms `#85837d` | Channel 0.72 / 0.35; short arms 0.91 / 0.35 | MR: the black channel is metal, so blackened (oxidised) metal as modelled, not enamel; the dots are bright silver (metal about 0.58). |
| 6 | Star connector's cabochon | A white domed cabochon in a smooth bezel, with a faint grey speck at its centre | Glossy | `#e0dfdb`, the brightest base colour on either earring | 0.09 / 0.30 | Most likely a white pearl (a half pearl or mabé); could be white mother-of-pearl, opaque white enamel or porcelain. The speck reads as a drill mark. |
| 7 | Round ring and spiral S-scroll link (star to sun) | Silver tone | Satin | `#7a787e` | 0.85 / 0.38 | |
| 8 | Sun pendant: 16 rays | Silver tone | Polished, rounded profile | `#7c7b7a` | 0.90 / 0.35 | Front and angled: crisp highlights along the ray edges. |
| 9 | Sun pendant: domed centre | Silver tone with a warm champagne or brassy cast, like silver over brass or a warm pewter | Hammered: clear planished dimples | `#827e6d` to `#878371` | 0.94 / 0.30 | The back is the same warm metal (`#87816d`, 0.95 / 0.31). A small embossed oval sits near the right edge of the dome. |
| 10 | Five dots on the dome (a curving diagonal row) | Smooth domed cabochons in bezels, very dark warm grey | Semi-gloss | `#2a2624` to `#2c2827` | 0.08 / 0.40 | MR: clearly dielectric, so not hematite. Black onyx or black enamel most likely; smoky quartz or dark grey moonstone are possible. |
| 11 | Left strand: ring at a ray tip, teardrop loop, pearl on an eye pin | Pearl: cool white with a lilac tint | Glossy; a drill hole shows at the top | `#a1a1b0` | 0.20 / 0.28 | The metalness of 0.2 is the model faking lustre; a pearl is a dielectric. A little of the neighbouring navy bead's colour has bled onto one side. |
| 12 | Left strand, star charm (six points) | Silver rim around a recessed dark slate field with a fine cross-hatch | Rim polished; field matte | Field `#3c3e40` | 0.62 / 0.41 | Oxidised silver or dark grey enamel; the metalness is in between, as on the moon's star charms. |
| 13 | Left strand, end: navy-black bead on an eye pin | Navy-black stone or glass, with a fine speckle | Semi-gloss | `#12132a` (blue about twice red) | 0.00 / 0.31 | Reads as black at a distance and navy close up. Blue goldstone, dark sodalite or dark blue glass; lapis lazuli would be much brighter. |
| 14 | Middle strand: ring, S-link, ring, rhombus frame | A polished silver frame around a recessed brown-taupe field with a fibrous, sandy texture | Frame polished; field matte, stippled | Field `#6c5d4e` | 0.89 / 0.40 | MR: the field is metal, so a stippled, sand-blasted bronze-coloured patina as modelled. There is no chatoyant banding in the texture, so tiger's eye is unlikely; brown enamel or sandstone would be the stone readings. |
| 15 | Middle strand: pearl on an eye pin | As 11 | As 11 | `#a29fae` | 0.26 / 0.30 | |
| 16 | Middle strand, end: rhombus frame | As 14 | As 14 | `#6b5c4d` | 0.91 / 0.42 | |
| 17 | Right strand: ring at a ray, teardrop wrapped loop, navy-black bead | As 13 | As 13 | `#13142b` | 0.00 / 0.31 | |

## 2. Making them luxurious

### The direction

- **The sun is the house lights (the light theme): warm 18k yellow gold** with white and champagne
  stones and pearls. Its gold is the site's gold: gold-500 (`#ebd88c`) is within a few percent of 18k
  yellow gold's reflectance, so the sun reads as the same gold as the stage light on the page.
- **The moon is the theatre (the dark theme): cool platinum** (or rhodium-plated white gold, or
  high-polish sterling silver) with rainbow moonstone, black onyx and black diamonds. Under the dark
  theme's warm gold key light, polished platinum turns that light into gold highlights on white metal,
  so the moon belongs to the same stage.
- **The brand's plum ties them together**, in small amounts: plum enamel and plum rhodolite garnet on
  the sun, an aubergine Tahitian mother-of-pearl on the moon. Plum here means wine and magenta
  (plum-600 `#6d2751`, plum-700 `#5a1f3c`), never lavender. The sun's lilac pearls therefore become
  white pearls with a rosé overtone.
- **Every texel is either metal or stone.** Metalness is 1 on metal and 0 on stone, with no in-between
  values except a narrow edge where they meet.
- **Clean, new and bright.** No grime, tarnish or baked dirt. Contrast in recesses comes from
  physically plausible darkening (a dark rhodium lining, a polished-versus-satin change), not from
  painted black.

### What changes, part by part

| Part | Moon now → luxurious | Sun now → luxurious |
|---|---|---|
| Ear wire | Blackened gunmetal → mirror-polished platinum | Violet gunmetal → mirror-polished 18k yellow gold |
| Coil and bead | Antiqued copper/bronze → polished platinum coil, polished platinum bead | Bronze → polished 18k gold coil (crisp turns), polished 18k gold bead |
| Jump rings, S-links, eye and head pins | Antiqued silver → polished platinum, round wire, bright | Silver tone → polished 18k gold |
| Star connector, metal | Antiqued silver → polished platinum; tiny white diamonds bead-set in the long arms' cells; short arms satin-brushed; a fine milgrain edge on the bezel | Silver with black channels → polished 18k gold; the long arms' channels in plum vitreous enamel with the raised dots as gold granulation; short arms satin |
| Star connector, cabochon | White disc with engraved lines → domed rainbow moonstone, milky and translucent with a soft blue adularescence | White cabochon → lustrous white Akoya half pearl (mabé) in a smooth gold bezel with milgrain |
| Pendant | Antiqued crescent → polished platinum; the scroll border kept as crisp engraving, lined in black rhodium; the inner band finely hammered and bright | Silver rays and warm dome → 18k gold; rays mirror-polished; the dome's hammering kept as fine planished facets, polished |
| Pendant stones | Black cabochons → glass-polished black onyx cabochons (or black spinel), polished platinum bars | Five dark dots → smooth cognac-champagne diamond cabochons (or golden citrine) in polished gold bezels |
| Beads | Black beads → glass-polished black onyx; white howlite → rainbow moonstone spheres | Lilac pearls → white Akoya pearls with a rosé overtone and high orient; navy beads → polished plum rhodolite garnet |
| Star charms | Blackened starry field → black diamond pavé (or black rhodium) scattered with a few white diamonds, polished platinum rim | Dark slate field → white diamond pavé in a polished gold rim |
| Last charms | Taupe quatrefoil box → platinum box, the quatrefoil in aubergine Tahitian mother-of-pearl | Brown-taupe rhombus fields → champagne mother-of-pearl inlay with soft iridescence |

### What to keep

- **The geometry, exactly**: every part, its shape, silhouette, thickness, scale and order, every link
  and loop, the number of rays, cells, dots and stones. Only the surface changes. The part map and
  pivots in `SPEC.md` §3 depend on the shapes staying put.
- **The relief that is already modelled**: the sun dome's hammering, the moon's hammered inner band,
  the crescent's scroll border, the star connectors' cells and dots, the charms' raised rims. These
  are kept as polished hammering and crisp engraving, not as worn texture.
- **Smooth stays smooth.** The beads and cabochons are smooth spheres and domes in the geometry; they
  stay polished cabochons. Facets are painted (as a normal map) only on flat recessed fields, as pavé,
  where they cannot contradict the silhouette.
- **No baked shadows between parts.** The parts will be cut apart and swing independently, so a ring's
  shadow baked onto the pendant would move with the pendant and look wrong. Occlusion inside a part
  (in a cell, under a bezel) is fine.
- **Both sides.** The back of each part gets the same materials as the front.

## 3. The prompts

These are written for Meshy's retexture (AI texturing from a text prompt) and work for similar tools.
Turn PBR maps on. Retexture the source glb files in `tools/earrings/source/`, then run
`build-earrings.mjs` as usual: the parts are cut by geometry, not by uv, so a new atlas does not
affect the cut. Generate at 2048 px or more; the pipeline reduces to 1024 px.

Meshy has capped its style prompt at about 600 characters in some versions. If the tool cuts the long
prompt, use the short form under it. An image reference (a fine-jewellery product photograph in the
target metal) helps more than extra words.

### The sun earring

**Positive (about 170 words):**

```
Luxury fine-jewellery retexture of a sun-and-star chandelier drop earring. Keep the existing geometry, silhouette and every part exactly as modelled; change only the surface materials. Physically based materials, studio product photograph realism, clean and new. Ear wire, coil, bead, all jump rings, S-links and pins: mirror-polished 18k yellow gold with crisp highlights. Eight-point star connector: high-polish 18k yellow gold; the four long arms carry a channel of deep plum vitreous enamel with tiny raised gold granulation dots; the short arms satin-brushed gold; in the centre a lustrous white Akoya half pearl in a smooth gold bezel with a fine milgrain edge. Sun pendant: 18k yellow gold, sixteen flame rays mirror-polished, the domed centre finely hand-hammered with soft planished facets; five smooth bezel-set cognac-champagne diamond cabochons. Strands: white Akoya pearls with a rosé overtone and high orient; a six-point star charm with a brilliant white diamond pavé field in a polished gold rim; rhombus frames inlaid with champagne mother-of-pearl; end beads of polished deep plum rhodolite garnet. Both sides textured alike.
```

**Negative:**

```
silver, grey metal, pewter, antique finish, oxidised, tarnish, patina, verdigris, rust, dirt, grime, heavy scratches, worn plating, painted black recesses, brass, bronze, copper, orange gold, matte plastic, waxy stones, chalky or cloudy pearls, lavender, violet, blue, neon, glitter paint, cartoon, toon shading, painted highlights, baked lighting or reflections in the base colour, baked contact shadows between parts, facets painted on smooth beads, text, logo, watermark, changed geometry, extra parts, deformed shapes, seams, blurry or low-resolution texture
```

**Short form (under 600 characters):**

```
Fine-jewellery retexture, geometry unchanged. PBR, clean, new. All metal mirror-polished 18k yellow gold. Star connector: plum enamel channels with gold granulation dots, white Akoya half pearl in a milgrain gold bezel. Sun: polished gold rays, finely hammered gold dome, five cognac-champagne diamond cabochons. Strands: white rosé-overtone Akoya pearls, white diamond pavé star charm, champagne mother-of-pearl rhombus inlays, plum rhodolite end beads. No silver, no tarnish, no baked shadows.
```

### The moon earring

**Positive (about 180 words):**

```
Luxury fine-jewellery retexture of a crescent-moon chandelier drop earring. Keep the existing geometry, silhouette and every part exactly as modelled; change only the surface materials. Physically based materials, studio product photograph realism, clean and new. Ear wire, coil, bead, jump rings, S-link, eye pins and head pins: mirror-polished platinum, cool bright white metal. Eight-point star connector: polished platinum, tiny white diamonds bead-set in the cells along the long arms, the short arms satin-brushed; in the centre a domed rainbow moonstone cabochon, milky and translucent with a soft blue adularescent glow, in a polished bezel with a milgrain edge. Crescent moon: polished platinum; the scroll border on the outer band crisply engraved and lined in black rhodium; the inner band finely hammered and bright; the channel of graduated round black onyx cabochons, glass-polished, between polished platinum bars. Beads: glass-polished black onyx spheres and rainbow moonstone spheres. Star charms: a field of black diamond pavé scattered with a few white diamonds, in polished platinum rims. Square charm: a platinum box with an aubergine Tahitian mother-of-pearl quatrefoil inlay. Both sides textured alike.
```

**Negative:**

```
yellow gold, brass, bronze, copper, warm metal, pewter, antique silver, oxidised, tarnish, patina, rust, dirt, grime, heavy scratches, dull grey metal, painted black recesses, chalky white stones, howlite veining, matte plastic, waxy or cloudy stones, lavender, bright purple, blue tint on the metal, glitter paint, cartoon, toon shading, painted highlights, baked lighting or reflections in the base colour, baked contact shadows between parts, facets painted on smooth beads, text, logo, watermark, changed geometry, extra parts, deformed shapes, seams, blurry or low-resolution texture
```

**Short form (under 600 characters):**

```
Fine-jewellery retexture, geometry unchanged. PBR, clean, new. All metal mirror-polished platinum. Star connector: white diamonds in the arm cells, rainbow moonstone cabochon with blue glow in a milgrain bezel. Crescent: polished platinum, engraved scroll border lined in black rhodium, finely hammered inner band, glass-polished black onyx cabochons. Beads: black onyx and rainbow moonstone. Star charms: black diamond pavé with a few white diamonds. Square charm: aubergine Tahitian mother-of-pearl inlay. No gold, no tarnish, no baked shadows.
```

### Variants

Each variant replaces the metal and stone sentences of the prompt above it and keeps the rest (the
geometry sentence, the realism sentence and the negative prompt, with its metal words adjusted).

- **All gold (a matched pair).** Sun: as written, but golden South Sea pearls in place of the white
  Akoya pearls, champagne diamonds in place of the plum garnet and plum enamel, for a monochrome gold
  piece. Moon: mirror-polished 18k yellow gold throughout, keeping the black onyx and rainbow moonstone
  and the white diamonds; the star charms become white diamond pavé. Remove "yellow gold" from the
  moon's negative prompt and add "silver, platinum".
- **Mixed metals (each earring carries the other's metal).** Sun: 18k yellow gold pendant and star,
  with polished platinum jump rings, pins and rhombus frames, and a platinum milgrain line around the
  dome. Moon: platinum crescent and star, with an 18k yellow gold coil, bead and bezel milgrain, and
  gold bars between the onyx cabochons. Remove the opposite metal from each negative prompt.
- **Rose and plum (sun only, a softer house light).** 18k rose gold throughout, with plum rhodolite
  garnet cabochons in the dome, pink-overtone pearls, plum enamel channels and rose mother-of-pearl
  rhombus inlays.
- **Noir (moon only, the deepest dark theme).** Black rhodium-plated metal throughout, with white
  diamond pavé on the star charms and the star connector's cells, black onyx kept, and a grey
  moonstone cabochon. Add "white metal" to the negative prompt.

### PBR values for three.js

For `MeshPhysicalMaterial`. Colours are sRGB hex, as three's `Color` setters take them. three.js
documents `ior` as 1.0 to 2.333 (where its `reflectivity` mapping ends), so diamond (2.42) is given
as 2.333; r170 does not clamp it, and the reflectance at normal incidence is 0.16 against 0.17, so
the difference is slight. `ior` only affects
dielectric surfaces (metalness 0); metals ignore it.

| Material | `color` | `metalness` | `roughness` | `clearcoat` / `clearcoatRoughness` | `ior` | Other |
|---|---|---|---|---|---|---|
| 18k yellow gold, mirror polish | `#ebd88c` (gold-500; physically about `#f2d48f`) | 1 | 0.06 to 0.10 | 0 to 0.2 / 0.05 | n/a | |
| 18k yellow gold, satin | `#e6c77f` | 1 | 0.28 to 0.35 | 0 | n/a | `anisotropy` 0.5 along the brushing |
| 18k gold in recesses (hammer dimples, milgrain valleys) | `#cbae57` (gold-600) | 1 | 0.18 to 0.22 | 0 | n/a | |
| 18k rose gold (variant) | `#e8b89a` | 1 | 0.08 | 0 to 0.2 / 0.05 | n/a | |
| Platinum, mirror polish | `#d6d1c9` | 1 | 0.06 to 0.10 | 0 to 0.2 / 0.05 | n/a | |
| Platinum, satin | `#cfcac2` | 1 | 0.30 | 0 | n/a | `anisotropy` 0.6 |
| White gold (rhodium plate) | `#dcdfe3` | 1 | 0.05 | 0 to 0.2 / 0.05 | n/a | |
| Sterling silver, high polish | `#f0eeea` | 1 | 0.08 | 0 to 0.2 / 0.05 | n/a | |
| Black rhodium (lining, noir) | `#2e2f33` | 1 | 0.18 | 0 | n/a | |
| Plum vitreous enamel | `#5a1f3c` (plum-700) | 0 | 0.08 | 1.0 / 0.03 | 1.52 | |
| White Akoya pearl, rosé overtone | `#f3eee8` | 0 | 0.20 | 0.7 / 0.12 | 1.53 | `iridescence` 0.5, `iridescenceIOR` 1.35, `iridescenceThicknessRange` [200, 500]; `sheen` 0.25, `sheenColor` `#ffe4ea`, `sheenRoughness` 0.5 |
| Golden South Sea pearl (variant) | `#ead3a2` | 0 | 0.20 | 0.7 / 0.12 | 1.53 | `iridescence` 0.35, `sheenColor` `#fff1d0` |
| Champagne mother-of-pearl | `#efe6d6` | 0 | 0.12 | 1.0 / 0.05 | 1.53 | `iridescence` 1.0, `iridescenceIOR` 1.4, `iridescenceThicknessRange` [300, 800] |
| Aubergine Tahitian mother-of-pearl | `#3b2a36` | 0 | 0.12 | 1.0 / 0.05 | 1.53 | `iridescence` 1.0, `iridescenceThicknessRange` [350, 900] |
| Rainbow moonstone | `#e8ebf0` | 0 | 0.06 | 1.0 / 0.04 | 1.52 | `sheen` 0.6, `sheenColor` `#8fb3ff`, `sheenRoughness` 0.35 (the blue glow); `transmission` 0.35, `thickness` 0.1, `attenuationColor` `#dce5f5` only if transmission is affordable |
| Black onyx, glass polish | `#0a0a0c` | 0 | 0.05 | 1.0 / 0.03 | 1.54 | `specularIntensity` 1 |
| Black diamond pavé | `#08080a` | 0 | 0.03 | 0 | 2.333 | facets in the normal map |
| White diamond pavé | `#f4f6f8` | 0 | 0.02 | 0 | 2.333 | facets in the normal map; as a separate clear mesh: `transmission` 1, `thickness` 0.05, `dispersion` 0.35 |
| Cognac-champagne diamond cabochon | `#d2a062` (cognac `#c8904a`, champagne `#e2c08a`) | 0 | 0.03 | 0.6 / 0.02 | 2.333 | |
| Golden citrine (alternative) | `#e7a83e` | 0 | 0.04 | 1.0 / 0.03 | 1.55 | |
| Plum rhodolite garnet | `#6e1c3a` | 0 | 0.05 | 1.0 / 0.03 | 1.76 | `attenuationColor` `#5a0f2e` if transmission is used |
| Honey tiger's eye (variant) | `#a8742e` | 0 | 0.10 | 1.0 / 0.04 | 1.54 | `anisotropy` 0.8 for the moving light band |

Using these with the site's one material per earring (`SPEC.md` §3.5):

- The colour, metalness and roughness live in the retextured maps; the table gives the values the
  maps should hold. Check them after the retexture with the same sampling as §1.
- `ior` is one number per material. Use **1.54** for the moon (onyx, moonstone and mother-of-pearl
  are all 1.52 to 1.54) and about **1.6** for the sun (pearls and mother-of-pearl dominate; the
  diamonds' fire comes from their normal-map facets).
- The layered effects (`clearcoat`, `sheen`, `iridescence`) can be confined to the stones with their
  maps (`clearcoatMap`, `sheenColorMap`, `iridescenceMap`), made from a stone mask: the texels where
  the metalness map is below 0.5.
- `transmission` costs an extra render pass. Leave it at 0 on the site and let sheen and iridescence
  carry the moonstone and pearls.
- With the metal this bright, `envMapIntensity` and exposure (`SPEC.md` §6) will need lowering, so the
  platinum is bright but not blown.

## How this was measured

- The textures were extracted from the glb (the JSON chunk's `images` and their buffer views) and
  their channel ranges checked. Moon roughness spans 0.08 to 0.59 and metalness 0 to 0.97; sun
  roughness 0.20 to 0.59 and metalness 0 to 1.
- Each model was rendered in a small three.js 0.170 viewer with an orthographic camera aimed at a
  point, in five views: lit (hemisphere, a directional light and `RoomEnvironment`), unlit base
  colour, metalness, roughness, and metalness and roughness together. The debug views sample the
  model's own maps through its uvs and texture transform, and write the raw values.
- Each part was located on a coordinate grid in the front view and looked at in four close-ups
  (front, angled, base, MR). Its values are statistics over the pixels inside a box around it in the
  front orthographic view: base colour is a mean, metalness and roughness are percentiles (p10, p50
  and p90 were recorded; the tables give p50). Boxes were kept inside the part where possible; where a
  part is small (a stone in a setting), neighbouring material can pull a value, as noted.
- The crescent's stones were counted as dark connected regions in a base colour render; the sun's rays
  from the silhouette's radial profile around the dome.
