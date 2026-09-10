"use client";

/* The editor's form controls.
 *
 * Every one of these is the component from `src/components/ui`, which is the
 * set copied out of gatorsys.xyz — the same Radix primitives, the same markup,
 * the same classes. This file is only the layout around them: a label, its
 * control, its hint and its counter, in the one arrangement they always take.
 *
 * Nothing here is a native `<select>` any more. A native select draws the
 * operating system's menu, which on Windows is a grey rectangle with square
 * corners in a font nothing else on the page uses — the single loudest way an
 * interface can announce it was not designed.
 */

import { createContext, useContext, useEffect, useId, useRef, useState } from "react";
import { IconCheck, IconPalette, IconPhoto, IconTrash, IconUpload } from "@tabler/icons-react";
import { HexColorPicker } from "react-colorful";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import * as SliderPrimitive from "@radix-ui/react-slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { safeMedia } from "@/lib/urls";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { readAsDataUrl, squareCrop } from "@/lib/image";
import "./fields.css";

/* The id of the control a Field wraps, handed down so the label can point at
   it by name.
 *
 * This used to be an implicit association — a <label> wrapped around
 * everything — which names "the first labelable descendant". A button is
 * labelable, so on the Content field the *emoji button* was claiming the
 * label and the textarea was left with no accessible name at all; a screen
 * reader announced it as an unnamed edit box. Explicit beats implicit here. */
const FieldContext = createContext(null);

export function Field({ label, hint, children, counter, tip }) {
  const base = useId();
  const ids = { id: `${base}-c`, labelId: `${base}-l` };

  const body = (
    <div className="e-field">
      {label ? (
        <span className="e-field-head">
          <label className="e-field-label" id={ids.labelId} htmlFor={ids.id}>
            {label}
          </label>
          {counter ? <span className="e-field-counter">{counter}</span> : null}
        </span>
      ) : null}
      <FieldContext.Provider value={label ? ids : null}>{children}</FieldContext.Provider>
      {hint ? <span className="e-field-hint">{hint}</span> : null}
    </div>
  );
  if (!tip) return body;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{body}</TooltipTrigger>
      <TooltipContent side="left">{tip}</TooltipContent>
    </Tooltip>
  );
}

/** How far into a limit a value is, said plainly and coloured once it is over.
 *  Nothing refuses the extra character — a mockup showing an over-long title is
 *  a legitimate thing to want to see — but it should be impossible to miss. */
export function Counter({ value = "", limit }) {
  const n = (value ?? "").length;
  if (!limit) return null;
  return (
    <span className="e-counter" data-over={n > limit ? "true" : "false"}>
      {n}/{limit}
    </span>
  );
}

export function Text({ value, onChange, limit, multiline, rows = 3, ref, className, ...rest }) {
  const over = limit && (value ?? "").length > limit;
  const field = useContext(FieldContext);
  const shared = {
    ref,
    id: field?.id,
    "aria-labelledby": field?.labelId,
    value: value ?? "",
    onChange: (e) => onChange(e.target.value),
    "data-over": over ? "true" : "false",
    className: cn("e-control", over && "border-[var(--gator-danger)]", className),
    ...rest,
  };
  return multiline ? <Textarea rows={rows} {...shared} /> : <Input {...shared} />;
}

export function Num({ value, onChange, min, max, step = 1, suffix }) {
  /* Same as `Text` and `Pick`: the label above points at this control by id,
     which is the only way it gets a name — the wrapper below means the field's
     implicit association never reaches the input. */
  const field = useContext(FieldContext);
  return (
    <span className="e-num">
      <Input
        type="number"
        className="e-control"
        id={field?.id}
        aria-labelledby={field?.labelId}
        value={value ?? 0}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {suffix ? <span className="e-num-suffix">{suffix}</span> : null}
    </span>
  );
}

/* Radix's slider rather than `<input type="range">`, which cannot be styled
   consistently across browsers — Firefox and Safari each draw their own track
   and thumb and ignore most of what you tell them. */
