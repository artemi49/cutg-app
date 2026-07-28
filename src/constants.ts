import type {
  BlueprintTexts,
  Gender,
  HairStyle,
  HairstyleGroup,
  Language,
} from "./types";

export const DEFAULT_TEXTS: Record<Language, BlueprintTexts> = {
  de: {
    beforeLabel: "VORHER",
    afterLabel: "NACHHER",
    headline: "Dein neuer Look",
    subline: "Vorher · Nachher Transformation",
    cta: "Jetzt ausprobieren",
  },
  en: {
    beforeLabel: "BEFORE",
    afterLabel: "AFTER",
    headline: "Your New Look",
    subline: "Before · After Transformation",
    cta: "Try it now",
  },
  fr: {
    beforeLabel: "AVANT",
    afterLabel: "APRÈS",
    headline: "Votre nouveau look",
    subline: "Transformation avant · après",
    cta: "Essayer maintenant",
  },
  es: {
    beforeLabel: "ANTES",
    afterLabel: "DESPUÉS",
    headline: "Tu nuevo look",
    subline: "Transformación antes · después",
    cta: "Pruébalo ahora",
  },
  it: {
    beforeLabel: "PRIMA",
    afterLabel: "DOPO",
    headline: "Il tuo nuovo look",
    subline: "Trasformazione prima · dopo",
    cta: "Provalo ora",
  },
};

export const UI_LABELS: Record<
  Language,
  {
    uploadTitle: string;
    uploadHint: string;
    beforeUpload: string;
    afterUpload: string;
    language: string;
    texts: string;
    generate: string;
    generating: string;
    download: string;
    accentColor: string;
    brandName: string;
    showBranding: string;
    formatHint: string;
  }
> = {
  de: {
    uploadTitle: "Vorher & Nachher importieren",
    uploadHint: "JPG, PNG oder WebP",
    beforeUpload: "Vorher-Bild",
    afterUpload: "Nachher-Bild",
    language: "Sprache",
    texts: "Texte anpassen",
    generate: "TikTok-Template erstellen",
    generating: "Template wird erstellt…",
    download: "Bild herunterladen",
    accentColor: "Akzentfarbe",
    brandName: "Markenname",
    showBranding: "Branding anzeigen",
    formatHint: "Ausgabe: 1080 × 1680 px · TikTok-Format",
  },
  en: {
    uploadTitle: "Import before & after",
    uploadHint: "JPG, PNG or WebP",
    beforeUpload: "Before image",
    afterUpload: "After image",
    language: "Language",
    texts: "Customize texts",
    generate: "Create TikTok template",
    generating: "Creating template…",
    download: "Download image",
    accentColor: "Accent color",
    brandName: "Brand name",
    showBranding: "Show branding",
    formatHint: "Output: 1080 × 1680 px · TikTok format",
  },
  fr: {
    uploadTitle: "Importer avant & après",
    uploadHint: "JPG, PNG ou WebP",
    beforeUpload: "Image avant",
    afterUpload: "Image après",
    language: "Langue",
    texts: "Personnaliser les textes",
    generate: "Créer le template TikTok",
    generating: "Création du template…",
    download: "Télécharger l'image",
    accentColor: "Couleur d'accent",
    brandName: "Nom de marque",
    showBranding: "Afficher la marque",
    formatHint: "Sortie : 1080 × 1680 px · format TikTok",
  },
  es: {
    uploadTitle: "Importar antes y después",
    uploadHint: "JPG, PNG o WebP",
    beforeUpload: "Imagen antes",
    afterUpload: "Imagen después",
    language: "Idioma",
    texts: "Personalizar textos",
    generate: "Crear plantilla TikTok",
    generating: "Creando plantilla…",
    download: "Descargar imagen",
    accentColor: "Color de acento",
    brandName: "Nombre de marca",
    showBranding: "Mostrar marca",
    formatHint: "Salida: 1080 × 1680 px · formato TikTok",
  },
  it: {
    uploadTitle: "Importa prima e dopo",
    uploadHint: "JPG, PNG o WebP",
    beforeUpload: "Immagine prima",
    afterUpload: "Immagine dopo",
    language: "Lingua",
    texts: "Personalizza testi",
    generate: "Crea template TikTok",
    generating: "Creazione template…",
    download: "Scarica immagine",
    accentColor: "Colore accento",
    brandName: "Nome brand",
    showBranding: "Mostra branding",
    formatHint: "Output: 1080 × 1680 px · formato TikTok",
  },
};

