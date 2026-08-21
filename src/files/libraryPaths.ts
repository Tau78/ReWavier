import { Directory, Paths } from 'expo-file-system';

export function libraryDirectory(): Directory {
  const dir = new Directory(Paths.document, 'rewavier');
  if (!dir.exists) {
    dir.create();
  }
  return dir;
}
