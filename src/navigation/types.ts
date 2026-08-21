import type { CollectionKind } from '../domain/library';

export type RootStackParamList = {
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
};
