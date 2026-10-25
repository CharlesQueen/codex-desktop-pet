---
name: codex-pet-control
description: Open and control the customizable Codex Desktop Pet and its installed animation packs.
---

Use `pet_open` to open the companion panel. Keep its `session_id` for later controls.
使用 `pet_open` 打开陪伴面板，并在后续控制中保留返回的 `session_id`。

`running` means focused work; `running-left` and `running-right` mean movement. Use `review` for inspection and `waiting` when the user must respond. Use `auto` to release a manual override. Lifecycle hooks already follow ordinary work events.
`running` 表示专注工作，`running-left` 和 `running-right` 表示移动。检查时使用 `review`，等待用户回应时使用 `waiting`；通过 `auto` 恢复自动跟随。普通工作事件由生命周期回调自动跟随。

Only offer outfits listed by `pet_open`. This native desktop renderer is separate from built-in Show pet. Automatic following requires a local host that supports plugin lifecycle hooks.
只提供 `pet_open` 列出的服饰。独立桌面浮窗与内置 Show pet 分开；自动联动需要支持插件生命周期回调的本地主机。

The hooks observe state without changing permission decisions or reading conversation text.
回调只观察状态，不改变权限决策，也不读取对话正文。

本项目仅供非商业学习、交流与分享。对于他人违反许可证或侵犯第三方权利的使用行为及其后果，作者概不承担任何责任。
This project is provided solely for noncommercial learning, discussion, and sharing. The author assumes no liability whatsoever for others’ use in violation of the license or third-party rights, or for any resulting consequences.
