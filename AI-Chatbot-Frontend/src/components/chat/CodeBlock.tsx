import { useState } from 'react';
import hljs from 'highlight.js/lib/core';
import type { LanguageFn } from 'highlight.js';
import { MdCheck, MdContentCopy } from 'react-icons/md';
import 'highlight.js/styles/github-dark.css';

// Register only the languages the assistant is likely to output , 
// keeps the (lazy-loaded) chat bundle far smaller than the full hljs build.
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import json from 'highlight.js/lib/languages/json';
import python from 'highlight.js/lib/languages/python';
import bash from 'highlight.js/lib/languages/bash';
import cpp from 'highlight.js/lib/languages/cpp';
import java from 'highlight.js/lib/languages/java';
import css from 'highlight.js/lib/languages/css';
import xml from 'highlight.js/lib/languages/xml';
import sql from 'highlight.js/lib/languages/sql';
import php from 'highlight.js/lib/languages/php';
import ruby from 'highlight.js/lib/languages/ruby';
import go from 'highlight.js/lib/languages/go';
import rust from 'highlight.js/lib/languages/rust';
import markdown from 'highlight.js/lib/languages/markdown';
import yaml from 'highlight.js/lib/languages/yaml';

const LANGUAGES: Record<string, LanguageFn> = {
  javascript,
  typescript,
  json,
  python,
  bash,
  cpp,
  c: cpp,
  java,
  css,
  xml,
  html: xml,
  sql,
  php,
  ruby,
  go,
  rust,
  markdown,
  yaml,
};

for (const [name, language] of Object.entries(LANGUAGES)) {
  if (!hljs.getLanguage(name)) hljs.registerLanguage(name, language);
}

export function CodeBlock({
  language,
  code,
}: {
  language: string;
  code: string;
}) {
  const [copied, setCopied] = useState(false);

  let highlighted = '';
  try {
    highlighted = language
      ? hljs.highlight(code, { language }).value
      : hljs.highlightAuto(code).value;
  } catch {
    highlighted = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // clipboard unavailable
    }
  };

  return (
    <div>
      <div className="code-header">
        <span>{language || 'text'}</span>
        <button onClick={() => void copy()}>
          {copied ? <MdCheck size={13} /> : <MdContentCopy size={13} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre>
        <code
          className="hljs-code"
          dangerouslySetInnerHTML={{ __html: highlighted }}
        />
      </pre>
    </div>
  );
}
