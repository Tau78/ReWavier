import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';

import { colors } from '../../theme/colors';

const DEFAULT_ROW = 68;

export type ReorderableItem = {
  id: string;
  rowHeight?: number;
  /** When false, long-press drag is disabled for this row. Default true. */
  draggable?: boolean;
};

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
  const onReorderRef = useRef(onReorder);
  const onDropOnRef = useRef(onDropOn);
  const onDraggingChangeRef = useRef(onDraggingChange);
  idsRef.current = ids;
  onReorderRef.current = onReorder;
  onDropOnRef.current = onDropOn;
  onDraggingChangeRef.current = onDraggingChange;
  fallbackRef.current = Object.fromEntries(items.map((item) => [item.id, item.rowHeight ?? DEFAULT_ROW]));

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
      let acc = 0;
      let to = current.length - 1;
      let hoverId: string | null = null;
      let foundTo = false;
      for (let index = 0; index < current.length; index += 1) {
        const id = current[index];
        const height = heightOf(id);
        const next = acc + height;
        const inset = Math.min(18, height * 0.28);
        if (id !== _id && pointer >= acc + inset && pointer <= next - inset) {
          hoverId = id;
        }
        if (!foundTo && pointer < (acc + next) / 2) {
          to = index;
          foundTo = true;
        }
        acc = next;
      }
      dropOnIdRef.current = hoverId;
      setDropOnId(hoverId);
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
    // `to` is computed against the list still including `from`; after removal, shift down.
    nextIds.splice(to > from ? to - 1 : to, 0, moved);
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
          if (from < to && index > from && index <= to) {
            rowShift = -activeHeight;
          } else if (from > to && index >= to && index < from) {
            rowShift = activeHeight;
          }
        }
        return (
          <DraggableRow
            key={id}
            id={id}
            dragging={dragging}
            dropTarget={dropOnId === id}
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
    backgroundColor: 'rgba(255, 107, 53, 0.16)',
    borderRadius: 12,
  },
});
