import { describe, expect, it } from 'vitest';
import manifest from '../com.supernon0.multioutils.sdPlugin/manifest.json';
import { HA_KINDS } from './ha/kinds';

describe('stateful Stream Deck actions', () => {
  it('offers two user-customizable images driven by the application for every toggle', () => {
    const ids = ['desktop-hide', 'desktop-peek', 'autoclick-toggle', 'autoclick-profile'].map((id) => `com.supernon0.multioutils.${id}`).concat(HA_KINDS.map((kind) => kind.uuid));
    for (const id of ids) {
      const action = manifest.Actions.find((a) => a.UUID === id);
      expect(action, id).toBeDefined();
      expect(action?.States, id).toHaveLength(2);
      expect(action?.DisableAutomaticStates, id).toBe(true);
    }
  });
  it('leaves zone visibility titles to the user', () => {
    for (const id of ['desktop-hide', 'desktop-peek']) {
      const action = manifest.Actions.find((a) => a.UUID === `com.supernon0.multioutils.${id}`);
      for (const state of action!.States) expect(state).not.toHaveProperty('Title');
    }
  });
  it('keeps the HA inspector as a single launcher button', () => {
    for (const kind of HA_KINDS) expect(manifest.Actions.find((a) => a.UUID === kind.uuid)?.PropertyInspectorPath).toBe('ui/ha-launcher.html');
  });
});
