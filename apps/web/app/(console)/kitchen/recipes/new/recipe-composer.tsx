"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Download, Info, Loader2 } from "lucide-react";
import { RECIPE_TEXT_MAX, SuggestRecipeInput } from "@camp404/types";
import { Button } from "@camp404/ui/components/button";
import { Card, CardContent } from "@camp404/ui/components/card";
import { AckRow } from "@camp404/ui/components/checkbox";
import { DictatePill } from "@camp404/ui/components/dictate-pill";
import { Field } from "@camp404/ui/components/field";
import { Input } from "@camp404/ui/components/input";
import { Textarea } from "@camp404/ui/components/textarea";
import { TextareaWithCount } from "@camp404/ui/components/textarea-with-count";
import { toast } from "@camp404/ui/components/toast";
import { RecorderPanel } from "@/components/voice/recorder-panel";
import { useDictationToggle } from "@/components/voice/use-dictation-toggle";
import { useVoiceSupported } from "@/components/voice/use-voice-recorder";
import { recipePath } from "@/lib/recipe-copy";
import { appendTranscript } from "../../../captains/announcements/transcript";
import { suggestRecipeAction } from "../actions";

// The import composer (#243). One card, like AfrikaBurn's bulletin composer:
// the recipe's words as the member found them (pasted, or dictated into the
// same box; only the text is kept, never the audio), an optional name (a
// blank one takes the text's first line, and Claude's title replaces it when
// the recipe is accepted), an optional link kept for reference (the server
// never opens it), why it suits the camp, and the member's own choice about
// Claude, unticked until they tick it. A problem shows beside its field; a
// refusal from the server shows in the card.

type FieldKey = "title" | "url" | "text" | "suitabilityNote";
type Errors = Partial<Record<FieldKey, string>>;

const IMPORTED_TOAST =
  "Recipe imported. A Kitchen lead or a captain checks it next.";

export function RecipeComposer() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  // Set once a transcript lands in the box: the recipe is then 'voice'.
  const [dictated, setDictated] = useState(false);
  const [suitabilityNote, setSuitabilityNote] = useState("");
  const [aiConsent, setAiConsent] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const dictation = useDictationToggle();
  const voiceSupported = useVoiceSupported();

  function clear(field: FieldKey) {
    setErrors((e) => ({ ...e, [field]: undefined }));
    setFormError(null);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = SuggestRecipeInput.safeParse({
      title,
      source: dictated ? "voice" : "text",
      url,
      text,
      suitabilityNote,
      aiConsent,
    });
    if (!parsed.success) {
      const next: Errors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as FieldKey;
        next[key] ??= issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    setFormError(null);
    startTransition(async () => {
      const result = await suggestRecipeAction(parsed.data);
      if (!result.ok) {
        setFormError(result.error);
        return;
      }
      toast.success(IMPORTED_TOAST);
      router.push(recipePath(result.data.id));
    });
  }

  return (
    <Card>
      <CardContent className="p-5">
        <form onSubmit={submit} noValidate className="flex flex-col gap-5">
          <Field
            label="Recipe text"
            htmlFor="recipe-text"
            required
            help="Ingredients and method, as you found them. Copy the words from the page, not just its link."
            error={errors.text}
          >
            <div className="flex flex-col gap-2">
              <TextareaWithCount
                id="recipe-text"
                value={text}
                rows={14}
                maxLength={RECIPE_TEXT_MAX}
                aria-invalid={errors.text ? true : undefined}
                aria-describedby={
                  errors.text ? "recipe-text-error" : "recipe-text-help"
                }
                disabled={pending}
                onChange={(e) => {
                  setText(e.target.value);
                  clear("text");
                }}
              />
              {voiceSupported &&
                (dictation.dictating ? (
                  <RecorderPanel
                    promptKey="recipe"
                    onTranscript={(t) => {
                      setText((current) =>
                        appendTranscript(current, t, RECIPE_TEXT_MAX),
                      );
                      if (t.trim()) setDictated(true);
                      clear("text");
                    }}
                    onDismiss={dictation.close}
                  />
                ) : (
                  <DictatePill
                    ref={dictation.pillRef}
                    label="Dictate the recipe"
                    onActivate={dictation.open}
                    disabled={pending}
                    className="self-start"
                  />
                ))}
            </div>
          </Field>

          <Field
            label="Name (optional)"
            htmlFor="recipe-title"
            help="Claude names it if you leave this blank."
            error={errors.title}
          >
            <Input
              id="recipe-title"
              value={title}
              maxLength={120}
              placeholder="e.g. Red lentil dal"
              aria-invalid={errors.title ? true : undefined}
              aria-describedby={
                errors.title ? "recipe-title-error" : "recipe-title-help"
              }
              disabled={pending}
              onChange={(e) => {
                setTitle(e.target.value);
                clear("title");
              }}
            />
          </Field>

          <Field
            label="Where it came from (optional)"
            htmlFor="recipe-url"
            help="For reference. Claude never opens links, so paste the recipe's words above."
            error={errors.url}
          >
            <Input
              id="recipe-url"
              type="url"
              inputMode="url"
              value={url}
              placeholder="https://"
              aria-invalid={errors.url ? true : undefined}
              aria-describedby={
                errors.url ? "recipe-url-error" : "recipe-url-help"
              }
              disabled={pending}
              onChange={(e) => {
                setUrl(e.target.value);
                clear("url");
              }}
            />
          </Field>

          <Field
            label="Why it suits the camp (optional)"
            htmlFor="recipe-suits"
            help="Kitchen leads read this; it is never sent to Claude."
            error={errors.suitabilityNote}
          >
            <Textarea
              id="recipe-suits"
              value={suitabilityNote}
              rows={3}
              maxLength={1000}
              placeholder="e.g. One pot, keeps in the heat, and everyone asked for seconds last year."
              aria-invalid={errors.suitabilityNote ? true : undefined}
              aria-describedby={
                errors.suitabilityNote
                  ? "recipe-suits-error"
                  : "recipe-suits-help"
              }
              disabled={pending}
              onChange={(e) => {
                setSuitabilityNote(e.target.value);
                clear("suitabilityNote");
              }}
            />
          </Field>

          <AckRow
            checked={aiConsent}
            onCheckedChange={(v) => setAiConsent(v === true)}
            disabled={pending}
          >
            A captain or a Kitchen lead may send this recipe&apos;s text to
            Claude to turn it into a recipe
          </AckRow>

          <div className="flex items-start gap-2.5 rounded-lg border border-accent/40 bg-accent/10 p-3 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
            <p>
              Only the recipe&apos;s text, name and link go to Claude, and only
              when a captain has Claude turn it into a recipe. Your name and
              your note stay in the camp&apos;s app.
            </p>
          </div>

          {formError && (
            <p className="text-sm text-destructive" role="alert">
              {formError}
            </p>
          )}

          <div>
            <Button type="submit" disabled={pending}>
              {pending ? (
                <Loader2 className="animate-spin" aria-hidden />
              ) : (
                <Download aria-hidden />
              )}
              Import recipe
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
