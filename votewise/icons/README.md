# VoteWise PWA Icons

Production icons (PNG) are generated from `icon.svg` at deployment time using:

```bash
npx sharp-cli --input icon.svg --output icon-192.png resize 192 192
npx sharp-cli --input icon.svg --output icon-512.png resize 512 512
```

Sizes required by manifest.json: 72, 96, 128, 144, 192, 512px.
All icons use `purpose: "maskable any"` for Android adaptive icon support.