export function Slider({ value, onChange, min, max, step = 1, suffix = "" }) {
  return (
    <span className="e-slider">
      <SliderPrimitive.Root
        className="relative flex h-5 w-full touch-none select-none items-center"
        value={[value ?? min]}
        min={min}
        max={max}
        step={step}
        onValueChange={([v]) => onChange(v)}
      >
        <SliderPrimitive.Track className="relative h-[5px] w-full grow overflow-hidden rounded-full bg-[var(--gator-border-strong)]">
          <SliderPrimitive.Range className="absolute h-full bg-[var(--accent-peach)]" />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb className="block size-[15px] rounded-full border-2 border-[var(--accent-peach)] bg-[var(--gator-surface-raised)] shadow-sm transition-[transform,box-shadow] duration-150 ease-premium hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-peach)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--gator-bg)] active:scale-95" />
      </SliderPrimitive.Root>
      <output>
        {value}
        {suffix}
      </output>
    </span>
  );
}

/** The dashboard's Select. Options are `{value,label,hint}` or bare strings. */
/* Radix reserves the empty string for "nothing is selected", and throws if an
   item is given it as a value — which takes the whole editor down, because a
   render error has no local recovery. But an empty value is exactly what an
   option like "Not a reply" or "None" means, so the two readings collide.
   Translated here, once, rather than left for every caller to remember: a
   caller passes "" for the empty choice and this swaps in a private sentinel
   on the way down and back out again. */
const NONE = "\u0000none";

