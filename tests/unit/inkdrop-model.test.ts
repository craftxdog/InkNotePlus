import { describe, expect, it } from 'vitest';
import {
  fromInkdropStatus,
  fromInkdropTimestamp,
  parseInkdropDocument,
  rewriteInkdropLinks,
} from '../../src/shared/inkdrop-model';

describe('Inkdrop data model', () => {
  it.each([
    ['none', 'none'],
    ['active', 'active'],
    ['onHold', 'onhold'],
    ['completed', 'completed'],
    ['dropped', 'dropped'],
    ['otro', 'none'],
    [undefined, 'none'],
  ])('maps the status %s', (status, expected) => {
    expect(fromInkdropStatus(status)).toBe(expected);
  });
  it('converts Unix milliseconds to ISO dates', () => {
    expect(fromInkdropTimestamp(1704164645000)).toBe(
      '2024-01-02T03:04:05.000Z',
    );
    expect(fromInkdropTimestamp(undefined)).toBeUndefined();
    expect(fromInkdropTimestamp(Number.NaN)).toBeUndefined();
  });
  it('recognizes each document type by its ID prefix', () => {
    expect(
      parseInkdropDocument({
        _id: 'note:a',
        title: 'T',
        body: 'B',
        bookId: 'book:b',
        tags: ['tag:c'],
        status: 'onHold',
        pinned: true,
        createdAt: 1,
        updatedAt: 2,
      })?.kind,
    ).toBe('note');
    expect(
      parseInkdropDocument({ _id: 'book:a', name: 'N', parentBookId: null })
        ?.kind,
    ).toBe('book');
    expect(
      parseInkdropDocument({ _id: 'tag:a', name: 'N', color: 'red' })?.kind,
    ).toBe('tag');
    expect(
      parseInkdropDocument({
        _id: 'file:a',
        name: 'a.png',
        contentType: 'image/png',
        _attachments: { index: { data: 'AAAA' } },
      })?.kind,
    ).toBe('file');
  });
  it('ignores anything else', () => {
    expect(parseInkdropDocument({ _id: 'config:a' })).toBeNull();
    expect(parseInkdropDocument({ title: 'sin id' })).toBeNull();
    expect(parseInkdropDocument('texto')).toBeNull();
  });
  it('rewrites links to imported notes and files only', () => {
    const body =
      '[a](inkdrop://note/one) [b](inkdrop://note:two) ![c](inkdrop://file:img) [d](inkdrop://note/none) ![e](inkdrop://file:none)';
    expect(
      rewriteInkdropLinks(
        body,
        new Map([
          ['note:one', 'id-1'],
          ['note:two', 'id-2'],
        ]),
        new Map([['file:img', 'inknote-asset://images/a.png']]),
      ),
    ).toBe(
      '[a](inknote://note/id-1) [b](inknote://note/id-2) ![c](inknote-asset://images/a.png) [d](inkdrop://note/none) ![e](inkdrop://file:none)',
    );
  });
});
