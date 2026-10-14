function resampleClosed(points,count = 128) {
  const clean = points.filter((point,index) => !index || Math.hypot(point[0] - points[index - 1][0],point[1] - points[index - 1][1]) > 1e-9);
  if (clean.length < 3) return null;
  if (Math.hypot(clean[0][0] - clean.at(-1)[0],clean[0][1] - clean.at(-1)[1]) > 1e-9) clean.push(clean[0]);
  const distances = [0];
  for (let index = 1; index < clean.length; index++) distances.push(distances.at(-1) + Math.hypot(clean[index][0] - clean[index - 1][0],clean[index][1] - clean[index - 1][1]));
  const length = distances.at(-1);
  if (!length) return null;
  let segment = 1;
  return Array.from({length:count},(_,index) => {
    const target = index / count * length;
    while (distances[segment] < target) segment++;
    const ratio = (target - distances[segment - 1]) / (distances[segment] - distances[segment - 1]);
    return clean[segment - 1].map((value,axis) => value + (clean[segment][axis] - value) * ratio);
  });
}

function normalize(points) {
  const center = [0,1].map(axis => points.reduce((sum,point) => sum + point[axis],0) / points.length);
  const centered = points.map(point => point.map((value,axis) => value - center[axis]));
  const size = Math.sqrt(centered.reduce((sum,[x,y]) => sum + x * x + y * y,0) / points.length);
  return centered.map(point => point.map(value => value / size));
}

export function geographicRotation(points,coordinates) {
  if (!Array.isArray(coordinates) || coordinates.length < 3 || coordinates.some(point => point.length < 2 || !point.slice(0,2).every(Number.isFinite))) return null;
  const latitude = coordinates.reduce((sum,point) => sum + point[1],0) / coordinates.length * Math.PI / 180;
  // East is right; geographic north is negative SVG Y. Longitude needs its latitude scale.
  const geographic = resampleClosed(coordinates.map(([longitude,lat]) => [longitude * Math.cos(latitude),-lat]));
  const telemetry = resampleClosed(points);
  if (!telemetry || !geographic) return null;
  const a = normalize(telemetry), b = normalize(geographic), count = a.length;
  let best = null;
  // Geographic polylines may start anywhere and may run in either direction.
  for (const direction of [1,-1]) for (let offset = 0; offset < count; offset++) {
    let dot = 0, cross = 0;
    for (let index = 0; index < count; index++) {
      const [x,y] = a[index], [east,south] = b[(offset + direction * index + count) % count];
      dot += x * east + y * south;
      cross += x * south - y * east;
    }
    const error = Math.sqrt(Math.max(0,2 - 2 * Math.hypot(dot,cross) / count));
    if (!best || error < best.error) best = {rotation:Math.atan2(cross,dot),error};
  }
  // Do not label an unrelated or substantially different layout as north-oriented.
  return best?.error <= .22 ? best : null;
}

export function orientTrackNorth(geometry,geographic) {
  const all = geometry.sectors.flatMap((sector,index) => index ? sector.points.slice(1) : sector.points);
  const alignment = geographicRotation(all,geographic?.coordinates);
  if (!alignment) return {...geometry,orientation:{northUp:false}};
  const cos = Math.cos(alignment.rotation), sin = Math.sin(alignment.rotation);
  const rotate = ([x,y]) => [x * cos - y * sin,x * sin + y * cos];
  const rotated = all.map(rotate);
  const minX = Math.min(...rotated.map(point => point[0])), maxX = Math.max(...rotated.map(point => point[0]));
  const minY = Math.min(...rotated.map(point => point[1])), maxY = Math.max(...rotated.map(point => point[1]));
  const scale = Math.min(516 / (maxX - minX),256 / (maxY - minY));
  const project = point => {
    const [x,y] = rotate(point);
    return [+(320 + (x - (minX + maxX) / 2) * scale).toFixed(2),+(180 + (y - (minY + maxY) / 2) * scale).toFixed(2)];
  };
  return {...geometry,start:project(geometry.start),direction:geometry.direction + alignment.rotation * 180 / Math.PI,
    sectors:geometry.sectors.map(sector => ({...sector,points:sector.points.map(project)})),
    orientation:{northUp:true,rotation:+(alignment.rotation * 180 / Math.PI).toFixed(3),fitError:+alignment.error.toFixed(4),source:'F1 Circuits',geographicId:geographic.geographicId}};
}
