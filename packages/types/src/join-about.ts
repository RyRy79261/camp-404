import { z } from "zod";

// About Camp 404: the camp's intro, word for word as the captains keep it in
// the Notion page "Intro to Camp 404" (Caitlin, 2026-11-15: "exactly all the
// same information ... with similar formatting"). One document, read whole on
// About Camp 404 in the app and on join.camp-404.com's About window, and a
// section at a time in the join site's windows of the same names.
//
// The sections and their names are fixed here, in the Notion page's List of
// Contents order, so the app's About page, the join site's About window and
// its desktop programs can never name a section two ways. `title` is the
// Notion heading, word for word, wherever the section's words are shown;
// `short` names the join site's desktop program for it (icon, window, taskbar,
// Start menu), where the full heading does not fit (owner, 2026-11-15).
// Captains edit only the words (Captains → Join site → About Camp 404).
//
// Each part is Markdown, rendered through @camp404/ui's MarkdownBody with its
// `marks` on, which reads three marks Markdown has no sign for, the ones the
// Notion page uses to make the important lines easy to find:
//   ==words==   highlighted (Notion's blue background)
//   {{words}}   in the accent colour (Notion's blue text)
//   ++words++   underlined
// They may hold bold and italic, and bold may hold them.

export const ABOUT_SECTIONS = [
  {
    key: "theme_camp",
    emoji: "4️⃣",
    title: "How does a Theme Camp like 404 work?",
    short: "How 404 Works",
  },
  {
    key: "contributions",
    emoji: "4️⃣",
    title: "Camp 404’s Contributions to Tankwa Town",
    short: "What We Give",
  },
  {
    key: "where",
    emoji: "🏕️",
    title: "Where is 404 in Tankwa Town?",
    short: "Where is 404?",
  },
  { key: "crew", emoji: "🛠", title: "The Crew", short: "The Crew" },
  {
    key: "responsibilities",
    emoji: "🔥",
    title: "Responsibilities - What You Put In",
    short: "What You Put In",
  },
  {
    key: "perks",
    emoji: "🔥",
    title: "Camp Perks - What you Get Out",
    short: "What You Get Out",
  },
  {
    key: "transport",
    emoji: "🛻",
    title: "How does 404 get stuff to Burn?",
    short: "Getting to Burn",
  },
] as const;

export type AboutSectionKey = (typeof ABOUT_SECTIONS)[number]["key"];
export const ABOUT_SECTION_KEYS = ABOUT_SECTIONS.map(
  (s) => s.key,
) as readonly AboutSectionKey[];

/** The page's own title, as the app and the join site name it. */
export const ABOUT_TITLE = "About Camp 404";
/** The contents list's heading, as the Notion page has it. */
export const ABOUT_CONTENTS_HEADING = "List of contents";

/** Where a section starts on a page that shows them all: `#about-crew`. */
export const aboutAnchor = (key: AboutSectionKey | "intro") => `about-${key}`;

export function aboutSection(key: AboutSectionKey) {
  return ABOUT_SECTIONS.find((s) => s.key === key)!;
}

const AboutBody = z
  .string()
  .trim()
  .min(1, "Write something here.")
  .max(20_000, "Shorten this.");

export const JoinAbout = z.object({
  /** The words before the List of Contents. */
  intro: AboutBody,
  sections: z.object({
    theme_camp: AboutBody,
    contributions: AboutBody,
    where: AboutBody,
    crew: AboutBody,
    responsibilities: AboutBody,
    perks: AboutBody,
    transport: AboutBody,
  }) satisfies z.ZodType<Record<AboutSectionKey, string>>,
});
export type JoinAbout = z.infer<typeof JoinAbout>;

const lines = (...l: string[]) => l.join("\n");

