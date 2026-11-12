import { randomUUID } from 'node:crypto';
import { lstatSync, readFileSync, renameSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, realpath, rm } from 'node:fs/promises';
import path from 'node:path';
import { maxBodyLength, maxTitleLength, noteSchema } from '../shared/ipc';
import { tagRecordSchema, type TagRecord } from '../shared/tags';
import { z } from '../shared/validation';
import {
  notebookRecordSchema,
  noteVersionSchema,
  recoveryRecordSchema,
  orderNotebooks,
  type NoteVersion,
  type SqliteLibraryTransfer,
} from '../infrastructure/sqlite/sqlite-library-transfer';
import {
  digest,
  hasFileError,
  imageFileName,
  makeUniqueDirectory,
  readManagedImage,
  readRegularFile,
  requireDirectory,
  writeAtomic,
} from './transfer-files';

const maxIndexBytes = 128 * 1024 * 1024;
const backedUpNoteSchema = noteSchema.extend({
  title: z.string().max(maxTitleLength),
  body: z.string().max(maxBodyLength),
});
const checkedNoteVersionSchema = noteVersionSchema.extend({
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});
type CheckedNoteVersion = z.output<typeof checkedNoteVersionSchema>;
const legacyManifestSchema = z
  .object({
    format: z.literal('inknote-backup'),
    version: z.literal(1),
    owner: z.uuid(),
    completedAt: z.string().datetime(),
    notebooks: z.string().regex(/^[a-f0-9]{64}$/),
    tags: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    notes: z.array(noteVersionSchema),
    images: z.array(z.string().regex(imageFileName)),
  })
  .strict();
const manifestSchema = z.discriminatedUnion('version', [
  legacyManifestSchema,
  legacyManifestSchema.extend({
    version: z.literal(2),
    notes: z.array(checkedNoteVersionSchema),
    recoveries: z.array(recoveryRecordSchema).default([]),
  }),
]);
type Manifest = z.output<typeof manifestSchema>;
type ManifestFile = { manifest: Manifest; json: string };

export class BackupFiles {
  constructor(
    private readonly library: SqliteLibraryTransfer,
    private readonly userData: string,
    private readonly owner: string,
  ) {}

  async create(
    parent: string,
  ): Promise<{ directory: string; completedAt: string }> {
    const location = await realpath(parent);
    await this.requireOutsideProfile(location);
    const directory = await makeUniqueDirectory(location, 'InkNote Backup');
    try {
      const layout = backupLayout(directory);
      await mkdir(path.dirname(layout.manifest), { mode: 0o700 });
      await mkdir(path.dirname(layout.notebooks), { mode: 0o700 });
      await mkdir(path.join(directory, '_deleted'), { mode: 0o700 });
      for (const child of [
        layout.notebooks,
        layout.notes,
        layout.trash,
        layout.images,
      ])
        await mkdir(child, { mode: 0o700 });
      return {
        directory,
        completedAt: await this.write(directory, null, false),
      };
    } catch (error) {
      await rm(directory, { recursive: true, force: true });
      throw error;
    }
  }

  async update(directory: string, verify = false): Promise<string> {
    await this.requireOutsideProfile(await realpath(directory));
    const previous = await readManifest(directory);
    if (previous.manifest.owner !== this.owner)
      throw new Error('Backup belongs to another profile.');
    return this.write(directory, previous, verify);
  }

