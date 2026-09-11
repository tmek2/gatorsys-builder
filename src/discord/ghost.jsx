/* The shape of text that is not there yet.
 *
 * The client draws an embed it has not filled in yet as grey bars — it is a
 * real state of a real Discord message, the one you see for the moment a link
 * is unfurling — so that is what empty looks like here too.
 *
 * And it is part of the picture, not editor chrome. It was built the other way
 * round, carrying `e-no-export` on the reasoning that an unfinished block is
 * scaffolding somebody forgot about. That was wrong twice over: it broke the
 * one promise this editor makes, which is that the canvas is the picture, and
 * it took away the drawing somebody wanted — a template with its text
 * positions marked out is a thing people make on purpose, and it is most of
 * why an empty embed is worth having at all.
 *
 * What is genuinely scaffolding still carries the flag: the dashed "Add an
 * image" plate, the hover strip over a picture. Those say what to press. Bars
 * say where words go, and a picture of where words go is a picture.
 */

/**
 * @param lines which bars to draw — "title" is the heavier one an embed's
 *   title line gets, "body" and "short" are the two widths a paragraph falls
 *   into. Order is the order they are drawn in.
 */
export function Ghost({ lines = ["title", "body"] }) {
  return (
    <span className="dc-ghost" aria-hidden="true">
      {lines.map((line, i) => (
        <span key={i} className="dc-ghost-line" data-line={line} />
      ))}
    </span>
  );
}