/** Moderne Männer-Trendfrisuren für Lumina (GPT Image 2), gruppiert */
export const HAIRCUT_GROUPS: HairstyleGroup[] = [
  {
    group: "Trend 2026",
    cuts: [
      { name: "Low Taper Fade", details: "subtle low taper fade tight at the neckline and temples, longer textured hair on top, the most popular modern barber cut" },
      { name: "Textured Fringe", details: "short faded sides with a forward-styled textured fringe falling onto the forehead, messy modern finish" },
      { name: "Textured Crop", details: "short choppy textured crop on top with a fringe and a clean fade on the sides" },
      { name: "Blowout Taper", details: "voluminous fluffy curly top blown out and rounded, with a clean low taper fade on the sides, trendy broccoli-style cut" },
      { name: "Middle Part Curtains", details: "medium length hair parted down the middle and swept to both sides, soft modern curtain fringe" },
      { name: "Curtain Fringe Fade", details: "soft curtain fringe split at the front swept to both sides, paired with a low fade" },
      { name: "Messy Fringe", details: "tousled medium-short hair styled forward into a relaxed messy fringe, effortless look" },
      { name: "Modern Mullet", details: "short textured top and sides with longer length at the back, contemporary mullet" },
      { name: "Wolf Cut", details: "shaggy layered cut with textured volume on top and wispy feathered layers, edgy and modern" },
      { name: "Two Block Cut", details: "longer styled top layer over short undercut sides, clean modern Korean two block" },
      { name: "Korean Perm", details: "soft loose wavy perm with natural volume and movement, down-perm fringe, Korean style" },
      { name: "Edgar Cut", details: "short blunt straight fringe across the forehead with sharp faded sides, takuache style" },
      { name: "Burst Fade Mohawk", details: "fade curving in a burst around the ears, longer strip of textured hair through the middle" },
      { name: "Faux Hawk", details: "hair styled up into a soft central peak with shorter or faded sides" },
      { name: "Disconnected Undercut", details: "hard disconnection between short shaved sides and a longer slicked or loose top" },
    ],
  },
  {
    group: "Fades & Classic",
    cuts: [
      { name: "Low Skin Fade", details: "clean low skin fade down to bare skin near the neckline, neat styled top" },
      { name: "Mid Drop Fade", details: "mid fade that drops lower behind the ear following the head shape" },
      { name: "High Skin Fade", details: "high bold skin fade with sharp contrast and a defined top" },
      { name: "Comb Over Fade", details: "hair combed neatly to one side with a defined part and a clean low fade" },
      { name: "Pompadour", details: "voluminous hair swept up and back from the forehead with tapered sides" },
      { name: "Quiff", details: "textured volume lifted up at the front, shorter back and sides" },
      { name: "Slick Back", details: "medium length hair combed straight back with a glossy polished finish" },
      { name: "Crew Cut", details: "short faded sides with a slightly longer cropped top tapered toward the front" },
      { name: "French Crop", details: "short cropped top with a blunt straight fringe and faded sides" },
      { name: "Caesar Cut", details: "short horizontal fringe straight across the forehead, even short length all over" },
      { name: "Buzz Cut", details: "very short uniform buzzed hair all over, clean and low maintenance" },
      { name: "Side Part", details: "classic side part with a sharp hard part line and tapered sides" },
    ],
  },
  {
    group: "Afro-Textured / Curly",
    cuts: [
      { name: "360 Waves Taper", details: "short 360 waves with a connected spinning wave pattern and a clean taper fade, brushed waves, sharp line up" },
      { name: "Afro Taper Fade", details: "rounded full natural afro on top with a clean taper fade on the sides, defined edge up" },
      { name: "High Top Fade", details: "tall box-shaped flat afro on top with very short faded sides, classic high top with sharp lines" },
      { name: "Curly Top Taper", details: "natural defined curls kept full and moisturized on top with a low taper fade on the sides" },
      { name: "Starter Locs", details: "short beginning dreadlocks (starter locs) evenly across the head with tapered sides" },
      { name: "Bald Fade Line Up", details: "very short hair with a clean bald fade and a razor-sharp line up at the hairline" },
    ],
  },
];

