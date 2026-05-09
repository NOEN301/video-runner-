# Chat

一个支持多模型商、多模型的 AI 对话工具，基于 Next.js 构建，数据全部保存在浏览器本地。

## 功能

- **多模型商支持**：内置 DeepSeek、Claude、Gemini、OpenAI、Qwen、硅基流动预设，也支持自定义添加
- **多模型管理**：每个模型商下可添加多个模型，支持获取官方模型列表
- **流式对话**：模型回复逐字显示
- **历史记录**：自动保存对话，支持切换和删除
- **代码预览**：模型生成的 HTML/SVG 代码可一键实时预览
- **图片上传**：支持粘贴或选择图片，有视觉能力的模型可读取图片内容
- **文件上传**：支持上传文本文件，内容自动加入对话
- **Token 统计**：基于模型接口真实返回数据显示消耗
- **双重布局**：气泡或经典平铺布局，可开关头像、时间戳、模型名称
- **API Key 管理**：API Key 支持查看/隐藏，支持连通性检测

## 技术栈

| 技术 | 说明 |
|------|------|
| Next.js 16 | App Router 全栈框架 |
| TypeScript | 类型安全 |
| React 18 | UI 渲染 |
| Anthropic SDK | Claude API 调用 |
| OpenAI 兼容接口 | DeepSeek / OpenAI / Gemini / Qwen / 硅基流动 等 |
| localStorage | 所有数据浏览器本地存储 |

## 快速开始

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 浏览器打开
# http://localhost:3000
```

## 使用指南

### 1. 配置模型

打开 http://localhost:3000/settings，点击任意模型提供方卡片：

1. 填写 **API Key**
2. 点击 **连通性检测** 验证配置
3. 点击 **获取模型** 拉取官方模型列表，或手动新建模型

### 2. 开始对话

打开 http://localhost:3000/chat：

1. 点击输入框上方的模型选择器，展开模型商后选择模型
2. 输入文字，按 Enter 发送
3. 可用 **+** 按钮上传图片或文件

### 3. 对话设置

在 http://localhost:3000/settings 的「对话设置」部分可调整：

- 流式输出开关
- 代码预览开关
- 自动跟随滚动
- 对话布局（气泡 / 经典）
- 头像、时间戳、模型名称、字数统计
- 拼写检查
- 自动标题

## 部署

### Vercel（推荐）

```bash
npm install -g vercel
vercel
```

按提示完成部署，无需服务器。

### 自行构建

```bash
npm run build
npm start
```

## 项目结构

```text
app/
├── api/
│   ├── chat/route.ts        后端模型调用接口
│   └── models/route.ts      后端获取模型列表接口
├── chat/page.tsx             对话页面
├── settings/page.tsx         设置页面
├── components/
│   ├── modelStore.ts         数据存储与预设
│   ├── MarkdownContent.tsx   代码块渲染与预览
│   └── ModelSelector.tsx     模型选择器
├── globals.css               全局样式
├── layout.tsx                布局框架
└── page.tsx                  首页
```

## 隐私

所有 API Key、对话历史、模型配置均保存在浏览器 localStorage，不会上传到任何服务器。模型调用通过当前设备的本地 Next.js 服务端代理转发，API Key 不会暴露给前端。
