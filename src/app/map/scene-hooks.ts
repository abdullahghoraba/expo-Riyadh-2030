import { InjectionToken } from '@angular/core';

/**
 * Feature callbacks the SceneService invokes during boot and on map clicks, so that map/ never imports
 * the feature folders (the plots feature provides the real implementation in app.config.ts).
 */
export interface SceneHooks {
  /** Called once the layers exist, before the view is ready (reference boot: default plot, detail pavilion, near list). */
  afterLayers(): void;
  /** Click on the 3D view (reference app.js onClick). */
  click(ev: __esri.ViewImmediateClickEvent): Promise<void>;
}

export const NOOP_SCENE_HOOKS: SceneHooks = {
  afterLayers: () => undefined,
  click: () => Promise.resolve()
};

export const SCENE_HOOKS = new InjectionToken<SceneHooks>('SceneHooks', {
  providedIn: 'root',
  factory: () => NOOP_SCENE_HOOKS
});
