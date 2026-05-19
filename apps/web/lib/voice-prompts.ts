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
