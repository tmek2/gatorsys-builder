/* The project: what a mockup is, in one place.
 *
 * Everything the editor writes and the renderer reads has its shape defined
 * here, along with the constructors for a new one of each. Keeping the
 * defaults beside the schema is what stops a block created by the "add"
 * menu and a block created by a template from disagreeing about which
 * fields exist.
 */

import { avatarUrl } from "./avatars";
import { ID, newId } from "./ids";

export const PROJECT_VERSION = 2;

/* Every id in a project comes from one scheme — see `ids.js`. It is prefixed
   so an id says what it is, time-ordered so a list sorts by creation, and its
   random half comes from the CSPRNG rather than `Math.random`, which some
   engines seed predictably enough to enumerate. */
/* A phone is a phone, not a narrow desktop.
 *
 * 393 x 852 is the iPhone 15/16 viewport in CSS pixels, and the ratio between
 * them is what makes a screenshot read as a phone. The canvas width slider
 * used to apply here too, so "Phone" only ever made the same canvas taller —
 * which is exactly what it looked like. */
export const PHONE_WIDTH = 393;
export const PHONE_HEIGHT = 852;

export const uid = () => newId("id");
export { ID };

/* --------------------------------------------------------------- limits */

/* Discord's own, from the component reference. The editor shows these as
 * counters rather than enforcing them: a mockup is a picture, and somebody
 * drawing a proposal for a message may legitimately want to see what one
 * character over the line looks like before deciding. It should say so
 * loudly, and it does — it just does not refuse to draw it. */
export const LIMITS = {
  content: 2000,
  embeds: 10,
  embedTitle: 256,
  embedDescription: 4096,
  embedFields: 25,
  embedFieldName: 256,
  embedFieldValue: 1024,
  embedFooter: 2048,
  embedAuthor: 256,
  embedTotal: 6000,
  buttonsPerRow: 5,
  rowsPerMessage: 5,
  buttonLabel: 80,
  selectOptions: 25,
  selectPlaceholder: 150,
  galleryItems: 10,
  containerChildren: 40,
  sectionText: 3,
  componentsTotal: 40,
  v2Characters: 4000,
};

/* ---------------------------------------------------------------- users */

/* ---------------------------------------------------------------- roles
 *
 * A role is a server-wide thing, not a per-member one: three people share the
 * Moderator role and all three go orange when you recolour it. Members carry
 * ids into this list, so renaming a role renames it everywhere it is drawn —
 * in the member list, on the profile card, and in whatever a message quotes.
 */

export const newRole = (over = {}) => ({
  id: ID.role(),
  name: "New role",
  color: "#5865f2",
  /* Discord's "display separately" flag. A hoisted role gets its own heading
     in the member list; everybody else falls into ONLINE and OFFLINE. */
  hoist: false,
  ...over,
});

/** The colour a member is drawn in: the first role that has one, then their
 *  own override, then nothing — which is the client's own order. */
export function roleColor(user, roles = []) {
  for (const id of user?.roles ?? []) {
    const role = roles.find((r) => r.id === id);
    if (role?.color) return role.color;
  }
  return user?.color || "";
}

export const newUser = (over = {}) => ({
  id: ID.user(),
  name: "New member",
  color: "",
  /** Ids into the project's role list, highest first. */
  roles: [],
  avatar: avatarUrl(0),
  bot: false,
  /* The tag beside a bot's name. Discord draws APP for an application and
     adds a check for one that is verified; a webhook says APP too but has no
     check, which is the only visible difference between the two. */
  badge: "APP",
  verified: false,
  /** A server tag / clan badge, drawn as a small pill after the name. */
  tag: "",
  /** An avatar decoration, drawn as a ring around the avatar. */
  decoration: "",
  roleIcon: "",
  status: "online",
  ...over,
});

/* ----------------------------------------------------------------- gift
 *
 * Discord's gift button opens a Nitro purchase, which is not a thing to draw.
 * What it *produces* is: a claimable card in the channel, and "here, have
 * Nitro" is a mockup people want. So the button makes the card.
 */

