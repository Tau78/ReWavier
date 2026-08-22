import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';

import { colors } from '../../theme/colors';

const DEFAULT_ROW = 68;

export type ReorderableItem = {
  id: string;
  rowHeight?: number;
};

export function ReorderableTrackList<T extends ReorderableItem>({
  items,
  enabled,
  onDraggingChange,
  onReorder,
  renderItem,
}: {
  items: T[];
  enabled: boolean;
  onDraggingChange?: (dragging: boolean) => void;
  onReorder: (ids: string[]) => void;
  renderItem: (item: T, dragging: boolean) => React.ReactNode;
}) {
  const [ids, setIds] = useState(items.map((item) => item.id));
  const [activeId, setActiveId] = useState<string | null>(null);
  const [shiftY, setShiftY] = useState(0);
  const idsRef = useRef(ids);
  const originIds = useRef(ids);
  const originIndex = useRef(0);
  const draggingRef = useRef(false);
  const heightsRef = useRef<Record<string, number>>({});
  const fallbackRef = useRef<Record<string, number>>({});
  const onReorderRef = useRef(onReorder);
  const onDraggingChangeRef = useRef(onDraggingChange);
  idsRef.current = ids;
  onReorderRef.current = onReorder;
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
    draggingRef.current = true;
    setActiveId(id);
    setShiftY(0);
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
      for (let index = 0; index < current.length; index += 1) {
        const next = acc + heightOf(current[index]);
        if (pointer < (acc + next) / 2) {
          to = index;
          break;
        }
        acc = next;
      }
      const nextIds = [...current];
      const [moved] = nextIds.splice(from, 1);
      if (!moved) {
        return;
      }
      nextIds.splice(to, 0, moved);
      setIds((existing) => (sameIds(existing, nextIds) ? existing : nextIds));
    },
    [heightOf],
  );

  const onDragEnd = useCallback(() => {
    if (!draggingRef.current) {
      return;
    }
    draggingRef.current = false;
    setActiveId(null);
    setShiftY(0);
    onDraggingChangeRef.current?.(false);
    onReorderRef.current(idsRef.current);
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

  return (
    <View>
      {ids.map((id) => {
        const item = byId.get(id);
        if (!item) {
          return null;
        }
        return (
          <DraggableRow
            key={id}
            id={id}
            dragging={activeId === id}
            shiftY={activeId === id ? shiftY : 0}
            onDragStart={onDragStart}
            onDragMove={onDragMove}
            onDragEnd={onDragEnd}
            onRowLayout={onRowLayout}
          >
            {renderItem(item, activeId === id)}
          </DraggableRow>
        );
      })}
    </View>
  );
}

function DraggableRow({
  id,
  dragging,
  shiftY,
  onDragStart,
  onDragMove,
  onDragEnd,
  onRowLayout,
  children,
}: {
  id: string;
  dragging: boolean;
  shiftY: number;
  onDragStart: (id: string) => void;
  onDragMove: (id: string, translationY: number) => void;
  onDragEnd: () => void;
  onRowLayout: (id: string, height: number) => void;
  children: React.ReactNode;
}) {
  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .activateAfterLongPress(280)
        .runOnJS(true)
        .onStart(() => onDragStart(id))
        .onUpdate((event) => onDragMove(id, event.translationY))
        .onFinalize(() => onDragEnd()),
    [id, onDragStart, onDragMove, onDragEnd],
  );

  return (
    <GestureDetector gesture={gesture}>
      <View
        onLayout={(event) => onRowLayout(id, event.nativeEvent.layout.height)}
        style={[dragging && styles.dragging, dragging && { transform: [{ translateY: shiftY }] }]}
      >
        {children}
      </View>
    </GestureDetector>
  );
}

function sameIds(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

const styles = StyleSheet.create({
  dragging: {
    zIndex: 4,
    elevation: 6,
    backgroundColor: colors.surfaceRaised,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
  },
});
