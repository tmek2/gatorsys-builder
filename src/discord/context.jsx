"use client";

import { createContext } from "react";

/* What the renderer needs to know that is not in the node it is drawing: who
 * the project's users are, so `<@u2>` can resolve to a name and a colour, and
 * which custom emoji have been uploaded, so `<:name:0>` can resolve to an
 * image. Passed through context rather than threaded down every component,
 * because a mention can appear at any depth of a container tree. */
/* `edit` is absent when the surface is only being drawn — an export, a shared
 * link — and present in the builder, where it carries the handful of callbacks
 * that let the mockup be edited by editing the mockup. Absent means the canvas
 * renders as a picture, with nothing clickable in it. */
export const RenderContext = createContext({ users: [], emojis: [], edit: null });
