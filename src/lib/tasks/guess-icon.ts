// Each rule is an emoji, its strong words, then after "|" its weak words. Strong words say
// what a task is about ("dentist", "groceries"). Weak words are verbs and words with other
// meanings ("buy", "sync", "garage"): they decide only when nothing strong matches. Between
// matches of the same strength the later word wins, as tasks put the thing after the verb:
// "email Sarah about the invoice" is about the invoice.
const RULES: [emoji: string, words: string][] = [
  ['🎂', 'birthday bday anniversary celebration | party celebrate'],
  ['🎁', 'gift gifts christmas xmas | present presents wrap wrapping flowers'],
  ['👶', 'baby nursery nappy nappies diaper babysitter childcare daycare creche'],
  ['🧒', 'kids kid scouts cubs brownies playdate | school'],
  ['🐕', 'dog puppy walkies dogs groomer | vet'],
  ['🐈', 'cat kitten litter cats'],
  ['💉', 'vaccine vaccination jab booster vax immunisation immunization'],
  ['🩺', 'doctor gp dentist dental clinic hospital checkup optician optometrist dr nurse surgery smear blood scan xray specialist referral | appointment appt glasses eyes teeth'],
  ['💊', 'prescription meds medicine medication pharmacy pill vitamin pills tablets inhaler pharmacist chemist supplements'],
  ['🏋️', 'gym workout exercise weights yoga pilates training stretch stretching pushups squats | lift'],
  ['🚲', 'bike bikes ebike e-bike bicycle cycle cycling'],
  ['🏃', 'running jog jogging hike hiking swim swimming 5k 10k marathon parkrun laps | run'],
  ['🧘', 'therapy therapist physio counselling counsellor meditate meditation wellbeing psychologist | health mental'],
  ['🏦', 'bank mortgage loan hmrc ato centrelink | council government account isa'],
  ['🧾', 'tax invoice bill receipt expense refund bills invoices taxes vat gst accountant receipts expenses electricity utilities | accounts'],
  ['💰', 'budget money savings pension super superannuation finances finance invest investing cash paypal shares | save transfer'],
  ['📄', 'form passport visa licence license insurance paperwork document contract forms application docs documents signature registration deregistration | sign apply admin print'],
  ['🎫', 'tickets ticket festival | event events'],
  ['✈️', 'flight flights holiday holidays trip travel hotel airport vacation luggage suitcase airbnb abroad overseas | booking pack packing'],
  ['🚗', 'car cars mot rego ute mechanic parking vehicle | tyre tyres service drive driving'],
  ['⛽', 'petrol fuel diesel servo | ev'],
  ['📦', 'parcel parcels delivery courier ebay amazon auspost | post return returns collect pickup'],
  ['✂️', 'haircut hairdresser barber hair nails manicure'],
  ['👕', 'clothes shoes dry-cleaning outfit jacket coat dress jeans trainers socks wardrobe suit tailor'],
  ['🔧', 'plumber boiler leak electrician tap sink shelves shelf diy drill tools curtains blinds locksmith bunnings handyman | fix repair broken install mend door lock quote hang replace frame frames'],
  ['🧺', 'laundry washing ironing towels sheets bedsheets bedding duvet | wash'],
  ['🗑️', 'bins bin rubbish recycling trash tip clearout'],
  ['🌱', 'garden plant plants weed weeds mow lawn hedge trees repot seeds pots allotment houseplants gardening monstera | water'],
  ['🛋️', 'furniture sofa couch ikea declutter | tidy organise organize sort bedroom'],
  ['🏠', 'hoover vacuum house flat landlord rent home cleaning cleaner bathroom kitchen oven fridge freezer dishes dishwasher mop windows lease | clean dust move garage lounge'],
  ['☕', 'coffee cafe'],
  ['🍽️', 'cook dinner lunch breakfast meal recipe food cooking bake baking soup brunch picnic takeaway bbq barbecue sizzle | eat'],
  ['📊', 'presentation slides deck keynote webinar workshop | talk demo pitch'],
  ['📅', 'meeting meetings standup 1:1 agenda | schedule'],
  ['⌨️', 'code bug bugs deploy pr refactor github api coding programming server app website webdav nextcloud button feature css ui ux frontend backend repo click drag | review release sync field hack'],
  ['💼', 'work client boss manager report deadline project interview cv job jobs office colleague colleagues hr linkedin resume quarterly | team'],
  ['💻', 'laptop computer backup password passwords pc mac software wifi router printer tech charger | update'],
  ['🎓', 'exam exams assignment homework essay revise uni university college lecture thesis dissertation tafe | study class'],
  ['🎵', 'music song guitar piano playlist gig concert band songs spotify album | practice'],
  ['📷', 'photo photos camera film video pictures pics prints photoshoot lens | picture'],
  ['🎨', 'paint repaint draw sketch design art craft drawing painting crafts knit knitting sew sewing gradient'],
  ['✏️', 'blog journal draft writing diary poem story speech | write note notes'],
  ['📖', 'book books article course library novel kindle podcast audiobook reading | read learn language spanish french'],
  ['💡', 'idea ideas brainstorm research | think plan planning figure consider explore'],
  ['👥', 'friends family catch-up dinner-party friend mates drinks pub meetup wedding hangout grandma grandpa nan | visit'],
  ['📞', 'call ring calls whatsapp facetime | phone phones text'],
  ['✉️', 'email mail emails inbox letter letters | reply message respond'],
  ['💳', 'payment subscription subscriptions membership netflix | pay cancel renew'],
  ['🛒', 'shop shopping groceries grocery groc supermarket tesco sainsburys aldi lidl asda woolies woolworths coles costco toilet loo batteries | buy order milk bread eggs'],
];