  private async write(
    directory: string,
    index: ManifestFile | null,
    verify: boolean,
  ): Promise<string> {
    const layout = await checkedLayout(directory);
    const previous = index?.manifest;
    const snapshot = this.library.withWriteLock(() => ({
      versions: this.library.listVersions(),
      notebooks: JSON.stringify(this.library.listNotebooks()),
      tags: JSON.stringify(this.library.listTags()),
      recoveries: this.library.listRecoveries(),
    }));
    const notes: CheckedNoteVersion[] = [];
    const previousNotes = new Map(
      previous?.notes.map((note) => [note.id, note]),
    );
    for (const version of snapshot.versions) {
      const cached = previousNotes.get(version.id);
      if (
        !verify &&
        cached &&
        'sha256' in cached &&
        cached.revision === version.revision &&
        cached.trashed === version.trashed
      ) {
        notes.push(cached);
        continue;
      }
      const note = this.library.readNote(version.id);
      if (!note || note.revision !== version.revision)
        throw new Error('Library changed during backup.');
      const json = JSON.stringify(note);
      const checked = { ...version, sha256: digest(json) };
      await writeAtomic(noteFile(layout, checked), json);
      notes.push(checked);
    }

    const notebooks = digest(snapshot.notebooks);
    if (verify || notebooks !== previous?.notebooks)
      await writeAtomic(notebookFile(layout, notebooks), snapshot.notebooks);
    const tags = digest(snapshot.tags);
    if (verify || tags !== previous?.tags)
      await writeAtomic(tagFile(layout, tags), snapshot.tags);

    const imagesDirectory = path.join(this.userData, 'images');
    const images = (
      await readdir(imagesDirectory).catch((error: unknown) => {
        if (hasFileError(error, 'ENOENT')) return [];
        throw error;
      })
    )
      .filter((name) => imageFileName.test(name))
      .sort();
    const previousImages = new Set(previous?.images);
    for (const name of images) {
      if (!verify && previousImages.has(name)) continue;
      const bytes = await readManagedImage(imagesDirectory, name);
      await writeAtomic(path.join(layout.images, name), bytes);
    }
    if (
      !verify &&
      previous &&
      previous.version === 2 &&
      notebooks === previous.notebooks &&
      tags === previous.tags &&
      notes.length === previous.notes.length &&
      notes.every((note) => {
        const prior = previousNotes.get(note.id);
        return prior && noteFileName(note) === noteFileName(prior);
      }) &&
      JSON.stringify(snapshot.recoveries) ===
        JSON.stringify(previous.recoveries) &&
      images.length === previous.images.length &&
      images.every((name) => previousImages.has(name))
    ) {
      return previous.completedAt;
    }
    const completedAt = new Date().toISOString();
    const manifest: Manifest = {
      format: 'inknote-backup',
      version: 2,
      owner: this.owner,
      completedAt,
      notebooks,
      tags,
      notes,
      recoveries: snapshot.recoveries,
      images,
    };
    await this.commitManifest(
      layout.manifest,
      JSON.stringify(manifest),
      index?.json,
    );

    // Each changed document is written before publishing its manifest. Old
    // revisions are disposable only after that commit.
    if (previous) {
      const currentNotes = new Set(notes.map(noteFileName));
      const obsolete = previous.notes
        .filter((note) => !currentNotes.has(noteFileName(note)))
        .map((note) => noteFile(layout, note));
      if (previous.notebooks !== notebooks)
        obsolete.push(notebookFile(layout, previous.notebooks));
      if (previous.tags && previous.tags !== tags)
        obsolete.push(tagFile(layout, previous.tags));
      for (const file of obsolete)
        await rm(file, { force: true }).catch(() => {});
    }
    return completedAt;
  }

  private async commitManifest(
    file: string,
    json: string,
    previous?: string,
  ): Promise<void> {
    if (previous === undefined) return writeAtomic(file, json);
    const staged = path.join(
      path.dirname(file),
      `.manifest-${randomUUID()}.tmp`,
    );
    try {
      await writeAtomic(staged, json);
      // SQLite serializes the short commit across processes using this profile.
      this.library.withWriteLock(() => {
        const current = lstatSync(file);
        if (
          !current.isFile() ||
          current.size !== Buffer.byteLength(previous) ||
          readFileSync(file, 'utf8') !== previous
        )
          throw new Error('Another backup committed first.');
        renameSync(staged, file);
      });
    } finally {
      await rm(staged, { force: true });
    }
  }

