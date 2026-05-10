# Stream Scramble Text

SillyTavern third-party extension that adds a cyber/anime-style scramble reveal to text while messages stream in.

## Install

Place this folder in SillyTavern's third-party extensions directory, for example:

```text
SillyTavern/public/scripts/extensions/third-party/stream-scramble-text
```

The folder name can be changed; the extension detects its own path when loading `settings.html`.

Restart or reload SillyTavern, then enable **Stream Scramble Text** in Extensions.

## Features

- Animates newly streamed text without replacing the whole message HTML.
- Preserves Markdown-rendered structure, links, code blocks, and existing DOM elements.
- Includes presets for blocks, matrix, symbols, numbers, and mixed characters.
- Uses SillyTavern's native extension settings drawer UI.
- Respects `prefers-reduced-motion` by not animating when the OS asks for reduced motion.

## Settings

- **Enabled**: Toggle the effect.
- **Characters**: Select the scramble character set.
- **Duration**: How long each text update scrambles before settling.
- **Frame rate**: How often scramble characters refresh.
- **Tail length**: Maximum number of trailing characters affected per update.
- **Glow**: Toggle the neon text glow.
