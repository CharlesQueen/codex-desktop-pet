// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 CharlesQueen
// 本项目仅供非商业学习、交流与分享。对于他人违反许可证或侵犯第三方权利的使用行为及其后果，作者概不承担任何责任。
// This project is provided solely for noncommercial learning, discussion, and sharing. The author assumes no liability whatsoever for others’ use in violation of the license or third-party rights, or for any resulting consequences.

export function sizeForHeight(height, ratio, workArea) {
  const h = Math.round(
    Math.max(200, Math.min(height, 840, workArea.height - 40)),
  );
  return {
    width: Math.min(Math.round(h * ratio), workArea.width - 24),
    height: h,
  };
}
export function clampBounds(bounds, area) {
  const width = Math.min(bounds.width, area.width),
    height = Math.min(bounds.height, area.height);
  return {
    x: Math.round(
      Math.max(area.x, Math.min(bounds.x, area.x + area.width - width)),
    ),
    y: Math.round(
      Math.max(area.y, Math.min(bounds.y, area.y + area.height - height)),
    ),
    width: Math.round(width),
    height: Math.round(height),
  };
}
export function point(value) {
  return (
    value &&
    Number.isFinite(value.x) &&
    Number.isFinite(value.y) &&
    Math.abs(value.x) < 100000 &&
    Math.abs(value.y) < 100000
  );
}
export function visibleArea(bounds, area) {
  return (
    Math.max(
      0,
      Math.min(bounds.x + bounds.width, area.x + area.width) -
        Math.max(bounds.x, area.x),
    ) *
    Math.max(
      0,
      Math.min(bounds.y + bounds.height, area.y + area.height) -
        Math.max(bounds.y, area.y),
    )
  );
}
