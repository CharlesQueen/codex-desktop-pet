// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 CharlesQueen
// 本项目仅供非商业学习、交流与分享。对于他人违反许可证或侵犯第三方权利的使用行为及其后果，作者概不承担任何责任。
// This project is provided solely for noncommercial learning, discussion, and sharing. The author assumes no liability whatsoever for others’ use in violation of the license or third-party rights, or for any resulting consequences.

import { applyHook } from "../core.mjs";
// Observe lifecycle events without writing approval decisions. / 仅观察生命周期，不输出审批决策。
let input = "";
for await (const chunk of process.stdin) input += chunk;
if (input.trim()) applyHook(JSON.parse(input));
