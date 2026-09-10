/* The picture a shared link shows.
 *
 * Composed inside the running app rather than in a separate page, for one
 * reason that decides it: the fonts. The wordmark is Merriweather and the
 * interface is Nunito, both loaded by the app itself, and a standalone page
 * would either have to fetch them again or set the card in something else —
 * which is a link preview that does not look like the product it is
 * previewing. So the card is built as a DOM overlay in the app's own document
 * and screenshotted there, and the mockup on it is drawn by the real Discord
 * renderer with a real project in it.
 *
 * Run it against a built app:
 *
 *   npx next build && npx next start -p 3111
 *   node scripts/build-og.mjs http://127.0.0.1:3111
 *
 * It writes public/og.png. Bump ICON_VERSION in src/app/layout.jsx when you
 * do, or the crawlers that have already cached the old one will keep it.
 */

import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const origin = process.argv[2] || "http://127.0.0.1:3111";
const OUT = new URL("../public/og.png", import.meta.url);

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
/* One to one, so the file that ships is exactly the 1200x630 every platform
   asks for. Capturing at 2x and letting the platform downscale makes a file
   four times the size that WhatsApp and Slack may refuse to fetch. */
const page = await (await browser.newContext({ viewport: { width: 1400, height: 1000 } })).newPage();
await page.goto(origin, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);

/* A conversation worth showing: enough to read as Discord, short enough to
   read at the size a link preview is actually displayed. */
const say = async (text) => {
  await page.locator(".c-field").click();
  await page.keyboard.type(text);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(350);
};

/* The phone, with the client's full chrome and the device frame around it.
 *
 * A desktop mockup shrunk into the corner of a card is a grey rectangle with
 * unreadable grey lines in it — the one thing a link preview cannot be. A
 * phone is tall, so it fills the space it is given, and at the size it lands
 * here its text is very near its real size. It also happens to be the half of
 * this tool that is hardest to believe until you see it.
 *
 * Enough messages to fill a screen, too: the frame grows with the
 * conversation, so three lines of chat would draw a phone two inches tall. */
await page.locator(".e-stage-field .e-control").nth(1).click();
await page.waitForTimeout(400);
await page.getByRole("option", { name: "Window", exact: true }).click();
await page.waitForTimeout(700);
await page.locator(".e-stage-seg", { hasText: "Phone" }).first().click();
await page.waitForTimeout(700);
/* A second person, because the conversation needs two of them and the blank
   project has one person and one app.
 *
 * It used to run the exchange between the human and Gator, which wears the
 * APP tag — so the picture showed a bot answering "took about a minute" like
 * somebody chatting, which no app does and which was fairly reported as
 * wrong. The app keeps the one line an app would actually post, the welcome,
 * and the two people have the conversation. */
const addPerson = async (name) => {
  await page.mouse.click(60, 400);
  await page.waitForTimeout(300);
  /* The canvas's own menu: right-clicking the plate rather than a message is
     how the editor offers the things that belong to the mockup as a whole. */
  await page.mouse.click(160, 620, { button: "right" });
  await page.waitForTimeout(400);
  await page.getByRole("menuitem", { name: /add a member/i }).click();
  await page.waitForTimeout(700);
  /* The *open* group's name field, not the first one on the sheet.
     Every member's fields are in the DOM whether their group is open or not,
     so "the first Name field" is the first member's — which is how the app
     ended up renamed to the person who was supposed to be new, keeping its
     APP tag and its lines. The sheet opens on the one just made, and that is
     the one standing open. */
  const field = page
    .locator('.e-sheet .e-group[data-open="true"]')
    .locator(".e-field", { hasText: "Name" })
    .first()
    .locator("input");
  await field.fill(name);
  await page.waitForTimeout(300);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);

  /* And prove it took, because a rename that silently lands on the wrong
     member is exactly the failure this picture had. */
  await page.locator(".c-author-btn").click();
  await page.waitForTimeout(350);
  const listed = await page.locator(".c-author-option").allInnerTexts();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  const people = listed.map((t) => t.split("\n")[0].trim());
  if (!people.includes(name)) throw new Error(`no member called ${name}: ${people.join(", ")}`);
  if (!people.includes("Gator")) throw new Error(`the app was renamed: ${people.join(", ")}`);
};

/* Deselect first: the author picker reassigns the message that is selected,
   so switching with the last one still highlighted moves *that* message to
   the new person instead of the next one. */
const sendAs = async (name) => {
  await page.mouse.click(60, 400);
  await page.waitForTimeout(300);
  await page.locator(".c-author-btn").click();
  await page.waitForTimeout(350);
  await page.locator(".c-author-option", { hasText: name }).first().click();
  await page.waitForTimeout(400);
};