// The Notion page as it stood on 2026-09-24, with three changes the app's own
// rules make: joining starts in the Camp 404 app (no Google Forms, owner
// 2026-09-25), money is in rands (owner 2026-09-24: the dollar figures read
// as rands, at the fee calculator's R16 to the dollar, and the recommended
// fee as the captains' fee scale), and the lounge's mood board picture is not
// carried (a picture on these pages comes only from the camp's own storage).
export const DEFAULT_JOIN_ABOUT: JoinAbout = {
  intro: lines(
    "**As a theme camp we provide a public space, a public service, a functional part of Tankwa Town.** We put our efforts into supporting each other as a team, but also into creating something for the general public of Tankwa Town to experience. We're dedicated infrastructure for The Gifting economy.",
    "",
    "Camp 404 will always be **a place for the lost**, whether it is weary burners who need a rest from the hustle and bustle of the playa, or real emergencies like people who are having troubles in their camp and need a place to stay. But we don’t just simply provide a stay, no our mission is to help people suspend their disbelief, to share our idea of fun with the world.",
    "",
    "We’re a wacky bunch of misfits who love to indulge in nonsense and shenanigans. We welcome games, tomfoolery, the bizarre and the hilarious.",
    "",
    "Camp 404 is not appropriate for children or for adults who don’t act like children.",
    "",
    "> *Camp 404 is the lost clutter of imagination. A place of uncertainty. Where are we? What's going on? How did we get here? Why did we get here? It's in our blanket fort of opportunity that we embrace the Error Codes of life so that we can explore all of our lost expressions and confused intentions. We create safety, comfort and acceptance - for everyone and everything.*",
    "",
    "**How do I join Camp 404?**",
    "",
    "- Get an invite code from someone in Camp 404 and sign up in the Camp 404 app",
    "- Get a response from the **Comms & HR team**",
    "- If accepted, complete the Registration Form, pay your camp fee (more info about this below) and get onboarded into the team(s) you’re interested in working with",
  ),
  sections: {
    theme_camp: lines(
      "A Theme Camp works as a team to conceptualise, organise, build and run a public space that Burners can come to enjoy. Our specific offerings are listed in the next section.",
      "",
      "We divide our camp into different teams to cover all the aspects of planning and prepping. Every camp member needs to be an active member of at least one team. Each team will have goals to achieve before we go to the desert.",
      "",
      "- **{{Communications & HR}}** - applications, tickets, messaging members, info flow",
      "- **{{Finance}}** - fee collecting, budgeting, account keeping",
      "- **{{Structures}}** - shade, flooring, essential furniture, rental of sleeping gear",
      "- **{{Safety}}** - first aid kits, extinguishers, safety regulations of Tankwa Town",
      "- **{{Kitchen}}** - menu/recipes, appliances & equipment, food shopping & storage, cooking shift scheduling",
      "- **{{Water}}** - clean water, grey water, plumbing of kitchen and shower, water shift scheduling",
      "- **{{Sanitation & MOOP}}** - cleaning equipment, waste disposal management, MOOP shift scheduling",
      "- **{{Ministry of Vibes}}** - lounge decor and aesthetic",
      "- **{{Ministry of Memes}}** - NEW! - coordinating memetic influence in Tankwa Town, onboarding new members, camp culture",
      "- **{{Power, Lighting & Sound}}** - generator & fuel, power grid, lights, DJ equipment, genie shift scheduling",
      "- **{{Artworks & Activities}}** - making art, coordinating activity & DJ schedule for lounge, coordinating breakfast serving vibes",
      "- **{{Mutant Vehicle}}** - vehicle building, transport, running & maintenance, vehicle garage in camp",
      "- **{{Transport & Travel}}** - logistics of truck and trailer rental, packing & unpacking, lift arrangements",
      "",
      "Prep takes **MONTHS** of work with the final weeks before the Burn being the most intense. All camp members will be expected to help out in whatever way they can: shopping, making, driving, packing the truck, buying food etc.",
      "",
      "==In the desert, **EVERYONE** helps to build the camp and eventually pack it all up again. During Burn **EVERYONE** does some kind of shift work to help cook, clean and keep camp running and vibing.==",
      "",
      "**{{Remember: YOU GET OUT WHAT YOU PUT IN}} 🙂**",
      "",
      "**More info on what you’ll be expected to contribute if you join Camp 404 are detailed [HERE](#about-responsibilities).**",
      "",
      "{{If this sounds like TOO MUCH work for you and you don’t have the time or capacity for it, that’s OKAY! You don’t *have to* join a Theme Camp in order to participate in AfrikaBurn.}}",
    ),
    contributions: lines(
      "**Primary**",
      "",
      "1. Orphanage for stray Burners in need of care",
      "2. Daily vegan Breakfast (to the public) and Snacks (to the Lounge)",
      "3. Lounge comfort and entertainment - a safe space to rest, relax, connect and have fun",
      "",
      "**Secondary**",
      "",
      "- ++Mutant Vehicles++",
      "  - “Now Now Meow Meow” lead by Kyle & Robyn",
      "- ++Artworks & Activities++",
      "  - 2026 - Chris is working on something big and burnable this year - exciting!",
      "  - **There is ALWAYS space for more activities!** Think about Slam Poetry, Carrot Readings, How to be a Duck Workshops or anything else. What magic can you add to the camp and to Burn?",
      "  - **There is ALWAYS space for more artworks!** You don’t have to go the official route of submitting your work to Org and getting it placed on the map - but if you want help doing that let us know.",
    ),
    where: lines(
      "We were plot #43 in 2025, and we’re planning to get the same block again for 2026 \\[[2024 TANKWA TOWN MAP](https://quaggapedia.afrikaburn.com/images/7/73/Map_2024.png)\\].",
      "",
      "There is a row of toilets directly behind our plot.",
      "",
      "We’ll be in a semi-loud area. However, the back of our block (where our sleeping area will be) boarders a sand dune area, so we aren’t surrounded by sound and activity.",
      "",
      "**I’m worried about being able to sleep, how much peace will there be?**",
      "",
      "It’s not a sound camp, but there is a sound system and we all know things pop off, will I be able to sleep?",
      "",
      "- Bring a good set of earplugs/ANC-headphones",
      "- Our sound system, in the lounge, will be pointed away from the sleeping area and the layout is such that there is a long distance between the two parts (sleeping and sound)",
    ),
    crew: lines(
      "The 404 crew is a total 50 people with space for 10 orphans",
      "",
      "- A third are completely new to AfrikaBurn and Camp 404, a second third have been to at least one AfrikaBurn before, and a final third are seasoned 404ers with many years of Burn experience.",
      "- The **Communications & HR** team are responsible for all pre-burn admin: onboarding everyone and helping people figure out how to contribute to camp in meaningful ways.",
      "",
      "**404 Captains for 2026**",
      "",
      "**{{Caitlin}}** - Chief Cat Herder - Guiding the gifted, you guys know what to do ;)",
      "",
      "**{{Cloud}}** - Vice President - Went from 0 - 100 in T -4s and now probably knows ALL the things.",
      "",
      "**{{Ryan}}** - The Original Error Code - Consistently entropic, weaponised autism needing an excuse for unicycle powered productivity.",
    ),
    responsibilities: lines(
      "### ++What is the lead up and day-to-day like?++",
      "",
      "**Preparation before the Desert**",
      "",
      "- ±6 months before burn. Kick off meeting November/December the year before.",
      "- In the months before Burn…",
      "  - Preparation in teams, about one meeting per team per month is a good rule of thumb.",
      "  - Those in Cape Town get together for craft, sorting through storage unit, team build/hang out days",
      "- In the week before Burn….",
      "  - Final shopping of equipment, materials and food (delegated to team members)",
      "  - Packing the truck/trailers (ALL HANDS ON DECK)",
      "",
      "**Set up in the Desert before Burn starts**",
      "",
      "- Sculpture crew goes to site earlier? Maybe?",
      "- 21st April - Core Crew arrives on site to set up stretch tents",
      "- 22nd-25th April - All other camp members arrive",
      "- 26th April - ==**ALL HANDS ON DECK** set up day==",
      "- 27th April - Burn starts, non-theme campers start arriving",
      "",
      "**==Camp members are encouraged to arrive no later than Saturday the 25th April 2026.==** Pre-Burn set up on site is the best time to bond with your camp mates - don’t miss out on this! There’ll be daily meetings, games and silly goosings in between the work of building our camp.",
      "",
      "**During Burn**",
      "",
      "- No more daily whole-team meetings, just rostered shift work.",
      "- Ideally each person does at least 3-4 shifts through out Burn - the more you put in the better camp runs",
      "- Some shifts are an hour or two of focused work on a specific task, other shifts are 12hr shifts were you are the ‘people in charge’ of keeping an eye on something.",
      "",
      "**Daily 404 shifts look like:**",
      "",
      "- **Breakfast (served 11ish) & Dinner (served 5ish)**",
      "  - Prep, cook and serve food",
      "  - Refill drinking water containers",
      "  - Replenish snack table",
      "- **Kitchen Cleaning - after Breakfast and after Dinner**",
      "  - Clean all surfaces",
      "  - Wash, dry & pack away cooking dishes, refresh dish water",
      "  - Trash and compost disposal, empty bins",
      "  - Walking the duck (emptying grey water)",
      "- **Ice Collection**",
      "  - Collect our daily ice with our camp's card",
      "  - Offer to collect ice for individuals with their cash",
      "- **MOOP - EVERYONE ALL THE TIME**",
      "  - Pick up MOOP (trash, lost property, etc) and put it where it belongs",
      "  - Keep the lounge tidy (pack up games, neaten furniture, pillows & blankets)",
      "- **Generator (experienced people only)**",
      "  - Keep generator sufficiently fuelled",
      "  - Monitor generator (power usage, sound proofing, etc)",
      "  - Oversee fuel supply in camp (communicating with depot if needed)",
      "",
      "**There are also LOTS of ad hoc tasks (e.g. orphanage management, fixing lights, refilling snacks, writing activities on the white board, etc.)**",
      "",
      "**==BE PROACTIVE - try and have the mentality of leaving camp better than you found it every time you go in and out.==** Whether that’s fixing some fairy lights, cleaning up a mess or staging a coup to overthrow the chef - DO SOMETHING :D",
      "",
      "**After Burn**",
      "",
      "- **Striking camp:**",
      "  - Sunday: Prep for strike",
      "  - **==Monday: Whole day striking and packing the truck - ALL HANDS ON DECK==**",
      "  - Tuesday: a few people stay to clear the final things and do a MOOP sign off",
      "  - Post-Burn clean-up/responsibility",
      "- **Unpack into storage in Cape Town:**",
      "  - **==ALL HANDS ON DECK to unpack the truck/trailers back into storage on Tuesday the 5th of May==**",
      "",
      "### ++What am I expected to contribute?++",
      "",
      "1. **++GET INVOLVED++**",
      "   1. **Help Plan Camp**",
      "      - The camp is broken up into [teams that create 404](#about-theme_camp). This helps us focus preparation.",
      "      - **==++Every camp member is expected to join AT LEAST ONE team.++==**",
      "      - Each team is managed by a team lead who will organise the team meetings, delegate tasks and help inspire everyone’s creativity. If you have no idea how a theme camp works or don’t know how to help then your Team Lead(s) will guide you.",
      "   2. **Help Set Up and Strike Camp**",
      "      - Arrive before Burn starts and leave after it finishes so you can help build it all up and take it all down again.",
      "      - Pack and unpack the truck and the storage unit. You’ll get ripped doing it, you’re welcome.",
      "   3. **Help Run Camp**",
      "      - Be a vibing, proactive camp member who takes care of the space and the people in it because it’s your home and your people.",
      "      - Do shift work. High fives if you can do it well without needing to be sober.",
      "2. **++A CAMP FEE++**",
      "   1. The official blurb: As a theme camp, 404 will require all camp members to contribute to our finances so that we can fund our infrastructure, offerings and supplies. We are, however, a financially inclusive camp so not everyone has to pay the same amount. Instead, we will ask you to **==++please pay what you can afford++==**. If you can't afford anything, that's okay! If you can afford a lot then we invite you to donate more than our top tier fee to help subsidise the starving artists :)",
      "   2. Camp 404 will spend money on shade structures (R100K), a kitchen that cooks 2 vegan meals a day with snacks and drinking water (R50K), 24/7 power & lights (R10K), decor (R10K), gifts and artworks, transport & storage for everything (R100K) - to name the essentials. Our finances will be fully transparent.",
      "   3. This doesn't mean that by paying camp fees this stuff will simply appear in the desert for you!! You will still need to help organising, buying, building, transporting and setting up everything.",
      "",
      "**Camp Fee (REQUIRED): R3,500-R16,000 (recommended amount)**",
      "",
      "**Tent Fee (OPTIONAL): TBC (for sleeping tent & bedding if you don't have your own)**",
      "",
      "> *To figure out how much you 'should' contribute, a good starting point is just how much money you'd normally spend on food during that time period (2 meals a day for ~10 days). You could then consider how much you usually spend on the other basic needs if you were camping privately at the Burn - shade, batteries/genie, random camping equipment etc. (this can be anywhere from R2000 to R8000 depending on how much you love to Glamp).*",
      ">",
      "> ***==Another way to approach it is to decide on your TOTAL budget for the Burn and add things until you reach that amount. Start with ticket, petrol and drugs/alcohol (the biggest 3) then add your extra food/snacks that would be above the 2 vegan meals a day (eg some braai meat, special snacks, wheatbix). Then you can add creative/gift endeavours and camp fees to bring you up to your MAX amount that you can reasonably afford.==***",
      ">",
      "> *A Burn usually costs me R5-10K in total (depending on how many fairy lights I buy). If we mid-point that to R7.5K then it's equivalent to about one month's rent for me (a Capetonian). Which then makes sense that a Berliner can spend nearly R20K on a Burn (flights excluded) because that's what one month of rent costs for them 0\\_o*",
      ">",
      "> *We have at least one person paying nothing, and at least two people paying over R16,000.*",
      ">",
      "> *So yeh, it's relative, it's flexible, it's up to you 🙃*",
    ),
    perks: lines(
      "**By being part of 404 you get:**",
      "",
      "- 2 vegan meals a day to all camp members (essentially brunch & lupper) and snacks",
      "- A fully functional kitchen and braai area (see the ++Kitchen++ section below)",
      "- Sheltered sleeping area (see ++Sleeping++ section below)",
      "- A public lounge for chilling and doing activities (see the ++Lounge++ section below)",
      "- To contribute a public service to the Burn",
      "- To be a part of a dope AF team of absolute nonsense humans who celebrate individuality, authenticity and the joys of tomfoolery",
      "",
      "### ++404’s Lounge++",
      "",
      "After the vegan breakfasts, our lounge is the next publicly accessible part of our theme camp (we don’t advertise the orphanage part - those who need to know, know). Our lounge is open to Burners 24/7 and provides a comfortable space for ANYONE to hangout, chill, nap, play games, host activities or generally cause mischief. This is also where you find the vegan snacks :)",
      "",
      "Our **Artworks & Activities** lead will help people arrange activities/DJ sets/general nonsense. However, Radical Immediacy (one of the Burn principles) means we LOVE spontaneity - the space is there to be used.",
      "",
      "Our **Sound** will be chilled. We are not a sound or a party camp so don’t expect a big rig or heavy beats. DJs will be curated to fit the activities happening in the lounge. We will favour downtempo, ambient, liquid, groovy tunes that you CAN dance to but that you don’t HAVE TO dance to.",
      "",
      "The **Ministry of Vibes** team is responsible for creating this space.",
      "",
      "### ++404’s Kitchen++",
      "",
      "The **Kitchen Team** is responsible for planning the kitchen including creating the meal plan and recipe book. Every camp member will be tasked with at least one cooking shift (follow the provided recipe using the pre-prepped ingredients) and one cleaning shift (wash up the cooking stuff) during Burn.",
      "",
      "**Food**",
      "",
      "- 2 vegan meals a day to all camp members (essentially brunch & lupper)",
      "- Vegan snacks for the lounge",
      "- The shopping list and meal plan will be shared so you can see what food/snackage is being included and what you might want to bring extra for yourself",
      "",
      "**Infrastructure**",
      "",
      "- Stretch tent, ground sheet, tables & shelves",
      "- Two deep freezes",
      "- Gas stoves",
      "- Cooking equipment",
      "- Basic cooking ingredients (eg salt & oil)",
      "- Braai",
      "",
      "**What the kitchen doesn’t provide**",
      "",
      "- Your own eating things: cutlery, a bowl, plate and cup (cups with handles can be easily carried around)",
      "- Gentle refrigeration: use a cooler box (we have lots to provide people) and swap out ice bricks for stuff you don’t want frozen by the deep freezes. You can bring your own ice bricks or buy ice once a day. Our camp has an ice card so we get early access for buying",
      "- Coffee making equipment",
      "- Alcohol",
      "- Your personal snacks and in between meals",
      "",
      "==The kitchen is a vegan kitchen but you are welcome to bring animal products **++AS LONG AS++** you don’t use the camp cooking equipment to prepare it. There is a fire place to cook meat, or you can bring your own pot/pan/utensils to prepare something on the stove. You can store meat in the deep freezes **++AS LONG AS++** you seal it **++PROPERLY++** to avoid any leakage.==",
      "",
      "### ++404’s Sleeping Area++",
      "",
      "In 2025 the **Structures team** will be renting a 20x30m stretch tent to shade our private camping area.",
      "",
      "**What to bring?**",
      "",
      "- Your own tent **OR** rent a tent through 404",
      "- Your own mattress, blankets (hot & cold options) and pillow **OR** rent these items through 404",
      "- Some shade cloth or ground sheet to contribute to the communal space",
      "- A carpet or picnic blanket for your tent’s doorstep",
      "- A light/fairy lights for inside your tent",
    ),
    transport: lines(
      "- **A truck transports the container** with infrastructure, furniture, the fridges/freezers, gas bottles, decor, etc.",
      "- **2 x trailers** for food, bicycles, etc - and to take rubbish home (some food goes up late).",
      "",
      "The **Transport & Travel** team are responsible for making sure everyone and everything has a ride to Tankwa Town and back. Some people drive their own cars, a lot of foreigners rent cars, the camp rents trailers and we have a truck.",
    ),
  },
};
