<script lang="ts">
import { Avatar, Icon } from '@kernhq/ui'
import { t } from '../i18n.js'
import type { Tile } from './tiles.js'

/**
 * One person.
 *
 * The picture is attached through the tile's own closure rather than by handing this component a
 * track: a `$state` array proxies the plain objects inside it, and a function survives that
 * unchanged where another package's class instance is a class of bug nobody wants to debug.
 *
 * When there is no picture there is always a sentence — "Camera off", or the demo's own line — and
 * never an empty square. A blank tile is indistinguishable from a tile that failed to load, and the
 * whole difference between a product and a prototype is which of those a reader is left guessing.
 */
interface Props {
  tile: Tile
  /** The large one, or one of the strip. Only the size and the type scale differ. */
  size: 'feature' | 'rail'
}
let { tile, size }: Props = $props()

let videoEl = $state<HTMLVideoElement | null>(null)

$effect(() => {
  const el = videoEl
  const attach = tile.attach
  if (!el || !attach) return
  attach(el)
  return () => tile.detach?.(el)
})
</script>

<div class="tile {size}" class:speaking={tile.speaking} data-testid="meet-tile">
  {#if tile.attach}
    <!-- svelte-ignore a11y_media_has_caption -->
    <video bind:this={videoEl} autoplay playsinline muted={tile.isLocal} aria-label={tile.name}></video>
  {:else}
    <div class="empty">
      <Avatar name={tile.name} id={tile.id} size={size === 'feature' ? 56 : 30} />
      <span class="why">{tile.placeholder === 'demo' ? t('demo_no_camera') : t('tile_camera_off')}</span>
    </div>
  {/if}

  <div class="caption">
    <span class="who">{tile.name}</span>
    {#if !tile.micOn}
      <span class="badge" title={t('tile_muted')}>
        <Icon name="mic" size={12} strokeWidth={1.8} />
        <span class="sr">{t('tile_muted')}</span>
      </span>
    {/if}
    {#if tile.sharing}
      <span class="badge" title={t('tile_sharing')}>
        <Icon name="monitor" size={12} strokeWidth={1.8} />
        <span class="sr">{t('tile_sharing')}</span>
      </span>
    {/if}
  </div>
</div>

<style>
.tile {
  position: relative;
  overflow: hidden;
  border-radius: var(--kern-r-2xl);
  background: var(--kern-surface-raised);
  border: 1px solid var(--kern-border);
  min-inline-size: 0;
}
.tile.feature {
  aspect-ratio: 16 / 9;
}
.tile.rail {
  aspect-ratio: 4 / 3;
}
/* A ring rather than a colour change, so the tile underneath keeps its own contrast. */
.tile.speaking {
  border-color: var(--kern-accent);
  box-shadow: 0 0 0 2px var(--kern-accent-tint);
}
video {
  inline-size: 100%;
  block-size: 100%;
  object-fit: cover;
  display: block;
}
.empty {
  block-size: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px;
  text-align: center;
}
.why {
  font-size: 12px;
  line-height: 1.4;
  color: var(--kern-ink-500);
}
.tile.rail .why {
  font-size: 11px;
}
.caption {
  position: absolute;
  inset-block-end: 6px;
  inset-inline-start: 6px;
  inset-inline-end: 6px;
  display: flex;
  align-items: center;
  gap: 6px;
  min-inline-size: 0;
}
.who {
  max-inline-size: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 2px 8px;
  border-radius: var(--kern-r-full);
  font-size: 12px;
  font-weight: 500;
  /*
   * A fixed dark ground with fixed light ink, and **opaque** rather than translucent: this text
   * sits over video, whose colour nothing controls, so the pair has to carry its own contrast in
   * both themes — and a contrast ratio computed against a translucent ground is a guess about
   * whatever frame happened to be underneath it.
   */
  background: #14120f;
  color: #f6f3ee;
}
.badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  inline-size: 20px;
  block-size: 20px;
  border-radius: var(--kern-r-full);
  background: var(--kern-danger);
  color: #fff;
}
.sr {
  position: absolute;
  inline-size: 1px;
  block-size: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
</style>
