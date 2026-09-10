"use client";

/* The inspector: everything about the selected message.
 *
 * Four tabs, and the split is by what a person is doing rather than by what
 * the data structure looks like. Content is the message itself. Embeds and
 * Components are the two ways a bot builds a rich message and are genuinely
 * separate jobs. Extras is everything a message can carry that is neither —
 * attachments, a poll, reactions, a thread — grouped because each is a small
 * form and eight of them in one column is a wall.
 */

import { useRef, useState } from "react";
import { IconPencil, IconPlus, IconTrash, IconUser, IconUsers } from "@tabler/icons-react";
import {
  LIMITS,
  newAttachment,
  newEmbed,
  newField,
  newPoll,
  newReaction,
  reid,
  uid,
} from "@/lib/model";
import {
  ColorField,
  Counter,
  Empty,
  Field,
  Group,
  Hint,
  ImageField,
  Num,
  Pick,
  Row,
  Segmented,
  Text,
  Toggle,
} from "./fields";
import { Art, Icon } from "@/discord/icon";
import { badgeList } from "@/discord/badges";
import { TOOLBAR_ACTIONS } from "@/discord/toolbar";
import { AvatarPicker } from "./panels";
import { BlockList } from "./blocks";
import { JsonPanel } from "./json-panel";
import { EmojiInsert, EmojiSlot, useEmojiInsert } from "./emoji-picker";

/* ------------------------------------------------------------- content */

const SYSTEM_KINDS = [
  { value: "join", label: "Joined the server" },
  { value: "leave", label: "Left the server" },
  { value: "add", label: "Added to the group" },
  { value: "boost", label: "Boosted the server" },
  { value: "pin", label: "Pinned a message" },
  { value: "thread", label: "Started a thread" },
  { value: "call", label: "Started a call" },
  { value: "follow", label: "Followed a channel" },
];

/* Who sent this message, and who that person is.
 *
 * These were two different places: the picker here, and the member's own name
 * and avatar behind a rail item that replaced this whole panel. So changing
 * the name on the message you were looking at meant leaving the message you
 * were looking at. The author's face is shown, the picker is next to it, and
 * everything about that member is one disclosure below — edited in place,
 * against the preview, which is the only way to tell whether it looks right.
 */
function AuthorRow({ message, patch, project, commit, onManageMembers, onError }) {
  const [editing, setEditing] = useState(false);
  const author = project.users.find((u) => u.id === message.user);

  const patchAuthor = (fields) =>
    commit(
      (p) => ({
        ...p,
        users: p.users.map((u) => (u.id === message.user ? { ...u, ...fields } : u)),
      }),
      // Typing a name is one undo step; so is dragging through the spectrum.
      `user:${message.user}:${Object.keys(fields).sort().join(",")}`,
    );

  return (
    <div className="e-author">
      <div className="e-author-row">
        <span className="e-author-face">
          {author?.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={author.avatar} alt="" />
          ) : (
            <IconUser size={18} />
          )}
        </span>
        <div className="e-author-pick">
          <Field label="Sent by">
            <Pick
              value={message.user}
              onChange={(v) => patch({ user: v })}
              options={project.users.map((u) => ({ value: u.id, label: u.name }))}
            />
          </Field>
        </div>
        <Hint label={editing ? "Done editing this member" : "Change this member's name, colour and picture"}>
          <button
            type="button"
            className="e-btn e-btn-quiet e-author-edit"
            onClick={() => setEditing((v) => !v)}
            aria-expanded={editing}
          >
            <IconPencil size={14} /> {editing ? "Done" : "Edit"}
          </button>
        </Hint>
      </div>

      {editing && author ? (
        <div className="e-author-edit-box">
          {/* Not side by side: the colour field is a swatch grid plus a hex
              box, and at half the inspector's width it wrapped into three
              ragged rows. */}
          <Field label="Display name">
            <Text value={author.name} onChange={(v) => patchAuthor({ name: v })} />
          </Field>
          <Field label="Name colour" hint="The role colour the client paints the name in.">
            <ColorField value={author.color} onChange={(v) => patchAuthor({ color: v })} />
          </Field>

          <Field label="Picture" hint="Choose one of ours, or upload your own.">
            <AvatarPicker
              value={author.avatar}
              onChange={(avatar) => patchAuthor({ avatar })}
              onClose={() => {}}
              inline
            />
          </Field>

          <ImageField
            round
            label="Or upload one"
            hint="Cropped to a square from the centre and masked into a circle, the way the client does it."
            value={author.avatar?.startsWith("data:") ? author.avatar : ""}
            onChange={(v) => patchAuthor({ avatar: v || author.avatar })}
            onError={onError}
          />

          <Toggle
            label="Application"
            hint="Draws the APP tag beside the name."
            value={author.bot}
            onChange={(v) => patchAuthor({ bot: v })}
          />

          <button type="button" className="e-btn e-btn-quiet" onClick={onManageMembers}>
            <IconUsers size={14} /> All members, decorations and role icons
          </button>
        </div>
      ) : null}
    </div>
  );
}

