# Cult UI 来源与许可

`CopyButton.tsx` 按需改编自 [Cult UI Copy Button](https://github.com/nolly-studio/cult-ui/blob/d71b1428b811c2779d46ea41b7ef8c9f9c9991c2/apps/www/registry/default/ui/copy-button.tsx)，于 2026-11-15 核对上游源码。仅用于公共用户 ID 的复制反馈，不代表引入整个组件库。

保留复制成功状态、两秒复位、图标切换及可访问性通知；替换为现有 HeroUI Button、Echo 原创图标和 CSS 动效，沿用主题并支持 reduced-motion。移除无调用方的属性及 legacy execCommand 回退；Clipboard API 不可用或拒绝时显示失败并保留可选择 ID。仅接受12位大写Base32公共ID，使用同步 pending 标记阻止重复请求，成功状态只在 writeText 完成后出现；复位定时器在状态变化和卸载时清理，ID变化时由调用方重置组件。未新增 npm 依赖。

以下上游 MIT 许可仅适用于该改编组件，不构成本项目整体许可证。

MIT License

Copyright (c) 2023 Jordan-Gilliam

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
