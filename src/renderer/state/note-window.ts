export type NoteWindowTarget = 'new' | string;

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// A window opened for one note carries its target in the page address.
export function noteWindowTarget(search: string): NoteWindowTarget | null {
  const target = new URLSearchParams(search).get('noteWindow');
  return target === 'new' || (target && uuid.test(target)) ? target : null;
}
