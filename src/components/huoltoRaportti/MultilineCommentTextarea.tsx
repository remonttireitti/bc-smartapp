import type { TextareaHTMLAttributes } from 'react';
import { handlePlainTextPaste } from '../../lib/clipboardPlainText';

interface Props extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange' | 'value'> {
  value: string;
  onChange: (value: string) => void;
}

export function MultilineCommentTextarea({ value, onChange, onPaste, className, style, ...rest }: Props) {
  return (
    <textarea
      {...rest}
      className={className ? `multiline-comment-textarea ${className}` : 'multiline-comment-textarea'}
      style={{ whiteSpace: 'pre-wrap', ...style }}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onPaste={(e) => {
        handlePlainTextPaste(e, value, onChange);
        onPaste?.(e);
      }}
    />
  );
}
