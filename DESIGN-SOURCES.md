# Design sources

Two design systems meet in this app, and they are kept deliberately separate.

The **editor** is Gator. It uses the same tokens, type, controls and appearance
system as the 2026 landing page on gatorsys.xyz, so the tool around the mockup
reads as part of the same product.

The **canvas** is Discord, and only Discord. Nothing from the Gator palette
reaches inside it. A mockup that is 90% accurate is a mockup somebody has to
apologise for, so the surface is built from the client's own values rather than
from an approximation of them.

## The Discord surface

- **Colour tokens.** `src/discord/tokens.css` holds the resolved chat, surface,
  text, mention, border and control colours for all four appearances, taken
  from the theme definitions in the public desktop client (checked 5 September
  2026). Discord names them internally: Ash is `theme-dark`, Dark is
  `theme-darker`, Onyx is `theme-midnight`. Every value is written through
  `--saturation-factor`, which is Discord's own hook for the accessibility
  setting that desaturates the client — it is left at 1 here, but the tokens
  are shaped so the control could be exposed without touching a colour.
- **Component anatomy.** Discord's component reference
  (<https://docs.discord.com/developers/components/reference>) for containers,
  sections, text displays, media galleries, files, separators, action rows and
  the five select-menu types, along with the limits shown as counters in the
  editor.
- **Appearance names.** Discord's own support article on colour themes, for the
  Light / Ash / Dark / Onyx naming.
- **Community kits inspected**, for structure rather than for values:
  [skyra-project/discord-components](https://github.com/skyra-project/discord-components)
  and [BF-GO/discord-message-kit](https://github.com/BF-GO/discord-message-kit).
  Both still carry the pre-2024 palette, where the chat ground was `#36393f`
  and an embed was a flat dark grey, so neither was copied.
- **Emoji.** Discord ships Twemoji rather than using the platform's emoji font,
  which is why a message looks identical on every operating system inside the
  client. The same asset set is used here, from the maintained fork
  ([jdecked/twemoji](https://github.com/jdecked/twemoji)) over jsDelivr, pinned
  to a version rather than to `latest` so an upstream release cannot change a
  mockup that has already been exported. If the CDN cannot be reached the
  renderer falls back to the character itself.

### Measured layout values

40px avatars; a 56px inset from the avatar's left edge to the message body;
16px content at a 1.375 line height; 12px timestamps on a 22px header line; a
17px gap above a new message and 0 above a grouped one; a 4px accent on an
embed at a 4px radius and an 8px one on a container; 8px between embed fields;
a twelve-column field grid, so two inline fields on a row take six columns each
rather than four; 16px above embed media.

Discord publishes no pixel-perfect specification for every client state. These
sources establish concrete reference values; they do not prove that every
possible mockup matches every rollout, operating system, density setting or
feature flag. This is a visual editor, not the Discord client, and custom
spacing and mixed content stay intentionally editable.

## Performance
### Running the checks locally

The regression suite drives a production build, not the dev server, because
several of the things it checks — the immutable cache headers, the short-link
fallback, the hydrated editor — do not exist or behave differently under
`next dev`. Two things have to be true or the results are noise rather than
failures: the server must be started *after* the build it is serving, since a
rebuilt `.next` leaves the running process handing out HTML that points at
chunk hashes no longer on disk, which fails hydration silently and times out
every test that needs the editor to respond; and it needs `REDIS_URL` in its
environment, or the short-link tests correctly report that short links are not
configured.

The second time this bit, it looked like a UI bug rather than a stale server.
A new `next start` lost the port race, exited with `EADDRINUSE`, and left the
*previous* one answering — so the port still returned 200, the page still
hydrated, and only the stylesheet 404'd. Every element was `position: static`,
every panel measured full-width, and a dozen tests failed with "this control
does nothing". The check that settles it in one line: fetch `/`, pull the
first `/_next/static/css/...` href out of it, and fetch that. A stale server
hands you a hash that is no longer on disk. Kill whatever holds the port, wait
for it to let go, start, and prove the CSS resolves before running anything.


Two things were making a large mockup heavier than it needed to be, and both
were measured rather than guessed.

**Images.** The icon library is 125 tiles, and a canvas draws forty of them at
a time. Separately that is 125 requests, 125 decodes and 125 GPU textures for
artwork that never changes; as one atlas it is one of each, 46KB, cached for a
year. The atlas is preloaded so it is in flight with the document rather than
after the stylesheet has been parsed, and the Twemoji CDN is preconnected so
the first emoji a mockup draws is not also a DNS lookup and a TLS handshake.
Emoji decode off the main thread and load lazily; so do the 240 avatars in the
picker.

The trade-off in a CSS mask is real — [Cloud Four's stress
test](https://cloudfour.com/thinks/svg-icon-stress-test/) found masking the
slowest of the icon techniques at a thousand icons on one page. That is not
this: forty glyphs at a time, and the alternative is baking a copy of every
icon per colour state, which loses the hover and the destructive red. One
decoded atlas serving all of them is the cheaper end of that trade.

**Typing.** A keystroke in the content field re-parsed the markdown of every
message on the canvas. Three things caused it: each row was handed a freshly
constructed click closure, the render context carried the whole message list so
any edit invalidated every consumer, and the row was not memoised. All three
are fixed — one handler for the stream that reads the id off the row, replies
resolved on the way past instead of out of context, and `memo` on the row. In
a Chrome CPU profile the markdown parser was 11.7% of samples during a typing
burst and is now absent from it. Script time per keystroke, measured through
the DevTools protocol rather than a wall clock:

| messages on canvas | before | after |
| --- | --- | --- |
| 40 | 8.8 ms | 5.0 ms |
| 150 | 22.5 ms | 7.1 ms |

## The editor

- **Tokens, appearance, header and controls** are ported from the 2026 landing
  page in the `gatorsys.xyz` repository (`src/components/landing2`): the
  palette, the two-appearance system with its three settings, the travelling
  nav blob, the cycling appearance block with its view-transition wipe, the
  ripple button and the hover label.
- **The block tree** follows the message designer in the Gator dashboard
  (`src/components/Manage/message-design.tsx`): the same add / nest / collapse /
  duplicate / reorder grammar and the same rule that a container is a block like
  any other rather than a wrapper around everything. What is missing is
  deliberate — the dashboard wires a button to a ticket panel, a form or a flow
  because a bot has to run it. Here a button is a label, a colour and an emoji.
  Nothing in this app sends anything.

## Icons

Every glyph the canvas draws — the composer buttons, the message action bar,
the channel hashes, the system-message arrows, the profile badges, the status
dots and the server tags — is Discord's own artwork, from the community
Ultimate Discord Library PSD supplied with the project. Nothing on the canvas
is a hand-drawn path or an emoji standing in for an icon: an approximated GIF
button is exactly the tell that gives a mockup away.

They live in `public/discord/` as PNGs and are drawn through
`src/discord/icon.jsx`. Monochrome ones are painted with a CSS mask so
`currentColor` reaches them, which is what lets one file serve the muted state
of a composer button, the white of a hovered one and the red of a destructive
menu row. The handful whose colour is the artwork — a ban hammer, a GIF badge,
the blurple checkbox — are drawn as images instead, and `icon.jsx` keeps the
list.

Extracting them was not a straight export. Each layer in the PSD is a tile of
artwork flattened onto a flat `#262732` swatch with a fully opaque alpha
channel, so a naive read gives 32×32 dark squares that look right only against
a background of the same colour. The shape lives in the luminance instead, and
the recovery inverts the composite: the swatch is identified by its known
colour rather than by frequency (a glyph that runs to the tile edge owns most
of the border), a monochrome glyph is reconstructed from the single ink of its
most distant pixel — exact, so solid interiors come back fully opaque and only
the antialiased rim is fractional — and a multi-coloured badge is treated as
solid beyond a threshold with the colour un-multiplied back out.

## Type

Discord's face is gg sans, which is licensed to Discord and cannot be
redistributed with a deployment. The canvas is set in **Inter** (SIL Open Font
License, via Google Fonts): the same humanist grotesque skeleton, the same tall
x-height, and metrics near enough that a message wraps where the client wraps
it. Noto Sans follows it in the stack because that is the fallback Discord's
own stylesheet names.

The editor is set in **Nunito**, with **Merriweather** for display type — the
two faces the rest of Gator uses.

## Avatars

The 240 default avatars in `public/avatars` are drawn from the collection
supplied with the project, at their original 45px artwork bounds. They are
files rather than base64 inlined into a module, so the browser fetches only the
ones it draws and the picker can lazy-load.

## The iPhone status bar, measured rather than drawn

Source: `iOS_and_iPadOS_27_Community_Status_Bars_and_Menu_Bars.psd`, the file
in this conversation's uploads. Its `Status bar - iPhone / Dark / Levels /
Frame` layer is the three trailing marks at 1x — 85 x 13 — and every number
below is a pixel measurement of that layer, taken with `psd-tools` and a row
profile rather than by eye.

This section exists because these three marks were redrawn from guesswork four
times, and each guess came out a different size from the mark beside it. If
they need touching again, measure the layer again; do not adjust by eye.

    from psd_tools import PSDImage
    layer = ...  # Dark/Levels/Frame
    layer.composite().save("levels.png")   # 85 x 13, white on transparent

**All three marks are 13 tall.** That is the single fact every previous version
got wrong.

| mark | box | detail |
| --- | --- | --- |
| signal | 20 x 13 | 4 bars, each 4 wide, 5.33 pitch, one baseline, heights 5 / 7.67 / 10.33 / 13, corner radius 1 |
| wi-fi | 17 x 13 | everything struck about (8.5, 10.5), spanning 50 degrees either side of straight up: dot r 2, arc on r 4.4 struck 2 thick, arc on r 9.1 struck 2.4 |
| battery | 25 x 13 | corner radius 4; nub 1.2 x 3.4, one clear of the shell |

Gaps between them: 6 from the ladder to the fan, 7 from the fan to the battery.
They are not evenly spaced, and one flex gap for both puts the fan a pixel out.

The iPhone's other measurements from the same file: the time is 34 x 13 at 17px
600 weight, the Dynamic Island is 125 x 37, and the status bar is 54 tall with
the marks 22 in from the trailing edge.