/** Moderne Frauen-Trendfrisuren für Lumina (GPT Image 2), gruppiert */
export const WOMEN_HAIRCUT_GROUPS: HairstyleGroup[] = [
  {
    group: "Trend 2026",
    cuts: [
      { name: "Butterfly Cut", details: "long hair with heavily layered shorter face-framing pieces that flick outward like butterfly wings, big blow-dried volume around the face" },
      { name: "Curtain Bangs", details: "soft curtain bangs parted in the middle and swept open to both sides, blending seamlessly into face-framing layers" },
      { name: "Wolf Cut", details: "shaggy wolf cut between a shag and a mullet: choppy volume and short layers on top, wispy longer lengths at the back, heavy texture" },
      { name: "Italian Bob", details: "jaw- to chin-length bob with soft rounded volume and the ends bending slightly inward, glossy Italian summer finish" },
      { name: "French Bob", details: "short blunt bob ending just below the ears with a full straight fringe, effortless Parisian finish" },
      { name: "Bixie Cut", details: "hybrid of bob and pixie: short cropped textured layers around the ears and nape with slightly longer piecey length on top" },
      { name: "Shaggy Lob", details: "shoulder-length lob with choppy shag layers, soft bangs and lived-in undone texture" },
      { name: "Wispy Bangs", details: "fine airy see-through fringe skimming the eyebrows, soft wispy ends, rest of the length kept long" },
      { name: "Birkin Bangs", details: "full soft 70s fringe splitting slightly in the middle, worn with long straight hair and gentle movement" },
      { name: "Jellyfish Cut", details: "sharply disconnected short bowl-shaped layer around the crown sitting over long straight lengths underneath, avant-garde jellyfish silhouette" },
      { name: "Octopus Cut", details: "short choppy volume through the crown with long thin wispy tendrils falling underneath, heavily layered octopus shape" },
      { name: "Ghost Layers", details: "long hair with invisible internal layers: the ends stay blunt and thick while the hair gains soft movement" },
      { name: "Blunt Cut with Face Frame", details: "one-length blunt cut with sharp thick ends plus soft shorter face-framing pieces at the front" },
      { name: "Bottleneck Bangs", details: "bangs shorter and rounded in the middle and longer at the sides, curving out like a bottleneck into the lengths" },
      { name: "Modern Mullet", details: "contemporary feminine mullet with short choppy top and bangs and longer textured length at the back, edgy but wearable" },
    ],
  },
  {
    group: "Bobs & Lobs",
    cuts: [
      { name: "Classic Bob", details: "clean chin-length bob, one length all around with a soft rounded shape" },
      { name: "Blunt Bob", details: "sharp blunt bob cut in a straight hard line at jaw level, thick heavy ends, sleek glossy finish" },
      { name: "A-Line Bob", details: "bob angled shorter at the back and gradually longer toward the front, sharp A-line silhouette" },
      { name: "Inverted Bob", details: "stacked graduated bob with short layered volume at the back and longer front pieces" },
      { name: "Textured Bob", details: "jaw-length bob with choppy razored ends and tousled piecey texture" },
      { name: "Bob with Curtain Bangs", details: "chin-length bob paired with soft curtain bangs parted in the middle" },
      { name: "Micro Bob", details: "very short blunt bob cut high above the jaw, sitting just under the ears, bold and sharp" },
      { name: "Wavy Lob", details: "collarbone-length lob styled in loose soft waves with airy movement" },
      { name: "Sleek Lob", details: "shoulder-grazing lob blow-dried perfectly straight and glassy with a subtle inward bend" },
      { name: "Asymmetric Bob", details: "bob with one side noticeably longer than the other, sharp asymmetric line" },
      { name: "Layered Bob", details: "bob with soft internal layers for movement and lift, rounded voluminous shape" },
      { name: "Bob with Bangs", details: "chin-length bob with a full blunt fringe straight across the eyebrows" },
    ],
  },
  {
    group: "Long & Layered",
    cuts: [
      { name: "Long Layers", details: "long hair with soft cascading layers running from the cheekbones down, natural movement and body" },
      { name: "Face-Framing Layers", details: "long hair with shorter layers cut around the face to frame the cheekbones and jaw, flicked away from the face" },
      { name: "V-Cut Long Hair", details: "very long hair cut into a sharp V shape at the back with long tapering layers" },
      { name: "U-Cut Long Hair", details: "long hair with a soft rounded U-shaped hem and gentle layering" },
      { name: "Bouncy Blowout", details: "long hair blow-dried with a big round brush into bouncy rounded volume and flicked ends, glossy salon blowout" },
      { name: "Beach Waves", details: "long relaxed beachy waves with soft undone texture and a matte lived-in finish" },
      { name: "Hollywood Waves", details: "long polished old-Hollywood waves, deep uniform S-shaped glossy waves brushed out smooth" },
      { name: "Sleek Straight", details: "long hair flat-ironed pin straight with a glassy mirror shine and a sharp clean hem" },
      { name: "Feathered Layers", details: "long 70s feathered layers flicking away from the face, soft winged movement" },
      { name: "Butterfly Layers XL", details: "extra long hair with dramatic stacked short-to-long layering for maximum volume around the face" },
      { name: "Straight with Middle Part", details: "long straight hair with a clean middle part falling smoothly on both sides of the face" },
    ],
  },
  {
    group: "Curly & Coily",
    cuts: [
      { name: "Curly Shag", details: "curly hair cut into a shaggy layered shape with curly bangs and lots of defined volume" },
      { name: "Curly Bob", details: "chin-length curly bob with defined springy curls and rounded volume" },
      { name: "Bouncy Ringlets", details: "long hair in defined bouncy spiral ringlet curls, shiny and well moisturised" },
      { name: "Wash and Go Curls", details: "natural defined wash-and-go curls with even curl pattern, soft frizz-free finish" },
      { name: "Layered Curls", details: "long curly hair with long internal layers so the curls fall in a soft cascading shape" },
      { name: "Curly Pixie", details: "short curly pixie with defined curls on top and tapered short sides" },
      { name: "Natural Afro", details: "full rounded natural afro with even soft volume all around, freshly picked out" },
      { name: "Twist Out", details: "twist-out style with defined stretched coils and soft separated volume" },
      { name: "Coily Tapered Cut", details: "natural coily hair kept full on top with a clean tapered fade at the sides and nape" },
      { name: "Curly Lob", details: "shoulder-length curly lob with soft layers and defined curl clumps" },
      { name: "Wavy Bronde Layers", details: "loose natural waves with soft layers and effortless air-dried texture" },
    ],
  },
  {
    group: "Short & Pixie",
    cuts: [
      { name: "Classic Pixie", details: "short pixie cut, cropped close at the back and sides with a slightly longer textured top" },
      { name: "Long Pixie", details: "grown-out pixie with longer piecey top and fringe swept to one side" },
      { name: "Pixie with Bangs", details: "short pixie with a soft wispy fringe falling onto the forehead" },
      { name: "Undercut Pixie", details: "pixie with a shaved or very short undercut at the sides and nape and a longer disconnected top" },
      { name: "Textured Crop", details: "short cropped cut with choppy piecey texture on top and a short soft fringe" },
      { name: "Short Shag", details: "short shaggy cut with heavy choppy layers and a fringe, rock-and-roll texture" },
      { name: "Bowl Cut Modern", details: "modern rounded bowl-shaped cut with a strong blunt line and soft texture" },
      { name: "Buzz Cut", details: "very short evenly buzzed hair all over, clean and bold" },
      { name: "Mixie Cut", details: "mullet-pixie mix: short cropped front and sides with a slightly longer soft nape" },
      { name: "Sleek Short Bob", details: "very short sleek bob at ear length, blow-dried smooth and tucked behind the ears" },
    ],
  },
  {
    group: "Braids & Updos",
    cuts: [
      { name: "Knotless Box Braids", details: "long knotless box braids with neat square parting and smooth flat roots" },
      { name: "Fulani Braids", details: "Fulani braid style with a centre cornrow, side braids and fine braided lengths with beads" },
      { name: "Cornrows", details: "neat straight-back cornrows braided close to the scalp with clean even partings" },
      { name: "Goddess Braids", details: "thick braided goddess braids with soft curly wavy pieces left out along the braids" },
      { name: "Boxer Braids", details: "two tight Dutch braids running straight back from a centre parting" },
      { name: "Sleek High Ponytail", details: "very sleek high ponytail with a glassy smooth pulled-back top and long straight length" },
      { name: "Bubble Ponytail", details: "long ponytail segmented into rounded bubbles with hair ties" },
      { name: "Messy Bun", details: "relaxed high messy bun with soft face-framing strands left loose" },
      { name: "Sleek Low Bun", details: "polished low bun at the nape with a smooth glossy pulled-back top and a middle part" },
      { name: "Space Buns", details: "two playful buns placed high on both sides of the head" },
      { name: "Half Up Half Down", details: "top section pulled back and secured while the rest falls loose in soft waves" },
      { name: "French Twist", details: "elegant French twist with the hair rolled and pinned vertically at the back of the head" },
    ],
  },
  {
    group: "Color & Balayage",
    cuts: [
      { name: "Caramel Balayage", details: "sun-kissed caramel balayage hand-painted from mid-lengths to ends over a warm brunette base, soft seamless blend", kind: "color" },
      { name: "Money Piece", details: "bright lightened money-piece sections framing the face at the front, rest of the hair kept in the natural base colour", kind: "color" },
      { name: "Platinum Blonde", details: "icy platinum blonde from root to tip, cool clean toneless finish", kind: "color" },
      { name: "Honey Blonde", details: "warm honey blonde with soft golden dimension throughout", kind: "color" },
      { name: "Babylights", details: "fine delicate babylights woven through the top sections for a naturally sun-lightened look", kind: "color" },
      { name: "Copper Red", details: "vivid copper red, glossy and saturated from root to tip", kind: "color" },
      { name: "Chocolate Brunette", details: "rich glossy chocolate brunette with subtle warm depth", kind: "color" },
      { name: "Ash Brown", details: "cool smoky ash brown with neutral matte tones and no warmth", kind: "color" },
      { name: "Ombré", details: "dark natural roots melting gradually into much lighter ends, smooth ombré gradient", kind: "color" },
      { name: "Silver Grey", details: "cool metallic silver grey with a soft shadowed root", kind: "color" },
      { name: "Cherry Cola", details: "deep cherry cola red-brown with glossy red reflections", kind: "color" },
      { name: "Peekaboo Color", details: "hidden vivid peekaboo colour panel underneath the top layer, only visible when the hair moves", kind: "color" },
    ],
  },
];

