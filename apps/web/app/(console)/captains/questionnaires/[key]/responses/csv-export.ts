import { buildQuestionnaireCsvExport } from "@camp404/core";
import { respondentsOf, type ResultsView } from "../metrics/results-data";

// The one place the responses CSV is assembled from a results view. The
// spreadsheet mechanics (BOM, CRLF, quote doubling, formula neutralisation, the
// label path the table also renders through) all live in @camp404/core's
// buildQuestionnaireCsvExport; this only maps the view onto its input.
//
// It runs in the export route, on download, not on every render of the
// responses page. The page used to build the whole file per request and ship
// it to the browser as a prop, answers and all, whether or not anyone pressed
// Export.

export function responsesCsv(view: ResultsView) {
  return buildQuestionnaireCsvExport({
    questionnaireKey: view.key,
    cycle: view.cycle,
    questions: view.questions,
    respondents: respondentsOf(view).map((r) => ({
      name: r.name,
      // Every row states its own year. These rows are already scoped to one
      // cycle by the read, but a file that has left the app has to say which
      // year it is on its own.
      cycle: view.cycle,
      definitionVersion: r.definitionVersion ?? "",
      submittedAt: r.completedAt,
      responses: r.responses,
    })),
  });
}

/** Where the Export CSV link points for one questionnaire and year. */
export function responsesCsvHref(key: string, cycle: number): string {
  const questionnaire = `/captains/questionnaires/${encodeURIComponent(key)}`;
  return `${questionnaire}/responses/export?cycle=${cycle}`;
}
