import type { Category } from './types';

export interface IconGuess {
  icon: string; // key into TASK_ICONS (emoji)
  category: Category;
}

// Earlier rules win, so specific nouns come before generic verbs:
// "buy birthday present" should be a gift, not a shopping cart.
const RULES: [icon: string, category: Category, words: string][] = [
  ['cake', 'people', 'birthday bday anniversary party celebration celebrate'],
  ['gift', 'people', 'gift present gifts presents wrap wrapping christmas xmas flowers'],
  ['baby', 'people', 'baby nursery nappy nappies diaper babysitter childcare kids'],
  ['dog', 'home', 'dog puppy vet walkies dogs groomer'],
  ['cat', 'home', 'cat kitten litter cats'],
  ['stethoscope', 'health', 'doctor gp dentist dental clinic hospital appointment checkup optician dr nurse surgery smear vaccine vaccination jab booster blood scan glasses eyes teeth'],
  ['pill', 'health', 'prescription meds medicine medication pharmacy pill vitamin pills tablets inhaler pharmacist chemist supplements'],
  ['dumbbell', 'health', 'gym workout exercise lift weights yoga pilates training weights stretch stretching pushups squats'],
  ['bike', 'health', 'run running cycle bike swim jog jogging hike hiking swimming 5k 10k marathon cycling'],
  ['heart-pulse', 'health', 'therapy therapist health physio counselling counsellor meditate meditation mental wellbeing'],
  ['landmark', 'money', 'bank mortgage loan hmrc council government isa account'],
  ['receipt', 'money', 'tax invoice bill receipt expense refund bills invoices taxes vat accountant accounts receipts expenses electricity utilities'],
  ['wallet', 'money', 'budget money savings save pension transfer finances finance invest investing cash paypal'],
  ['file-text', 'money', 'form passport visa licence license insurance paperwork document contract sign forms application apply docs documents admin print signature will'],
  ['plane', 'errands', 'flight flights holiday trip travel hotel airport book holidays vacation luggage suitcase airbnb booking abroad'],
  ['car', 'errands', 'car mot service garage tyre tyres cars mechanic parking drive driving'],
  ['fuel', 'errands', 'petrol fuel diesel charge charging ev'],
  ['package', 'errands', 'parcel post return collect delivery courier parcels returns ebay amazon pickup'],
  ['scissors', 'errands', 'haircut hairdresser barber hair nails'],
  ['shirt', 'errands', 'clothes shoes dry-cleaning outfit jacket coat dress jeans trainers socks wardrobe'],
  ['wrench', 'home', 'fix repair plumber boiler leak broken electrician install mend tap sink shelves shelf diy drill tools curtains blinds door lock locksmith quote'],
  ['washing-machine', 'home', 'laundry washing wash ironing towels sheets bedsheets bedding duvet'],
  ['trash', 'home', 'bins bin rubbish recycling trash tip clearout'],
  ['sprout', 'home', 'garden plant plants weed mow lawn water hedge trees repot seeds pots allotment houseplants'],
  ['sofa', 'home', 'furniture sofa ikea tidy declutter bedroom organise organize sort'],
  ['house', 'home', 'clean hoover vacuum dust house flat landlord rent move home cleaning bathroom kitchen oven fridge freezer dishes dishwasher mop windows lease'],
  ['utensils', 'home', 'cook dinner lunch breakfast meal recipe eat food cooking bake baking soup brunch picnic takeaway'],
  ['presentation', 'work', 'presentation slides deck talk demo pitch keynote webinar workshop'],
  ['calendar', 'work', 'meeting standup 1:1 schedule sync meetings agenda'],
  ['code', 'work', 'code bug deploy pr review refactor release app website site github api bugs coding programming server'],
  ['briefcase', 'work', 'work client boss manager report deadline project interview cv job jobs office team colleague colleagues hr linkedin resume quarterly'],
  ['laptop', 'work', 'laptop computer backup update password pc mac software wifi router printer tech charger'],
  ['graduation-cap', 'creative', 'exam assignment homework essay revise school uni university college lecture class thesis dissertation'],
  ['keyboard-music', 'creative', 'music song guitar piano practice playlist gig concert band songs spotify album'],
  ['camera', 'creative', 'photo photos camera film video pictures pics prints photoshoot'],
  ['paintbrush', 'creative', 'paint draw sketch design art craft drawing painting crafts knit knitting sew sewing'],
  ['pen-line', 'creative', 'write blog journal draft note writing diary notes poem story speech'],
  ['book-open', 'creative', 'read book article course study learn books reading library novel kindle podcast language spanish french'],
  ['lightbulb', 'creative', 'idea ideas brainstorm research think plan planning figure consider explore'],
  ['users', 'people', 'friends family visit catch-up dinner-party friend mates drinks pub meetup wedding hangout'],
  ['phone', 'people', 'call ring phone text calls whatsapp facetime'],
  ['mail', 'people', 'email mail reply message letter emails inbox respond letters'],
  ['credit-card', 'money', 'pay payment subscription cancel renew membership subscriptions netflix'],
  ['shopping-cart', 'errands', 'buy shop shopping order groceries supermarket milk bread eggs grocery tesco sainsburys aldi lidl asda toilet loo batteries'],
];

export const GUESSABLE_ICONS = [...new Set(RULES.map(([icon]) => icon))];

const LOOKUP = new Map<string, IconGuess>();
for (const [icon, category, words] of [...RULES].reverse()) {
  for (const w of words.split(' ')) LOOKUP.set(w, { icon, category });
}
const PRIORITY = new Map(RULES.map(([icon], i) => [icon, i]));

function candidates(word: string): string[] {
  const forms = [word];
  for (const suffix of ['s', 'es', 'ing', 'ed']) {
    if (word.length > suffix.length + 2 && word.endsWith(suffix)) {
      forms.push(word.slice(0, -suffix.length));
    }
  }
  // calling → call, but also shopping → shop
  if (word.endsWith('ing')) forms.push(word.slice(0, -4));
  return forms;
}

const KEYWORDS = [...LOOKUP.keys()];

/** True if a and b differ by at most one inserted, deleted or changed letter. */
function oneEditApart(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

/** Looser matching for words with no exact hit: typos ("plumbr") and abbreviations ("groc"). */
function fuzzyHit(word: string): IconGuess | undefined {
  // Kept tight: short words are too often real words that happen to be one letter off
  // ("thing" / "think"), and "check" shouldn't read as an abbreviation of "checkup".
  if (word.length < 4) return undefined;
  for (const k of KEYWORDS) {
    if (word.length >= 6 && k.length >= 6 && oneEditApart(word, k)) return LOOKUP.get(k);
    if (k.length >= word.length + 3 && k.startsWith(word)) return LOOKUP.get(k);
  }
  return undefined;
}

function better(hit: IconGuess | undefined, best: IconGuess | null): hit is IconGuess {
  return !!hit && (!best || PRIORITY.get(hit.icon)! < PRIORITY.get(best.icon)!);
}

/**
 * Best-guess icon for a task: exact keyword matches first, then near misses.
 * Null when nothing fits; the UI then shows an empty box.
 */
export function guessIcon(text: string): IconGuess | null {
  const words = text.toLowerCase().replace(/'s\b/g, '').match(/[a-z0-9:-]+/g) ?? [];
  let best: IconGuess | null = null;
  for (const word of words) {
    for (const form of candidates(word)) {
      const hit = LOOKUP.get(form);
      if (better(hit, best)) best = hit;
    }
  }
  if (best) return best;

  for (const word of words) {
    const hit = fuzzyHit(word);
    if (better(hit, best)) best = hit;
  }
  return best;
}
