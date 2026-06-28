import type { BlueprintTexts, Language } from "./types";

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
export const HAIRCUT_GROUPS: {
  group: string;
  cuts: { name: string; details: string }[];
}[] = [
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
    group: "Fades & Klassisch",
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

/** Moderne Bart-Styles für Lumina */
export const BEARD_STYLES: { name: string; details: string }[] = [
  { name: "Glatt rasiert", details: "completely clean shaven smooth face, no beard and no stubble at all" },
  { name: "3-Tage-Bart", details: "short even stubble across the jaw and cheeks, neat groomed three-day shadow" },
  { name: "Kurzer Vollbart", details: "short full beard evenly trimmed, sharply lined along the cheeks and neckline" },
  { name: "Vollbart", details: "thick full beard with good length, neatly groomed and shaped, defined edges" },
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
  { name: "Schnauzer", details: "thick chevron mustache fully covering the top lip, cheeks and chin clean shaven" },
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

/** Baut einen JSON-Prompt, der NUR die Haare verändert (Gesicht/Identität bleibt) */
export function buildHaircutPrompt(name: string, details: string): string {
  return JSON.stringify(
    {
      task: "change_hairstyle_only",
      target_hairstyle: {
        name,
        description: details,
        style: "modern men's barbershop haircut",
      },
      keep_unchanged: [
        "face",
        "facial features",
        "identity",
        "skin tone",
        "expression",
        "eyes",
        "nose",
        "mouth",
        "ears",
        "beard and facial hair",
        "background",
        "clothing",
        "lighting",
        "head pose and angle",
      ],
      requirements: [
        "Only modify the hair on the head",
        "Keep the exact same person and face — do not change identity",
        "Photorealistic with a natural hairline and realistic hair texture",
        "Clean, professional modern barbershop result",
      ],
      instruction: `Edit ONLY the hairstyle of the man in this photo to a ${name}. Do not change his face, identity, skin, beard or the background — change the hair only.`,
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