function ContentTab({ message, patch, project, commit, onManageMembers, onError }) {
  const others = project.messages.filter((m) => m.id !== message.id && m.kind !== "system");
  const body = useRef(null);
  const insert = useEmojiInsert(body, message.content, (content) => patch({ content }));

  return (
    <>
      <Group title="Message" collapsible open={false} icon={<Icon name="edit" size={16} />}>
        {/* The author, the text and the timestamp are not here any more: the
            island's pill says who is sending, and the words and the clock are
            edited where they are drawn. What is left is the handful of things
            a message is rather than says. */}
        <Field label="Kind" hint="A system message is the client's own one-line notice, not a message with an author.">
          <Segmented
            value={message.kind || "message"}
            onChange={(v) => patch({ kind: v })}
            label="Message kind"
            options={[
              { value: "message", label: "Message" },
              { value: "system", label: "System" },
            ]}
          />
        </Field>

        {/* A system message has no text to double-click on the canvas — the
            client writes the sentence — so its two fields stay here. */}
        {message.kind === "system" ? (
          <>
            <Field label="What happened">
              <Pick
                value={message.systemType || "join"}
                onChange={(v) => patch({ systemType: v })}
                options={SYSTEM_KINDS}
              />
            </Field>
            <Field label="Override the sentence" hint="Leave empty to use the client's own wording.">
              <Text value={message.content} onChange={(v) => patch({ content: v })} />
            </Field>
          </>
        ) : (
          /* The canvas is the quick way — click the words and type — but a
             long piece of markdown is easier in a box you can see all of, so
             the box stays. Taking it away entirely was a mistake: it left the
             gesture as the only route, and a gesture nobody is told about is
             not a route. */
          <Field
            label="Content"
            hint="Or click the message on the canvas and type. Markdown, mentions like <@Rowan>, channels like <#general>, timestamps like <t:1735689600:R>."
            counter={
              <span className="e-field-tools">
                <EmojiInsert onPick={insert} custom={project.emojis} />
                <Counter value={message.content} limit={LIMITS.content} />
              </span>
            }
          >
            <Text
              ref={body}
              multiline
              rows={5}
              value={message.content}
              onChange={(v) => patch({ content: v })}
              limit={LIMITS.content}
            />
          </Field>
        )}
      </Group>

      {message.kind === "system" ? null : (
        <Group title="How it is drawn" collapsible open={false} icon={<Icon name="configure" size={16} />}>
          <Toggle
            label="Grouped under the message above"
            hint="No avatar and no author line, the way the client groups a run from one person."
            value={message.grouped}
            onChange={(v) => patch({ grouped: v })}
          />
          <Toggle label="Edited" value={message.edited} onChange={(v) => patch({ edited: v })} />
          <Toggle label="Pinned" value={message.pinned} onChange={(v) => patch({ pinned: v })} />
          <Toggle
            label="Ephemeral"
            hint="Adds the 'Only you can see this' footer."
            value={message.ephemeral}
            onChange={(v) => patch({ ephemeral: v })}
          />
          <Toggle label="Text to speech" value={message.tts} onChange={(v) => patch({ tts: v })} />
        </Group>
      )}

      <Group title="Reply" collapsible open={false} icon={<Icon name="reply" size={16} />} on={Boolean(message.reply)}>
        {others.length ? (
          <Field label="Replying to" hint="The client draws a spine up to the message being answered.">
            <Pick
              value={message.reply || ""}
              onChange={(v) => patch({ reply: v })}
              options={[
                { value: "", label: "Not a reply" },
                ...others.map((m) => ({
                  value: m.id,
                  label: `${project.users.find((u) => u.id === m.user)?.name ?? "?"}: ${
                    (m.content || "(no text)").slice(0, 40)
                  }`,
                })),
              ]}
            />
          </Field>
        ) : (
          <Empty>Add another message first and this one can reply to it.</Empty>
        )}
      </Group>

      <Group title="Slash command header" collapsible open={false} icon={<Icon name="apps" size={16} />} on={Boolean(message.interaction)}>
        {message.interaction ? (
          <>
            <Row>
              <Field label="Who ran it">
                <Pick
                  value={message.interaction.user}
                  onChange={(v) => patch({ interaction: { ...message.interaction, user: v } })}
                  options={project.users.map((u) => ({ value: u.id, label: u.name }))}
                />
              </Field>
              <Field label="Command">
                <Text
                  value={message.interaction.command}
                  onChange={(v) => patch({ interaction: { ...message.interaction, command: v } })}
                  placeholder="shift start"
                />
              </Field>
            </Row>
            <button type="button" className="e-btn e-btn-quiet" onClick={() => patch({ interaction: null })}>
              <IconTrash size={14} /> Remove the header
            </button>
          </>
        ) : (
          <button
            type="button"
            className="e-btn e-btn-dashed"
            onClick={() => patch({ interaction: { user: project.users[0].id, command: "command" } })}
          >
            <IconPlus size={15} /> Add “used /command”
          </button>
        )}
      </Group>

      <Group title="Forwarded message" collapsible open={false} icon={<Icon name="forward" size={16} />} on={Boolean(message.forwarded)}>
        {message.forwarded ? (
          <>
            <Field label="What was forwarded">
              <Text
                multiline
                rows={3}
                value={message.forwarded.content}
                onChange={(v) => patch({ forwarded: { ...message.forwarded, content: v } })}
              />
            </Field>
            <Field label="From">
              <Text
                value={message.forwarded.from}
                onChange={(v) => patch({ forwarded: { ...message.forwarded, from: v } })}
                placeholder="#announcements"
              />
            </Field>
            <button type="button" className="e-btn e-btn-quiet" onClick={() => patch({ forwarded: null })}>
              <IconTrash size={14} /> Remove
            </button>
          </>
        ) : (
          <button
            type="button"
            className="e-btn e-btn-dashed"
            onClick={() => patch({ forwarded: { content: "The forwarded text.", from: "#announcements" } })}
          >
            <IconPlus size={15} /> Add a forward
          </button>
        )}
      </Group>
    </>
  );
}

