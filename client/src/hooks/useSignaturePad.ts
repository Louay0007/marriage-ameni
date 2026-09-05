import type { PointerEvent as ReactPointerEvent } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Party, Point, Stroke, StrokeBatch } from '@marriage/shared';
import type { ContractSocket } from '../lib/socket';
import {
  drawStrokes,
  normalizePoint,
  renderSignatureBlob,
} from '../lib/canvas';

type UseSignaturePadOptions = {
  disabled: boolean;
  party: Party;
  socket: ContractSocket;
};

export function useSignaturePad({
  disabled,
  party,
  socket,
}: UseSignaturePadOptions) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const activePointerRef = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);
  const pendingRef = useRef<StrokeBatch | null>(null);
  const flushTimerRef = useRef<number | null>(null);
  const sequenceRef = useRef(0);
  const [hasInk, setHasInk] = useState(false);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    drawStrokes(context, strokesRef.current, canvas.width, canvas.height);
  }, []);

  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const bounds = canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(bounds.width * ratio));
    const height = Math.max(1, Math.round(bounds.height * ratio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    redraw();
  }, [redraw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    return () => observer.disconnect();
  }, [resize]);

  useEffect(() => {
    const replace = (batches: StrokeBatch[]) => {
      const strokes = new Map<string, Stroke>();
      for (const batch of batches) {
        const stroke = strokes.get(batch.strokeId) ?? {
          id: batch.strokeId,
          points: [],
        };
        stroke.points.push(...batch.points);
        strokes.set(batch.strokeId, stroke);
      }
      strokesRef.current = [...strokes.values()];
      setHasInk(strokesRef.current.length > 0);
      redraw();
    };
    const onSnapshot = (
      snapshot: Parameters<
        Parameters<typeof socket.on<'strokes:snapshot'>>[1]
      >[0],
    ) => {
      sequenceRef.current = snapshot.sequences[party];
      replace(snapshot.strokes[party]);
    };
    const onBatch = (
      batch: Parameters<Parameters<typeof socket.on<'stroke:batch'>>[1]>[0],
    ) => {
      if (batch.party !== party || batch.sequence <= sequenceRef.current)
        return;
      if (batch.sequence !== sequenceRef.current + 1) {
        socket.emit('strokes:request');
        return;
      }
      sequenceRef.current = batch.sequence;
      let stroke = strokesRef.current.find(({ id }) => id === batch.strokeId);
      if (!stroke) {
        stroke = { id: batch.strokeId, points: [] };
        strokesRef.current.push(stroke);
      }
      stroke.points.push(...batch.points);
      setHasInk(true);
      scheduleRedraw();
    };
    const onClear = (payload: { party: Party }) => {
      if (payload.party === party) {
        strokesRef.current = [];
        sequenceRef.current = 0;
        setHasInk(false);
        redraw();
      }
    };
    const request = () => socket.emit('strokes:request');
    socket.on('strokes:snapshot', onSnapshot);
    socket.on('stroke:batch', onBatch);
    socket.on('stroke:clear', onClear);
    socket.on('connect', request);
    if (socket.connected) request();
    return () => {
      socket.off('strokes:snapshot', onSnapshot);
      socket.off('stroke:batch', onBatch);
      socket.off('stroke:clear', onClear);
      socket.off('connect', request);
    };
  }, [party, redraw, socket]);

  useEffect(
    () => () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      if (flushTimerRef.current !== null)
        window.clearTimeout(flushTimerRef.current);
    },
    [],
  );

  const scheduleRedraw = () => {
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      redraw();
    });
  };

  const flush = (final = false) => {
    if (flushTimerRef.current !== null)
      window.clearTimeout(flushTimerRef.current);
    flushTimerRef.current = null;
    const pending = pendingRef.current;
    if (!pending || pending.points.length === 0) return;
    socket.emit('stroke:batch', { ...pending, final }, () => undefined);
    pendingRef.current = final ? null : { ...pending, points: [] };
  };

  const queuePoint = (strokeId: string, point: Point) => {
    if (!pendingRef.current || pendingRef.current.strokeId !== strokeId)
      pendingRef.current = { strokeId, points: [], final: false };
    pendingRef.current.points.push(point);
    if (flushTimerRef.current === null)
      flushTimerRef.current = window.setTimeout(() => flush(false), 40);
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (disabled || activePointerRef.current !== null) return;
    activePointerRef.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = normalizePoint(
      event.clientX,
      event.clientY,
      event.currentTarget.getBoundingClientRect(),
      event.timeStamp,
      event.pressure,
    );
    const stroke = { id: crypto.randomUUID(), points: [point] };
    strokesRef.current.push(stroke);
    queuePoint(stroke.id, point);
    setHasInk(true);
    scheduleRedraw();
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (disabled || activePointerRef.current !== event.pointerId) return;
    const stroke = strokesRef.current.at(-1);
    if (!stroke) return;
    const point = normalizePoint(
      event.clientX,
      event.clientY,
      event.currentTarget.getBoundingClientRect(),
      event.timeStamp,
      event.pressure,
    );
    stroke.points.push(point);
    queuePoint(stroke.id, point);
    scheduleRedraw();
  };

  const finishPointer = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (activePointerRef.current !== event.pointerId) return;
    const stroke = strokesRef.current.at(-1);
    if (stroke) {
      const point = normalizePoint(
        event.clientX,
        event.clientY,
        event.currentTarget.getBoundingClientRect(),
        event.timeStamp,
        event.pressure,
      );
      stroke.points.push(point);
      queuePoint(stroke.id, point);
      scheduleRedraw();
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    activePointerRef.current = null;
    flush(true);
  };

  const clear = () => {
    if (disabled) return;
    strokesRef.current = [];
    activePointerRef.current = null;
    setHasInk(false);
    redraw();
    socket.emit('stroke:clear', () => undefined);
  };

  return {
    canvasRef,
    clear,
    exportPng: () => renderSignatureBlob(strokesRef.current),
    hasInk,
    pointerHandlers: {
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: finishPointer,
      onPointerCancel: finishPointer,
      onLostPointerCapture: finishPointer,
    },
  };
}
