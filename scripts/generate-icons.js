import sharp from 'sharp';

const source = 'public/icons/icon.svg';
const output = (file, size) => sharp(source).resize(size, size).png().toFile(`public/icons/${file}`);

await Promise.all([
  output('icon-192.png', 192),
  output('icon-512.png', 512),
  output('icon-512-maskable.png', 512),
  output('apple-touch-icon.png', 180),
]);