/* -------------------------------------------------------------- embeds */

function EmbedEditor({ embed, patch, onRemove, index, onError }) {
  const fields = embed.fields ?? [];
  const setField = (id, over) => patch({ fields: fields.map((f) => (f.id === id ? { ...f, ...over } : f)) });

  return (
    <Group
      title={`Embed ${index + 1}${embed.title ? ` — ${embed.title.slice(0, 24)}` : ""}`}
      collapsible
      open={index === 0}
      action={
        <button type="button" className="e-icon-btn" onClick={onRemove} aria-label="Remove embed">
          <IconTrash size={14} />
        </button>
      }
    >
      <Field label="Accent">
        <ColorField value={embed.color} onChange={(v) => patch({ color: v })} />
      </Field>

      <Row>
        <Field label="Author" counter={<Counter value={embed.author} limit={LIMITS.embedAuthor} />}>
          <Text value={embed.author} onChange={(v) => patch({ author: v })} />
        </Field>
        <Field label="Author link">
          <Text value={embed.authorUrl} onChange={(v) => patch({ authorUrl: v })} placeholder="https://…" />
        </Field>
      </Row>
      <ImageField round label="Author icon" value={embed.authorIcon} onChange={(v) => patch({ authorIcon: v })} onError={onError} />

      <Field label="Title" counter={<Counter value={embed.title} limit={LIMITS.embedTitle} />}>
        <Text value={embed.title} onChange={(v) => patch({ title: v })} limit={LIMITS.embedTitle} />
      </Field>
      <Field label="Title link">
        <Text value={embed.url} onChange={(v) => patch({ url: v })} placeholder="https://…" />
      </Field>

      <Field
        label="Description"
        hint="Markdown works here, but headings are drawn smaller than they are in a message."
        counter={<Counter value={embed.description} limit={LIMITS.embedDescription} />}
      >
        <Text
          multiline
          rows={4}
          value={embed.description}
          onChange={(v) => patch({ description: v })}
          limit={LIMITS.embedDescription}
        />
      </Field>

      <div className="e-fields">
        <header className="e-fields-head">
          <span className="e-field-label">Fields</span>
          <span className="e-field-counter">
            {fields.length}/{LIMITS.embedFields}
          </span>
        </header>

        {fields.map((field, n) => (
          <div className="e-sub" key={field.id}>
            <header className="e-sub-head">
              <span className="e-sub-title">Field {n + 1}</span>
              <button
                type="button"
                className="e-icon-btn"
                onClick={() => patch({ fields: fields.filter((f) => f.id !== field.id) })}
                aria-label="Remove field"
              >
                <IconTrash size={14} />
              </button>
            </header>
            <Field label="Name" counter={<Counter value={field.name} limit={LIMITS.embedFieldName} />}>
              <Text value={field.name} onChange={(v) => setField(field.id, { name: v })} />
            </Field>
            <Field label="Value" counter={<Counter value={field.value} limit={LIMITS.embedFieldValue} />}>
              <Text multiline rows={2} value={field.value} onChange={(v) => setField(field.id, { value: v })} />
            </Field>
            <Toggle
              label="Inline"
              hint="Up to three inline fields share a row. Two on a row take half the width each, not a third."
              value={field.inline}
              onChange={(v) => setField(field.id, { inline: v })}
            />
          </div>
        ))}

        <button
          type="button"
          className="e-btn e-btn-dashed"
          disabled={fields.length >= LIMITS.embedFields}
          onClick={() => patch({ fields: [...fields, newField()] })}
        >
          <IconPlus size={15} /> Add a field
        </button>
      </div>

      <ImageField label="Thumbnail" value={embed.thumbnail} onChange={(v) => patch({ thumbnail: v })} onError={onError} />
      <ImageField label="Image" value={embed.image} onChange={(v) => patch({ image: v })} onError={onError} />

      <Row>
        <Field label="Footer" counter={<Counter value={embed.footer} limit={LIMITS.embedFooter} />}>
          <Text value={embed.footer} onChange={(v) => patch({ footer: v })} />
        </Field>
        <Field label="Timestamp" hint="A date, or a Unix seconds value.">
          <Text value={embed.timestamp} onChange={(v) => patch({ timestamp: v })} placeholder="2026-09-05 10:00" />
        </Field>
      </Row>
      <ImageField round label="Footer icon" value={embed.footerIcon} onChange={(v) => patch({ footerIcon: v })} onError={onError} />
    </Group>
  );
}

