import { linkedNoteId } from '../shared/note-link';

// Windows and Linux pass the opened link as a process argument.
export const noteLinkFromArgv = (argv: readonly string[]) =>
  argv.find((argument) => linkedNoteId(argument)) ?? null;

export function createNoteLinkRouter(options: {
  send: (url: string) => void;
  reveal: () => void;
}) {
  let ready = false;
  let pending: string | null = null;
  return {
    open(url: string) {
      if (!linkedNoteId(url)) return;
      options.reveal();
      if (ready) options.send(url);
      else pending = url;
    },
    rendererReady() {
      ready = true;
      if (pending) options.send(pending);
      pending = null;
    },
    rendererGone() {
      ready = false;
    },
  };
}
