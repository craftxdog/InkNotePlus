// The session denies web permissions by default, so the asynchronous clipboard
// can reject. The document command still copies during a user action.
export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const previous = document.activeElement;
    const field = document.createElement('textarea');
    field.value = text;
    field.setAttribute('readonly', '');
    field.style.position = 'fixed';
    field.style.opacity = '0';
    (previous?.closest('dialog') ?? document.body).append(field);
    field.focus();
    field.select();
    try {
      return document.execCommand('copy');
    } catch {
      return false;
    } finally {
      field.remove();
      if (previous instanceof HTMLElement) previous.focus();
    }
  }
}
