import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { CollectionKind } from '../domain/library';

export type MainTabParamList = {
  Home: undefined;
  Libreria: undefined;
  Cerca: undefined;
  Impostazioni: undefined;
};

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
  LessonRecap: { kind: 'album' | 'folder' | 'track'; id: string };
  NoteHeat: { trackId: string };
};

/** Nested tab screen that can still open stack routes (Player, Collection, Settings, …). */
export type MainTabNavigation<RouteName extends keyof MainTabParamList = keyof MainTabParamList> =
  CompositeNavigationProp<
    BottomTabNavigationProp<MainTabParamList, RouteName>,
    NativeStackNavigationProp<RootStackParamList>
  >;
