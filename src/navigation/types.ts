import type { CollectionKind } from '../domain/library';

export type RootStackParamList = {
  Home: undefined;
  Library: undefined;
  Player: undefined;
  Collection: { kind: CollectionKind; id: string };
  Conditions: { id?: string };
  Settings: undefined;
  Privacy: undefined;
  Discovery: undefined;
  ReplaceFile: { trackId?: string; albumId?: string };
  DriveFolder: { albumId?: string };
  SyncReview: undefined;
  RecordSketch: { folderId?: string; albumId?: string };
  LessonRecap: { kind: 'album' | 'folder' | 'track'; id: string };
  NoteHeat: { trackId: string };
};
