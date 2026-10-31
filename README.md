# 普贤上师言教 藏文学习

以《大圆满前行·普贤上师言教》藏文原文为核心的藏文学习 PWA：从零基础拼读开始，逐步过渡到原文诵读和理解。读音为安多音。

## 内容来源

- 藏文原文：华智仁波切《普贤上师言教》。
- 读音：Meta MMS 安多藏语 TTS（`facebook/mms-tts-adx`，CC BY-NC 4.0）自动生成，尚未经人工校对。
- 中文译文有版权，**不在本仓库中**。需要时在 App 的“设置”里导入本地的译文包。

## 课程结构

- **拼读线**（单元 1–10）：字母、元音、加字，每关只学 2–3 个新东西，每三关有一关练习，单元最后是小测。
- **诵读线**（单元 11 起，开篇原文）：一句一关。词卡用从整句连读里切出来的读音，最后听整句排词序、跟读。两条线各自解锁，可以同时学。
- **定时回顾**：到期复习按 FSRS 排；每个单元通过后第 1、3、7、14、30 天各有一次 10 题的抽查。

开篇逐词数据（分词、一本通式注音、音频编号）由 `scripts/build_opening_words.py` 从 `scripts/data/opening-words.tsv` 生成 `src/opening-words.json`；音频在 `public/audio/op/`。

## 开发

```bash
npm install
npm run dev      # 本地开发
npm run build    # 构建到 dist/
```

推送到 `main` 后，GitHub Actions 会自动部署到 GitHub Pages。