/** Style-Bibliothek je Zielgruppe */
export const HAIRCUT_GROUPS_BY_GENDER: Record<Gender, HairstyleGroup[]> = {
  men: HAIRCUT_GROUPS,
  women: WOMEN_HAIRCUT_GROUPS,
};

export const GENDERS: { code: Gender; label: string; icon: string }[] = [
  { code: "men", label: "Men", icon: "💈" },
  { code: "women", label: "Women", icon: "💇‍♀️" },
];

export const allStyles = (gender: Gender): HairStyle[] =>
  HAIRCUT_GROUPS_BY_GENDER[gender].flatMap((g) => g.cuts);

/** Findet einen Style innerhalb der gewählten Zielgruppe (Namen können sich zwischen den Gruppen überschneiden) */
export const findStyle = (gender: Gender, name: string): HairStyle | undefined =>
  allStyles(gender).find((s) => s.name === name);

/** Moderne Bart-Styles für Lumina */
export const BEARD_STYLES: { name: string; details: string }[] = [
  { name: "Clean Shaven", details: "completely clean shaven smooth face, no beard and no stubble at all" },
  { name: "Stubble", details: "short even stubble across the jaw and cheeks, neat groomed three-day shadow" },
  { name: "Short Beard", details: "short full beard evenly trimmed, sharply lined along the cheeks and neckline" },
  { name: "Full Beard", details: "thick full beard with good length, neatly groomed and shaped, defined edges" },
  { name: "Garibaldi", details: "long rounded full beard with a natural fuller bottom and a thick mustache" },
  { name: "Ducktail", details: "full beard tapered to a pointed ducktail shape at the chin, tidy cheeks" },
  { name: "Van Dyke", details: "disconnected pointed goatee with a styled mustache, cheeks fully shaved" },
  { name: "Goatee", details: "chin goatee connected to the mustache, cheeks clean shaven" },
  { name: "Circle Beard", details: "rounded circle beard connecting mustache and chin in a circle, cheeks shaved" },
  { name: "Balbo", details: "balbo beard with no sideburns: a separate mustache and a sculpted chin and jaw beard" },
  { name: "Anchor", details: "anchor-shaped beard along the jawline plus a mustache, no sideburn connection" },
  { name: "Beardstache", details: "prominent thick mustache with very short stubble on the rest of the beard area" },
  { name: "Faded Beard", details: "full beard faded smoothly into the sideburns with a sharp clean cheek line" },
  // Schnauzer / Moustache-Styles
  { name: "Chevron", details: "thick chevron mustache fully covering the top lip, cheeks and chin clean shaven" },
  { name: "Handlebar", details: "long mustache with the ends twisted and curled upward into rounded loops, cheeks shaved" },
  { name: "Imperial", details: "large bushy mustache with both ends curled and twisted upward, no chin beard" },
  { name: "Dalí", details: "thin mustache with very long pointed ends twisted and pointing straight upward, dramatic" },
  { name: "English Moustache", details: "narrow mustache parted in the middle with long ends pulled and twisted out to the sides" },
  { name: "Walrus", details: "thick bushy mustache hanging down fully over the upper lip, cheeks shaved" },
  { name: "Horseshoe", details: "mustache extending straight down both sides of the mouth to the jaw, horseshoe shape" },
  { name: "Fu Manchu", details: "long thin mustache with the ends growing straight downward past the chin, cheeks shaved" },
  { name: "Pencil", details: "very thin narrow pencil mustache outlining just the upper lip, neatly trimmed" },
];

