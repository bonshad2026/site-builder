import { isSectionType, parseSectionProps, type PageDocument, type SectionAppearance } from '@site-builder/shared';
import { Component, useMemo, type CSSProperties, type ReactNode } from 'react';
import { fillTokens } from '../features/collections/CardView';
import { useCurrentItem } from '../features/collections/data';
import { useSiteCalendar } from '../features/public-site/data';
import { usePreferences } from '../lib/preferences';
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
  const props = useItemTokens(section.props);
  if (section.hidden && !editing) return null;
  if (!isSectionType(section.type)) return editing ? <EditorNotice text={`Unknown section type “${section.type}”`} /> : null;
  const parsed = parseSectionProps(section.type, props);
  if (!parsed.success) return editing ? <EditorNotice text={`Invalid section settings: ${parsed.error}`} /> : null;
  const Renderer = sectionRenderers[section.type];
  return (
    <SectionBoundary fallback={editing ? <EditorNotice text="This section failed to render." /> : null}>
      <SectionLook look={parsed.data.appearance as SectionAppearance}>
        <Renderer props={parsed.data} />
      </SectionLook>
    </SectionBoundary>
  );
}

/** On a table's template page, `{{field}}` in any text of a section becomes the item's value. */
function useItemTokens(props: Record<string, unknown>): Record<string, unknown> {
  const current = useCurrentItem();
  const prefs = usePreferences();
  const cal = useSiteCalendar();
  return useMemo(() => {
    if (!current) return props;
    const fill = (v: unknown): unknown => {
      if (typeof v === 'string') return v.includes('{{') ? fillTokens(v, current.item, current.collection, prefs, cal) : v;
      if (Array.isArray(v)) return v.map(fill);
      if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fill(x)]));
      return v;
    };
    return fill(props) as Record<string, unknown>;
  }, [props, current, prefs, cal]);
}

/**
 * A section's own spacing, colours, width and devices. Untouched settings add nothing, so
 * sections look exactly as before. Colours work by giving the section its own theme colours.
 */
function SectionLook({ look, children }: { look: SectionAppearance | undefined; children: ReactNode }) {
  if (!look) return <>{children}</>;
  const changed = look.paddingTop !== 'default' || look.paddingBottom !== 'default' || look.background || look.textColor || look.width !== 'default' || look.showOn !== 'all';
  if (!changed) return <>{children}</>;
  const style: Record<string, string> = {};
  if (look.background) Object.assign(style, { '--bg': look.background, '--surface': look.background, background: look.background });
  if (look.textColor) Object.assign(style, { '--ink': look.textColor, '--ink-soft': look.textColor, color: look.textColor });
  return (
    <div
      data-pt={look.paddingTop}
      data-pb={look.paddingBottom}
      data-width={look.width}
      className={look.showOn === 'desktop' ? 'hidden md:block' : look.showOn === 'mobile' ? 'md:hidden' : undefined}
      style={style as CSSProperties}
    >
      {children}
    </div>
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
