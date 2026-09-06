<script lang="ts">
import { Button, IconButton, Input, localTime } from '@kernhq/ui'
import { t } from '../i18n.js'
import type { ChatLine } from './chat.js'

/**
 * Typing to the people in the meeting.
 *
 * **The header states what this is, and that sentence is the feature.** These lines ride LiveKit's
 * data channel: they exist in the browsers that are in the meeting and nowhere else, so when the
 * meeting ends there is nothing to delete and nothing to search. A panel that looked like the chat
 * module and quietly lost everything would be worse than no panel; saying so, in all five locales,
 * is what makes it usable. A huddle started from a conversation keeps its durable record in that
 * conversation — which is a later slice, and is deliberately not this.
 */
interface Props {
  messages: ChatLine[]
  onSend: (body: string) => void | Promise<void>
  onClose: () => void
}
let { messages, onSend, onClose }: Props = $props()

let draft = $state('')
let sending = $state(false)

async function send() {
  const body = draft.trim()
  if (!body || sending) return
  sending = true
  draft = ''
  try {
    await onSend(body)
  } finally {
    sending = false
  }
}

/** Through `Intl`, so a Persian reader gets Persian digits rather than the one Latin thing here. */
const at = (ms: number) => localTime(new Date(ms))
</script>

<aside class="panel" aria-label={t('chat_title')}>
  <header class="head">
    <h2 class="title">{t('chat_title')}</h2>
    <IconButton icon="x" size={26} variant="ghost" label={t('panel_close')} onclick={onClose} />
  </header>

  <p class="notice">{t('chat_ephemeral')}</p>

  <div class="lines" role="log" aria-label={t('chat_title')}>
    {#if messages.length === 0}
      <p class="empty">{t('chat_empty')}</p>
    {:else}
      {#each messages as line (line.id)}
        <div class="line" class:mine={line.mine}>
          <span class="meta">{line.from} · {at(line.at)}</span>
          <span class="body">{line.body}</span>
        </div>
      {/each}
    {/if}
  </div>

  <form
    class="compose"
    onsubmit={(event) => {
      event.preventDefault()
      void send()
    }}
  >
    <Input bind:value={draft} placeholder={t('chat_placeholder')} aria-label={t('chat_placeholder')} />
    <Button variant="secondary" type="submit" aria-busy={sending}>{t('chat_send')}</Button>
  </form>
</aside>

<style>
.panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-inline-size: 0;
  padding: 12px;
  border-radius: var(--kern-r-2xl);
  border: 1px solid var(--kern-border);
  background: var(--kern-surface);
}
.head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.title {
  margin: 0;
  flex: 1;
  font-size: 13.5px;
  font-weight: 600;
  color: var(--kern-ink-900);
}
.notice {
  margin: 0;
  padding: 8px 10px;
  border-radius: var(--kern-r-lg);
  background: var(--kern-info-tint);
  color: var(--kern-ink-700);
  font-size: 12.5px;
  line-height: 1.5;
}
.lines {
  display: grid;
  gap: 8px;
  align-content: start;
  max-block-size: 320px;
  overflow-y: auto;
  min-block-size: 64px;
}
.line {
  display: grid;
  gap: 2px;
  padding: 6px 8px;
  border-radius: var(--kern-r-lg);
  background: var(--kern-surface-raised);
}
.line.mine {
  background: var(--kern-accent-tint);
}
.meta {
  font-size: 11.5px;
  color: var(--kern-ink-600);
}
.body {
  font-size: 13px;
  line-height: 1.5;
  color: var(--kern-ink-900);
  overflow-wrap: anywhere;
}
.empty {
  margin: 0;
  font-size: 13px;
  color: var(--kern-ink-500);
}
.compose {
  display: flex;
  gap: 8px;
  align-items: center;
}
.compose :global(input) {
  flex: 1;
  min-inline-size: 0;
}
</style>
