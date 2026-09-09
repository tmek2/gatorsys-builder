import { Inter, Merriweather, Nunito } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import { THEME_SCRIPT } from "@/gator/theme";
import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/site";
import "@/gator/tokens.css";

/* The interface face. Nunito's rounded terminals are the whole reason it is
   here: it is the face the rest of Gator is set in, and the editor around the
   mockup should read as part of the same product. */
const nunito = Nunito({
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
  display: "swap",
  variable: "--font-nunito",
});

/* Display type only: the wordmark and the headline. */
const merriweather = Merriweather({
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
  variable: "--font-merriweather",
});

/* The Discord surface.
 *
 * Discord's own face is gg sans, which is licensed to Discord and cannot be
 * redistributed with a deployment. Inter is the closest thing on Google Fonts
 * under the SIL Open Font License: the same humanist grotesque skeleton, the
 * same tall x-height, and metrics near enough that a message set in it wraps
 * where the client wraps it. Noto Sans follows it in the stack because that is
 * the fallback Discord's own stylesheet names. */
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
  variable: "--font-discord",
});

/* Bumped whenever an icon or the link-preview card changes. See the note on
   `icons` below: this is the only thing that gets a browser — or a crawler —
   to let go of the one it has already cached. */
const ICON_VERSION = "5";

export const metadata = {
  metadataBase: new URL("https://mockups.gatorsys.xyz"),
  /* One name, everywhere. No per-route suffix: there is one route, and a tab
     reading "Builder — Gator Mockups" says the same thing twice. */
  title: SITE_NAME,
  description: SITE_DESCRIPTION,
  /* What a shared link shows.
   *
   * A link to this used to arrive as a bare URL with a line of text under it,
   * which for a tool whose whole output is a picture is the worst possible
   * introduction. The card is the product's own materials — the wordmark, the
   * ground, and a phone with a real conversation on it drawn by the same
   * renderer the tool exports — and it is built by `scripts/build-og.mjs`
   * rather than drawn by hand, so it can be made again when any of that
   * changes. Versioned like the icons, because a crawler caches this against
   * its URL exactly the same way. */
  openGraph: {
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    url: "https://mockups.gatorsys.xyz",
    siteName: SITE_NAME,
    type: "website",
    images: [
      {
        url: `/og.png?v=${ICON_VERSION}`,
        width: 1200,
        height: 630,
        alt: "Gator Mockups — a Discord conversation on an iPhone, built in the editor",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    images: [`/og.png?v=${ICON_VERSION}`],
  },
  /* The SVG is the one browsers should use; the .ico is there because they
     ask for /favicon.ico anyway — including on an error page, where the
     document's own links may never render — and a 404 in the console is
     noise somebody has to rule out later.

     Every one of these is transparent, and has been for three releases —
     which was not enough, because "the tab has a black background" was
     reported after every one of them. The plate had gone from the files and
     stayed in the browser: a favicon is cached against its own URL, in a
     store that a reload, a hard reload and an empty HTTP cache all leave
     alone, so the black one kept being drawn from disk no matter what the
     server sent. The version below is how you evict it. A new URL is a new
     icon as far as that store is concerned, so the old bitmap can never be
     chosen again. Bump it if the artwork ever changes.

     The .ico now actually holds the five sizes it claims. It held one 16px
     image and said it had five, so every ask for a 32 — which is what a tab
     wants on a scaled Windows display — got a 16 stretched to fit.

     And the mark is drawn whole. Its tile used to be worked out by hand from
     a raster, and the arithmetic was wrong in a way nothing checked: the box
     cut the tail and the feet off at all four edges. It is measured from the
     path now, and sized so the mark stands at about three quarters of the
     tile's height, which is where a tall mark sits on Apple's icon grid. */
  icons: {
    icon: [
      { url: `/favicon.svg?v=${ICON_VERSION}`, type: "image/svg+xml" },
      { url: `/favicon.ico?v=${ICON_VERSION}`, sizes: "16x16 24x24 32x32 48x48 64x64" },
    ],
    shortcut: `/favicon.ico?v=${ICON_VERSION}`,
    apple: [{ url: `/apple-touch-icon.png?v=${ICON_VERSION}`, sizes: "180x180", type: "image/png" }],
  },
  manifest: `/manifest.webmanifest?v=${ICON_VERSION}`,
};

export const viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0b0b0d" },
    { media: "(prefers-color-scheme: light)", color: "#f3dfc1" },
  ],
  width: "device-width",
  initialScale: 1,
  // The builder is a tool, not a document: pinch-zooming the page zooms the
  // chrome as well as the canvas, and the canvas has its own zoom.
  maximumScale: 5,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${nunito.variable} ${merriweather.variable} ${inter.variable}`}>
      <head>
        {/* Before the first paint and before React, so a visitor who chose
            light never watches a black page correct itself. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        {/* Every glyph on the canvas comes out of one atlas, and the canvas is
            the first thing painted, so the connection is opened and the file
            fetched alongside the document rather than after the stylesheet has
            been parsed and a mask rule has asked for it. */}
        <link rel="preload" as="image" href="/discord/atlas.png" fetchPriority="high" />
        {/* Emoji are Twemoji, one SVG each, from a CDN this page has not
            otherwise talked to. Opening the connection early saves the DNS,
            TCP and TLS round trips off the first emoji a mockup draws. */}
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://cdn.jsdelivr.net" />
      </head>
      <body>
        {/* One provider for every hover label in the app. Radix needs it above
            anything that uses a Tooltip, and a delay short enough that the
            label feels like part of the control rather than a timer. */}
        <TooltipProvider delayDuration={280} skipDelayDuration={120}>
          {children}
        </TooltipProvider>
      </body>
    </html>
  );
}