await addPerson("Rhea");
await sendAs("Member");
await say("how did you get a screenshot of a message that doesn't exist");
await sendAs("Rhea");
await say("gator mockups — took about a minute");
await sendAs("Member");
await say("even the roles and the colours?");
await sendAs("Rhea");
await say("all of it. drag things around and export the picture");

/* Nothing selected: the editor's highlight on the last message is the editor
   talking about itself, and this picture is about the output. */
await page.mouse.click(60, 400);
await page.waitForTimeout(600);

/* The device's lift comes off before it is photographed.
 *
 * A shadow spreads outside the element, and an element screenshot is clipped
 * to the element's own box — so the part of the shadow that falls inside the
 * box survives and the rest is cut, which paints the four corners outside the
 * body's radius as flat dark squares. Composited onto the card, those read as
 * hard edges down the phone's sides where the background's own texture stops.
 * Without the shadow the corners are simply transparent. */
await page.addStyleTag({ content: ".e-frame, .e-frame-phone { box-shadow: none !important; }" });
await page.waitForTimeout(200);

const mockup = await page.locator(".e-frame").screenshot({ type: "png", omitBackground: true });
const mockupUrl = `data:image/png;base64,${mockup.toString("base64")}`;

await page.evaluate((src) => {
  document.querySelectorAll(".og-card").forEach((n) => n.remove());
  const card = document.createElement("div");
  card.className = "og-card";
  card.innerHTML = `
    <div class="og-copy">
      <div class="og-brand">
        <img class="og-mark" src="/favicon.svg" alt="">
        <span class="og-name">Gator<br>Mockups</span>
      </div>
      <p class="og-line">Build Discord message mockups and export them as images.</p>
      <span class="og-host">mockups.gatorsys.xyz</span>
    </div>
    <div class="og-shot"><img src="${src}" alt=""></div>`;
  const style = document.createElement("style");
  style.textContent = `
    .og-card {
      position: fixed; left: 0; top: 0; z-index: 99999;
      display: flex; align-items: center; gap: 24px;
      width: 1200px; height: 630px; padding: 0 0 0 84px;
      overflow: hidden;
      background:
        radial-gradient(1100px 560px at 6% 4%, rgba(247,168,196,0.16), transparent 60%),
        radial-gradient(700px 420px at 96% 96%, rgba(247,168,196,0.12), transparent 58%),
        #0b0b0d;
      font-family: var(--font-nunito), system-ui, sans-serif;
      color: #f4f2f0;
    }
    /* The stage's own dot grid, so the card is made of the product's
       materials rather than of a gradient somebody picked. */
    .og-card::before {
      content: ""; position: absolute; inset: 0;
      background-image: radial-gradient(rgba(255,255,255,0.09) 1.6px, transparent 1.6px);
      background-size: 28px 28px;
      mask-image: linear-gradient(100deg, #000 0 46%, transparent 78%);
    }
    .og-copy { position: relative; width: 500px; flex: none; }
    .og-brand { display: flex; align-items: center; gap: 16px; }
    .og-mark { width: 84px; height: 84px; flex: none; }
    .og-name {
      font-family: var(--font-merriweather), Georgia, serif;
      font-size: 62px; font-weight: 700; line-height: 1.02;
      letter-spacing: -0.024em;
    }
    .og-line {
      margin: 30px 0 0; max-width: 440px;
      font-size: 28px; font-weight: 600; line-height: 1.34;
      letter-spacing: -0.006em; color: #bcb9c0;
    }
    .og-host {
      display: inline-block; margin-top: 34px;
      font-size: 21px; font-weight: 800; letter-spacing: 0.06em;
      color: #f7a8c4;
    }
    /* Bleeding off the bottom edge: a preview is a window onto the thing, and
       a screenshot floated whole in the middle reads as a slide. */
    .og-shot {
      position: relative; flex: 1; align-self: stretch;
      display: flex; align-items: flex-end; justify-content: center;
    }
    .og-shot img {
      width: 404px; max-width: none;
      margin-bottom: -104px;
      filter: drop-shadow(0 44px 70px rgba(0,0,0,0.6)) drop-shadow(0 8px 20px rgba(0,0,0,0.45));
    }`;
  document.head.appendChild(style);
  document.body.appendChild(card);
}, mockupUrl);

await page.waitForTimeout(900);
const png = await page.locator(".og-card").screenshot({ type: "png" });
writeFileSync(OUT, png);
console.log(`wrote ${OUT.pathname} — ${png.length} bytes`);
await browser.close();