  async read(directory: string) {
    const root = await realpath(directory);
    const { manifest, json: original } = await readManifest(root);
    const layout = await checkedLayout(root);
    const books = await readRegularFile(
      notebookFile(layout, manifest.notebooks),
      maxIndexBytes,
    );
    if (digest(books) !== manifest.notebooks)
      throw new Error('Invalid notebook backup.');
    const notebooks = orderNotebooks(
      z.array(notebookRecordSchema).parse(JSON.parse(books.toString())),
    );
    let tags: TagRecord[] = [];
    if (manifest.tags) {
      const tagJson = await readRegularFile(
        tagFile(layout, manifest.tags),
        maxIndexBytes,
      );
      if (digest(tagJson) !== manifest.tags)
        throw new Error('Invalid tag backup.');
      tags = z.array(tagRecordSchema).parse(JSON.parse(tagJson.toString()));
    }
    const ids = new Set<string>();
    const notes = [];
    for (const version of manifest.notes) {
      const json = await readRegularFile(
        noteFile(layout, version),
        7 * 1024 * 1024,
      );
      if ('sha256' in version && digest(json) !== version.sha256)
        throw new Error('Invalid note backup checksum.');
      const note = backedUpNoteSchema.parse(JSON.parse(json.toString()));
      if (
        ids.has(note.id) ||
        note.id !== version.id ||
        note.revision !== version.revision ||
        (note.deletedAt !== null) !== version.trashed
      )
        throw new Error('Invalid note backup.');
      ids.add(note.id);
      notes.push(note);
    }
    if (new Set(manifest.images).size !== manifest.images.length)
      throw new Error('Duplicate attachment.');
    const latest = await readRegularFile(layout.manifest, maxIndexBytes);
    if (latest.toString() !== original)
      throw new Error('Backup is being updated.');
    return { notebooks, notes, tags, manifest, images: layout.images };
  }

  async restore(backup: Awaited<ReturnType<BackupFiles['read']>>) {
    const staged = await mkdtemp(path.join(this.userData, '.restore-'));
    try {
      for (const name of backup.manifest.images) {
        const bytes = await readManagedImage(backup.images, name);
        await writeAtomic(path.join(staged, name), bytes);
      }
      const images = path.join(this.userData, 'images');
      await mkdir(images, { recursive: true, mode: 0o700 });
      await requireDirectory(images);
      // Content-addressed attachments are safe to reuse even if the SQLite
      // transaction later fails. Commit notes only when every image is present.
      for (const name of backup.manifest.images) {
        const bytes = await readManagedImage(staged, name);
        await writeAtomic(path.join(images, name), bytes);
      }
      return this.library.restore(
        backup.notebooks,
        backup.notes,
        backup.tags,
        backup.manifest.version === 2 ? backup.manifest.recoveries : [],
      );
    } finally {
      await rm(staged, { recursive: true, force: true });
    }
  }

  private async requireOutsideProfile(directory: string): Promise<void> {
    // Resolve both paths through the same API to normalize Windows short names.
    const profile = await realpath(this.userData);
    const relative = path.relative(profile, directory);
    if (
      !relative ||
      (relative !== '..' &&
        !relative.startsWith(`..${path.sep}`) &&
        !path.isAbsolute(relative))
    )
      throw new Error('Choose a backup location outside the InkNote profile.');
  }
}

function backupLayout(directory: string) {
  return {
    manifest: path.join(directory, 'state', 'manifest.json'),
    notebooks: path.join(directory, 'data', 'notebooks'),
    notes: path.join(directory, 'data', 'notes'),
    trash: path.join(directory, '_deleted', 'notes'),
    images: path.join(directory, 'data', 'images'),
  };
}
type Layout = ReturnType<typeof backupLayout>;

async function checkedLayout(directory: string): Promise<Layout> {
  const layout = backupLayout(directory);
  for (const child of [
    directory,
    path.dirname(layout.manifest),
    path.dirname(layout.notes),
    path.dirname(layout.trash),
    layout.notebooks,
    layout.notes,
    layout.trash,
    layout.images,
  ])
    await requireDirectory(child);
  return layout;
}

async function readManifest(directory: string): Promise<ManifestFile> {
  await requireDirectory(directory);
  const { manifest } = backupLayout(directory);
  await requireDirectory(path.dirname(manifest));
  const json = (await readRegularFile(manifest, maxIndexBytes)).toString();
  return { manifest: manifestSchema.parse(JSON.parse(json)), json };
}

function noteFileName(note: NoteVersion & { sha256?: string }): string {
  // Version 2 writes new content before switching the manifest. Never replace
  // bytes still referenced by the last committed snapshot, even on verification.
  return `${note.id}.${note.revision}.${note.trashed ? 'trash.' : ''}${note.sha256 ? `${note.sha256}.` : ''}json`;
}

function noteFile(
  layout: Layout,
  note: NoteVersion & { sha256?: string },
): string {
  return path.join(
    note.trashed ? layout.trash : layout.notes,
    noteFileName(note),
  );
}

function notebookFile(layout: Layout, checksum: string): string {
  return path.join(layout.notebooks, `${checksum}.json`);
}

function tagFile(layout: Layout, checksum: string): string {
  return path.join(path.dirname(layout.notebooks), `tags.${checksum}.json`);
}
