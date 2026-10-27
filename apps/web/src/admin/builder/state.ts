import { defaultProps, type PageDocument, type SectionType } from '@site-builder/shared';

export type Section = PageDocument['sections'][number];

export interface BuilderState {
  sections: Section[];
  past: Section[][];
  future: Section[][];
  selectedId: string | null;
  /** Increments on every content change; the editor autosaves when it moves. */
  revision: number;
  /** Consecutive edits to the same section within a short window share one undo step. */
  lastEdit: { id: string; at: number } | null;
}

export type BuilderAction =
  | { type: 'load'; sections: Section[] }
  | { type: 'add'; sectionType: SectionType; index?: number; id?: string }
  | { type: 'remove'; id: string }
  | { type: 'duplicate'; id: string; newId?: string }
  | { type: 'move'; from: number; to: number }
  | { type: 'moveBy'; id: string; delta: number }
  | { type: 'update'; id: string; props: Record<string, unknown>; at?: number }
  | { type: 'toggleHidden'; id: string }
  | { type: 'select'; id: string | null }
  | { type: 'undo' }
  | { type: 'redo' };

const HISTORY_LIMIT = 100;
const COALESCE_MS = 1000;

export const newSectionId = () => `s-${Math.random().toString(36).slice(2, 9)}`;

export const initialBuilderState: BuilderState = { sections: [], past: [], future: [], selectedId: null, revision: 0, lastEdit: null };

/** Applies a content change, recording the previous state for undo. */
function commit(state: BuilderState, sections: Section[], extra: Partial<BuilderState> = {}): BuilderState {
  return {
    ...state,
    past: [...state.past, state.sections].slice(-HISTORY_LIMIT),
    future: [],
    sections,
    revision: state.revision + 1,
    lastEdit: null,
    ...extra,
  };
}

export function builderReducer(state: BuilderState, action: BuilderAction): BuilderState {
  switch (action.type) {
    case 'load':
      return { ...initialBuilderState, sections: action.sections, selectedId: action.sections[0]?.id ?? null };

    case 'add': {
      const section: Section = { id: action.id ?? newSectionId(), type: action.sectionType, props: defaultProps(action.sectionType) as Record<string, unknown> };
      const selectedIndex = state.sections.findIndex((s) => s.id === state.selectedId);
      const index = action.index ?? (selectedIndex >= 0 ? selectedIndex + 1 : state.sections.length);
      const sections = [...state.sections];
      sections.splice(Math.max(0, Math.min(index, sections.length)), 0, section);
      return commit(state, sections, { selectedId: section.id });
    }

    case 'remove': {
      const index = state.sections.findIndex((s) => s.id === action.id);
      if (index < 0) return state;
      const sections = state.sections.filter((s) => s.id !== action.id);
      const nextSelected = state.selectedId === action.id ? (sections[index] ?? sections[index - 1])?.id ?? null : state.selectedId;
      return commit(state, sections, { selectedId: nextSelected });
    }

    case 'duplicate': {
      const index = state.sections.findIndex((s) => s.id === action.id);
      if (index < 0) return state;
      const copy: Section = { ...structuredClone(state.sections[index]), id: action.newId ?? newSectionId() };
      const sections = [...state.sections];
      sections.splice(index + 1, 0, copy);
      return commit(state, sections, { selectedId: copy.id });
    }

    case 'move': {
      const { from, to } = action;
      if (from === to || from < 0 || to < 0 || from >= state.sections.length || to >= state.sections.length) return state;
      const sections = [...state.sections];
      const [item] = sections.splice(from, 1);
      sections.splice(to, 0, item);
      return commit(state, sections);
    }

    case 'moveBy': {
      const from = state.sections.findIndex((s) => s.id === action.id);
      return builderReducer(state, { type: 'move', from, to: from + action.delta });
    }

    case 'update': {
      const at = action.at ?? Date.now();
      const sections = state.sections.map((s) => (s.id === action.id ? { ...s, props: action.props } : s));
      const coalesce = state.lastEdit && state.lastEdit.id === action.id && at - state.lastEdit.at < COALESCE_MS;
      if (coalesce) return { ...state, sections, future: [], revision: state.revision + 1, lastEdit: { id: action.id, at } };
      return { ...commit(state, sections), lastEdit: { id: action.id, at } };
    }

    case 'toggleHidden':
      return commit(
        state,
        state.sections.map((s) => (s.id === action.id ? { ...s, hidden: !s.hidden } : s)),
      );

    case 'select':
      return { ...state, selectedId: action.id };

    case 'undo': {
      const previous = state.past.at(-1);
      if (!previous) return state;
      return {
        ...state,
        sections: previous,
        past: state.past.slice(0, -1),
        future: [state.sections, ...state.future],
        revision: state.revision + 1,
        lastEdit: null,
        selectedId: previous.some((s) => s.id === state.selectedId) ? state.selectedId : (previous[0]?.id ?? null),
      };
    }

    case 'redo': {
      const [next, ...rest] = state.future;
      if (!next) return state;
      return {
        ...state,
        sections: next,
        past: [...state.past, state.sections],
        future: rest,
        revision: state.revision + 1,
        lastEdit: null,
        selectedId: next.some((s) => s.id === state.selectedId) ? state.selectedId : (next[0]?.id ?? null),
      };
    }
  }
}
