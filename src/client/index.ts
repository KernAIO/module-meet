/**
 * The client half.
 *
 * Published as **source**, not compiled: the consumer builds the TypeScript and Svelte with its own
 * toolchain, which is what lets `$state` in a module store stay reactive inside the app.
 *
 * Everything the interface offers lives here — the manifest, the screens, this module's own strings
 * and its permissions. The app registers `meetClientModule` and mounts whatever it declares; it
 * holds no screens of its own. Deleting this package removes the feature completely.
 *
 * **Import the file, not this barrel, from inside the package.** This re-exports `module.js`, which
 * reaches Svelte components and the framework's rune-backed singletons — so a pure-function test
 * that goes through here fails with "$state is not defined", and a file that imports its own barrel
 * is a cycle that resolves inside the app and breaks the moment the package is built alone.
 *
 * **Nothing reachable from here may import `livekit-client`**, statically or dynamically. The
 * shell's registry imports every module's client barrel at build time, so anything on this graph is
 * in the first paint of every Kern page in every workspace — including workspaces that have never
 * switched meetings on. The SDK is loaded by `meeting/room.svelte.ts`, which is reached only
 * through the route's own `import()` and then only when somebody presses Join. `bundle.test.ts`
 * walks this graph and fails if it ever changes.
 *
 * `files` in package.json must cover every directory this entry reaches, contract source included.
 */

export { MODULE_ID, meetCapabilities, meetPermissions } from '../contract/index.js'
export { meetMessageBundles } from './messages.js'
export { meetClientModule, meetClientModule as default } from './module.js'
export { MEET_PERMISSIONS } from './permissions.js'
