/* The shape of text that is not there yet.
 *
 * A block somebody has just added, or cleared, draws nothing at all — and a
 * container with an empty text block in it looks like a container with a bug
 * in it rather than one waiting for words. The client draws an embed it has
 * not filled in yet as grey bars, so that is what empty looks like here too.
 *
 * Editor only: every one of these carries `e-no-export`, so a mockup with an
 * unfinished block in it exports as though the block were simply absent rather
 * than exporting a picture of scaffolding.
 */

/**
 * @param lines which bars to draw — "title" is the heavier one an embed's
 *   title line gets, "body" and "short" are the two widths a paragraph falls
 *   into. Order is the order they are drawn in.
 */
export function Ghost({ lines = ["title", "body"] }) {
  return (
    <span className="dc-ghost e-no-export" aria-hidden="true">
      {lines.map((line, i) => (
        <span key={i} className="dc-ghost-line" data-line={line} />
      ))}
    </span>
  );
}
