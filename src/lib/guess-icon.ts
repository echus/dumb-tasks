import type { Category } from './types';

export interface IconGuess {
  icon: string; // Lucide icon name
  category: Category;
}

// Earlier rules win, so specific nouns come before generic verbs:
// "buy birthday present" should be a gift, not a shopping cart.
const RULES: [icon: string, category: Category, words: string][] = [
  ['cake', 'people', 'birthday bday anniversary party'],
  ['gift', 'people', 'gift present'],
  ['baby', 'people', 'baby nursery nappy nappies diaper'],
  ['dog', 'home', 'dog puppy vet walkies'],
  ['cat', 'home', 'cat kitten litter'],
  ['stethoscope', 'health', 'doctor gp dentist dental clinic hospital appointment checkup optician'],
  ['pill', 'health', 'prescription meds medicine medication pharmacy pill vitamin'],
  ['dumbbell', 'health', 'gym workout exercise lift weights yoga pilates'],
  ['bike', 'health', 'run running cycle bike swim'],
  ['heart-pulse', 'health', 'therapy therapist health'],
  ['landmark', 'money', 'bank mortgage loan hmrc council'],
  ['receipt', 'money', 'tax invoice bill receipt expense refund'],
  ['wallet', 'money', 'budget money savings save pension transfer'],
  ['file-text', 'money', 'form passport visa licence license insurance paperwork document contract sign'],
  ['plane', 'errands', 'flight flights holiday trip travel hotel airport book'],
  ['car', 'errands', 'car mot service garage tyre tyres'],
  ['fuel', 'errands', 'petrol fuel diesel charge'],
  ['package', 'errands', 'parcel post return collect delivery courier'],
  ['scissors', 'errands', 'haircut hairdresser barber'],
  ['shirt', 'errands', 'clothes shoes dry-cleaning outfit'],
  ['wrench', 'home', 'fix repair plumber boiler leak broken electrician install'],
  ['washing-machine', 'home', 'laundry washing wash ironing'],
  ['trash', 'home', 'bins bin rubbish recycling trash'],
  ['sprout', 'home', 'garden plant plants weed mow lawn water'],
  ['sofa', 'home', 'furniture sofa ikea tidy declutter'],
  ['house', 'home', 'clean hoover vacuum dust house flat landlord rent move'],
  ['utensils', 'home', 'cook dinner lunch breakfast meal recipe'],
  ['presentation', 'work', 'presentation slides deck talk demo'],
  ['calendar', 'work', 'meeting standup 1:1 schedule sync'],
  ['code', 'work', 'code bug deploy pr review refactor release'],
  ['briefcase', 'work', 'work client boss manager report deadline project interview cv'],
  ['laptop', 'work', 'laptop computer backup update password'],
  ['graduation-cap', 'creative', 'exam assignment homework essay revise'],
  ['keyboard-music', 'creative', 'music song guitar piano practice playlist'],
  ['camera', 'creative', 'photo photos camera film video'],
  ['paintbrush', 'creative', 'paint draw sketch design art craft'],
  ['pen-line', 'creative', 'write blog journal draft note'],
  ['book-open', 'creative', 'read book article course study learn'],
  ['lightbulb', 'creative', 'idea ideas brainstorm research'],
  ['users', 'people', 'friends family visit catch-up dinner-party'],
  ['phone', 'people', 'call ring phone text'],
  ['mail', 'people', 'email mail reply message letter'],
  ['credit-card', 'money', 'pay payment subscription cancel renew'],
  ['shopping-cart', 'errands', 'buy shop shopping order groceries supermarket milk bread eggs'],
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

/** Best-guess icon for a task, or null to show a neutral dot. */
export function guessIcon(text: string): IconGuess | null {
  const words = text.toLowerCase().replace(/'s\b/g, '').match(/[a-z0-9:-]+/g) ?? [];
  let best: IconGuess | null = null;
  for (const word of words) {
    for (const form of candidates(word)) {
      const hit = LOOKUP.get(form);
      if (hit && (!best || PRIORITY.get(hit.icon)! < PRIORITY.get(best.icon)!)) best = hit;
    }
  }
  return best;
}