function EmbedsTab({ message, patch, onError }) {
  const embeds = message.embeds ?? [];
  /* The 6000-character ceiling is across every embed on the message, not per
     embed, which is the one embed limit people trip over. */
  const total = embeds.reduce(
    (n, e) =>
      n +
      (e.title?.length ?? 0) +
      (e.description?.length ?? 0) +
      (e.author?.length ?? 0) +
      (e.footer?.length ?? 0) +
      (e.fields ?? []).reduce((m, f) => m + (f.name?.length ?? 0) + (f.value?.length ?? 0), 0),
    0,
  );

  return (
    <>
      {embeds.length ? (
        <div className="e-total" data-over={total > LIMITS.embedTotal ? "true" : "false"}>
          {total}/{LIMITS.embedTotal} characters across every embed on this message
        </div>
      ) : (
        <Empty>No embeds. An embed is the classic bordered card — for the newer layout, use Components.</Empty>
      )}

      {embeds.map((embed, i) => (
        <EmbedEditor
          key={embed.id}
          index={i}
          embed={embed}
          onError={onError}
          patch={(over) => patch({ embeds: embeds.map((e) => (e.id === embed.id ? { ...e, ...over } : e)) })}
          onRemove={() => patch({ embeds: embeds.filter((e) => e.id !== embed.id) })}
        />
      ))}

      <div className="e-stack">
        <button
          type="button"
          className="e-btn e-btn-dashed"
          disabled={embeds.length >= LIMITS.embeds}
          /* Empty, on purpose. The canvas draws an embed with nothing in it
             as the client does — two grey bars — so there is no placeholder
             text to delete before writing, and none to leave behind in the
             exported picture. */
          onClick={() => patch({ embeds: [...embeds, newEmbed()] })}
        >
          <IconPlus size={15} /> Add an embed
          <span className="e-btn-count">
            {embeds.length}/{LIMITS.embeds}
          </span>
        </button>
        {embeds.length ? (
          <button
            type="button"
            className="e-btn e-btn-quiet"
            onClick={() => patch({ embeds: [...embeds, reid(embeds[embeds.length - 1])] })}
          >
            <IconPlus size={15} /> Duplicate the last one
          </button>
        ) : null}
      </div>
    </>
  );
}

/* -------------------------------------------------------------- extras */

