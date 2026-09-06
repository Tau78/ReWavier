import type { CollectionKind } from '../domain/library';

export type RootStackParamList = {
  Home: undefined;
  Library: undefined;
  Player: undefined;
  Collection: { kind: CollectionKind; id: string };
  Conditions: { id?: string };
  Settings: undefined;
  Help: undefined;
  Privacy: undefined;
  Discovery: undefined;
  ReplaceFile: { trackId?: string; albumId?: string };
  DriveFolder: { albumId?: string };
  SyncReview: undefined;
  RecordSketch: { folderId?: string; albumId?: string };
  LessonRecap: { kind: 'album' | 'folder' | 'track'; id: string };
  DawExport: { trackId: string };
  NoteHeat: { trackId: string };
  PdfPreview: { fileUri: string; name: string };
};
