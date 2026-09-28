import { z } from "zod";

// Transport (#270): this year's cars, who rides in them, the camp's rented
// trailers, and lift requests. What people type on the Transport page. Who may
// do what is the server's rule (@camp404/core transport.ts and
// canSendToAudience), never this shape's.
//
// Every shape is `.strict()`: a field the form does not send (a driver id on
// a car message, say) is refused rather than silently dropped, so no caller
// can steer a write with a field the screen never offers.

// A member id. Plain text, like the task board's assignee: the database
// module refuses anything that is not one of its ids (a UUID) itself.
const Id = z
  .string()
  .min(1, "That isn't a camp member. Reload the page.")
  .max(100, "That isn't a camp member. Reload the page.");

/** The most seats a car can offer: a minibus, not a bus. */
export const MAX_SEATS_OFFERED = 15;
export const TRAILER_NAME_MAX = 60;
export const TRAILER_NOTES_MAX = 300;
export const CAR_MESSAGE_TITLE_MAX = 120;
export const CAR_MESSAGE_BODY_MAX = 2000;

/** Put a member in a car, or take them out. */
export const CarSeatInput = z
  .object({ driverUserId: Id, memberUserId: Id })
  .strict();
export type CarSeatInput = z.infer<typeof CarSeatInput>;

/** How many seats a driver offers this year. */
export const SeatsOfferedInput = z
  .object({
    driverUserId: Id,
    seatsOffered: z
      .number()
      .int("Seats are whole numbers.")
      .min(0, "Seats can't be below 0.")
      .max(MAX_SEATS_OFFERED, `At most ${MAX_SEATS_OFFERED} seats.`),
  })
  .strict();
export type SeatsOfferedInput = z.infer<typeof SeatsOfferedInput>;

/**
 * A member asks for a lift: in one car (`driverUserId`), or in any car
 * (null), for the transport team to match.
 */
export const LiftRequestInput = z
  .object({ driverUserId: Id.nullable() })
  .strict();
export type LiftRequestInput = z.infer<typeof LiftRequestInput>;

/** The driver or the transport team answers a member's request. */
export const LiftRequestAnswerInput = z
  .object({ memberUserId: Id, accept: z.boolean() })
  .strict();
export type LiftRequestAnswerInput = z.infer<typeof LiftRequestAnswerInput>;

const trailerFields = {
  name: z
    .string()
    .trim()
    .min(1, "Give the trailer a name.")
    .max(TRAILER_NAME_MAX, `Keep the name under ${TRAILER_NAME_MAX} letters.`),
  notes: z
    .string()
    .trim()
    .max(
      TRAILER_NOTES_MAX,
      `Keep the notes under ${TRAILER_NOTES_MAX} letters.`,
    )
    .transform((v) => (v === "" ? null : v))
    .nullable(),
};

/** A trailer the camp has this year. */
export const TrailerInput = z.object(trailerFields).strict();
export type TrailerInput = z.infer<typeof TrailerInput>;

/** A change to a trailer, a compare-and-set on the version the editor saw. */
export const EditTrailerInput = z
  .object({
    ...trailerFields,
    trailerId: z.guid("That trailer isn't there any more. Reload the page."),
    expectedVersion: z.number().int().min(0),
  })
  .strict();
export type EditTrailerInput = z.infer<typeof EditTrailerInput>;

/** Which car tows a trailer; null takes it off every car. */
export const TowInput = z
  .object({
    trailerId: z.guid("That trailer isn't there any more. Reload the page."),
    driverUserId: Id.nullable(),
    expectedVersion: z.number().int().min(0),
  })
  .strict();
export type TowInput = z.infer<typeof TowInput>;

export const RemoveTrailerInput = z
  .object({
    trailerId: z.guid("That trailer isn't there any more. Reload the page."),
    expectedVersion: z.number().int().min(0),
  })
  .strict();
export type RemoveTrailerInput = z.infer<typeof RemoveTrailerInput>;

/**
 * A driver's message to the people in their car. There is deliberately no
 * car, driver or rider field: the car is always the sender's own, read by the
 * server inside the send.
 */
export const CarMessageInput = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, "Give it a title.")
      .max(
        CAR_MESSAGE_TITLE_MAX,
        `Keep the title under ${CAR_MESSAGE_TITLE_MAX} letters.`,
      ),
    body: z
      .string()
      .trim()
      .min(1, "Write the message.")
      .max(
        CAR_MESSAGE_BODY_MAX,
        `Keep it under ${CAR_MESSAGE_BODY_MAX} letters.`,
      ),
  })
  .strict();
export type CarMessageInput = z.infer<typeof CarMessageInput>;
