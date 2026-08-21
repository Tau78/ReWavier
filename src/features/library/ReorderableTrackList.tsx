import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';

import type { Track } from '../../domain/models';
import { colors } from '../../theme/colors';

const DEFAULT_ROW = 68;

export function ReorderableTrackList({
  tracks,
  enabled,
  onDraggingChange,
  onReorder,
  renderItem,
}: {
  tracks: Track[];
  enabled: boolean;
  onDraggingChange?: (dragging: boolean) => void;
  onReorder: (trackIds: string[]) => void;
  renderItem: (track: Track, dragging: boolean) => React.ReactNode;
}) {
  const [ids, setIds] = useState(tracks.map((track) => track.id));
  const [activeId, setActiveId] = useState<string | null>(null);
  const [shiftY, setShiftY] = useState(0);
  const idsRef = useRef(ids);
  const originIds = useRef(ids);
  const originIndex = useRef(0);
  const draggingRef = useRef(false);
  const rowHeight = useRef(DEFAULT_ROW);
  const onReorderRef = useRef(onReorder);
  const onDraggingChangeRef = useRef(onDraggingChange);
  idsRef.current = ids;
  onReorderRef.current = onReorder;
  onDraggingChangeRef.current = onDraggingChange;

  useEffect(() => {
    if (activeId) {
      return;
    }
    setIds(tracks.map((track) => track.id));
  }, [tracks, activeId]);

  const onDragStart = useCallback((id: string) => {
    originIds.current = idsRef.current;
    originIndex.current = idsRef.current.indexOf(id);
    draggingRef.current = true;
    setActiveId(id);
    setShiftY(0);
    onDraggingChangeRef.current?.(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, []);

  const onDragMove = useCallback((_id: string, translationY: number) => {
    setShiftY(translationY);
    const to = Math.max(
      0,
      Math.min(
        originIds.current.length - 1,
        originIndex.current + Math.round(translationY / rowHeight.current),
      ),
    );
    const next = [...originIds.current];
    const [moved] = next.splice(originIndex.current, 1);
    if (!moved) {
      return;
    }
    next.splice(to, 0, moved);
    setIds((current) => (sameIds(current, next) ? current : next));
  }, []);

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

  const onRowLayout = useCallback((height: number) => {
    if (height > 0) {
      rowHeight.current = height;
    }
  }, []);

  if (!enabled) {
    return <>{tracks.map((track) => renderItem(track, false))}</>;
  }

  return (
    <View>
      {ids.map((id) => {
        const track = tracks.find((item) => item.id === id);
        if (!track) {
          return null;
        }
        return (
          <DraggableRow
            key={id}
            track={track}
            dragging={activeId === id}
            shiftY={activeId === id ? shiftY : 0}
            onDragStart={onDragStart}
            onDragMove={onDragMove}
            onDragEnd={onDragEnd}
            onRowLayout={onRowLayout}
          >
            {renderItem(track, activeId === id)}
          </DraggableRow>
        );
      })}
    </View>
  );
}

function DraggableRow({
  track,
  dragging,
  shiftY,
  onDragStart,
  onDragMove,
  onDragEnd,
  onRowLayout,
  children,
}: {
  track: Track;
  dragging: boolean;
  shiftY: number;
  onDragStart: (id: string) => void;
  onDragMove: (id: string, translationY: number) => void;
  onDragEnd: () => void;
  onRowLayout: (height: number) => void;
  children: React.ReactNode;
}) {
  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .activateAfterLongPress(280)
        .runOnJS(true)
        .onStart(() => onDragStart(track.id))
        .onUpdate((event) => onDragMove(track.id, event.translationY))
        .onFinalize(() => onDragEnd()),
    [track.id, onDragStart, onDragMove, onDragEnd],
  );

  return (
    <GestureDetector gesture={gesture}>
      <View
        onLayout={(event) => onRowLayout(event.nativeEvent.layout.height)}
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
