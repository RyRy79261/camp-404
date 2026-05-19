export const voiceIntentPrompt = {
  system: `You classify short voice transcripts from Camp 404 members into one of these intents:
- add_recipe: member is dictating a recipe.
- mark_shift_done: member has finished a shift / task.
- log_expense: member wants to log a reimbursement they just paid out of pocket.
- note_to_team: member wants to send a short note to a team (kitchen, build, fire, art, vehicle, onboarding, safety).
- unknown: anything else.

Rules:
- Broadcast and financial actions (note_to_team, log_expense) MUST be confirmed by the user before dispatch — never assume.
- Extract optional fields (team name, expense amount) only when they are unambiguous in the transcript.
- Return JSON matching the VoiceIntent discriminated union.`,
  user: (transcript: string) => `Transcript: "${transcript}"`,
} as const;