export function Pick({ value, onChange, options, placeholder = "Choose", label, title }) {
  /* Only when the caller actually offers an empty choice. Without one, "" has
     to keep meaning "unset" so the placeholder still shows. */
  const clearable = options.some((o) => (o.value ?? o) === "");
  const encode = (v) => (clearable && (v === "" || v == null) ? NONE : (v ?? ""));
  const decode = (v) => (v === NONE ? "" : v);

  const field = useContext(FieldContext);

  return (
    <Select value={encode(value)} onValueChange={(v) => onChange(decode(v))}>
      <SelectTrigger
        className="e-control h-10"
        id={field?.id}
        aria-labelledby={label ? undefined : field?.labelId}
        aria-label={label}
        title={title}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => {
          const v = o.value ?? o;
          return (
            <SelectItem key={v} value={encode(v)}>
              <span className="flex flex-col gap-0.5">
                <span>{o.label ?? o}</span>
                {o.hint ? (
                  <span className="text-[11px] leading-snug text-[var(--gator-text-muted)]">{o.hint}</span>
                ) : null}
              </span>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}

/* A segmented control for three or four short options. Above that it is a
   Select: a segmented control with six segments is a row of truncated words. */
export function Segmented({ value, onChange, options, label }) {
  return (
    <div className="e-segmented" role="group" aria-label={label}>
      {options.map((o) => {
        const v = o.value ?? o;
        return (
          <button
            key={v}
            type="button"
            className="e-segment"
            data-on={value === v ? "true" : "false"}
            onClick={() => onChange(v)}
          >
            {o.icon ?? null}
            {o.label ?? o}
          </button>
        );
      })}
    </div>
  );
}

/* Radix's switch, so the thumb animates from a real state machine and the
   whole control is one keyboard target rather than a div with a click. */
export function Toggle({ label, hint, value, onChange }) {
  const id = useId();
  return (
    <div className="e-toggle">
      <label htmlFor={id} className="e-toggle-copy">
        <span className="e-toggle-label">{label}</span>
        {hint ? <span className="e-field-hint">{hint}</span> : null}
      </label>
      <SwitchPrimitive.Root
        id={id}
        checked={Boolean(value)}
        onCheckedChange={onChange}
        className="peer inline-flex h-[22px] w-[38px] shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-colors duration-200 ease-premium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-peach)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--gator-bg)] disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-[var(--accent-peach)] data-[state=unchecked]:bg-[var(--gator-border-strong)]"
      >
        <SwitchPrimitive.Thumb className="pointer-events-none block size-4 rounded-full bg-white shadow-lg ring-0 transition-transform duration-200 ease-premium data-[state=checked]:translate-x-[19px] data-[state=unchecked]:translate-x-[3px]" />
      </SwitchPrimitive.Root>
    </div>
  );
}

/* The colour control, copied from gatorsys.xyz.
 *
 * This was a native `<input type="color">`, which opens the operating
 * system's picker — a different control on every machine, wearing none of
 * this site's design. `ColorPicker` in `gatorsys.xyz/src/components/Manage/
 * fields.tsx` is the one the dashboard's embed editor already uses: a swatch
 * that opens a popover holding a real spectrum, the same fifteen presets, and
 * a hex box. Same component, same swatches, same behaviour.
 *
 * The one addition is `allowNone`, because an embed here can have no accent
 * at all and the dashboard's cannot. */
const COLOR_SWATCHES = [
  "#ffb3ab", "#fb7185", "#f97316", "#facc15", "#84cc16",
  "#34d399", "#22d3ee", "#60a5fa", "#818cf8", "#a78bfa",
  "#e879f9", "#f472b6", "#f8fafc", "#94a3b8", "#475569",
];

function normalizedHex(value, fallback) {
  const next = (value ?? "").trim();
  if (/^#[0-9a-f]{6}$/i.test(next)) return next.toLowerCase();
  if (/^[0-9a-f]{6}$/i.test(next)) return `#${next.toLowerCase()}`;
  return fallback;
}

export function ColorField({ value, onChange, allowNone = false, label = "Choose colour" }) {
  const none = allowNone && (!value || value === "none");
  const safeValue = normalizedHex(value, "#5865f2");
  const [draft, setDraft] = useState(safeValue);

  useEffect(() => setDraft(safeValue), [safeValue]);

  return (
    <div className="e-color">
      <Popover>
        <PopoverTrigger asChild>
          <button type="button" className="e-color-trigger" aria-label={label}>
            <span
              className="e-color-chip"
              data-none={none ? "true" : "false"}
              style={none ? undefined : { backgroundColor: safeValue }}
            />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" sideOffset={8} className="e-color-pop">
          <div className="e-color-pop-head">
            <IconPalette size={15} />
            <span>Colour</span>
          </div>

          {/* A full spectrum, so any colour is reachable — not only a preset. */}
          <div className="e-colorful">
            <HexColorPicker
              color={safeValue}
              onChange={(next) => {
                setDraft(next);
                onChange(next);
              }}
            />
          </div>

          <div className="e-color-swatches">
            {allowNone ? (
              <button
                type="button"
                className="e-color-swatch e-color-swatch-none"
                data-on={none ? "true" : "false"}
                onClick={() => onChange("none")}
                aria-label="No accent"
              />
            ) : null}
            {COLOR_SWATCHES.map((swatch) => (
              <button
                key={swatch}
                type="button"
                className="e-color-swatch"
                data-on={!none && safeValue === swatch ? "true" : "false"}
                style={{ backgroundColor: swatch }}
                onClick={() => onChange(swatch)}
                aria-label={`Use ${swatch}`}
              >
                {!none && safeValue === swatch ? <IconCheck size={13} stroke={3} /> : null}
              </button>
            ))}
          </div>

          <div className="e-color-hexrow">
            <input
              className="e-control e-color-hex"
              value={draft}
              maxLength={7}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={() => {
                const next = normalizedHex(draft, safeValue);
                setDraft(next);
                onChange(next);
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                const next = normalizedHex(draft, safeValue);
                setDraft(next);
                onChange(next);
              }}
              aria-label="Custom hex colour"
              spellCheck={false}
            />
            <span className="e-color-preview" style={none ? undefined : { backgroundColor: safeValue }} />
          </div>
        </PopoverContent>
      </Popover>

      <Input
        className="e-control e-color-value"
        value={none ? "none" : (value ?? "")}
        onChange={(event) => onChange(event.target.value)}
        onBlur={() => {
          if (none) return;
          onChange(normalizedHex(value, safeValue));
        }}
        placeholder="#5865f2"
        aria-label="Hex colour"
        spellCheck={false}
      />
    </div>
  );
}

/* An image, from a file or from a URL.
 *
 * Both, because they solve different problems. A pasted file becomes a data
 * URI, which travels inside the project file and works offline but counts
 * against the cloud backup's size limit; a URL costs nothing and breaks if the
 * host goes away. The field says which one is in use rather than hiding it. */
export function ImageField({ value, onChange, label, hint, onError, round = false, square = round, name }) {
  const [mode, setMode] = useState(() => (value?.startsWith("data:") ? "file" : "url"));
  const input = useRef(null);

  const take = async (file) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      onError?.("That file is not an image.");
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      onError?.("Images pasted into a mockup are capped at 4 MB. Link it by URL instead.");
      return;
    }
    try {
      /* A slot that is a fixed circle or square gets the upload cropped to fit
         it, the way Discord crops an avatar at upload rather than squashing it
         at render. Everything else keeps whatever shape it arrived in. */
      onChange(square ? await squareCrop(file) : await readAsDataUrl(file));
      // A file has just been chosen, so the field should be showing the file
      // control — not a URL box the upload did not come from.
      setMode("file");
    } catch {
      onError?.("That image could not be read.");
    }
  };

  return (
    /* `name` is how something outside can point at this field — the server's
       icon on the canvas opens the sheet and then has to say *which* control it
       meant, or the sheet just opens at the top and leaves you looking for it. */
    <div className="e-image" data-field={name}>
      <div className="e-field-head">
        <span className="e-field-label">{label}</span>
        <Segmented
          value={mode}
          onChange={setMode}
          label="Image source"
          options={[
            { value: "file", label: "Upload" },
            { value: "url", label: "Link" },
          ]}
        />
      </div>

      <div className="e-image-row">
        {/* The preview is masked the same way the slot is, so what you see
            here is the crop you are going to get. */}
        <span className="e-image-preview" data-round={round ? "true" : "false"}>
          {/* Through the same guard the canvas uses. The preview exists to show
              what the mockup will draw, so showing something the mockup would
              refuse is a lie either way — and a `javascript:` or `data:text`
              URL pasted into a field should not reach an element at all, even
              one that would decline to run it. */}
          {safeMedia(value) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={safeMedia(value)} alt="" />
          ) : (
            <IconPhoto size={18} />
          )}
        </span>

        {mode === "file" ? (
          <button type="button" className="e-btn e-btn-quiet" onClick={() => input.current?.click()}>
            <IconUpload size={15} />
            {value ? "Replace" : "Choose a file"}
          </button>
        ) : (
          <Input
            className="e-control"
            value={value?.startsWith("data:") ? "" : (value ?? "")}
            onChange={(e) => onChange(e.target.value)}
            placeholder="https://…"
            spellCheck={false}
          />
        )}

        {value ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="e-btn e-btn-quiet e-btn-icon"
                onClick={() => onChange("")}
                aria-label="Remove image"
              >
                <IconTrash size={15} />
              </button>
            </TooltipTrigger>
            <TooltipContent>Remove</TooltipContent>
          </Tooltip>
        ) : null}

        <input
          ref={input}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            take(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>
      {hint ? <span className="e-field-hint">{hint}</span> : null}
    </div>
  );
}

/* A hover label. Lives here rather than in the builder because the inspector
   needs the same thing, and two of these would drift apart. */
export function Hint({ label, keys, children }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent className="e-hint">
        {label}
        {keys ? <kbd>{keys}</kbd> : null}
      </TooltipContent>
    </Tooltip>
  );
}

