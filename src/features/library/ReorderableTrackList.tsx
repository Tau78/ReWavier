import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';

import { colors } from '../../theme/colors';

const DEFAULT_ROW = 68;
const FOLDER_EDGE_INSET_MAX = 8;
const FOLDER_EDGE_INSET_MIN = 4;
const FOLDER_EDGE_INSET_RATIO = 0.12;
const GROUP_EDGE_INSET_MAX = 22;
const GROUP_EDGE_INSET_MIN = 16;
const GROUP_EDGE_INSET_RATIO = 0.32;
const INSERT_SLOT_MIN_HEIGHT = 44;
const ACCENT_FILL_STRONG = 'rgba(255, 107, 53, 0.28)';
const ACCENT_FILL_SOFT = 'rgba(255, 107, 53, 0.10)';

export type DropRole = 'group' | 'folder' | 'none';

export type ReorderableItem = {
  id: string;
  rowHeight?: number;
  /** When false, long-press drag is disabled for this row. Default true. */
  draggable?: boolean;
  /**
   * How dropping *on* this row behaves (only when `onDropOn` is set):
   * - group: track-on-track → create a version folder
   * - folder: drop into an existing version folder (header or child)
   * - none: never a drop-on target (separators)
   */
  dropRole?: DropRole;
  /** Dragging this row also moves the following rows with matching `packParentId`. */
  packWithChildren?: boolean;
  /** Belongs to an open pack led by this parent id (version-track under a folder). */
  packParentId?: string;
};

function edgeInset(height: number, role: DropRole | undefined): number {
  if (role === 'folder') {
    return Math.min(
      FOLDER_EDGE_INSET_MAX,
      Math.max(FOLDER_EDGE_INSET_MIN, height * FOLDER_EDGE_INSET_RATIO),
    );
  }
  if (role === 'none') {
    return height;
  }
  return Math.min(
    GROUP_EDGE_INSET_MAX,
    Math.max(GROUP_EDGE_INSET_MIN, height * GROUP_EDGE_INSET_RATIO),
  );
}

/** Labels follow applyAlbumVersionDrop, not target alone. */
function dropLabelFor(
  sourceRole: DropRole | undefined,
  targetRole: DropRole | undefined,
): string | null {
  if (!sourceRole || !targetRole || sourceRole === 'none' || targetRole === 'none') {
    return null;
  }
  if (sourceRole === 'folder' && targetRole === 'folder') {
    return 'Unisci cartelle';
  }
  if (targetRole === 'folder' || sourceRole === 'folder') {
    return 'Metti nella cartella';
  }
  if (sourceRole === 'group' && targetRole === 'group') {
    return 'Crea cartella';
  }
  return null;
}

function prefixHeight(ids: string[], end: number, heightOf: (id: string) => number): number {
  return ids.slice(0, end).reduce((sum, id) => sum + heightOf(id), 0);
}

/** Contiguous pack: folder header + open version-track children below it. */
export function packRangeFor(
  ids: string[],
  from: number,
  itemOf: (id: string) => Pick<ReorderableItem, 'packWithChildren' | 'packParentId'> | undefined,
): { start: number; end: number } {
  if (from < 0 || from >= ids.length) {
    return { start: from, end: from };
  }
  const lead = itemOf(ids[from]!);
  if (!lead?.packWithChildren) {
    return { start: from, end: from };
  }
  const parentId = ids[from]!;
  let end = from;
  for (let index = from + 1; index < ids.length; index += 1) {
    const row = itemOf(ids[index]!);
    if (row?.packParentId === parentId) {
      end = index;
      continue;
    }
    break;
  }
  return { start: from, end };
}

function packHeight(
  ids: string[],
  start: number,
  end: number,
  heightOf: (id: string) => number,
): number {
  let sum = 0;
  for (let index = start; index <= end; index += 1) {
    sum += heightOf(ids[index]!);
  }
  return sum;
}

