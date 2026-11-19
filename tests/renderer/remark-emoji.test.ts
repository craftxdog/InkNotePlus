import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import Markdown from 'react-markdown';
import { remarkEmoji } from '../../src/renderer/editor/remark-emoji';

const render = (text: string) =>
  renderToStaticMarkup(
    createElement(Markdown, { remarkPlugins: [remarkEmoji] }, text),
  );

describe('remarkEmoji', () => {
  it('replaces known shortcodes', () => {
    expect(render('Hola :smile: y :+1:')).toContain('Hola 😄 y 👍');
  });

  it('keeps unknown codes and times untouched', () => {
    expect(render('a :no_existe: 12:30:45')).toContain(
      'a :no_existe: 12:30:45',
    );
  });

  it('respects inline code and code blocks', () => {
    expect(render('`:smile:`')).toContain('<code>:smile:</code>');
    expect(render('```\n:smile:\n```')).toContain(':smile:');
    expect(render('```\n:smile:\n```')).not.toContain('😄');
  });

  it('does not read inherited object properties', () => {
    expect(render(':constructor:')).toContain(':constructor:');
  });
});
