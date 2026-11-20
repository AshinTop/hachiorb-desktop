'use strict';
/** Keep desktop window dimensions stable while translating its screen position. */
function clampPosition(x, y, size, area) {
  if(!area || !Number.isFinite(size) || size <= 0) throw new TypeError('Invalid display work area or pet size');
  const maxX = area.x + Math.max(0, area.width-size);
  const maxY = area.y + Math.max(0, area.height-size);
  return {
    x: Math.round(Math.max(area.x, Math.min(x, maxX))),
    y: Math.round(Math.max(area.y, Math.min(y, maxY)))
  };
}
function dragPosition(startCursor, startBounds, cursor, size, area) {
  return clampPosition(startBounds.x + cursor.x - startCursor.x,
    startBounds.y + cursor.y - startCursor.y, size, area);
}
function fixedBounds(bounds, size, area) {
  const pos = clampPosition(bounds.x, bounds.y, size, area);
  return {...pos, width:size, height:size};
}
module.exports={clampPosition,dragPosition,fixedBounds};
