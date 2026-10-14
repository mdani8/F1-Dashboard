import test from 'node:test';
import assert from 'node:assert/strict';
import { geographicRotation, orientTrackNorth } from '../shared/track-orientation.js';
import { validateTrack } from '../shared/track-model.js';
import geography from '../data/circuit-geography.json' with {type:'json'};

const northShape = [[0,0],[4,0],[5,1],[3,2],[2,4],[0,3],[-1,1],[0,0]];
const latitude = 47;
const coordinates = northShape.map(([x,y]) => [19 + x * .001 / Math.cos(latitude * Math.PI / 180),latitude - y * .001]);
function rotate(points,angle) {
  const cos = Math.cos(angle), sin = Math.sin(angle);
  return points.map(([x,y]) => [250 + (x * cos - y * sin) * 20,180 + (x * sin + y * cos) * 20]);
}
test('geographic alignment corrects a rotated telemetry frame even when reference point order differs',() => {
  const telemetry = rotate(northShape,Math.PI / 2);
  const alignment = geographicRotation(telemetry,coordinates);
  assert.ok(alignment);
  assert.ok(Math.abs(alignment.rotation + Math.PI / 2) < .002);
  const reversed = geographicRotation(telemetry,[...coordinates].reverse());
  assert.ok(reversed && Math.abs(reversed.rotation - alignment.rotation) < .002);
});
test('north rotation preserves sector connectivity, times and finish-line direction within the viewport',() => {
  const points = rotate(northShape,Math.PI / 2);
  const geometry = {version:2,viewBox:[0,0,640,360],start:points[0],direction:90,sectors:[{number:1,time:20,points:points.slice(0,3)},{number:2,time:30,points:points.slice(2,6)},{number:3,time:25,points:points.slice(5)}]};
  const result = orientTrackNorth(geometry,{coordinates,geographicId:'test'});
  assert.equal(result.orientation.northUp,true);
  assert.deepEqual(result.sectors.map(row => row.time),[20,30,25]);
  assert.deepEqual(result.sectors[0].points.at(-1),result.sectors[1].points[0]);
  assert.deepEqual(result.sectors[1].points.at(-1),result.sectors[2].points[0]);
  assert.deepEqual(result.sectors[2].points.at(-1),result.start);
  assert.ok(Math.abs(result.direction) < .2);
  assert.ok(result.sectors.flatMap(row => row.points).every(([x,y]) => x >= 0 && x <= 640 && y >= 0 && y <= 360));
});
test('unknown or malformed geographic references never claim north; old cached geometry is rejected',() => {
  assert.equal(geographicRotation(northShape,null),null);
  assert.equal(geographicRotation(northShape,[[0,0],[1,NaN],[2,2]]),null);
  assert.throws(() => validateTrack({status:'available',circuitId:'test',reference:{},at:0,geometry:{sectors:[]}}));
  const ids = ['albert_park','shanghai','suzuka','miami','villeneuve','monaco','catalunya','red_bull_ring','silverstone','spa','hungaroring','zandvoort','monza','madring','baku','sepang','marina_bay','americas','rodriguez','interlagos','vegas','losail','yas_marina'];
  assert.ok(ids.every(id => geography.circuits[id]?.coordinates.length >= 3));
});
