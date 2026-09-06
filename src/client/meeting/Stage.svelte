<script lang="ts">
import { Button, Icon } from '@kernhq/ui'
import { t } from '../i18n.js'
import { stageLayout, type Tile } from './tiles.js'
import VideoTile from './VideoTile.svelte'

/**
 * Who is large and who is small.
 *
 * The rule lives in `tiles.ts` where a test can reach it, because this is the one decision on the
 * screen that goes wrong silently: a stage showing the person who is *not* talking looks exactly
 * like a stage that is working.
 *
 * The reconnecting band sits **over** the tiles rather than replacing them. The tiles are still
 * true while LiveKit rebuilds the transport underneath — everybody in the meeting is still in it —
 * and swapping the grid for a spinner throws away the one fact the person wants.
 */
interface Props {
  tiles: Tile[]
  reconnecting: boolean
  /** Null while there is nothing to copy — a demo, or before the address is known. */
  onCopyLink: (() => void) | null
  linkCopied: boolean
}
let { tiles, reconnecting, onCopyLink, linkCopied }: Props = $props()

const layout = $derived(stageLayout(tiles))
const alone = $derived(tiles.every((tile) => tile.isLocal))
</script>

<div class="stage" aria-label={t('stage')}>
  {#if reconnecting}
    <!--
      `role="status"`, so a screen reader is told without being interrupted. It is a band and not a
      screen for the reason in the comment above: the tiles behind it are still correct.
    -->
    <div class="band" role="status">
      <Icon name="wifi-off" size={15} strokeWidth={1.7} />
      <span class="bandtitle">{t('reconnecting')}</span>
      <span class="banddesc">{t('reconnecting_desc')}</span>
    </div>
  {/if}

  {#if layout.feature}
    <VideoTile tile={layout.feature} size="feature" />
  {/if}

  {#if alone}
    <!--
      Being alone is a state with something to do in it, not an empty grid. The link is the whole
      answer to "how does anybody else get here", and it is the one control this screen offers that
      changes nothing about the meeting.
    -->
    <div class="alone">
      <div class="alonetext">
        <span class="alonetitle">{t('alone_title')}</span>
        <span class="alonedesc">{t('alone_desc')}</span>
      </div>
      {#if onCopyLink}
        <Button variant="secondary" icon="copy" onclick={onCopyLink}>
          {linkCopied ? t('link_copied') : t('copy_link')}
        </Button>
      {/if}
    </div>
  {:else if layout.rail.length > 0}
    <div class="rail">
      {#each layout.rail as tile (tile.id)}
        <VideoTile {tile} size="rail" />
      {/each}
    </div>
  {/if}
</div>

<style>
.stage {
  position: relative;
  display: grid;
  gap: 12px;
  align-content: start;
  min-inline-size: 0;
}
.band {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 8px 12px;
  border-radius: var(--kern-r-lg);
  border: 1px solid var(--kern-warning);
  background: var(--kern-warning-tint);
  color: var(--kern-ink-900);
  font-size: 13px;
}
.bandtitle {
  font-weight: 600;
}
.banddesc {
  color: var(--kern-ink-600);
}
.rail {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 10px;
}
.alone {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  border-radius: var(--kern-r-2xl);
  border: 1px dashed var(--kern-border-muted);
}
.alonetext {
  display: grid;
  gap: 3px;
  min-inline-size: 0;
}
.alonetitle {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--kern-ink-900);
}
.alonedesc {
  font-size: 13px;
  color: var(--kern-ink-500);
}
</style>
