// Author: CharlesQueen
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 CharlesQueen

export function nearbyPointer(cursor, bounds) {
  const padding = Math.max(24, Math.min(64, bounds.height / 9));
  const x = cursor.x - bounds.x,
    y = cursor.y - bounds.y;
  return x >= -padding &&
    x <= bounds.width + padding &&
    y >= -padding &&
    y <= bounds.height + padding
    ? { x, y }
    : null;
}

export function dragDirection(anchor, x, state) {
  const delta = x - anchor;
  return Math.abs(delta) > 3
    ? { anchor: x, state: delta > 0 ? "running-right" : "running-left" }
    : { anchor, state };
}

export function lookDirection(p, box) {
  if (!p) return undefined;
  const dx = p.x - (box.left + box.width / 2);
  const dy = p.y - (box.top + box.height * 0.35);
  if (Math.hypot(dx, dy) < 35) return undefined;
  return (
    Math.round((((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360) / 22.5) %
    16
  );
}
