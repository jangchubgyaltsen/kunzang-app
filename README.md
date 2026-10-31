# 普贤上师言教 藏文学习

以《大圆满前行·普贤上师言教》藏文原文为核心的藏文学习 PWA：从零基础拼读开始，逐步过渡到原文诵读和理解。读音为安多音。

## 内容来源

- 藏文原文：华智仁波切《普贤上师言教》。
- 读音：Meta MMS 安多藏语 TTS（`facebook/mms-tts-adx`，CC BY-NC 4.0）自动生成，尚未经人工校对。
- 中文译文有版权，**不在本仓库中**。需要时在 App 的“设置”里导入本地的译文包。

## 开发

```bash
npm install
npm run dev      # 本地开发
npm run build    # 构建到 dist/
```

推送到 `main` 后，GitHub Actions 会自动部署到 GitHub Pages。