function ExtrasTab({ message, patch, project, onError }) {
  const attachments = message.attachments ?? [];
  const reactions = message.reactions ?? [];

  return (
    <>
      <Group title="Attachments" collapsible open={false} icon={<Icon name="attach" size={16} />} on={attachments.length > 0}>
        {attachments.map((a, n) => (
          <div className="e-sub" key={a.id}>
            <header className="e-sub-head">
              <span className="e-sub-title">Attachment {n + 1}</span>
              <button
                type="button"
                className="e-icon-btn"
                onClick={() => patch({ attachments: attachments.filter((x) => x.id !== a.id) })}
                aria-label="Remove attachment"
              >
                <IconTrash size={14} />
              </button>
            </header>
            <Field label="Kind">
              <Pick
                value={a.kind}
                onChange={(v) => patch({ attachments: attachments.map((x) => (x.id === a.id ? { ...x, kind: v } : x)) })}
                options={[
                  { value: "image", label: "Image" },
                  { value: "video", label: "Video" },
                  { value: "file", label: "File card" },
                  { value: "audio", label: "Audio player" },
                ]}
              />
            </Field>
            {a.kind === "image" || a.kind === "video" ? (
              <>
                <ImageField
                  label="Source"
                  value={a.src}
                  onChange={(v) => patch({ attachments: attachments.map((x) => (x.id === a.id ? { ...x, src: v } : x)) })}
                  onError={onError}
                />
                <Toggle
                  label="Spoiler"
                  value={a.spoiler}
                  onChange={(v) => patch({ attachments: attachments.map((x) => (x.id === a.id ? { ...x, spoiler: v } : x)) })}
                />
              </>
            ) : (
              <Row>
                <Field label="Name">
                  <Text
                    value={a.name}
                    onChange={(v) => patch({ attachments: attachments.map((x) => (x.id === a.id ? { ...x, name: v } : x)) })}
                  />
                </Field>
                <Field label="Size">
                  <Text
                    value={a.size}
                    onChange={(v) => patch({ attachments: attachments.map((x) => (x.id === a.id ? { ...x, size: v } : x)) })}
                  />
                </Field>
              </Row>
            )}
          </div>
        ))}
        <button
          type="button"
          className="e-btn e-btn-dashed"
          onClick={() => patch({ attachments: [...attachments, newAttachment()] })}
        >
          <IconPlus size={15} /> Add an attachment
        </button>
      </Group>

      <Group title="Reactions" collapsible open={false} icon={<Icon name="add-reaction" size={16} />} on={reactions.length > 0}>
        {reactions.map((r, n) => (
          <div className="e-sub" key={r.id}>
            <header className="e-sub-head">
              <span className="e-sub-title">Reaction {n + 1}</span>
              <button
                type="button"
                className="e-icon-btn"
                onClick={() => patch({ reactions: reactions.filter((x) => x.id !== r.id) })}
                aria-label="Remove reaction"
              >
                <IconTrash size={14} />
              </button>
            </header>
            <Row>
              <Field label="Emoji">
                <EmojiSlot
                  custom={project.emojis}
                  value={r.emoji}
                  onChange={(v) => patch({ reactions: reactions.map((x) => (x.id === r.id ? { ...x, emoji: v } : x)) })}
                  placeholder="👍"
                />
              </Field>
              <Field label="Count">
                <Num
                  value={r.count}
                  min={1}
                  max={999999}
                  onChange={(v) => patch({ reactions: reactions.map((x) => (x.id === r.id ? { ...x, count: v } : x)) })}
                />
              </Field>
            </Row>
            <Toggle
              label="You reacted"
              hint="Takes the blurple fill and border the client gives your own reaction."
              value={r.me}
              onChange={(v) => patch({ reactions: reactions.map((x) => (x.id === r.id ? { ...x, me: v } : x)) })}
            />
            <Toggle
              label="Super reaction"
              value={r.burst}
              onChange={(v) => patch({ reactions: reactions.map((x) => (x.id === r.id ? { ...x, burst: v } : x)) })}
            />
          </div>
        ))}
        <button type="button" className="e-btn e-btn-dashed" onClick={() => patch({ reactions: [...reactions, newReaction()] })}>
          <IconPlus size={15} /> Add a reaction
        </button>
      </Group>

      <Group title="Poll" collapsible open={false} icon={<Icon name="poll" size={16} />} on={Boolean(message.poll)}>
        {message.poll ? (
          <>
            <Field label="Question">
              <Text value={message.poll.question} onChange={(v) => patch({ poll: { ...message.poll, question: v } })} />
            </Field>
            {message.poll.answers.map((answer, n) => (
              <div className="e-sub" key={answer.id}>
                <header className="e-sub-head">
                  <span className="e-sub-title">Answer {n + 1}</span>
                  <button
                    type="button"
                    className="e-icon-btn"
                    onClick={() =>
                      patch({ poll: { ...message.poll, answers: message.poll.answers.filter((a) => a.id !== answer.id) } })
                    }
                    aria-label="Remove answer"
                  >
                    <IconTrash size={14} />
                  </button>
                </header>
                <Row>
                  <Field label="Text">
                    <Text
                      value={answer.text}
                      onChange={(v) =>
                        patch({
                          poll: {
                            ...message.poll,
                            answers: message.poll.answers.map((a) => (a.id === answer.id ? { ...a, text: v } : a)),
                          },
                        })
                      }
                    />
                  </Field>
                  <Field label="Votes">
                    <Num
                      value={answer.votes}
                      min={0}
                      onChange={(v) =>
                        patch({
                          poll: {
                            ...message.poll,
                            answers: message.poll.answers.map((a) => (a.id === answer.id ? { ...a, votes: v } : a)),
                          },
                        })
                      }
                    />
                  </Field>
                </Row>
                <Field label="Emoji">
                  <EmojiSlot
                    custom={project.emojis}
                    value={answer.emoji}
                    onChange={(v) =>
                      patch({
                        poll: {
                          ...message.poll,
                          answers: message.poll.answers.map((a) => (a.id === answer.id ? { ...a, emoji: v } : a)),
                        },
                      })
                    }
                  />
                </Field>
              </div>
            ))}
            <button
              type="button"
              className="e-btn e-btn-dashed"
              onClick={() =>
                patch({
                  poll: {
                    ...message.poll,
                    answers: [...message.poll.answers, { id: uid(), text: "Another option", emoji: "", votes: 0 }],
                  },
                })
              }
            >
              <IconPlus size={15} /> Add an answer
            </button>
            <Row>
              <Field label="Total votes" hint="Leave at zero to add the answers up.">
                <Num value={message.poll.total} min={0} onChange={(v) => patch({ poll: { ...message.poll, total: v } })} />
              </Field>
              <Field label="Time left">
                <Text value={message.poll.duration} onChange={(v) => patch({ poll: { ...message.poll, duration: v } })} />
              </Field>
            </Row>
            <Toggle
              label="Multiple answers"
              value={message.poll.multiple}
              onChange={(v) => patch({ poll: { ...message.poll, multiple: v } })}
            />
            <Toggle
              label="Finished"
              hint="Draws the final results, with the winning answer filled."
              value={message.poll.finished}
              onChange={(v) => patch({ poll: { ...message.poll, finished: v } })}
            />
            <button type="button" className="e-btn e-btn-quiet" onClick={() => patch({ poll: null })}>
              <IconTrash size={14} /> Remove the poll
            </button>
          </>
        ) : (
          <button type="button" className="e-btn e-btn-dashed" onClick={() => patch({ poll: newPoll() })}>
            <IconPlus size={15} /> Add a poll
          </button>
        )}
      </Group>

      <Group title="Voice message" collapsible open={false} icon={<Icon name="microphone" size={16} />} on={Boolean(message.voice)}>
        {message.voice ? (
          <>
            <Row>
              <Field label="Length">
                <Text value={message.voice.duration} onChange={(v) => patch({ voice: { ...message.voice, duration: v } })} />
              </Field>
              <Field label="Played" hint="0 to 1.">
                <Num
                  value={message.voice.progress}
                  min={0}
                  max={1}
                  step={0.05}
                  onChange={(v) => patch({ voice: { ...message.voice, progress: v } })}
                />
              </Field>
            </Row>
            <button type="button" className="e-btn e-btn-quiet" onClick={() => patch({ voice: null })}>
              <IconTrash size={14} /> Remove
            </button>
          </>
        ) : (
          <button
            type="button"
            className="e-btn e-btn-dashed"
            onClick={() => patch({ voice: { duration: "0:14", progress: 0.35 } })}
          >
            <IconPlus size={15} /> Add a voice message
          </button>
        )}
      </Group>

      {/* Discord shows badges in the profile popout — not the member list and
          not beside a name in a message — so this is where the badge library
          belongs, and the popout is a surface mockups want in its own right. */}
      <Group title="Profile card" collapsible open={false} icon={<Icon name="profile" size={16} />} on={Boolean(message.profile)}>
        {message.profile ? (
          <>
            <div className="e-note">
              Drawn under this message, for whoever sent it. The avatar, name, colour and app tag come
              from the member, so this cannot disagree with the message above it.
            </div>

            <Row>
              <Field label="Handle" hint="The @name under the display name.">
                <Text
                  value={message.profile.handle}
                  onChange={(v) => patch({ profile: { ...message.profile, handle: v } })}
                  placeholder="@name"
                />
              </Field>
              <Field label="Member since">
                <Text
                  value={message.profile.since}
                  onChange={(v) => patch({ profile: { ...message.profile, since: v } })}
                  placeholder="12 Mar 2019"
                />
              </Field>
            </Row>

            <Field label="About me" hint="Markdown, the same as a message.">
              <Text
                multiline
                rows={3}
                value={message.profile.bio}
                onChange={(v) => patch({ profile: { ...message.profile, bio: v } })}
              />
            </Field>

            <ImageField
              label="Banner"
              hint="Leave empty for a flat band in the accent below."
              value={message.profile.banner}
              onChange={(v) => patch({ profile: { ...message.profile, banner: v } })}
              onError={onError}
            />
            <Field label="Banner colour" hint="Used when there is no banner image.">
              <ColorField
                value={message.profile.accent}
                onChange={(v) => patch({ profile: { ...message.profile, accent: v } })}
              />
            </Field>

            <Field label="Badges" hint="Discord's own, at the size the client draws them.">
              <div className="e-badges">
                {badgeList().map((group) => (
                  <div className="e-badge-group" key={group.group}>
                    <span className="e-badge-group-name">{group.group}</span>
                    <div className="e-badge-grid">
                      {group.items.map((item) => {
                        const on = (message.profile.badges ?? []).includes(item.id);
                        return (
                          <Hint key={item.id} label={item.label}>
                            <button
                              type="button"
                              className="e-badge"
                              data-on={on ? "true" : "false"}
                              aria-pressed={on}
                              aria-label={item.label}
                              onClick={() =>
                                patch({
                                  profile: {
                                    ...message.profile,
                                    badges: on
                                      ? message.profile.badges.filter((b) => b !== item.id)
                                      : [...(message.profile.badges ?? []), item.id],
                                  },
                                })
                              }
                            >
                              <Art group="badges" name={item.id} size={24} />
                            </button>
                          </Hint>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </Field>

            <button type="button" className="e-btn e-btn-quiet" onClick={() => patch({ profile: null })}>
              <IconTrash size={14} /> Remove the profile card
            </button>
          </>
        ) : (
          <button
            type="button"
            className="e-btn e-btn-dashed"
            onClick={() =>
              patch({
                profile: { handle: "", since: "", bio: "", banner: "", accent: "", badges: [] },
              })
            }
          >
            <IconPlus size={15} /> Add a profile card
          </button>
        )}
      </Group>

      {/* The bar the client floats over a message you point at. It is in most
          screenshots of Discord, so it is a thing a mockup needs to be able to
          draw — and where a button sits decides what it looks like: an emoji
          in the quick-reaction zone, a grey glyph in the action zone, exactly
          as the client does it. */}
      <Group title="Hover toolbar" collapsible open={false} icon={<Icon name="more" size={16} />} on={Boolean(message.toolbar)}>
        {message.toolbar ? (
          <>
            <div className="e-note">
              Shown over this message, top right. The first zone is your quick
              reactions in colour; the second is the client&rsquo;s own action
              icons in grey.
            </div>

            <Field label="Quick reactions" hint="Up to five. The client shows the emoji you use most.">
              <div className="e-stack">
                {(message.toolbar.reactions ?? []).map((emoji, i) => (
                  <Row key={i}>
                    <EmojiSlot
                      value={emoji}
                      custom={project.emojis}
                      onChange={(v) =>
                        patch({
                          toolbar: {
                            ...message.toolbar,
                            reactions: message.toolbar.reactions.map((x, j) => (j === i ? v : x)),
                          },
                        })
                      }
                    />
                    <button
                      type="button"
                      className="e-btn e-btn-quiet e-btn-icon"
                      aria-label="Remove this reaction"
                      onClick={() =>
                        patch({
                          toolbar: {
                            ...message.toolbar,
                            reactions: message.toolbar.reactions.filter((_, j) => j !== i),
                          },
                        })
                      }
                    >
                      <IconTrash size={14} />
                    </button>
                  </Row>
                ))}
                {(message.toolbar.reactions ?? []).length < 5 ? (
                  <button
                    type="button"
                    className="e-btn e-btn-dashed"
                    onClick={() =>
                      patch({
                        toolbar: {
                          ...message.toolbar,
                          reactions: [...(message.toolbar.reactions ?? []), "\u2764\ufe0f"],
                        },
                      })
                    }
                  >
                    <IconPlus size={15} /> Add a quick reaction
                  </button>
                ) : null}
              </div>
            </Field>

            <Field label="Actions" hint="Which of the client's icons are drawn, in its own order.">
              <div className="e-stack">
                {TOOLBAR_ACTIONS.map((action) => (
                  <Toggle
                    key={action.id}
                    label={action.label}
                    value={(message.toolbar.actions ?? []).includes(action.id)}
                    onChange={(on) =>
                      patch({
                        toolbar: {
                          ...message.toolbar,
                          /* Rebuilt from the catalogue rather than pushed, so
                             the order is always the client's own however the
                             toggles were flipped. */
                          actions: TOOLBAR_ACTIONS.map((a) => a.id).filter((id) =>
                            id === action.id ? on : (message.toolbar.actions ?? []).includes(id),
                          ),
                        },
                      })
                    }
                  />
                ))}
              </div>
            </Field>

            <button type="button" className="e-btn e-btn-quiet" onClick={() => patch({ toolbar: null })}>
              <IconTrash size={14} /> Remove the toolbar
            </button>
          </>
        ) : (
          <button
            type="button"
            className="e-btn e-btn-dashed"
            onClick={() =>
              patch({
                toolbar: {
                  reactions: ["\u2764\ufe0f", "\ud83d\udc80", "\u2705"],
                  /* What the client actually draws on your own message:
                     react, super-react, edit, reply, forward, and the
                     overflow. Everything else in the set lives behind that
                     last one, and is here to be added rather than shown. */
                  actions: ["add-reaction", "super-reaction", "edit", "reply", "forward", "more"],
                },
              })
            }
          >
            <IconPlus size={15} /> Show the hover toolbar
          </button>
        )}
      </Group>

      <Group title="Sticker" collapsible open={false} icon={<Icon name="sticker" size={16} />} on={Boolean(message.sticker)}>
        <ImageField
          label="Sticker image"
          value={message.sticker?.src ?? ""}
          onChange={(v) => patch({ sticker: v ? { src: v, name: message.sticker?.name ?? "" } : null })}
          onError={onError}
        />
      </Group>

      <Group title="Thread" collapsible open={false} icon={<Icon name="threads" size={16} />} on={Boolean(message.thread)}>
        {message.thread ? (
          <>
            <Row>
              <Field label="Thread name">
                <Text value={message.thread.name} onChange={(v) => patch({ thread: { ...message.thread, name: v } })} />
              </Field>
              <Field label="Messages">
                <Num value={message.thread.count} min={0} onChange={(v) => patch({ thread: { ...message.thread, count: v } })} />
              </Field>
            </Row>
            <button type="button" className="e-btn e-btn-quiet" onClick={() => patch({ thread: null })}>
              <IconTrash size={14} /> Remove
            </button>
          </>
        ) : (
          <button
            type="button"
            className="e-btn e-btn-dashed"
            onClick={() => patch({ thread: { name: "Thread", count: 3 } })}
          >
            <IconPlus size={15} /> Add a thread tag
          </button>
        )}
      </Group>

      <Group title="Server invite" collapsible open={false} icon={<Icon name="add-friends" size={16} />} on={Boolean(message.invite)}>
        {message.invite ? (
          <>
            <Field label="Server name">
              <Text value={message.invite.name} onChange={(v) => patch({ invite: { ...message.invite, name: v } })} />
            </Field>
            <Row>
              <Field label="Online">
                <Text value={message.invite.online} onChange={(v) => patch({ invite: { ...message.invite, online: v } })} />
              </Field>
              <Field label="Members">
                <Text value={message.invite.members} onChange={(v) => patch({ invite: { ...message.invite, members: v } })} />
              </Field>
            </Row>
            <ImageField
              square
              label="Server icon"
              value={message.invite.icon}
              onChange={(v) => patch({ invite: { ...message.invite, icon: v } })}
              onError={onError}
            />
            <button type="button" className="e-btn e-btn-quiet" onClick={() => patch({ invite: null })}>
              <IconTrash size={14} /> Remove
            </button>
          </>
        ) : (
          <button
            type="button"
            className="e-btn e-btn-dashed"
            onClick={() => patch({ invite: { name: "Community", online: "1,204", members: "8,392", icon: "" } })}
          >
            <IconPlus size={15} /> Add an invite card
          </button>
        )}
      </Group>

      <Group title="Link preview" collapsible open={false} icon={<Icon name="external" size={16} />} on={Boolean(message.linkPreview)}>
        {message.linkPreview ? (
          <>
            <Row>
              <Field label="Site">
                <Text
                  value={message.linkPreview.provider}
                  onChange={(v) => patch({ linkPreview: { ...message.linkPreview, provider: v } })}
                />
              </Field>
              <Field label="Accent">
                <Text
                  value={message.linkPreview.color}
                  onChange={(v) => patch({ linkPreview: { ...message.linkPreview, color: v } })}
                />
              </Field>
            </Row>
            <Field label="Title">
              <Text
                value={message.linkPreview.title}
                onChange={(v) => patch({ linkPreview: { ...message.linkPreview, title: v } })}
              />
            </Field>
            <Field label="Description">
              <Text
                multiline
                rows={2}
                value={message.linkPreview.description}
                onChange={(v) => patch({ linkPreview: { ...message.linkPreview, description: v } })}
              />
            </Field>
            <ImageField
              label="Thumbnail"
              value={message.linkPreview.thumbnail}
              onChange={(v) => patch({ linkPreview: { ...message.linkPreview, thumbnail: v } })}
              onError={onError}
            />
            <button type="button" className="e-btn e-btn-quiet" onClick={() => patch({ linkPreview: null })}>
              <IconTrash size={14} /> Remove
            </button>
          </>
        ) : (
          <button
            type="button"
            className="e-btn e-btn-dashed"
            onClick={() =>
              patch({
                linkPreview: {
                  provider: "gatorsys.xyz",
                  title: "Gator",
                  description: "Moderation, made simple.",
                  url: "https://gatorsys.xyz",
                  color: "#f7a8c4",
                  thumbnail: "",
                },
              })
            }
          >
            <IconPlus size={15} /> Add a link preview
          </button>
        )}
      </Group>
    </>
  );
}

/* --------------------------------------------------------------- shell */

export const TABS = ["Content", "Embeds", "Components", "Extras", "JSON"];

export function Inspector({ tab, message, project, patch, commit, onManageMembers, onError, onNotify }) {
  if (!message) return <Empty>Pick a message on the left, or add one.</Empty>;

  switch (tab) {
    case "Embeds":
      return <EmbedsTab message={message} patch={patch} onError={onError} />;
    case "Components":
      return (
        <>
          <div className="e-note">
            Components v2 — the newer layout, built out of containers, sections and rows rather than
            an embed. Buttons and menus here are drawn, not wired: nothing sends anything.
          </div>
          <BlockList
            blocks={message.components ?? []}
            onChange={(components) => patch({ components })}
            onError={onError}
            emojis={project.emojis}
          />
        </>
      );
    case "Extras":
      return <ExtrasTab message={message} patch={patch} project={project} onError={onError} />;
    case "JSON":
      /* Wrapped, so it is a tile in the board like everything else rather than
         a wall of monospace that the grid has to make room for whether or not
         anybody wanted it. */
      return (
        <Group title="JSON" collapsible open={false} icon={<Icon name="code" size={16} />}>
          <JsonPanel message={message} patch={patch} onError={onError} onNotify={onNotify} />
        </Group>
      );
    default:
      return (
        <ContentTab
          message={message}
          patch={patch}
          project={project}
          commit={commit}
          onManageMembers={onManageMembers}
          onError={onError}
        />
      );
  }
}
