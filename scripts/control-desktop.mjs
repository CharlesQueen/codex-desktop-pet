// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 CharlesQueen
// 本项目仅供非商业学习、交流与分享。对于他人违反许可证或侵犯第三方权利的使用行为及其后果，作者概不承担任何责任。
// This project is provided solely for noncommercial learning, discussion, and sharing. The author assumes no liability whatsoever for others’ use in violation of the license or third-party rights, or for any resulting consequences.

import { setState, status } from "../core.mjs";
const args = process.argv.slice(2);
const value = (k) => {
  const i = args.indexOf(k);
  return i < 0 ? undefined : args[i + 1];
};
const session_id = value("--session");
const state = value("--state");
if (state || value("--mode"))
  console.log(
    JSON.stringify(
      setState(
        {
          session_id,
          state,
          mode: value("--mode") || "once",
          duration_ms: value("--duration")
            ? Number(value("--duration"))
            : undefined,
        },
        "model",
      ),
    ),
  );
else console.log(JSON.stringify(status(session_id)));
