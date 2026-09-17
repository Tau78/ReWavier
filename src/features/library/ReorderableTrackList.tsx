import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';

import { colors } from '../../theme/colors';

const DEFAULT_ROW = 68;

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
};

function edgeInset(height: number, role: DropRole | undefined): number {
  if (role === 'folder') {
    // Almost the whole folder row is "drop into"; tiny edges keep reorder available.
    return Math.min(8, Math.max(4, height * 0.12));
  }
  if (role === 'none') {
    return height;
  }
  // Tracks: clearer top/bottom bands for move vs center for "create folder".
  return Math.min(22, Math.max(16, height * 0.32));
}

function dropLabelFor(role: DropRole | undefined): string | null {
  if (role === 'folder') {
    return 'Metti nella cartella';
  }
  if (role === 'group') {
    return 'Crea cartella';
  }
  return null;
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
  const onReorderRef = useRef(onReorder);
  const onDropOnRef = useRef(onDropOn);
  const onDraggingChangeRef = useRef(onDraggingChange);
  idsRef.current = ids;
  onReorderRef.current = onReorder;
  onDropOnRef.current = onDropOn;
  onDraggingChangeRef.current = onDraggingChange;
  fallbackRef.current = Object.fromEntries(items.map((item) => [item.id, item.rowHeight ?? DEFAULT_ROW]));
  dropRoleRef.current = Object.fromEntries(items.map((item) => [item.id, item.dropRole]));

  useEffect(() => {
    if (activeId) {
      return;
    }
    setIds(items.map((item) => item.id));
  }, [items, activeId]);

  const heightOf = useCallback((id: string) => {
    return heightsRef.current[id] ?? fallbackRef.current[id] ?? DEFAULT_ROW;
  }, []);

  const onDragStart = useCallback((id: string) => {
    originIds.current = idsRef.current;
    originIndex.current = idsRef.current.indexOf(id);
    insertIndexRef.current = originIndex.current;
    draggingRef.current = true;
    setActiveId(id);
    setDropOnId(null);
    setShiftY(0);
    setInsertIndex(originIndex.current);
    onDraggingChangeRef.current?.(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, []);

  const onDragMove = useCallback(
    (_id: string, translationY: number) => {
      setShiftY(translationY);
      const current = originIds.current;
      const from = originIndex.current;
      if (from < 0) {
        return;
      }
      const originMid =
        current.slice(0, from).reduce((sum, id) => sum + heightOf(id), 0) + heightOf(current[from]) / 2;
      const pointer = originMid + translationY;
      const canDropOn = onDropOnRef.current != null;
      let acc = 0;
      let to = current.length;
      let hoverId: string | null = null;
      let foundTo = false;
      for (let index = 0; index < current.length; index += 1) {
        const id = current[index];
        const height = heightOf(id);
        const next = acc + height;
        const role = dropRoleRef.current[id];
        if (canDropOn && id !== _id && role !== 'none') {
          const inset = edgeInset(height, role);
          if (pointer >= acc + inset && pointer <= next - inset) {
            hoverId = id;
          }
        }
        if (!foundTo && pointer < (acc + next) / 2) {
          to = index;
          foundTo = true;
        }
        acc = next;
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
    const to = insertIndexRef.current;
    dropOnIdRef.current = null;
    setActiveId(null);
    setDropOnId(null);
    setShiftY(0);
    setInsertIndex(0);
    onDraggingChangeRef.current?.(false);
    if (sourceId && targetId && onDropOnRef.current?.(sourceId, targetId)) {
      setIds(originIds.current);
      return;
    }
    const nextIds = [...originIds.current];
    const [moved] = nextIds.splice(from, 1);
    if (!moved) {
      return;
    }
    // `to` is an insert-before index in the list still including `from`.
    const insertAt = Math.min(nextIds.length, to > from ? to - 1 : to);
    nextIds.splice(insertAt, 0, moved);
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
  const to = activeId ? (dropOnId ? from : insertIndex) : -1;
  const activeHeight = activeId ? heightOf(activeId) : 0;
  const originTop =
    activeId && from >= 0
      ? originIds.current.slice(0, from).reduce((sum, id) => sum + heightOf(id), 0)
      : 0;
  const activeItem = activeId ? byId.get(activeId) : undefined;
  const previewInsertAt =
    activeId && from >= 0 && !dropOnId
      ? to > from
        ? to - 1
        : to
      : from;
  const showInsertSlot = Boolean(activeId && from >= 0 && !dropOnId && previewInsertAt !== from);
  // When moving down, rows in (from, to) shift up; the empty slot lands before `to`.
  const gapTop = showInsertSlot
    ? from < to
      ? originIds.current.slice(0, to).reduce((sum, id) => sum + heightOf(id), 0) - activeHeight
      : originIds.current.slice(0, to).reduce((sum, id) => sum + heightOf(id), 0)
    : -1;

  return (
    <View style={styles.list}>
      {ids.map((id, index) => {
        const item = byId.get(id);
        if (!item) {
          return null;
        }
        const dragging = activeId === id;
        let rowShift = 0;
        if (activeId && from >= 0 && !dropOnId && index !== from) {
          // Moving down: shift the open interval (from, to) up — not `to` itself —
          // so the gap sits where the item will land (insert-before `to`).
          if (from < to && index > from && index < to) {
            rowShift = -activeHeight;
          } else if (from > to && index >= to && index < from) {
            rowShift = activeHeight;
          }
        }
        const isDropTarget = dropOnId === id;
        return (
          <DraggableRow
            key={id}
            id={id}
            dragging={dragging}
            dropTarget={isDropTarget}
            dropLabel={isDropTarget ? dropLabelFor(item.dropRole ?? 'group') : null}
            shiftY={rowShift}
            enabled={item.draggable !== false}
            onDragStart={onDragStart}
            onDragMove={onDragMove}
            onDragEnd={onDragEnd}
            onRowLayout={onRowLayout}
          >
            {renderItem(item, dragging)}
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
              height: Math.max(activeHeight, 44),
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
          <View style={styles.ghostInner}>{renderItem(activeItem, true)}</View>
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
        style={[
          dropTarget && styles.dropTarget,
          dragging && styles.placeholder,
          { transform: [{ translateY: shiftY }] },
        ]}
      >
        {children}
        {dropTarget && dropLabel ? (
          <View pointerEvents="none" style={styles.dropOverlay}>
            <Text style={styles.dropOverlayLabel}>{dropLabel}</Text>
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
  dropTarget: {
    backgroundColor: 'rgba(255, 107, 53, 0.22)',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.accent,
  },
  dropOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 107, 53, 0.28)',
    borderRadius: 10,
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
    backgroundColor: 'rgba(255, 107, 53, 0.10)',
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
