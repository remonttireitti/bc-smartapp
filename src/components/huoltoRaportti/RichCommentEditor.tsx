import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  clipboardDataToRichCommentHtml,
  editorHtmlToStoredValue,
  markEditorParagraphs,
  paragraphGapHtml,
  RICH_COMMENT_FONT_SIZES,
  valueToEditorHtml,
} from '../../lib/richCommentHtml';

interface Props {
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
  className?: string;
}

type FormatState = {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  unorderedList: boolean;
  orderedList: boolean;
};

const DEFAULT_FORMAT: FormatState = {
  bold: false,
  italic: false,
  underline: false,
  unorderedList: false,
  orderedList: false,
};

function isEmptyEditorHtml(html: string): boolean {
  const trimmed = html.replace(/<br\s*\/?>/gi, '').trim();
  return !trimmed;
}

export function RichCommentEditor({ value, onChange, rows = 5, placeholder, className }: Props) {
  const editorRef = useRef<HTMLDivElement>(null);
  const lastStoredRef = useRef(value);
  const [format, setFormat] = useState<FormatState>(DEFAULT_FORMAT);

  useLayoutEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    el.innerHTML = valueToEditorHtml(value);
    lastStoredRef.current = value;
  }, []);

  useEffect(() => {
    const el = editorRef.current;
    if (!el || value === lastStoredRef.current) return;
    el.innerHTML = valueToEditorHtml(value);
    lastStoredRef.current = value;
  }, [value]);

  const refreshFormat = () => {
    setFormat({
      bold: document.queryCommandState('bold'),
      italic: document.queryCommandState('italic'),
      underline: document.queryCommandState('underline'),
      unorderedList: document.queryCommandState('insertUnorderedList'),
      orderedList: document.queryCommandState('insertOrderedList'),
    });
  };

  const emitChange = () => {
    const el = editorRef.current;
    if (!el) return;
    markEditorParagraphs(el);
    const next = editorHtmlToStoredValue(el.innerHTML);
    lastStoredRef.current = next;
    onChange(next);
    refreshFormat();
  };

  const execFormat = (command: string, commandValue?: string) => {
    editorRef.current?.focus();
    if (command === 'fontSize') {
      document.execCommand('styleWithCSS', false, 'true');
    } else {
      document.execCommand('styleWithCSS', false, 'false');
    }
    document.execCommand(command, false, commandValue);
    emitChange();
  };

  const insertParagraphGap = () => {
    editorRef.current?.focus();
    document.execCommand('insertHTML', false, paragraphGapHtml());
    emitChange();
  };

  const handleEnterKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
    if (format.unorderedList || format.orderedList) return;

    e.preventDefault();
    editorRef.current?.focus();
    if (e.shiftKey) {
      document.execCommand('insertLineBreak');
    } else {
      document.execCommand('insertParagraph');
    }
    emitChange();
  };

  return (
    <div className={className ? `rich-comment-editor-wrap ${className}` : 'rich-comment-editor-wrap'}>
      <div className="rich-comment-editor-toolbar" role="toolbar" aria-label="Tekstin muotoilu">
        <div className="rich-comment-editor-toolbar-group">
          <button
            type="button"
            className={`rich-comment-editor-btn${format.bold ? ' is-active' : ''}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => execFormat('bold')}
            title="Lihavoi"
            aria-label="Lihavoi"
            aria-pressed={format.bold}
          >
            <strong>B</strong>
          </button>
          <button
            type="button"
            className={`rich-comment-editor-btn${format.italic ? ' is-active' : ''}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => execFormat('italic')}
            title="Kursivoi"
            aria-label="Kursivoi"
            aria-pressed={format.italic}
          >
            <em>I</em>
          </button>
          <button
            type="button"
            className={`rich-comment-editor-btn${format.underline ? ' is-active' : ''}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => execFormat('underline')}
            title="Alleviivaa"
            aria-label="Alleviivaa"
            aria-pressed={format.underline}
          >
            <span className="rich-comment-editor-u">U</span>
          </button>
        </div>

        <div className="rich-comment-editor-toolbar-group">
          <label className="rich-comment-editor-size-label">
            <span className="visually-hidden">Fonttikoko</span>
            <select
              className="rich-comment-editor-size"
              defaultValue="3"
              onMouseDown={(e) => e.stopPropagation()}
              onChange={(e) => execFormat('fontSize', e.target.value)}
              title="Fonttikoko"
              aria-label="Fonttikoko"
            >
              {RICH_COMMENT_FONT_SIZES.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="rich-comment-editor-toolbar-group">
          <button
            type="button"
            className="rich-comment-editor-btn"
            onMouseDown={(e) => e.preventDefault()}
            onClick={insertParagraphGap}
            title="Kappaleväli (isompi riviväli)"
            aria-label="Kappaleväli"
          >
            ¶
          </button>
          <button
            type="button"
            className={`rich-comment-editor-btn${format.unorderedList ? ' is-active' : ''}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => execFormat('insertUnorderedList')}
            title="Luettelomerkit"
            aria-label="Luettelomerkit"
            aria-pressed={format.unorderedList}
          >
            •≡
          </button>
          <button
            type="button"
            className={`rich-comment-editor-btn${format.orderedList ? ' is-active' : ''}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => execFormat('insertOrderedList')}
            title="Numerointi"
            aria-label="Numerointi"
            aria-pressed={format.orderedList}
          >
            1.
          </button>
        </div>
      </div>
      <div
        ref={editorRef}
        className="rich-comment-editor"
        contentEditable
        spellCheck
        lang="fi"
        role="textbox"
        aria-multiline="true"
        data-placeholder={placeholder}
        style={{ minHeight: `${rows * 1.45}em` }}
        onInput={emitChange}
        onBlur={emitChange}
        onKeyUp={refreshFormat}
        onMouseUp={refreshFormat}
        onKeyDown={handleEnterKey}
        onPaste={(e) => {
          e.preventDefault();
          const html = clipboardDataToRichCommentHtml(e.clipboardData);
          if (html) {
            document.execCommand('insertHTML', false, html);
          } else {
            document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
          }
          emitChange();
        }}
        suppressContentEditableWarning
      />
    </div>
  );
}

export function isRichCommentEmpty(value: string): boolean {
  return !value.trim() || isEmptyEditorHtml(valueToEditorHtml(value));
}