export const newGift = (over = {}) => ({
  title: "You've been gifted a subscription!",
  plan: "Nitro \u2014 1 Month",
  button: "Accept",
  claimed: false,
  ...over,
});

/* -------------------------------------------------------------- embeds */

export const newEmbed = (over = {}) => ({
  id: ID.embed(),
  color: "#5865f2",
  author: "",
  authorIcon: "",
  authorUrl: "",
  title: "",
  url: "",
  description: "",
  thumbnail: "",
  image: "",
  video: "",
  footer: "",
  footerIcon: "",
  timestamp: "",
  provider: "",
  fields: [],
  ...over,
});

export const newField = (over = {}) => ({ id: ID.field(), name: "Field name", value: "Field value", inline: false, ...over });

/* --------------------------------------------------- components (v2) --- */

export const newButton = (over = {}) => ({
  id: ID.button(),
  label: "Button",
  style: "secondary",
  emoji: "",
  url: "",
  disabled: false,
  ...over,
});

export const newSelectOption = (over = {}) => ({
  id: ID.item(),
  label: "Option",
  description: "",
  emoji: "",
  ...over,
});

/* One constructor per block type, and the adder menu is built from the same
 * table — so a type cannot be addable without being constructible. */
export const BLOCK_TYPES = {
  text: {
    label: "Text",
    hint: "A paragraph. Markdown, headings, lists and mentions all work.",
    make: () => ({ id: ID.block(), type: "text", content: "Your text here" }),
  },
  section: {
    label: "Section",
    hint: "Up to three lines of text with a thumbnail or a button beside them.",
    make: () => ({
      id: ID.block(),
      type: "section",
      content: "Text with something pinned to its right.",
      accessory: { kind: "thumbnail", src: "", alt: "" },
    }),
  },
  gallery: {
    label: "Media gallery",
    hint: "Up to ten images or videos in a grid.",
    make: () => ({ id: ID.block(), type: "gallery", items: [] }),
  },
  separator: {
    label: "Separator",
    hint: "A dividing line, or blank space with no line.",
    make: () => ({ id: ID.block(), type: "separator", divider: true, spacing: "small" }),
  },
  buttons: {
    label: "Button row",
    hint: "Up to five buttons on one line.",
    make: () => ({ id: ID.block(), type: "buttons", buttons: [newButton()] }),
  },
  select: {
    label: "Select menu",
    hint: "A dropdown — string options, or a user, role, channel or mentionable picker.",
    make: () => ({
      id: ID.block(),
      type: "select",
      kind: "string",
      placeholder: "Make a selection",
      disabled: false,
      options: [newSelectOption(), newSelectOption({ label: "Second option" })],
    }),
  },
  file: {
    label: "File",
    hint: "An uploaded file, drawn as the client's file card.",
    make: () => ({ id: ID.block(), type: "file", name: "document.pdf", size: "24.1 KB", spoiler: false }),
  },
  container: {
    label: "Container",
    hint: "A box with an accent stripe. Only what you put inside it is boxed.",
    make: () => ({
      id: ID.block(),
      type: "container",
      color: "#5865f2",
      spoiler: false,
      blocks: [{ id: ID.block(), type: "text", content: "Inside the container." }],
    }),
  },
};

/** Blocks a container can hold. Discord has no container inside a container. */
export const NESTABLE = Object.keys(BLOCK_TYPES).filter((t) => t !== "container");

export const newBlock = (type) => BLOCK_TYPES[type]?.make() ?? BLOCK_TYPES.text.make();

/* ------------------------------------------------------------- messages */