function movePack(ids: string[], from: number, end: number, to: number): string[] {
  const pack = ids.slice(from, end + 1);
  const without = [...ids.slice(0, from), ...ids.slice(end + 1)];
  const packLen = pack.length;
  // `to` is an insert index in the original list; adjust after removal.
  let insertAt = to;
  if (to > end) {
    insertAt = to - packLen;
  } else if (to > from) {
    insertAt = from;
  }
  insertAt = Math.max(0, Math.min(without.length, insertAt));
  return [...without.slice(0, insertAt), ...pack, ...without.slice(insertAt)];
}

export function ReorderableTrackList<T extends ReorderableItem>({
  items,
  enabled,
  onDraggingChange,
  onReorder,
  onDropOn,
  renderItem,
}: {
  items: T[];
  enabled: boolean;
  onDraggingChange?: (dragging: boolean) => void;
  onReorder: (ids: string[]) => void;
  onDropOn?: (sourceId: string, targetId: string) => boolean;
  renderItem: (item: T, dragging: boolean) => React.ReactNode;
}) {
  const [ids, setIds] = useState(items.map((item) => item.id));
  const [activeId, setActiveId] = useState<string | null>(null);
  const [dropOnId, setDropOnId] = useState<string | null>(null);
  const [shiftY, setShiftY] = useState(0);
  const [insertIndex, setInsertIndex] = useState(0);
  const idsRef = useRef(ids);
  const originIds = useRef(ids);
  const originIndex = useRef(0);
  const insertIndexRef = useRef(0);
  const draggingRef = useRef(false);
  const dropOnIdRef = useRef<string | null>(null);
  const heightsRef = useRef<Record<string, number>>({});
  const fallbackRef = useRef<Record<string, number>>({});
  const dropRoleRef = useRef<Record<string, DropRole | undefined>>({});
  const packMetaRef = useRef<
    Record<string, { packWithChildren?: boolean; packParentId?: string }>
  >({});
  const onReorderRef = useRef(onReorder);
  const onDropOnRef = useRef(onDropOn);
  const onDraggingChangeRef = useRef(onDraggingChange);
  const packEndRef = useRef(0);
  idsRef.current = ids;
  onReorderRef.current = onReorder;
  onDropOnRef.current = onDropOn;
  onDraggingChangeRef.current = onDraggingChange;
  fallbackRef.current = Object.fromEntries(items.map((item) => [item.id, item.rowHeight ?? DEFAULT_ROW]));
  dropRoleRef.current = Object.fromEntries(items.map((item) => [item.id, item.dropRole]));
  packMetaRef.current = Object.fromEntries(
    items.map((item) => [
      item.id,
      { packWithChildren: item.packWithChildren, packParentId: item.packParentId },
    ]),
  );

  useEffect(() => {
    if (activeId) {
      return;
    }
    setIds(items.map((item) => item.id));
  }, [items, activeId]);

  const heightOf = useCallback((id: string) => {
    return heightsRef.current[id] ?? fallbackRef.current[id] ?? DEFAULT_ROW;
  }, []);

  const itemMeta = useCallback((id: string) => packMetaRef.current[id], []);

  const onDragStart = useCallback(
    (id: string) => {
      originIds.current = idsRef.current;
      const from = idsRef.current.indexOf(id);
      originIndex.current = from;
      const pack = packRangeFor(idsRef.current, from, itemMeta);
      packEndRef.current = pack.end;
      insertIndexRef.current = from;
      draggingRef.current = true;
      setActiveId(id);
      setDropOnId(null);
      setShiftY(0);
      setInsertIndex(from);
      onDraggingChangeRef.current?.(true);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    },
    [itemMeta],
  );

  const onDragMove = useCallback(
    (_id: string, translationY: number) => {
      setShiftY(translationY);
      const current = originIds.current;
      const from = originIndex.current;
      const packEnd = packEndRef.current;
      if (from < 0) {
        return;
      }
      const movingHeight = packHeight(current, from, packEnd, heightOf);
      const originMid = prefixHeight(current, from, heightOf) + movingHeight / 2;
      const pointer = originMid + translationY;
      const canDropOn = onDropOnRef.current != null;
      const packIds = new Set(current.slice(from, packEnd + 1));
      let acc = 0;
      let to = current.length;
      let hoverId: string | null = null;
      let foundTo = false;
      for (let index = 0; index < current.length; index += 1) {
        const id = current[index]!;
        const height = heightOf(id);
        const next = acc + height;
        const inPack = packIds.has(id);
        const role = dropRoleRef.current[id];
        if (canDropOn && !inPack && role !== 'none') {
          const inset = edgeInset(height, role);
          if (pointer >= acc + inset && pointer <= next - inset) {
            hoverId = id;
          }
        }
        if (!foundTo && !inPack && pointer < (acc + next) / 2) {
          to = index;
          foundTo = true;
        }
        acc = next;
      }
      if (!foundTo) {
        const packTop = prefixHeight(current, from, heightOf);
        if (pointer >= packTop && pointer < packTop + movingHeight) {
          to = from;
        }
      }
      if (hoverId !== dropOnIdRef.current) {
        if (hoverId) {
          void Haptics.selectionAsync();
        }
        dropOnIdRef.current = hoverId;
        setDropOnId(hoverId);
      }
      const nextInsert = hoverId ? from : to;
      insertIndexRef.current = nextInsert;
      setInsertIndex((existing) => (existing === nextInsert ? existing : nextInsert));
    },
    [heightOf],
  );

  const onDragEnd = useCallback(() => {
    if (!draggingRef.current) {
      return;
    }
    draggingRef.current = false;
    const sourceId = originIds.current[originIndex.current];
    const targetId = dropOnIdRef.current;
    const from = originIndex.current;
    const packEnd = packEndRef.current;
    const to = insertIndexRef.current;
    dropOnIdRef.current = null;
    setActiveId(null);
    setDropOnId(null);
    setShiftY(0);
    setInsertIndex(0);
    onDraggingChangeRef.current?.(false);

    if (sourceId && targetId && onDropOnRef.current) {
      if (onDropOnRef.current(sourceId, targetId)) {
        setIds(originIds.current);
        return;
      }
      // Drop was offered in UI but domain/store refused — do not pretend a move.
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setIds(originIds.current);
      return;
    }

    if (from < 0 || packEnd < from) {
      return;
    }
    const nextIds = movePack(originIds.current, from, packEnd, to);
    const unchanged =
      nextIds.length === originIds.current.length &&
      nextIds.every((id, index) => id === originIds.current[index]);
    if (unchanged) {
      setIds(originIds.current);
      return;
    }
    setIds(nextIds);
    onReorderRef.current(nextIds);
  }, []);

  const onRowLayout = useCallback((id: string, height: number) => {
    if (height > 0) {
      heightsRef.current[id] = height;
    }
  }, []);

  if (!enabled) {
    return <>{items.map((item) => renderItem(item, false))}</>;
  }

  const byId = new Map(items.map((item) => [item.id, item]));
  const from = activeId ? originIndex.current : -1;
  const packEnd = activeId ? packEndRef.current : -1;
  const to = activeId ? (dropOnId ? from : insertIndex) : -1;
  const movingHeight =
    activeId && from >= 0 && packEnd >= from
      ? packHeight(originIds.current, from, packEnd, heightOf)
      : 0;
  const originTop = activeId && from >= 0 ? prefixHeight(originIds.current, from, heightOf) : 0;
  const activeItem = activeId ? byId.get(activeId) : undefined;
  const sourceRole = activeId ? dropRoleRef.current[activeId] : undefined;
  const previewInsertAt =
    activeId && from >= 0 && !dropOnId ? (to > packEnd ? to - (packEnd - from + 1) : to) : from;
  const showInsertSlot = Boolean(
    activeId && from >= 0 && !dropOnId && previewInsertAt !== from,
  );
  const gapTop = showInsertSlot
    ? from < to
      ? prefixHeight(originIds.current, to, heightOf) - movingHeight
      : prefixHeight(originIds.current, to, heightOf)
    : -1;
  const packIdSet =
    activeId && from >= 0 && packEnd >= from
      ? new Set(originIds.current.slice(from, packEnd + 1))
      : null;

  return (
    <View style={styles.list}>
      {ids.map((id, index) => {
        const item = byId.get(id);
        if (!item) {
          return null;
        }
        const dragging = packIdSet ? packIdSet.has(id) : activeId === id;
        let rowShift = 0;
        if (activeId && from >= 0 && packEnd >= from && !dropOnId && !dragging) {
          if (from < to && index > packEnd && index < to) {
            rowShift = -movingHeight;
          } else if (from > to && index >= to && index < from) {
            rowShift = movingHeight;
          }
        }
        const isDropTarget = dropOnId === id;
        return (
          <DraggableRow
            key={id}
            id={id}
            dragging={dragging}
            dropTarget={isDropTarget}
            dropLabel={isDropTarget ? dropLabelFor(sourceRole, item.dropRole) : null}
            shiftY={rowShift}
            enabled={item.draggable !== false}
            onDragStart={onDragStart}
            onDragMove={onDragMove}
            onDragEnd={onDragEnd}
            onRowLayout={onRowLayout}
          >
            {renderItem(item, dragging && id === activeId)}
          </DraggableRow>
        );
      })}
      {showInsertSlot && gapTop >= 0 ? (
        <View
          pointerEvents="none"
          style={[
            styles.insertSlot,
            {
              top: gapTop,
              height: Math.max(movingHeight, INSERT_SLOT_MIN_HEIGHT),
            },
          ]}
        >
          <View style={styles.insertSlotInner}>
            <View style={styles.insertLine} />
            <Text style={styles.insertLabel}>Sposta qui</Text>
            <View style={styles.insertLine} />
          </View>
        </View>
      ) : null}
      {activeId && activeItem ? (
        <View
          pointerEvents="none"
          style={[
            styles.ghost,
            {
              top: originTop,
              transform: [{ translateY: shiftY }],
            },
          ]}
        >
          <View style={styles.ghostInner}>
            {(packIdSet ? originIds.current.filter((id) => packIdSet.has(id)) : [activeId]).map(
              (id) => {
                const item = byId.get(id);
                if (!item) {
                  return null;
                }
                return <View key={id}>{renderItem(item, id === activeId)}</View>;
              },
            )}
          </View>
        </View>
      ) : null}
    </View>
  );
}

