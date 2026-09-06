<script lang="ts">
import { Avatar, Icon, IconButton } from '@kernhq/ui'
import { t } from '../i18n.js'
import type { Tile } from './tiles.js'

/**
 * Who is in the meeting, as a list rather than as pictures.
 *
 * The stage answers "who is talking"; this answers "who is here", which is a different question and
 * the one somebody asks when they are about to say a name. It is also where a later slice hangs the
 * host's row actions — mute, remove — so the row is built as a row from the start.
 *
 * The microphone mark is a colour **and** a word: the icon carries a screen-reader label, because a
 * red dot on its own is a fact only a sighted person receives.
 */
interface Props {
  tiles: Tile[]
  onClose: () => void
}
let { tiles, onClose }: Props = $props()
</script>

<aside class="panel" aria-label={t('people_title')}>
  <header class="head">
    <h2 class="title">{t('people_title')}</h2>
    <span class="count">{t('people_count', { n: tiles.length })}</span>
    <IconButton icon="x" size={26} variant="ghost" label={t('panel_close')} onclick={onClose} />
  </header>

  <ul class="list">
    {#each tiles as tile (tile.id)}
      <li class="row">
        <Avatar name={tile.name} id={tile.id} size={24} />
        <span class="who">{tile.name}{tile.isLocal ? ` · ${t('you')}` : ''}</span>
        <!--
          `role="img"` with a label rather than a visually hidden `<span>`, and the mark only when
          there is something to mark.
          A hidden span is still text to a contrast audit — it is 1px square with a clip-path, not
          `display:none` — so `.sr` inside a danger-toned mark was measured at 3.19:1 in dark mode
          and failed the sweep. The label carries the same words to a screen reader with nothing to
          measure. An unmuted microphone gets no badge at all: every video product marks the
          exception rather than the rule, and a row of mic icons is noise.
        -->
        {#if tile.sharing}
          <span class="mark sharing" role="img" aria-label={t('tile_sharing')}>
            <Icon name="monitor" size={13} strokeWidth={1.7} />
          </span>
        {/if}
        {#if !tile.micOn}
          <span class="mark muted" role="img" aria-label={t('tile_muted')}>
            <Icon name="mic" size={13} strokeWidth={1.7} />
          </span>
        {/if}
      </li>
    {/each}
  </ul>
</aside>

<style>
.panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
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
  font-size: 13.5px;
  font-weight: 600;
  color: var(--kern-ink-900);
}
.count {
  flex: 1;
  font-size: 12px;
  color: var(--kern-ink-500);
  font-variant-numeric: tabular-nums;
}
.list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 2px;
}
.row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-block-size: 32px;
  padding-inline: 6px;
  border-radius: var(--kern-r-md);
}
.who {
  flex: 1;
  min-inline-size: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  color: var(--kern-ink-900);
}
.mark {
  display: inline-flex;
  align-items: center;
  color: var(--kern-ink-500);
}
.mark.sharing {
  color: var(--kern-accent-text);
}
/* A colour, never opacity: a row faded to 0.5 is unreadable whatever token it names. */
.mark.muted {
  color: var(--kern-danger);
}
</style>
