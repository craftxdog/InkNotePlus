import { describe, expect, it, vi } from 'vitest';
import {
  createNoteLinkRouter,
  noteLinkFromArgv,
} from '../../src/main/note-links';

const id = '5a5115f8-747f-416d-82d5-d9c12e34d323';
const link = `inknote://note/${id}`;

describe('links on the command line', () => {
  it('finds a valid note link', () => {
    expect(noteLinkFromArgv(['/app/InkNote', '--flag', link])).toBe(link);
  });
  it.each([
    [['/app/InkNote']],
    [['/app/InkNote', 'inknote://note/no-es-uuid']],
    [['/app/InkNote', `inknote://settings/${id}`]],
    [['/app/InkNote', `https://example.com/${id}`]],
    [['/app/InkNote', `${link}?x=1`]],
  ])('ignores %j', (argv) => {
    expect(noteLinkFromArgv(argv)).toBeNull();
  });
});

describe('note link router', () => {
  function setup() {
    const send = vi.fn();
    const reveal = vi.fn();
    return { send, reveal, router: createNoteLinkRouter({ send, reveal }) };
  }
  it('holds a link until the renderer is ready', () => {
    const { router, send, reveal } = setup();
    router.open(link);
    expect(send).not.toHaveBeenCalled();
    expect(reveal).toHaveBeenCalledTimes(1);
    router.rendererReady();
    expect(send).toHaveBeenCalledExactlyOnceWith(link);
    router.rendererReady();
    expect(send).toHaveBeenCalledTimes(1);
  });
  it('sends at once while the renderer is ready', () => {
    const { router, send } = setup();
    router.rendererReady();
    router.open(link);
    expect(send).toHaveBeenCalledExactlyOnceWith(link);
  });
  it('waits again while the window reloads', () => {
    const { router, send } = setup();
    router.rendererReady();
    router.rendererGone();
    router.open(link);
    expect(send).not.toHaveBeenCalled();
    router.rendererReady();
    expect(send).toHaveBeenCalledTimes(1);
  });
  it('ignores invalid links without revealing the window', () => {
    const { router, send, reveal } = setup();
    router.rendererReady();
    router.open('inknote://note/x');
    router.open('https://example.com');
    expect(send).not.toHaveBeenCalled();
    expect(reveal).not.toHaveBeenCalled();
  });
});
