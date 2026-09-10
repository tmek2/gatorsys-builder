"use client";

/* The component tree.
 *
 * The same shape as the message designer in the dashboard: a list of blocks
 * you add to, nest, reorder and collapse, with each block's own editor inline
 * rather than behind a modal. Two things are deliberately different.
 *
 * A container is a block like any other. Every block is not swept inside one,
 * so adding a button to a line of text does not box the text — which is both
 * how Discord's tree is actually shaped and the single most common thing a
 * builder gets wrong.
 *
 * Nothing here builds behaviour. The dashboard's version attaches a ticket
 * panel or a form to a button because the bot has to run it; here a button is
 * a label, a colour and an emoji, because the output is a picture. That is
 * why this file is a third the size of the one it is modelled on.
 */

import React, { useRef, useState } from "react";
import {
  IconChevronDown,
  IconChevronUp,
  IconCopy,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import { BLOCK_TYPES, LIMITS, NESTABLE, newBlock, newButton, newSelectOption, reid, uid } from "@/lib/model";
import { ColorField, Counter, Field, ImageField, Num, Pick, Row, Segmented, Text, Toggle } from "./fields";
import { EmojiInsert, EmojiSlot, useEmojiInsert } from "./emoji-picker";

/* The project's uploaded emoji, so every picker in the tree offers them
   without each block editor being handed the whole project. */
const EmojiSet = React.createContext([]);
const useEmojis = () => React.useContext(EmojiSet);
import "./blocks.css";

/* ---------------------------------------------------------------- adder */

function AddBlock({ types, onAdd, label = "Add a block" }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="e-adder">
      <button type="button" className="e-btn e-btn-dashed" onClick={() => setOpen((v) => !v)}>
        <IconPlus size={15} />
        {label}
      </button>
      {open ? (
        <>
          {/* A click anywhere else closes it. A backdrop rather than a
              document listener, so the click that closes the menu does not
              also press whatever is underneath. */}
          <button type="button" className="e-adder-scrim" aria-label="Close" onClick={() => setOpen(false)} />
          <div className="e-adder-menu" role="menu">
            {types.map((type) => (
              <button
                key={type}
                type="button"
                className="e-adder-item"
                onClick={() => {
                  onAdd(newBlock(type));
                  setOpen(false);
                }}
              >
                <span className="e-adder-name">{BLOCK_TYPES[type].label}</span>
                <span className="e-adder-hint">{BLOCK_TYPES[type].hint}</span>
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

/* --------------------------------------------------------------- buttons */

const BUTTON_STYLES = [
  { value: "primary", label: "Blurple" },
  { value: "secondary", label: "Grey" },
  { value: "success", label: "Green" },
  { value: "danger", label: "Red" },
  { value: "link", label: "Link" },
  { value: "premium", label: "Premium" },
];

function ButtonEditor({ button, onChange, onRemove, index }) {
  const emojis = useEmojis();
  return (
    <div className="e-sub">
      <header className="e-sub-head">
        <span className="e-sub-title">Button {index + 1}</span>
        <button type="button" className="e-btn e-btn-quiet e-btn-icon" onClick={onRemove} aria-label="Remove button">
          <IconTrash size={14} />
        </button>
      </header>
      <Row>
        <Field label="Label" counter={<Counter value={button.label} limit={LIMITS.buttonLabel} />}>
          <Text value={button.label} onChange={(v) => onChange({ label: v })} limit={LIMITS.buttonLabel} />
        </Field>
        <Field label="Emoji" hint="A Unicode emoji, or :name: for one you uploaded.">
          <EmojiSlot custom={emojis} value={button.emoji} onChange={(v) => onChange({ emoji: v })} />
        </Field>
      </Row>
      <Row>
        <Field label="Style">
          <Pick value={button.style} onChange={(v) => onChange({ style: v })} options={BUTTON_STYLES} />
        </Field>
        {button.style === "link" ? (
          <Field label="Link">
            <Text value={button.url} onChange={(v) => onChange({ url: v })} placeholder="https://…" />
          </Field>
        ) : null}
      </Row>
      <Toggle
        label="Disabled"
        hint="Drawn at half opacity, the way the client draws a button that cannot be pressed."
        value={button.disabled}
        onChange={(v) => onChange({ disabled: v })}
      />
    </div>
  );
}

/* ------------------------------------------------------- block bodies */

function TextBody({ block, patch }) {
  const emojis = useEmojis();
  const body = useRef(null);
  const insert = useEmojiInsert(body, block.content, (content) => patch({ content }));
  return (
    <Field
      label="Text"
      hint="Markdown, headings, lists, quotes, spoilers, mentions and timestamps all render."
      counter={
        <span className="e-field-tools">
          <EmojiInsert onPick={insert} custom={emojis} />
          <Counter value={block.content} limit={LIMITS.v2Characters} />
        </span>
      }
    >
      <Text ref={body} multiline rows={4} value={block.content} onChange={(v) => patch({ content: v })} />
    </Field>
  );
}

function SectionBody({ block, patch, onError }) {
  const accessory = block.accessory ?? { kind: "thumbnail" };
  const setAccessory = (over) => patch({ accessory: { ...accessory, ...over } });

  return (
    <>
      <Field
        label="Text"
        hint={`Up to ${LIMITS.sectionText} lines sit beside the accessory before the client wraps them.`}
      >
        <Text multiline rows={3} value={block.content} onChange={(v) => patch({ content: v })} />
      </Field>

      <Field label="Accessory">
        <Segmented
          value={accessory.kind}
          onChange={(kind) =>
            patch({
              accessory:
                kind === "button"
                  ? { kind: "button", ...newButton({ label: "Open" }) }
                  : { kind: "thumbnail", src: "", alt: "" },
            })
          }
          label="Accessory kind"
          options={[
            { value: "thumbnail", label: "Thumbnail" },
            { value: "button", label: "Button" },
          ]}
        />
      </Field>

      {accessory.kind === "button" ? (
        <ButtonEditor
          button={accessory}
          index={0}
          onChange={(over) => setAccessory(over)}
          onRemove={() => patch({ accessory: { kind: "thumbnail", src: "", alt: "" } })}
        />
      ) : (
        <>
          <ImageField
            label="Thumbnail"
            value={accessory.src}
            onChange={(src) => setAccessory({ src })}
            onError={onError}
          />
          <Field label="Alt text" hint="Drawn as the ALT tag the client puts on described media.">
            <Text value={accessory.alt} onChange={(alt) => setAccessory({ alt })} />
          </Field>
          {/* A thumbnail carries its own spoiler in the spec, separately from
              the container it might sit in. */}
          <Toggle
            label="Spoiler"
            hint="Blurred with a Spoiler tag, the way the client delivers one."
            value={accessory.spoiler}
            onChange={(spoiler) => setAccessory({ spoiler })}
          />
        </>
      )}
    </>
  );
}

function GalleryBody({ block, patch, onError }) {
  const items = block.items ?? [];
  const set = (id, over) => patch({ items: items.map((i) => (i.id === id ? { ...i, ...over } : i)) });

  return (
    <>
      {items.map((item, n) => (
        <div className="e-sub" key={item.id}>
          <header className="e-sub-head">
            <span className="e-sub-title">Item {n + 1}</span>
            <button
              type="button"
              className="e-btn e-btn-quiet e-btn-icon"
              onClick={() => patch({ items: items.filter((i) => i.id !== item.id) })}
              aria-label="Remove item"
            >
              <IconTrash size={14} />
            </button>
          </header>
          <ImageField label="Image or video" value={item.src} onChange={(src) => set(item.id, { src })} onError={onError} />
          <Row>
            <Field label="Alt text">
              <Text value={item.alt} onChange={(alt) => set(item.id, { alt })} />
            </Field>
          </Row>
          <Toggle label="Spoiler" value={item.spoiler} onChange={(spoiler) => set(item.id, { spoiler })} />
        </div>
      ))}

      <button
        type="button"
        className="e-btn e-btn-dashed"
        disabled={items.length >= LIMITS.galleryItems}
        onClick={() => patch({ items: [...items, { id: uid(), src: "", alt: "", spoiler: false }] })}
      >
        <IconPlus size={15} />
        Add an image
        <span className="e-btn-count">
          {items.length}/{LIMITS.galleryItems}
        </span>
      </button>
    </>
  );
}

function SeparatorBody({ block, patch }) {
  return (
    <>
      <Toggle
        label="Draw the line"
        hint="Off leaves the space and no rule, which is what a separator is for most of the time."
        value={block.divider !== false}
        onChange={(v) => patch({ divider: v })}
      />
      <Field label="Spacing">
        <Segmented
          value={block.spacing || "small"}
          onChange={(v) => patch({ spacing: v })}
          label="Spacing"
          options={[
            { value: "small", label: "Small" },
            { value: "large", label: "Large" },
          ]}
        />
      </Field>
    </>
  );
}

function ButtonsBody({ block, patch }) {
  const buttons = block.buttons ?? [];
  return (
    <>
      {buttons.map((button, n) => (
        <ButtonEditor
          key={button.id}
          index={n}
          button={button}
          onChange={(over) => patch({ buttons: buttons.map((b) => (b.id === button.id ? { ...b, ...over } : b)) })}
          onRemove={() => patch({ buttons: buttons.filter((b) => b.id !== button.id) })}
        />
      ))}
      <button
        type="button"
        className="e-btn e-btn-dashed"
        disabled={buttons.length >= LIMITS.buttonsPerRow}
        onClick={() => patch({ buttons: [...buttons, newButton()] })}
      >
        <IconPlus size={15} />
        Add a button
        <span className="e-btn-count">
          {buttons.length}/{LIMITS.buttonsPerRow}
        </span>
      </button>
    </>
  );
}

const SELECT_KINDS = [
  { value: "string", label: "Options you write" },
  { value: "user", label: "User picker" },
  { value: "role", label: "Role picker" },
  { value: "channel", label: "Channel picker" },
  { value: "mentionable", label: "User or role picker" },
];

function SelectBody({ block, patch }) {
  const emojis = useEmojis();
  const options = block.options ?? [];
  const set = (id, over) => patch({ options: options.map((o) => (o.id === id ? { ...o, ...over } : o)) });

  return (
    <>
      <Field label="Kind" hint="The four pickers draw their own placeholder — their options come from the server.">
        <Pick value={block.kind || "string"} onChange={(v) => patch({ kind: v })} options={SELECT_KINDS} />
      </Field>
      <Field label="Placeholder" counter={<Counter value={block.placeholder} limit={LIMITS.selectPlaceholder} />}>
        <Text value={block.placeholder} onChange={(v) => patch({ placeholder: v })} limit={LIMITS.selectPlaceholder} />
      </Field>
      <Toggle label="Disabled" value={block.disabled} onChange={(v) => patch({ disabled: v })} />

      {/* How many may be chosen. The client draws a different menu for a
          multi-select — "Select up to 3" rather than the placeholder — so this
          is visible in a mockup rather than a detail of the payload. */}
      {(block.kind || "string") === "string" ? (
        <Row>
          <Field label="Choose at least" hint="0 lets the menu be left empty.">
            <Num value={block.minValues ?? 1} min={0} max={25} onChange={(v) => patch({ minValues: v })} />
          </Field>
          <Field label="Choose at most" hint="Above 1 the client draws a multi-select.">
            <Num value={block.maxValues ?? 1} min={1} max={25} onChange={(v) => patch({ maxValues: v })} />
          </Field>
        </Row>
      ) : null}

      {(!block.kind || block.kind === "string") ? (
        <>
          {options.map((option, n) => (
            <div className="e-sub" key={option.id}>
              <header className="e-sub-head">
                <span className="e-sub-title">Option {n + 1}</span>
                <button
                  type="button"
                  className="e-btn e-btn-quiet e-btn-icon"
                  onClick={() => patch({ options: options.filter((o) => o.id !== option.id) })}
                  aria-label="Remove option"
                >
                  <IconTrash size={14} />
                </button>
              </header>
              <Row>
                <Field label="Label">
                  <Text value={option.label} onChange={(v) => set(option.id, { label: v })} />
                </Field>
                <Field label="Emoji">
                  <EmojiSlot custom={emojis} value={option.emoji} onChange={(v) => set(option.id, { emoji: v })} />
                </Field>
              </Row>
              <Field label="Description">
                <Text value={option.description} onChange={(v) => set(option.id, { description: v })} />
              </Field>
            </div>
          ))}
          <button
            type="button"
            className="e-btn e-btn-dashed"
            disabled={options.length >= LIMITS.selectOptions}
            onClick={() => patch({ options: [...options, newSelectOption()] })}
          >
            <IconPlus size={15} />
            Add an option
            <span className="e-btn-count">
              {options.length}/{LIMITS.selectOptions}
            </span>
          </button>
        </>
      ) : null}
    </>
  );
}

function FileBody({ block, patch }) {
  return (
    <>
      <Row>
        <Field label="File name" hint="The extension picks the glyph's tint.">
          <Text value={block.name} onChange={(v) => patch({ name: v })} placeholder="report.pdf" />
        </Field>
        <Field label="Size">
          <Text value={block.size} onChange={(v) => patch({ size: v })} placeholder="24.1 KB" />
        </Field>
      </Row>
      <Toggle label="Spoiler" value={block.spoiler} onChange={(v) => patch({ spoiler: v })} />
    </>
  );
}

function ContainerBody({ block, patch, onError, depth }) {
  return (
    <>
      <Field label="Accent" hint="The stripe down the left edge. None leaves the box with no accent at all.">
        <ColorField value={block.color} onChange={(v) => patch({ color: v })} allowNone />
      </Field>
      <Toggle
        label="Spoiler"
        hint="Drawn blurred with a Spoiler tag over it, the way one arrives in the client."
        value={block.spoiler}
        onChange={(v) => patch({ spoiler: v })}
      />
      <div className="e-nest">
        <BlockList
          blocks={block.blocks ?? []}
          onChange={(blocks) => patch({ blocks })}
          onError={onError}
          depth={depth + 1}
        />
      </div>
    </>
  );
}

const BODIES = {
  text: TextBody,
  section: SectionBody,
  gallery: GalleryBody,
  separator: SeparatorBody,
  buttons: ButtonsBody,
  select: SelectBody,
  file: FileBody,
  container: ContainerBody,
};

/* A one-line description of what a block currently holds, for the collapsed
 * header. "Text" tells you nothing when there are six of them; the first few
 * words of the text tells you which one you are looking for. */
function summarise(block) {
  switch (block.type) {
    case "text":
    case "section":
      return (block.content || "").replace(/[#*_~`>-]/g, "").split("\n")[0].slice(0, 46) || "Empty";
    case "buttons":
      return (block.buttons ?? []).map((b) => b.label || "Button").join(" · ") || "No buttons";
    case "gallery":
      return `${(block.items ?? []).length} image${(block.items ?? []).length === 1 ? "" : "s"}`;
    case "separator":
      return block.divider === false ? "Space, no line" : "Line";
    case "select":
      return block.placeholder || "Select menu";
    case "file":
      return block.name || "File";
    case "container":
      return `${(block.blocks ?? []).length} block${(block.blocks ?? []).length === 1 ? "" : "s"}`;
    default:
      return "";
  }
}

/* ------------------------------------------------------------- the list */

function BlockRow({ block, onPatch, onRemove, onDuplicate, onMove, first, last, onError, depth }) {
  const [open, setOpen] = useState(true);
  const Body = BODIES[block.type];

  return (
    <div className="e-block" data-open={open ? "true" : "false"} data-type={block.type}>
      <header className="e-block-head">
        <button
          type="button"
          className="e-block-toggle"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          <IconChevronDown size={14} className="e-block-caret" />
          <span className="e-block-kind">{BLOCK_TYPES[block.type]?.label ?? block.type}</span>
          <span className="e-block-summary">{summarise(block)}</span>
        </button>

        <span className="e-block-tools">
          {/* Up and down rather than drag: the tree nests, and a drag that can
              cross a container boundary needs a drop model that says what
              happens at every edge. Two buttons cannot be ambiguous.
              They are arrows now. They were one button carrying a six-dot
              grip — the glyph every interface uses for "pick this up and drag
              it" — which did not drag, did the job of the arrow below it, and
              on a block that is the only one in its list did nothing at all.
              Reported, fairly, as useless. */}
          <button type="button" className="e-icon-btn" disabled={first} onClick={() => onMove(-1)} aria-label="Move up">
            <IconChevronUp size={15} />
          </button>
          <button type="button" className="e-icon-btn" disabled={last} onClick={() => onMove(1)} aria-label="Move down">
            <IconChevronDown size={15} />
          </button>
          <button type="button" className="e-icon-btn" onClick={onDuplicate} aria-label="Duplicate">
            <IconCopy size={14} />
          </button>
          <button type="button" className="e-icon-btn" onClick={onRemove} aria-label="Remove">
            <IconTrash size={14} />
          </button>
        </span>
      </header>

      {open && Body ? (
        <div className="e-block-body">
          {/* The pair of word-buttons that used to sit under every open block
              said the same thing as the two arrows in its header, one line
              apart, and only appeared while the block was open — so a
              collapsed block could not be moved at all. The arrows do it. */}
          <Body block={block} patch={onPatch} onError={onError} depth={depth} />
        </div>
      ) : null}
    </div>
  );
}

export function BlockList({ blocks = [], onChange, onError, depth = 0, emojis }) {
  const types = depth === 0 ? Object.keys(BLOCK_TYPES) : NESTABLE;

  const move = (i, delta) => {
    const next = [...blocks];
    const j = i + delta;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  const tree = (
    <div className="e-blocks">
      {blocks.map((block, i) => (
        <BlockRow
          key={block.id}
          block={block}
          depth={depth}
          first={i === 0}
          last={i === blocks.length - 1}
          onError={onError}
          onPatch={(over) => onChange(blocks.map((b) => (b.id === block.id ? { ...b, ...over } : b)))}
          onRemove={() => onChange(blocks.filter((b) => b.id !== block.id))}
          onDuplicate={() => onChange([...blocks.slice(0, i + 1), reid(block), ...blocks.slice(i + 1)])}
          onMove={(delta) => move(i, delta)}
        />
      ))}

      <AddBlock
        types={types}
        onAdd={(block) => onChange([...blocks, block])}
        label={depth === 0 ? "Add a component" : "Add inside the container"}
      />
    </div>
  );

  // The provider only wraps the outermost list; nested ones inherit it.
  return depth === 0 ? <EmojiSet.Provider value={emojis ?? []}>{tree}</EmojiSet.Provider> : tree;
}
