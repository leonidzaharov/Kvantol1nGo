import { EditorView } from "@codemirror/view";
import type { ViewMode } from "@mdxeditor/editor";

type Position = { top: number; ratio: number; anchor?: string; offset?: number; selection?: { anchor: number; head: number } };

/** Each representation has its own viewport. First visits follow the visible text. */
export function createEditorViewMemory() {
  let viewportElement: HTMLDivElement | null = null;
  const getViewport = () => viewportElement;
  let mode: ViewMode = "rich-text";
  const positions: Partial<Record<ViewMode, Position>> = {};
  let frame = 0;
  function sourceView(viewport: HTMLElement) {
    const element = viewport.querySelector<HTMLElement>(".mdxeditor-source-editor .cm-editor");
    return element ? EditorView.findFromDOM(element) : null;
  }
  function capture(): Position {
    const viewport = getViewport();
    if (!viewport) return { top: 0, ratio: 0 };
    const top = viewport.scrollTop;
    const position: Position = { top, ratio: top / Math.max(1, viewport.scrollHeight - viewport.clientHeight) };
    if (mode === "rich-text") {
      const edge = viewport.getBoundingClientRect().top + 52;
      const element = Array.from(viewport.querySelectorAll<HTMLElement>('.mdxeditor-rich-text-editor [contenteditable="true"] > *'))
        .find((candidate) => candidate.getBoundingClientRect().bottom > edge && candidate.textContent?.trim());
      if (element) {
        position.anchor = element.textContent?.trim().slice(0, 90);
        position.offset = element.getBoundingClientRect().top - viewport.getBoundingClientRect().top;
      }
    } else if (mode === "source") {
      const view = sourceView(viewport);
      if (view) position.selection = { anchor: view.state.selection.main.anchor, head: view.state.selection.main.head };
    }
    return position;
  }
  function restore(next: ViewMode, previous: Position) {
    cancelAnimationFrame(frame);
    // Wait for the new CodeMirror view and Lexical's import/focus to finish.
    frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        const viewport = getViewport();
        if (!viewport) return;
        const saved = positions[next];
        viewport.scrollTop = saved?.top ?? previous.ratio * Math.max(0, viewport.scrollHeight - viewport.clientHeight);
        if (next === "source") {
          const view = sourceView(viewport);
          if (view && saved?.selection) {
            view.dispatch({ selection: {
              anchor: Math.min(saved.selection.anchor, view.state.doc.length),
              head: Math.min(saved.selection.head, view.state.doc.length),
            } });
          } else if (view && previous.anchor) {
            const index = view.state.doc.toString().indexOf(previous.anchor);
            if (index >= 0) view.dispatch({ effects: EditorView.scrollIntoView(index, { y: "start", yMargin: 60 }) });
          }
        } else if (next === "rich-text" && saved?.anchor) {
          const element = Array.from(viewport.querySelectorAll<HTMLElement>('.mdxeditor-rich-text-editor [contenteditable="true"] > *'))
            .find((candidate) => candidate.textContent?.trim().startsWith(saved.anchor!));
          if (element) viewport.scrollTop += element.getBoundingClientRect().top - viewport.getBoundingClientRect().top - (saved.offset ?? 52);
        }
      });
    });
  }
  return {
    attach(element: HTMLDivElement | null) { viewportElement = element; },
    changeMode(next: ViewMode) {
      if (next === mode) return;
      const previous = capture();
      positions[mode] = previous;
      mode = next;
      restore(next, previous);
    },
    preserve(change: () => void) {
      const previous = capture();
      positions[mode] = previous;
      change();
      restore(mode, previous);
    },
    dispose() { cancelAnimationFrame(frame); },
  };
}
