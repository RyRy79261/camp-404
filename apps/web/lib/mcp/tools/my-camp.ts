import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { campDayKey, rentalOrderState } from "@camp404/core";
import { UNSET_CYCLE } from "@camp404/db/camp-config";
import { getCycles } from "../../camp-config";
import { getMyDietary } from "../../dietary";
import { balanceSentence } from "../../dues-view";
import { getDuesYear, getMemberDues, listFeeTiers } from "../../dues";
import {
  listAnsweredQuestionnaires,
  listCompletedForms,
  listOptionalForms,
} from "../../forms";
import { ledgerCycle } from "../../payments";
import { DIETARY_FORM_PATH } from "../../recipe-copy";
import { getMyRental } from "../../rental";
import { itemPriceText } from "../../rental-view";
import { getPendingQuestionnaires } from "../../users";
import { siteUrl } from "../capabilities";
import { runTool } from "../tool-utils";

// The person's own pages over MCP, read-only: My dues, My gear and My forms.
// Each reads through the page's own function with the caller's own id, and
// as the page reads it for the member (dues with `forFinance: false`, which
// leaves out the Finance team's notes and concession reasons; gear as
// getMyRental shapes it, a captain's tent, source and price only once
// confirmed). Nothing here pays, pledges, orders, uploads proof or answers a
// questionnaire: those stay on the pages, which what_can_i_do links to.

/** The gear page's words for each state of an order. */
const GEAR_STATE: Record<string, string> = {
  draft: "Not sent yet. Send it when you're ready.",
  submitted: "Sent. A captain will confirm it.",
  confirmed: "Confirmed. There's nothing to pay for it.",
  charged: "Confirmed. It's on your dues.",
};