/** Baut einen JSON-Prompt, der NUR den Bart verändert (Haare/Gesicht/Identität bleibt) */
export function buildBeardPrompt(name: string, details: string): string {
  return JSON.stringify(
    {
      task: "change_beard_only",
      target_beard: {
        name,
        description: details,
        style: "modern groomed men's beard",
      },
      keep_unchanged: [
        "face",
        "facial features",
        "identity",
        "hairstyle and hair on the head",
        "skin tone",
        "expression",
        "eyes",
        "nose",
        "mouth",
        "ears",
        "background",
        "clothing",
        "lighting",
        "head pose and angle",
      ],
      requirements: [
        "Only modify the beard, mustache and facial hair",
        "Keep the exact same person and face — do not change identity or the haircut",
        "Photorealistic with natural facial hair texture and a clean groomed result",
      ],
      instruction: `Edit ONLY the facial hair of the man in this photo to a ${name} beard style. Do not change his face, identity, hairstyle or the background — change the beard only.`,
    },
    null,
    2
  );
}

/** Sprachbausteine je Zielgruppe – halten alle Prompts konsistent */
export const SUBJECT: Record<Gender, { noun: string; possessive: string; venue: string }> = {
  men: { noun: "man", possessive: "his", venue: "barbershop" },
  women: { noun: "woman", possessive: "her", venue: "hair salon" },
};

