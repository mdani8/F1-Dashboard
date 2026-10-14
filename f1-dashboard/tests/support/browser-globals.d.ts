export {};
interface MotionEvidence {
  highlights: (string | null)[];
  replays: string[];
  page: HTMLElement | null;
  table: HTMLElement | null;
  cell: HTMLElement | null;
  tires: HTMLElement[];
}
declare global {
  var tireSamples: number[];
  var sampleTires: boolean;
  var motionQA: MotionEvidence;
  var qolBefore: number;
  var originalMap: HTMLElement | null;
}
