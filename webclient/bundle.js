import fs from 'fs';

const build = await Bun.build({
    entrypoints: ['./src/client/Client.ts'],
    outdir: './out',
    sourcemap: 'external',
    minify: true
});

if (!build.success) {
    build.logs.forEach(x => console.log(x));
} else {
    fs.copyFileSync('out/Client.js', '../Server/public/js/Client.js');
    fs.copyFileSync('out/Client.js.map', '../Server/public/js/Client.js.map');
    fs.copyFileSync('src/3rdparty/bzip2-wasm/bzip2.wasm', '../Server/public/js/bzip2.wasm');
    fs.copyFileSync('src/3rdparty/tinymidipcm/tinymidipcm.wasm', '../Server/public/js/tinymidipcm.wasm');
}
