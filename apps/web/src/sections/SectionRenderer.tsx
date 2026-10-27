import { isSectionType, parseSectionProps, type PageDocument } from '@site-builder/shared';
import { Component, type ReactNode } from 'react';
import { sectionRenderers } from './renderers';

type Section = PageDocument['sections'][number];

/** Keeps one crashing section from taking down the rest of the page. */
class SectionBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function EditorNotice({ text }: { text: string }) {
  return (
    <div role="note" className="mx-auto my-6 max-w-3xl border border-dashed border-danger px-6 py-4 text-sm text-danger">
      {text}
    </div>
  );
}

/**
 * Renders one section. Unknown or invalid sections render nothing for visitors
 * and a visible notice in the editor (`editing`).
 */
export function SectionRenderer({ section, editing = false }: { section: Section; editing?: boolean }) {
  if (section.hidden && !editing) return null;
  if (!isSectionType(section.type)) return editing ? <EditorNotice text={`Unknown section type “${section.type}”`} /> : null;
  const parsed = parseSectionProps(section.type, section.props);
  if (!parsed.success) return editing ? <EditorNotice text={`Invalid section settings: ${parsed.error}`} /> : null;
  const Renderer = sectionRenderers[section.type];
  return (
    <SectionBoundary fallback={editing ? <EditorNotice text="This section failed to render." /> : null}>
      <Renderer props={parsed.data} />
    </SectionBoundary>
  );
}

export function PageSections({ document }: { document: PageDocument }) {
  return (
    <>
      {document.sections.map((s) => (
        <SectionRenderer key={s.id} section={s} />
      ))}
    </>
  );
}
