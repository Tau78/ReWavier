import { useMemo, useRef, type ReactNode, type RefObject } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';

import { colors } from '../../theme/colors';

export type HomeDropKind = 'folder' | 'album';

export type HomeDropTarget = {
  key: string;
  kind: HomeDropKind;
  id: string;
  name: string;
  trackIds: string[];
};

type Rect = { x: number; y: number; w: number; h: number };

export function remesureDropTargets(
  nodes: RefObject<Map<string, View | null>>,
  rects: RefObject<Map<string, Rect>>,
) {
  nodes.current.forEach((node, key) => {
    node?.measureInWindow((x, y, w, h) => {
      rects.current.set(key, { x, y, w, h });
    });
  });
}

export function targetAtPoint(
  pageX: number,
  pageY: number,
  rects: Map<string, Rect>,
  targets: HomeDropTarget[],
): HomeDropTarget | null {
  for (const target of targets) {
    const rect = rects.get(target.key);
    if (!rect) {
      continue;
    }
    if (pageX >= rect.x && pageX <= rect.x + rect.w && pageY >= rect.y && pageY <= rect.y + rect.h) {
      return target;
    }
  }
  return null;
}

export function HomeDropTargetBox({
  dropKey,
  highlighted,
  rects,
  nodes,
  children,
}: {
  dropKey: string;
  highlighted: boolean;
  rects: RefObject<Map<string, Rect>>;
  nodes: RefObject<Map<string, View | null>>;
  children: ReactNode;
}) {
  const measure = (node: View | null) => {
    nodes.current.set(dropKey, node);
    node?.measureInWindow((x, y, w, h) => {
      rects.current.set(dropKey, { x, y, w, h });
    });
  };

  return (
    <View
      ref={measure}
      onLayout={() => measure(nodes.current.get(dropKey) ?? null)}
      collapsable={false}
      style={highlighted ? styles.dropHover : undefined}
    >
      {children}
    </View>
  );
}

export function HomeDraggableTrack({
  trackId,
  onMove,
  onEnd,
  children,
}: {
  trackId: string;
  onMove: (trackId: string, pageX: number, pageY: number) => void;
  onEnd: (trackId: string, pageX: number, pageY: number) => void;
  children: ReactNode;
}) {
  const start = useRef({ x: 0, y: 0 });
  const last = useRef({ x: 0, y: 0 });

  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .activateAfterLongPress(280)
        .runOnJS(true)
        .onStart((event) => {
          start.current = { x: event.absoluteX, y: event.absoluteY };
          last.current = { x: event.absoluteX, y: event.absoluteY };
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          onMove(trackId, event.absoluteX, event.absoluteY);
        })
        .onUpdate((event) => {
          const x = start.current.x + event.translationX;
          const y = start.current.y + event.translationY;
          last.current = { x, y };
          onMove(trackId, x, y);
        })
        .onFinalize(() => {
          onEnd(trackId, last.current.x, last.current.y);
        }),
    [trackId, onMove, onEnd],
  );

  return (
    <GestureDetector gesture={gesture}>
      <View>{children}</View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  dropHover: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: 10,
  },
});
