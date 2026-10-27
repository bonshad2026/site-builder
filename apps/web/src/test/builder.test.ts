import { pageDocumentSchema } from '@site-builder/shared';
import { describe, expect, it } from 'vitest';
import { builderReducer, initialBuilderState, type BuilderState } from '../admin/builder/state';
import { cartOps } from '../features/cart/cart';

const run = (actions: Parameters<typeof builderReducer>[1][], start: BuilderState = initialBuilderState) => actions.reduce(builderReducer, start);
const types = (s: BuilderState) => s.sections.map((x) => x.type);

describe('page builder state', () => {
  it('adds sections with valid default props after the selected one', () => {
    const s = run([
      { type: 'add', sectionType: 'hero', id: 'a' },
      { type: 'add', sectionType: 'cta', id: 'b' },
      { type: 'select', id: 'a' },
      { type: 'add', sectionType: 'faq', id: 'c' },
    ]);
    expect(types(s)).toEqual(['hero', 'faq', 'cta']);
    expect(s.selectedId).toBe('c');
    // Whatever the builder creates must pass the API's validation.
    expect(pageDocumentSchema.safeParse({ schemaVersion: 1, sections: s.sections }).success).toBe(true);
  });

  it('moves, duplicates, hides and deletes', () => {
    let s = run([
      { type: 'add', sectionType: 'hero', id: 'a' },
      { type: 'add', sectionType: 'stats', id: 'b' },
      { type: 'add', sectionType: 'cta', id: 'c' },
      { type: 'move', from: 2, to: 0 },
    ]);
    expect(s.sections.map((x) => x.id)).toEqual(['c', 'a', 'b']);
    s = run([{ type: 'moveBy', id: 'a', delta: 1 }], s);
    expect(s.sections.map((x) => x.id)).toEqual(['c', 'b', 'a']);
    s = run([{ type: 'moveBy', id: 'c', delta: -1 }], s); // already first: no change
    expect(s.sections.map((x) => x.id)).toEqual(['c', 'b', 'a']);

    s = run([{ type: 'duplicate', id: 'b', newId: 'b2' }], s);
    expect(s.sections.map((x) => x.id)).toEqual(['c', 'b', 'b2', 'a']);
    expect(s.sections[2].props).toEqual(s.sections[1].props);
    expect(s.sections[2].props).not.toBe(s.sections[1].props);

    s = run([{ type: 'toggleHidden', id: 'b2' }], s);
    expect(s.sections[2].hidden).toBe(true);
    s = run([{ type: 'remove', id: 'b2' }], s);
    expect(s.sections.map((x) => x.id)).toEqual(['c', 'b', 'a']);
    expect(s.selectedId).toBe('a');
  });

  it('undoes and redoes; a new change clears redo', () => {
    let s = run([
      { type: 'add', sectionType: 'hero', id: 'a' },
      { type: 'add', sectionType: 'cta', id: 'b' },
      { type: 'remove', id: 'a' },
    ]);
    expect(types(s)).toEqual(['cta']);
    s = run([{ type: 'undo' }], s);
    expect(types(s)).toEqual(['hero', 'cta']);
    s = run([{ type: 'undo' }, { type: 'undo' }], s);
    expect(types(s)).toEqual([]);
    s = run([{ type: 'redo' }], s);
    expect(types(s)).toEqual(['hero']);
    s = run([{ type: 'add', sectionType: 'faq' }], s);
    expect(s.future).toHaveLength(0);
  });

  it('groups rapid typing in one section into a single undo step', () => {
    let s = run([{ type: 'add', sectionType: 'cta', id: 'a' }]);
    const props = (h: string) => ({ ...s.sections[0].props, heading: { en: h, fa: '' } });
    s = run([{ type: 'update', id: 'a', props: props('H'), at: 1000 }], s);
    s = run([{ type: 'update', id: 'a', props: props('He'), at: 1300 }], s);
    s = run([{ type: 'update', id: 'a', props: props('Hey'), at: 1600 }], s);
    expect((s.sections[0].props.heading as { en: string }).en).toBe('Hey');
    s = run([{ type: 'undo' }], s);
    expect((s.sections[0].props.heading as { en: string }).en).toBe('');
  });

  it('bumps the revision on every content change (drives autosave), not on selection', () => {
    const s = run([{ type: 'add', sectionType: 'hero', id: 'a' }]);
    expect(run([{ type: 'select', id: null }], s).revision).toBe(s.revision);
    expect(run([{ type: 'toggleHidden', id: 'a' }], s).revision).toBe(s.revision + 1);
  });
});

describe('cart', () => {
  const lamp = { productId: 'p1', slug: 'lamp', name: { en: 'Lamp', fa: 'چراغ' }, priceMinor: '38000000', currency: 'IRR', imageUrl: null };

  it('merges lines, caps quantity and computes the subtotal with bigint precision', () => {
    let lines = cartOps.add([], lamp, 2);
    lines = cartOps.add(lines, lamp, 3);
    expect(lines).toHaveLength(1);
    expect(lines[0].quantity).toBe(5);
    lines = cartOps.setQuantity(lines, 'p1', 999);
    expect(lines[0].quantity).toBe(50);
    expect(cartOps.subtotal(lines)).toBe(1_900_000_000n);
    expect(cartOps.setQuantity(lines, 'p1', 0)).toHaveLength(0);
  });
});
