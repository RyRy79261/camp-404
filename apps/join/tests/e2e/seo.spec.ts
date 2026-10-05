import { expect, test } from "@playwright/test";

// What a search engine reads before the desktop boots (seo-1, seo-2): the
// canonical URL, the Open Graph tags, the JSON-LD and a summary of the camp's
// own words, all in the server's HTML.

test("the server HTML carries the canonical URL, Open Graph, JSON-LD and a summary", async ({
  request,
}) => {
  const response = await request.get("/");
  expect(response.ok()).toBe(true);
  const html = await response.text();
  const head = html.slice(0, html.indexOf("</head>"));

  expect(head).toContain(
    '<link rel="canonical" href="https://join.camp-404.com"/>',
  );
  expect(head).toContain('<meta property="og:title" content="Join 404"/>');
  expect(head).toContain(
    '<meta property="og:url" content="https://join.camp-404.com"/>',
  );
  expect(head).toMatch(/<meta property="og:image" content="[^"]+"/);

  const ld = html.match(
    /<script type="application\/ld\+json">([^<]*)<\/script>/,
  );
  expect(ld).not.toBeNull();
  const graph = JSON.parse(ld![1]!)["@graph"] as { "@type": string }[];
  expect(graph.map((node) => node["@type"])).toContain("Organization");

  expect(html).toContain('aria-label="About Camp 404"');
  expect(html).toContain("Camp 404 is a place for the lost.");
});

test("robots.txt allows crawling and names the sitemap", async ({
  request,
}) => {
  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toMatch(/Allow: \//);
  expect(robots).toContain("Sitemap: https://join.camp-404.com/sitemap.xml");
  const sitemap = await (await request.get("/sitemap.xml")).text();
  expect(sitemap).toContain("<loc>https://join.camp-404.com/</loc>");
});