export const newMessage = (user, over = {}) => ({
  id: ID.message(),
  user,
  kind: "message",
  content: "",
  timestamp: "Today at 10:03",
  /* Drawn under the previous message with no avatar and no name, the way the
     client groups consecutive messages from one author inside seven minutes. */
  grouped: false,
  edited: false,
  pinned: false,
  /** "Only you can see this" — the footer on an interaction response. */
  ephemeral: false,
  tts: false,
  /** The message this one is a reply to, by id. */
  reply: "",
  /** The slash command header: "Name used /command". */
  interaction: null,
  /** A forwarded message, drawn as the client's forward card. */
  forwarded: null,
  embeds: [],
  components: [],
  attachments: [],
  reactions: [],
  poll: null,
  sticker: null,
  thread: null,
  invite: null,
  linkPreview: null,
  voice: null,
  ...over,
});

export const newSystemMessage = (user, systemType = "join", over = {}) => ({
  ...newMessage(user),
  kind: "system",
  systemType,
  content: "",
  ...over,
});

export const newAttachment = (over = {}) => ({
  id: ID.item(),
  kind: "image",
  src: "",
  name: "image.png",
  size: "148 KB",
  alt: "",
  spoiler: false,
  ...over,
});

export const newReaction = (over = {}) => ({ id: ID.item(), emoji: "👍", src: "", count: 1, me: false, burst: false, ...over });

export const newPoll = () => ({
  question: "Which one?",
  answers: [
    { id: ID.item(), text: "The first one", emoji: "", votes: 12 },
    { id: ID.item(), text: "The second one", emoji: "", votes: 7 },
  ],
  total: 19,
  duration: "1 day left",
  multiple: false,
  finished: false,
});

/* ---------------------------------------------------------------- canvas */

export const newCanvas = (over = {}) => ({
  theme: "ash",
  platform: "desktop",
  density: "cozy",
  /** How much of the client is drawn around the messages. */
  chrome: "none",
  /* 1280, which is the width Discord's own desktop window opens at. It was
     720 — chosen so a screenshot dropped into a document without being scaled
     — and 720 is not a desktop: the server rail, the channel list and the
     member list all have to fit beside the conversation, and at 720 they are
     squeezed into something no real client ever looks like. The export scale
     is the control for "make it smaller in the document", not this. */
  width: 1280,
  /* Where the window stops growing.
   *
   * A mockup that grows a message at a time ends up a four-thousand-pixel
   * strip, which is not a picture of Discord — Discord is a window, and a
   * window has a bottom edge. Below this the frame hugs its content, so a
   * three-message mockup is still three messages tall; past it the
   * conversation scrolls inside the frame and the frame is what exports.
   *
   * 800 goes with the 1280 width: together they are the window Discord's
   * desktop client opens at. The phone ignores both and uses the device's
   * own, because a phone is a fixed piece of hardware.
   */
  height: 800,
  padding: 24,
  radius: 10,
  scale: 2,
  background: "surface",
  customBackground: "",
  server: { name: "Community", icon: "", banner: "" },
  channel: { name: "general", topic: "Say hello and read the rules.", category: "TEXT CHANNELS" },
  channels: ["rules", "announcements", "general", "off-topic", "support"],
  showDateDivider: false,
  dateLabel: "Today",
  showNewDivider: false,
  /* The furniture a real screenshot is full of and a mockup never had: the
     blue catch-up bar, the top of the channel, the follow button an
     announcement channel offers, and the composer of a channel you can only
     read. */
  showUnreadBanner: false,
  unreadCount: 25,
  unreadSince: "19:42",
  showChannelStart: false,
  channelKind: "text",
  showFollow: false,
  followText: "Follow this channel to post updates into your own server.",
  readOnly: false,
  readOnlyReason: "You do not have permission to send messages in this channel.",
  /* The phone's own status bar. Every screenshot taken on a phone has one,
     and 9:41 is the time Apple puts in theirs. */
  showStatusBar: true,
  phoneTime: "9:41",
  phoneBattery: 78,
  showTyping: false,
  typingNames: "Someone",
  ...over,
});

/* ---------------------------------------------------------------- blank */

