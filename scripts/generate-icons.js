import sharp from 'sharp';

const source = 'public/icons/icon.svg';
const output = (file, size) => sharp(source).resize(size, size).png().toFile(`public/icons/${file}`);
const outputMaskable = async () => {
  const size = 512;
  const safeZoneSize = Math.round(size * 0.6);
  const inset = Math.round((size - safeZoneSize) / 2);
  const logo = await sharp(source).resize(safeZoneSize, safeZoneSize).png().toBuffer();

  return sharp({
    create: { width: size, height: size, channels: 4, background: '#030712' },
  })
    .composite([{ input: logo, top: inset, left: inset }])
    .png()
    .toFile('public/icons/icon-512-maskable.png');
};

await Promise.all([
  output('icon-192.png', 192),
  output('icon-512.png', 512),
  outputMaskable(),
  output('apple-touch-icon.png', 180),
]);
