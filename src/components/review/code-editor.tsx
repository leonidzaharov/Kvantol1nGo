"use client";

import { useEffect, useRef, useState } from "react";
import { basicSetup } from "codemirror";
import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { syntaxHighlighting } from "@codemirror/language";
import { EditorState, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { classHighlighter } from "@lezer/highlight";

import type { ReviewCodeLanguage } from "@/generated/prisma";

const editorTheme = EditorView.theme({
  "&": {
    border: "2px solid var(--code-editor-border)",
    borderRadius: "0.75rem",
    backgroundColor: "var(--code-editor-background)",
    color: "var(--code-editor-foreground)",
    fontSize: "14px",
    minHeight: "280px",
  },
  "&.cm-focused": {
    outline: "none",
    borderColor: "var(--code-editor-focus)",
  },
  ".cm-scroller": {
    fontFamily:
      "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    lineHeight: "1.6",
  },
  ".cm-content": {
    padding: "12px 0",
    caretColor: "var(--code-editor-caret)",
  },
  ".cm-gutters": {
    backgroundColor: "var(--code-editor-gutter-background)",
    borderRight: "1px solid var(--code-editor-border)",
    color: "var(--code-editor-muted)",
  },
  ".cm-activeLine, .cm-activeLineGutter": {
    backgroundColor: "var(--code-editor-active-line)",
  },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, .cm-content ::selection": {
    backgroundColor: "var(--code-editor-selection)",
  },
  ".cm-cursor, .cm-dropCursor": {
    borderLeftColor: "var(--code-editor-caret)",
  },
  ".cm-placeholder": {
    color: "var(--code-editor-muted)",
  },
  ".tok-keyword, .tok-operator": {
    color: "var(--code-editor-keyword)",
  },
  ".tok-atom, .tok-bool, .tok-url, .tok-labelName, .tok-number": {
    color: "var(--code-editor-atom)",
  },
  ".tok-literal, .tok-inserted": {
    color: "var(--code-editor-literal)",
  },
  ".tok-string, .tok-deleted": {
    color: "var(--code-editor-string)",
  },
  ".tok-string2": {
    color: "var(--code-editor-special-string)",
  },
  ".tok-variableName.tok-definition, .tok-propertyName.tok-definition": {
    color: "var(--code-editor-definition)",
  },
  ".tok-typeName, .tok-namespace, .tok-className": {
    color: "var(--code-editor-type)",
  },
  ".tok-propertyName, .tok-variableName2, .tok-macroName": {
    color: "var(--code-editor-property)",
  },
  ".tok-comment, .tok-meta": {
    color: "var(--code-editor-comment)",
  },
  ".tok-invalid": {
    color: "var(--code-editor-invalid)",
  },
});

function languageExtension(language: ReviewCodeLanguage): Extension {
  switch (language) {
    case "PYTHON":
      return python();
    case "JAVASCRIPT":
      return javascript();
    case "HTML":
      return html();
    case "CSS":
      return css();
    case "OTHER":
      return [];
  }
}

type CodeEditorProps = {
  language: ReviewCodeLanguage;
  initialValue: string;
  readOnly?: boolean;
  name?: string;
  ariaLabel: string;
};

export function CodeEditor({
  language,
  initialValue,
  readOnly = false,
  name,
  ariaLabel,
}: CodeEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    if (!hostRef.current) {
      return;
    }

    const state = EditorState.create({
      doc: initialValue,
      extensions: [
        basicSetup,
        languageExtension(language),
        syntaxHighlighting(classHighlighter),
        editorTheme,
        EditorView.lineWrapping,
        EditorState.readOnly.of(readOnly),
        EditorView.editable.of(!readOnly),
        EditorView.contentAttributes.of({ "aria-label": ariaLabel }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            setValue(update.state.doc.toString());
          }
        }),
      ],
    });
    const view = new EditorView({ state, parent: hostRef.current });
    return () => view.destroy();
  }, [ariaLabel, initialValue, language, readOnly]);

  return (
    <>
      <div ref={hostRef} />
      {!readOnly && name ? (
        <input type="hidden" name={name} value={value} readOnly />
      ) : null}
    </>
  );
}