/* The empty document's ids are fixed, not generated.
 *
 * This page is server-rendered and then hydrated, and `blankProject()` runs on
 * both sides — so a random id meant the server wrote one set of ids into the
 * HTML and the browser built another. React kept the server's attributes and
 * the client's state, and from then on the two disagreed: the `data-id` on a
 * message was not the id of any message in the project. Clicking a message
 * looked up an id that did not exist.
 *
 * That went unnoticed for a long time because the editor used to fall back to
 * "the first message" whenever the lookup failed, which is exactly the answer
 * that hid it.
 *
 * Ids only have to be unique *within* a document, and a blank document is one
 * document, so fixed ones are correct. Everything created after this — every
 * message, member and embed somebody adds — is minted properly, and copying a
 * document re-ids it.
 */
export function blankProject() {
  const bot = newUser({
    id: "usr_blank_bot",
    name: "Gator",
    color: "#f7a8c4",
    avatar: avatarUrl(0),
    bot: true,
    verified: true,
  });
  const person = newUser({ id: "usr_blank_member", name: "Member", color: "#5fd08a", avatar: avatarUrl(12) });

  return {
    version: PROJECT_VERSION,
    name: "Untitled mockup",
    updatedAt: Date.now(),
    roles: [],
    users: [bot, person],
    emojis: [],
    canvas: newCanvas(),
    messages: [
      newMessage(bot.id, {
        id: "msg_blank_welcome",
        content: "Welcome to the server.",
        timestamp: "Today at 10:00",
      }),
    ],
  };
}

/* --------------------------------------------------------------- helpers */

/** Every block in a tree, flattened, so a count or a search does not have to
 *  know how deep the nesting goes. */
export function flatten(blocks = []) {
  return blocks.flatMap((b) => (b.type === "container" ? [b, ...flatten(b.blocks)] : [b]));
}

/** The character count Discord charges a v2 message for: every piece of text
 *  in the tree, including labels and placeholders. */
export function countCharacters(blocks = []) {
  return flatten(blocks).reduce((sum, b) => {
    let n = (b.content ?? "").length + (b.placeholder ?? "").length;
    for (const button of b.buttons ?? []) n += (button.label ?? "").length;
    if (b.accessory?.kind === "button") n += (b.accessory.label ?? "").length;
    for (const option of b.options ?? []) n += (option.label ?? "").length + (option.description ?? "").length;
    return sum + n;
  }, 0);
}

/** A deep copy with fresh ids, for duplicating a block or a message. */
export function reid(node) {
  if (Array.isArray(node)) return node.map(reid);
  if (node && typeof node === "object") {
    const copy = Object.fromEntries(Object.entries(node).map(([k, v]) => [k, reid(v)]));
    if ("id" in copy) copy.id = uid();
    return copy;
  }
  return node;
}

/* Every picture already in a mockup, once, in the order somebody would look
 * for them.
 *
 * The pickers offer this first. "Which picture?" is most often answered with
 * one that is already here — the same avatar, the same screenshot, the sticker
 * from two messages up — and making somebody find that file on disk again is
 * the reason a picker without a gallery is worse than no picker.
 */
export function projectImages(project) {
  const out = [];
  const seen = new Set();
  const take = (src, label) => {
    if (!src || seen.has(src)) return;
    seen.add(src);
    out.push({ src, label });
  };

  for (const emoji of project.emojis ?? []) take(emoji.src, `:${emoji.name}:`);
  for (const message of project.messages ?? []) {
    for (const a of message.attachments ?? []) take(a.src, a.name || "attachment");
    take(message.sticker?.src, message.sticker?.name || "sticker");
    take(message.profile?.banner, "banner");
    take(message.invite?.icon, message.invite?.name || "invite");
    take(message.linkPreview?.image, "link image");
    take(message.linkPreview?.thumbnail, "link thumbnail");
    for (const embed of message.embeds ?? []) {
      take(embed.image, "embed image");
      take(embed.thumbnail, "embed thumbnail");
      take(embed.authorIcon, "author icon");
      take(embed.footerIcon, "footer icon");
    }
  }
  take(project.canvas?.server?.icon, "server icon");
  take(project.canvas?.customBackground, "background");
  for (const user of project.users ?? []) take(user.avatar, user.name);

  return out;
}