export function Row({ children, gap = 8 }) {
  return (
    <div className="e-row" style={{ gap }}>
      {children}
    </div>
  );
}

export function Group({
  title,
  action,
  children,
  collapsible = false,
  open: openProp = true,
  /** A glyph for the tile grid; ignored by the plain stacked layout. */
  icon = null,
  /** Whether the thing this group configures is currently on the message. */
  on = null,
}) {
  const [open, setOpen] = useState(openProp);
  return (
    <section
      className="e-group"
      data-open={open ? "true" : "false"}
      data-on={on === null ? undefined : on ? "true" : "false"}
    >
      <header className="e-group-head">
        {collapsible ? (
          <button
            type="button"
            className="e-group-toggle"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {icon ? <span className="e-group-icon">{icon}</span> : null}
            <svg className="e-group-caret" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="m7 10 5 5 5-5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {title}
            {on ? <span className="e-group-dot" aria-label="on" /> : null}
          </button>
        ) : (
          <span className="e-group-title">
            {icon ? <span className="e-group-icon">{icon}</span> : null}
            {title}
          </span>
        )}
        {action}
      </header>
      {/* The body stays mounted and the wrapper animates between 0fr and 1fr,
          which is how you transition to a height nobody has measured. Removing
          it from the tree instead would snap, and measuring it in JavaScript
          would fight every field inside that changes its own height. */}
      <div className="e-group-wrap" aria-hidden={!open}>
        <div className="e-group-body" inert={open ? undefined : ""}>
          {children}
        </div>
      </div>
    </section>
  );
}

export function Empty({ children }) {
  return <p className="e-empty">{children}</p>;
}

/** A quiet control with a label that only appears on hover — used wherever an
 *  icon has to stand in for a word. */
export function IconAction({ label, onClick, disabled, children, className }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className={cn("e-icon-btn", className)}
          onClick={onClick}
          disabled={disabled}
          aria-label={label}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