function DraggableRow({
  id,
  dragging,
  dropTarget,
  dropLabel,
  shiftY,
  enabled,
  onDragStart,
  onDragMove,
  onDragEnd,
  onRowLayout,
  children,
}: {
  id: string;
  dragging: boolean;
  dropTarget: boolean;
  dropLabel: string | null;
  shiftY: number;
  enabled: boolean;
  onDragStart: (id: string) => void;
  onDragMove: (id: string, translationY: number) => void;
  onDragEnd: () => void;
  onRowLayout: (id: string, height: number) => void;
  children: React.ReactNode;
}) {
  const gesture = useMemo(() => {
    const pan = Gesture.Pan()
      .activateAfterLongPress(280)
      .runOnJS(true)
      .onStart(() => onDragStart(id))
      .onUpdate((event) => onDragMove(id, event.translationY))
      .onFinalize(() => onDragEnd());
    return enabled ? pan : Gesture.Pan().enabled(false);
  }, [id, enabled, onDragStart, onDragMove, onDragEnd]);

  return (
    <GestureDetector gesture={gesture}>
      <View
        onLayout={(event) => onRowLayout(id, event.nativeEvent.layout.height)}
        style={[dragging && styles.placeholder, { transform: [{ translateY: shiftY }] }]}
      >
        {children}
        {dropTarget ? (
          <View pointerEvents="none" style={styles.dropOverlay}>
            {dropLabel ? <Text style={styles.dropOverlayLabel}>{dropLabel}</Text> : null}
          </View>
        ) : null}
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  list: {
    position: 'relative',
  },
  placeholder: {
    opacity: 0,
  },
  ghost: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 20,
    elevation: 8,
  },
  ghostInner: {
    backgroundColor: colors.surfaceRaised,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
  },
  dropOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ACCENT_FILL_STRONG,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.accent,
  },
  dropOverlayLabel: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: colors.accent,
  },
  insertSlot: {
    position: 'absolute',
    left: 8,
    right: 8,
    zIndex: 15,
    elevation: 6,
    justifyContent: 'center',
  },
  insertSlotInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 6,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.accent,
    backgroundColor: ACCENT_FILL_SOFT,
  },
  insertLine: {
    flex: 1,
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.accent,
    opacity: 0.85,
  },
  insertLabel: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '700',
  },
});