/** Baut einen JSON-Prompt, der NUR die Haare (bzw. NUR die Haarfarbe) verändert */
export function buildHaircutPrompt(style: HairStyle, gender: Gender): string {
  const { noun, possessive, venue } = SUBJECT[gender];
  const isColor = style.kind === "color";

  const keepUnchanged = [
    "face",
    "facial features",
    "identity",
    "skin tone",
    "expression",
    "eyes",
    "nose",
    "mouth",
    "ears",
    ...(gender === "men" ? ["beard and facial hair"] : ["makeup"]),
    "background",
    "clothing",
    "lighting",
    "head pose and angle",
    ...(isColor ? ["haircut, hair length and hairstyle"] : []),
  ];

  return JSON.stringify(
    isColor
      ? {
          task: "change_hair_color_only",
          target_hair_color: {
            name: style.name,
            description: style.details,
            style: `modern ${venue} colour service`,
          },
          keep_unchanged: keepUnchanged,
          requirements: [
            "Only modify the colour of the hair",
            "Keep the exact same haircut, length, parting and styling",
            "Keep the exact same person and face — do not change identity",
            "Photorealistic with natural shine and realistic colour depth",
          ],
          instruction: `Recolour ONLY the hair of the ${noun} in this photo to ${style.name}. Do not change ${possessive} haircut, face, identity, skin or the background — change the hair colour only.`,
        }
      : {
          task: "change_hairstyle_only",
          target_hairstyle: {
            name: style.name,
            description: style.details,
            style: `modern ${gender === "men" ? "men's" : "women's"} ${venue} hairstyle`,
          },
          keep_unchanged: keepUnchanged,
          requirements: [
            "Only modify the hair on the head",
            "Keep the exact same person and face — do not change identity",
            "Photorealistic with a natural hairline and realistic hair texture",
            `Clean, professional modern ${venue} result`,
          ],
          instruction: `Edit ONLY the hairstyle of the ${noun} in this photo to a ${style.name}. Do not change ${possessive} face, identity, skin${
            gender === "men" ? ", beard" : ""
          } or the background — change the hair only.`,
        },
    null,
    2
  );
}

export const LANGUAGES: { code: Language; label: string }[] = [
  { code: "de", label: "Deutsch" },
  { code: "en", label: "English" },
  { code: "fr", label: "Français" },
  { code: "es", label: "Español" },
  { code: "it", label: "Italiano" },
];
