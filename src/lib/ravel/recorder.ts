import { type InputEvent } from '@/types/ravel';

let isRecording = false;
let events: InputEvent[] = [];
let frameCount = 0;
let listenerCleanup: (() => void)[] = [];

export function startRecording(): void {
  isRecording = true;
  events = [];
  frameCount = 0;

  const onKey = (e: KeyboardEvent, type: 'keydown' | 'keyup') => {
    if (!isRecording) return;
    events.push({
      type,
      key: e.key,
      code: e.code,
      timestamp: Date.now(),
      frame: frameCount,
    });
  };

  const onMouse = (e: MouseEvent, type: 'mousedown' | 'mouseup' | 'mousemove' | 'click') => {
    if (!isRecording) return;
    events.push({
      type,
      x: e.clientX,
      y: e.clientY,
      button: e.button,
      timestamp: Date.now(),
      frame: frameCount,
    });
  };

  const onKeyDown = (e: KeyboardEvent) => onKey(e, 'keydown');
  const onKeyUp = (e: KeyboardEvent) => onKey(e, 'keyup');
  const onMouseDown = (e: MouseEvent) => onMouse(e, 'mousedown');
  const onMouseUp = (e: MouseEvent) => onMouse(e, 'mouseup');
  const onMouseMove = (e: MouseEvent) => onMouse(e, 'mousemove');
  const onClick = (e: MouseEvent) => onMouse(e, 'click');

  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);
  document.addEventListener('mousedown', onMouseDown);
  document.addEventListener('mouseup', onMouseUp);
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('click', onClick);

  listenerCleanup = [
    () => document.removeEventListener('keydown', onKeyDown),
    () => document.removeEventListener('keyup', onKeyUp),
    () => document.removeEventListener('mousedown', onMouseDown),
    () => document.removeEventListener('mouseup', onMouseUp),
    () => document.removeEventListener('mousemove', onMouseMove),
    () => document.removeEventListener('click', onClick),
  ];
}

export function stopRecording(): InputEvent[] {
  isRecording = false;
  listenerCleanup.forEach(fn => fn());
  listenerCleanup = [];
  return [...events];
}

export function incrementFrame(): void {
  frameCount++;
}

export function getRecordedEvents(): InputEvent[] {
  return [...events];
}

export function isCurrentlyRecording(): boolean {
  return isRecording;
}

export function generateReplayScript(events: InputEvent[]): string {
  const lines: string[] = [];
  let lastTimestamp = 0;

  for (const event of events) {
    const delay = event.timestamp - lastTimestamp;
    lastTimestamp = event.timestamp;

    if (event.type === 'keydown' && event.key) {
      lines.push(`await delay(${delay});`);
      lines.push(`dispatchEvent(new KeyboardEvent('keydown', { key: '${event.key}', code: '${event.code}' }));`);
    } else if (event.type === 'keyup' && event.key) {
      lines.push(`await delay(${delay});`);
      lines.push(`dispatchEvent(new KeyboardEvent('keyup', { key: '${event.key}', code: '${event.code}' }));`);
    } else if (event.type === 'mousedown') {
      lines.push(`await delay(${delay});`);
      lines.push(`dispatchEvent(new MouseEvent('mousedown', { clientX: ${event.x}, clientY: ${event.y}, button: ${event.button} }));`);
    } else if (event.type === 'mouseup') {
      lines.push(`await delay(${delay});`);
      lines.push(`dispatchEvent(new MouseEvent('mouseup', { clientX: ${event.x}, clientY: ${event.y}, button: ${event.button} }));`);
    }
  }

  return lines.join('\n');
}