// Phrases are read first, and stand in for their words: a "tip run" is a trip to the tip,
// not a run. Null: the words say nothing here ("get the bike running", "Google Drive").
// "*" stands for up to three words.
const PHRASES: [phrase: string, emoji: string | null][] = [
  ['google drive', null],
  ['get * running', null],
  ['up and running', null],
  ['drink * water', null],
  ['chase up', null],
  ['tip run', '🗑️'],
  ['school run', '🧒'],
  ['school pickup', '🧒'],
  ['school pick up', '🧒'],
  ['dry cleaning', '👕'],
  ['dry cleaner', '👕'],
  ['oil change', '🚗'],
  ['flu shot', '💉'],
  ['covid shot', '💉'],
  ['smoke alarm', '🔧'],
  ['book a table', '🍽️'],
  ['book club', '📖'],
  ['blog post', '✏️'],
  ['post office', '📦'],
  ['sausage sizzle', '🍽️'],
  ['in touch', '📞'],
  ['catch up with', '👥'],
  ['click and collect', '🛒'],
  ['dinner party', '👥'],
  ['back up', '💻'],
  ['boarding pass', '✈️'],
  ['update * will', '📄'],
  ['my will', '📄'],
  ['washing up', '🏠'],
  ['toilet paper', '🛒'],
];

// A task's first word is usually a verb, and a few verbs are nouns with another meaning:
// "book flights" is booking, while "read a book" isn't. These count as weak.
const AS_FIRST_WORD: Record<string, string> = {
  book: '✈️',
  present: '📊',
};

const STRONG = 2;
const WEAK = 1;
const PHRASE = 3;

const LOOKUP = new Map<string, [emoji: string, strength: number]>();
for (const [emoji, words] of RULES) {
  const [strong, weak = ''] = words.split('|');
  for (const w of strong.split(' ').filter(Boolean)) LOOKUP.set(w, [emoji, STRONG]);
  for (const w of weak.split(' ').filter(Boolean)) LOOKUP.set(w, [emoji, WEAK]);
}

/** Every emoji the keyword table can pick */
export const ICONS = RULES.map(([emoji]) => emoji);

const PHRASE_PATTERNS = PHRASES.map(
  ([phrase, emoji]) =>
    [
      new RegExp(`\\b${phrase.split(' ').map((w) => (w === '*' ? '(?:\\S+\\s+){0,3}?' : `${w}\\s+`)).join('').replace(/\\s\+$/, '')}\\b`, 'g'),
      emoji,
    ] as const,
);

function forms(word: string): string[] {
  const out = [word];
  for (const suffix of ['s', 'es', 'ing', 'ed']) {
    if (word.length > suffix.length + 2 && word.endsWith(suffix)) out.push(word.slice(0, -suffix.length));
  }
  // calling → call, but also shopping → shop
  if (word.endsWith('ing')) out.push(word.slice(0, -4));
  return out;
}

/**
 * True if a is b with one letter left out, added or swapped with its neighbour, the usual
 * slips when typing fast. Not a changed letter: "change" isn't a typo of "charge".
 */
function slipOf(a: string, b: string): boolean {
  if (a === b || a[0] !== b[0]) return false;
  if (a.length === b.length) {
    const i = [...a].findIndex((ch, k) => ch !== b[k]);
    return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2);
  }
  const [long, short] = a.length > b.length ? [a, b] : [b, a];
  if (long.length - short.length !== 1) return false;
  const i = [...short].findIndex((ch, k) => ch !== long[k]);
  return i === -1 || long.slice(i + 1) === short.slice(i);
}

type Hit = { emoji: string; strength: number; at: number };

/** Stronger first, then later in the task. */
function better(hit: Hit, best: Hit | null): boolean {
  return !best || hit.strength > best.strength || (hit.strength === best.strength && hit.at > best.at);
}

/**
 * Best-guess icon for a task, or null when nothing fits; the UI then shows PLAIN_ICON.
 * Prefers no icon to a wrong one, so near misses are only typing slips of long words.
 */
export function guessIcon(text: string): string | null {
  let rest = text.toLowerCase().replace(/'s\b/g, '').replace(/[^a-z0-9:+-]+/g, ' ');
  let best: Hit | null = null;

  for (const [pattern, emoji] of PHRASE_PATTERNS) {
    rest = rest.replace(pattern, (match, at: number) => {
      const hit = emoji && { emoji, strength: PHRASE, at };
      if (hit && better(hit, best)) best = hit;
      return ' '.repeat(match.length);
    });
  }

  const words = [...rest.matchAll(/[a-z0-9:+-]+/g)];
  for (const [i, { 0: word, index: at }] of words.entries()) {
    const first = i === 0 && text.trimStart().toLowerCase().startsWith(word) && AS_FIRST_WORD[word];
    const found = first ? [first, WEAK] as const : forms(word).map((f) => LOOKUP.get(f)).find(Boolean);
    const hit = found && { emoji: found[0], strength: found[1], at };
    if (hit && better(hit, best)) best = hit;
  }
  if (best) return (best as Hit).emoji;

  for (const { 0: word, index: at } of words) {
    if (word.length < 6) continue;
    for (const [keyword, [emoji, strength]] of LOOKUP) {
      if (keyword.length < 6 || !slipOf(word, keyword)) continue;
      const hit = { emoji, strength, at };
      if (better(hit, best)) best = hit;
    }
  }
  return best ? (best as Hit).emoji : null;
}
