"use client";

/* Changing a picture where the picture is.
 *
 * Every image a mockup draws — an attachment, an embed's image or thumbnail, a
 * sticker, a profile's banner — could be *added* from a form and then never
 * touched again: there was no way to swap one for another or take one away
 * except by finding the row it came from, three panels deep. The first report
 * of this was two words long: "can't switch/remove images."
 *
 * So the picture is the control. Hover it and a small strip appears in the
 * corner with the only three things anybody ever wants: put a different file
 * here, point it at a URL, or take it out. Nothing is drawn until the pointer
 * is over the image, and the whole strip is dropped from the export.
 */

import { useEffect, useRef, useState } from "react";
import { Icon } from "./icon";
import { fitWithin } from "@/lib/image";
import { safeMedia } from "@/lib/urls";

/**
 * The hover strip. Drop it inside anything with `position: relative` that
 * draws an image.
 *
 * `onChange` takes the new source; `onRemove`, when given, adds the third
 * button. A slot that must always hold something — a server icon, say — simply
 * does not pass one.
 */
export function ImageTools({ value, onChange, onRemove, label = "image", align = "end" }) {
  const [linking, setLinking] = useState(false);
  const [draft, setDraft] = useState("");
  const file = useRef(null);
  const box = useRef(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!linking) return undefined;
    const away = (event) => {
      if (!box.current?.contains(event.target)) setLinking(false);
    };
    const key = (event) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setLinking(false);
      }
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", key);
    };
  }, [linking]);

  const take = async (chosen) => {
    if (!chosen) return;
    setBusy(true);
    try {
      onChange(await fitWithin(chosen));
    } finally {
      setBusy(false);
    }
  };

  /* The canvas selects a message on click and pans on drag. Neither is what
     pressing a button drawn on top of a picture means. */
  const stop = (event) => event.stopPropagation();

  return (
    <span
      className="dc-imgtools e-no-export"
      ref={box}
      onPointerDown={stop}
      onClick={stop}
      data-align={align}
    >
      <input
        ref={file}
        type="file"
        accept="image/*,video/mp4,video/webm"
        hidden
        onChange={(event) => {
          take(event.target.files?.[0]);
          event.target.value = "";
        }}
      />

      <button
        type="button"
        title={`Choose a different ${label}`}
        aria-label={`Choose a different ${label}`}
        disabled={busy}
        onClick={() => file.current?.click()}
      >
        <Icon name="upload" size={14} />
      </button>

      <button
        type="button"
        title={`Point this ${label} at a link`}
        aria-label={`Point this ${label} at a link`}
        data-on={linking ? "true" : "false"}
        onClick={() => {
          setDraft(value || "");
          setLinking((open) => !open);
        }}
      >
        <Icon name="copy-link" size={14} />
      </button>

      {onRemove ? (
        <button
          type="button"
          title={`Remove this ${label}`}
          aria-label={`Remove this ${label}`}
          data-danger="true"
          onClick={onRemove}
        >
          <Icon name="delete" size={14} />
        </button>
      ) : null}

      {linking ? (
        <span className="dc-imgtools-link">
          <input
            autoFocus
            value={draft}
            placeholder="https://…"
            aria-label={`Link for this ${label}`}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                /* Refused rather than drawn: an http: or javascript: source
                   in a mockup is somebody else's script running inside it. */
                if (safeMedia(draft) || !draft) onChange(draft);
                setLinking(false);
              }
            }}
          />
        </span>
      ) : null}
    </span>
  );
}

/**
 * An empty slot that wants a picture: the same two ways in, drawn as a plate
 * rather than an overlay, because there is nothing underneath to overlay.
 */
export function ImageDrop({ onChange, label = "image", className = "" }) {
  const file = useRef(null);
  const [over, setOver] = useState(false);
  const take = async (chosen) => {
    if (chosen) onChange(await fitWithin(chosen));
  };
  return (
    /* A dashed plate is a picture of "drop something here", so it takes a drop
       as well as a press — and a paste, for a picture that is on the clipboard
       rather than on disk. */
    <button
      type="button"
      className={`dc-imgdrop e-no-export ${className}`}
      data-over={over ? "true" : "false"}
      onClick={(event) => {
        event.stopPropagation();
        file.current?.click();
      }}
      onPointerDown={(event) => event.stopPropagation()}
      onDragOver={(event) => {
        event.preventDefault();
        setOver(true);
      }}
      onDragEnter={(event) => {
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setOver(false);
        take(event.dataTransfer?.files?.[0]);
      }}
      onPaste={(event) => {
        const item = [...(event.clipboardData?.items ?? [])].find((i) => i.kind === "file");
        if (item) take(item.getAsFile());
      }}
    >
      <input
        ref={file}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp,image/avif,video/mp4,video/webm"
        hidden
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => {
          const chosen = event.target.files?.[0];
          event.target.value = "";
          take(chosen);
        }}
      />
      <Icon name="gallery" size={18} />
      <span>{over ? `Drop the ${label} here` : `Add ${label}`}</span>
    </button>
  );
}
