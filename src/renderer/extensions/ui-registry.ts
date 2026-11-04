import type { ComponentType } from 'react';
import { createStore } from 'zustand/vanilla';
import type { Disposable } from '../../application/disposable';

// Trusted, bundled React modules extend these documented layouts. Downloaded
// theme packages contribute CSS only, never executable extension code.
export const uiLayouts = [
  'main:full',
  'main:slim',
  'main:distraction-free',
  'sidebar',
  'sidebar-menu',
  'sidebar-workspace-menu',
  'note-list-bar',
  'note-list-bar:trash',
  'editor',
  'editor-header',
  'editor-meta',
  'editor-toolbar',
  'editor-drawer-menu',
  'editor-status-bar',
  'editor-floating-actions',
  'mde',
  'modal',
] as const;
export type UiLayout = (typeof uiLayouts)[number];
type Registration = {
  owner: string;
  name: string;
  component: ComponentType;
  token: symbol;
};
type Placement = {
  owner: string;
  name: string;
  layout: UiLayout;
  token: symbol;
};
export class UiRegistry {
  readonly store = createStore(() => ({ revision: 0 }));
  private components = new Map<string, Registration>();
  private placements: Placement[] = [];
  private changed() {
    this.store.setState((state) => ({ revision: state.revision + 1 }));
  }
  registerClass(
    owner: string,
    name: string,
    component: ComponentType,
  ): Disposable {
    if (
      !/^[a-z][a-z0-9.-]*$/.test(owner) ||
      !/^[A-Z][a-zA-Z0-9]*$/.test(name) ||
      this.components.has(name)
    )
      throw new Error('Invalid or duplicate UI component.');
    const registration = { owner, name, component, token: Symbol(name) };
    this.components.set(name, registration);
    this.changed();
    return {
      dispose: () => {
        if (this.components.get(name)?.token === registration.token)
          this.deleteClass(owner, name);
      },
    };
  }
  getComponentClass(name: string) {
    return this.components.get(name)?.component;
  }
  deleteClass(owner: string, name: string) {
    if (this.components.get(name)?.owner !== owner) return;
    this.components.delete(name);
    this.placements = this.placements.filter((item) => item.name !== name);
    this.changed();
  }
  addComponentToLayout(
    owner: string,
    layout: UiLayout,
    name: string,
  ): Disposable {
    if (
      !uiLayouts.includes(layout) ||
      this.components.get(name)?.owner !== owner ||
      this.placements.some(
        (item) => item.layout === layout && item.name === name,
      )
    )
      throw new Error('Invalid layout contribution.');
    const placement = { owner, layout, name, token: Symbol(name) };
    this.placements = [...this.placements, placement];
    this.changed();
    return {
      dispose: () => {
        this.placements = this.placements.filter(
          (item) => item.token !== placement.token,
        );
        this.changed();
      },
    };
  }
  removeComponentFromLayout(owner: string, layout: UiLayout, name: string) {
    this.placements = this.placements.filter(
      (item) =>
        item.owner !== owner || item.layout !== layout || item.name !== name,
    );
    this.changed();
  }
  getLayout(layout: UiLayout) {
    return this.placements
      .filter((item) => item.layout === layout)
      .map((item) => this.components.get(item.name)!)
      .filter(Boolean);
  }
  disposeOwner(owner: string) {
    for (const entry of this.components.values())
      if (entry.owner === owner) this.components.delete(entry.name);
    this.placements = this.placements.filter((item) => item.owner !== owner);
    this.changed();
  }
}
