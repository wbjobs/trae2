/// <reference types="svelte" />
/// <reference types="vite/client" />

declare module 'svelte-spa-router' {
  import type { Component, SvelteComponent } from 'svelte'
  const Router: Component<any, any, any>
  export default Router
  export function wrap(options: { component: typeof SvelteComponent; props?: Record<string, unknown> }): typeof SvelteComponent
}
