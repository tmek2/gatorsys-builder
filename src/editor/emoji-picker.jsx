"use client";

/* Picking an emoji.
 *
 * Built here rather than pulled from a package, for two reasons that both
 * matter. The package drew Apple's emoji set, so you picked one glyph and the
 * canvas drew another — on a tool whose whole output is a picture, that is the
 * one mismatch that cannot be allowed. And it shipped every emoji in Unicode
 * behind a search box, which is a few hundred kilobytes of things nobody has
 * ever put on a Discord button.
 *
 * This draws the same Twemoji the canvas does, from the same pinned version,
 * and offers the few hundred a message actually uses — grouped the way Discord
 * groups them, short enough to scan rather than long enough to need searching,
 * with search there anyway for when you know the word.
 *
 * Two shapes, because there are two jobs. `EmojiSlot` is a field holding
 * exactly one emoji, where picking replaces what is there. `EmojiInsert` goes
 * into a body of text, at the caret, leaving the caret after it.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import { IconMoodSmile, IconSearch } from "@tabler/icons-react";
import { Icon } from "@/discord/icon";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ALL_EMOJI, EMOJI_GROUPS } from "@/lib/emoji-data";
import { Twemoji } from "@/discord/emoji-node";
import "./emoji-picker.css";

function Picker({ onPick, custom = [] }) {
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState(EMOJI_GROUPS[0].id);

  const searching = query.trim().length > 0;
  const found = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return ALL_EMOJI.filter((e) => e.keywords.includes(q) || e.keywords.split(" ").some((k) => k.startsWith(q)))
      .slice(0, 96);
  }, [query]);

  const shown = searching
    ? found
    : (EMOJI_GROUPS.find((g) => g.id === group)?.emoji ?? []).map(([char, keywords]) => ({ char, keywords }));

  return (
    <div className="e-emoji">
      <div className="e-emoji-search">
        <IconSearch size={15} />
        <Input
          className="e-emoji-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search emoji"
          autoFocus
          spellCheck={false}
        />
      </div>

      {/* The uploaded server emoji come first and are always visible: they are
          the ones this project has, and burying them under seven categories of
          Unicode would be burying the only ones that are yours. */}
      {custom.length && !searching ? (
        <div className="e-emoji-section">
          <div className="e-emoji-label">This project</div>
          <div className="e-emoji-grid">
            {custom.filter((c) => c.src).map((c) => (
              <button
                key={c.name}
                type="button"
                className="e-emoji-cell"
                onClick={() => onPick(`:${c.name}:`)}
                title={`:${c.name}:`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={c.src} alt={c.name} />
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {!searching ? (
        <div className="e-emoji-tabs" role="tablist">
          {EMOJI_GROUPS.map((g) => (
            <button
              key={g.id}
              type="button"
              role="tab"
              className="e-emoji-tab"
              data-on={group === g.id ? "true" : "false"}
              onClick={() => setGroup(g.id)}
              aria-label={g.name}
              title={g.name}
            >
              <Twemoji text={g.icon} />
            </button>
          ))}
        </div>
      ) : null}

      <div className="e-emoji-section e-emoji-scroll">
        <div className="e-emoji-label">
          {searching ? `${found.length} result${found.length === 1 ? "" : "s"}` : EMOJI_GROUPS.find((g) => g.id === group)?.name}
        </div>
        {shown.length ? (
          <div className="e-emoji-grid">
            {shown.map((e) => (
              <button
                key={e.char}
                type="button"
                className="e-emoji-cell"
                onClick={() => onPick(e.char)}
                title={e.keywords.split(" ")[0]}
              >
                <Twemoji text={e.char} />
              </button>
            ))}
          </div>
        ) : (
          <p className="e-emoji-none">Nothing matches “{query}”.</p>
        )}
      </div>
    </div>
  );
}

/** A field that holds one emoji, with a picker beside it. */
export function EmojiSlot({ value, onChange, custom, placeholder = "🎟️" }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="e-emoji-slot">
      <Input
        className="e-control"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        spellCheck={false}
      />
      <Popover open={open} onOpenChange={setOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <button type="button" className="e-btn e-btn-quiet e-btn-icon" aria-label="Pick an emoji">
                <IconMoodSmile size={16} />
              </button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent>Pick an emoji</TooltipContent>
        </Tooltip>
        <PopoverContent className="e-emoji-pop" align="end" sideOffset={8}>
          <Picker
            custom={custom}
            onPick={(emoji) => {
              onChange(emoji);
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

/* Inserting into a body of text.
 *
 * The textarea is not owned by this component, so it is handed in by ref. The
 * caret is read before the insert and restored after it, one frame later —
 * React has re-rendered the field with the new value by then, and setting a
 * selection on the old one would be setting it on a value that no longer
 * exists. */
export function useEmojiInsert(ref, value, onChange) {
  return useCallback(
    (emoji) => {
      const el = ref.current;
      const start = el?.selectionStart ?? (value ?? "").length;
      const end = el?.selectionEnd ?? start;
      const next = `${(value ?? "").slice(0, start)}${emoji}${(value ?? "").slice(end)}`;
      onChange(next);
      window.requestAnimationFrame(() => {
        if (!el) return;
        el.focus();
        el.setSelectionRange(start + emoji.length, start + emoji.length);
      });
    },
    [onChange, ref, value],
  );
}

/** The picker button that sits beside a text area's label. */
export function EmojiInsert({ onPick, custom }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            {/* The client's own smiley, out of the icon library, not a
                generic one from the interface set. Every other button on the
                island is Discord's; this one was the odd face out. */}
            <button type="button" className="e-icon-btn c-bar-btn" aria-label="Insert an emoji">
              <Icon name="emoji" size={20} />
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Insert an emoji</TooltipContent>
      </Tooltip>
      <PopoverContent className="e-emoji-pop" align="end" sideOffset={8}>
        <Picker
          custom={custom}
          onPick={(emoji) => {
            onPick(emoji);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

export { useRef };