export function registerMyCampTools(server: McpServer): void {
  server.registerTool(
    "get_my_dues",
    {
      title: "My dues",
      description:
        "What the My dues page shows you this year: what you owe in a sentence and in figures (charged, paid, being checked, refunded, balance: rand cents), your next instalment or the year's deadline, your fee tier pledge, your payment reference, your charges, and your payments with their status and any refund. Read-only: paying, pledging, proof and refunds are on the page.",
      inputSchema: z.object({}),
    },
    async (_args, extra) =>
      runTool({
        toolName: "get_my_dues",
        extra,
        argsForAudit: null,
        handler: async ({ scope }) => {
          const cycle = await ledgerCycle();
          const today = campDayKey(new Date());
          const [dues, tiers, year] = await Promise.all([
            getMemberDues(scope.campUserId, cycle, {
              forFinance: false,
              today,
            }),
            listFeeTiers(cycle),
            getDuesYear(cycle),
          ]);
          const url = siteUrl("/dues");
          if (!dues) return { cycle, dues: null, url };
          return {
            cycle,
            summary: balanceSentence(dues.balance),
            balance: dues.balance,
            next: dues.next,
            deadline: year.deadline,
            refunds: {
              fullUntil: year.fullRefundUntil,
              partialUntil: year.partialRefundUntil,
              partialPercent: year.partialRefundPct,
            },
            reference: dues.refCode,
            pledge: dues.pledge
              ? {
                  tier: dues.pledge.tierLabel,
                  amountCents: dues.pledge.amountCents,
                  pledgedAt: dues.pledge.pledgedAt,
                }
              : null,
            feeTiers: tiers
              .filter((t) => !t.archived)
              .map((t) => ({ label: t.label, amountCents: t.amountCents })),
            instalments: dues.instalments,
            charges: dues.charges
              .filter((c) => !c.cancelled)
              .map((c) => ({
                kind: c.kind,
                description: c.description,
                amountCents: c.amountCents,
                createdAt: c.createdAt,
              })),
            payments: dues.payments.map((p) => ({
              reference: p.reference,
              amountCents: p.amountCents,
              status: p.status,
              method: p.method,
              paidOn: p.paidOn,
              proofSent: p.hasProof,
              refund: p.refund
                ? {
                    status: p.refund.status,
                    amountCents: p.refund.amountCents,
                    declineReason: p.refund.declineReason,
                  }
                : null,
            })),
            participation: dues.participation,
            url,
          };
        },
      }),
  );

  server.registerTool(
    "get_my_gear_rental",
    {
      title: "My gear rental",
      description:
        "What the My gear page shows you this year: your order's state, its lines and your tent answer (the captain's tent, source and price once confirmed), who has you in their tent, whether a captain asked for your order, and the catalogue with prices. Read-only: ordering is on the page.",
      inputSchema: z.object({}),
    },
    async (_args, extra) =>
      runTool({
        toolName: "get_my_gear_rental",
        extra,
        argsForAudit: null,
        handler: async ({ scope }) => {
          const cycle = await ledgerCycle();
          const rental = await getMyRental(scope.campUserId, cycle);
          const order = rental.order;
          const state = order ? rentalOrderState(order) : null;
          return {
            cycle,
            asked: rental.asked,
            order: order
              ? {
                  state,
                  stateText: state ? GEAR_STATE[state] : null,
                  submittedAt: order.submittedAt,
                  confirmedAt: order.confirmedAt,
                  totalCents: order.totalCents,
                  filledByCaptain: order.filledByCaptain,
                  hostedBy: order.hostedBy,
                  tent: order.tent
                    ? {
                        choice: order.tent.choice,
                        people: order.tent.people,
                        ownDescription: order.tent.ownDescription,
                        ownSleeps: order.tent.ownSleeps,
                        sharers: order.tent.sharers.map((s) => s.name),
                        assigned: order.tent.assigned
                          ? {
                              item: order.tent.assigned.itemName,
                              source: order.tent.assigned.source,
                              unitPriceCents:
                                order.tent.assigned.unitPriceCents,
                              tentLabel: order.tent.assigned.tentLabel,
                            }
                          : null,
                      }
                    : null,
                  lines: order.lines.map((l) => ({
                    item: l.itemName,
                    choice: l.choice,
                    quantity: l.quantity,
                    source: l.source,
                    unitPriceCents: l.unitPriceCents,
                  })),
                }
              : null,
            sharedWithMe: rental.sharedWithMe.map((t) => ({
              tent: t.tentName,
              tentLabel: t.tentLabel,
              confirmed: t.confirmed,
              owner: t.ownerName,
              others: t.otherSharers,
            })),
            catalogue: rental.items.map((i) => ({
              name: i.name,
              isTent: i.isTent,
              sleeps: i.isTent ? i.sleeps : null,
              price: itemPriceText(i),
            })),
            url: siteUrl("/gear"),
          };
        },
      }),
  );

  server.registerTool(
    "list_my_forms",
    {
      title: "List my forms",
      description:
        "Your questionnaires, as My forms and the inbox show them: the ones waiting for your answer (`waiting`, blocking ones first: the app holds you until they are done), the optional ones anyone may answer (`optional`, `started` when you saved a draft), the forms you can update any time, and the questionnaires you submitted. Each with its page's address: answer or change them there.",
      inputSchema: z.object({}),
    },
    async (_args, extra) =>
      runTool({
        toolName: "list_my_forms",
        extra,
        argsForAudit: null,
        handler: async ({ scope }) => {
          const id = scope.campUserId;
          const [waiting, optional, editable, dietary, answered, cycles] =
            await Promise.all([
              getPendingQuestionnaires(id),
              listOptionalForms(id),
              listCompletedForms(id),
              getMyDietary(id),
              listAnsweredQuestionnaires(id),
              getCycles(),
            ]);
          const yearName = (cycle: number) => {
            if (cycle === UNSET_CYCLE) return null;
            const name = cycles.find((c) => c.year === cycle)?.name;
            return name ? `${cycle} (${name})` : String(cycle);
          };
          return {
            waiting: waiting.map((q) => ({
              title: q.title,
              blocking: q.blocking,
              dueAt: q.dueAt,
              url: siteUrl(`/questionnaires/${q.activationId}`),
            })),
            optional: optional.map((f) => ({
              title: f.title,
              description: f.description,
              started: f.started,
              url: siteUrl(`/questionnaires/${f.activationId}`),
            })),
            updateAnyTime: [
              ...editable.map((f) => ({
                title: f.title,
                description: f.description,
                lastSaved: f.updatedAt ?? f.completedAt,
                url: siteUrl(`/tools/forms/${f.key}`),
              })),
              {
                title: "Dietary needs",
                description:
                  "The foods you react to and how, and your diet. The kitchen checks the menu against them.",
                lastSaved: dietary.savedAt,
                url: siteUrl(DIETARY_FORM_PATH),
              },
            ],
            submitted: answered.map((a) => ({
              title: a.questionnaire.title ?? "",
              year: yearName(a.cycle),
              submittedAt: a.completedAt,
              url: siteUrl(
                `/tools/forms/answers/${encodeURIComponent(a.definitionKey)}/${a.cycle}`,
              ),
            })),
            url: siteUrl("/tools/forms"),
          };
        },
      }),
  );
}
