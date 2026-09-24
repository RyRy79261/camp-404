// Whisper domain-biasing prompts. Each string lists vocabulary the user is
// likely to say in the relevant context — names, jargon, numerals — which
// significantly improves transcription accuracy vs. an empty prompt.
//
// Keep these short (Whisper truncates around 224 tokens of prompt) and
// dense with the rare terms; don't bother repeating common English.

export const QUESTIONNAIRE_PROMPT =
  "Camp 404 burner profile. Afrikaburn, Burning Man, Tankwa Karoo, theme camp, " +
  "Dance of 1000 Flames, Now Now Meow Meow, mutant vehicle, DDT ticket, virgin burner. " +
  "Skills: cooking, recipes, vegan, kitchen, build, welding, sewing, fire safety, " +
  "fire spinning, poi, staff, fans, art, decor, lighting, generators, wiring, inverters, LEDs. " +
  "Roles: team lead, camp lead, treasurer, medic. Ministry of Vibes, Ministry of Memes.";

// A member dictating a recipe suggestion (#243): units, vegan staples and the
// spices and dishes of a South African camp kitchen.
export const RECIPE_PROMPT =
  "Camp 404 recipe. grams, kilograms, millilitres, litres, tablespoon, teaspoon, cup, tin, " +
  "a pinch, to taste. Vegan: nutritional yeast, chickpeas, lentils, red lentils, tofu, tempeh, " +
  "coconut milk, coconut cream, soy sauce, tahini, miso, seitan, oat milk. potjie, braai, " +
  "chakalaka, pap, bobotie, samp and beans, butternut, stock, vegetable stock. Spices: cumin, " +
  "turmeric, garam masala, coriander, paprika, smoked paprika, cardamom, fenugreek, masala, chilli.";

// Which prompt each voice field asks for, by the key its form sends. Own keys
// only, so a key like "toString" is no prompt.
const PROMPTS: Readonly<Record<string, string>> = {
  questionnaire: QUESTIONNAIRE_PROMPT,
  recipe: RECIPE_PROMPT,
};

/** The Whisper prompt for a form's `promptKey`, or undefined for an unknown key. */
export function voicePromptFor(key: string): string | undefined {
  return Object.hasOwn(PROMPTS, key) ? PROMPTS[key] : undefined;
}
