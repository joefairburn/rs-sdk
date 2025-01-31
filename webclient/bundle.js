import fs from 'fs';

import obfuscator from 'javascript-obfuscator';
import uglify from 'uglify-js';

const define = {
    'process.env.SECURE_ORIGIN': JSON.stringify(process.env.SECURE_ORIGIN ?? 'false'),
    // original key, used 2003-2010
    'process.env.LOGIN_RSAE': JSON.stringify('58778699976184461502525193738213253649000149147835990136706041084440742975821'),
    'process.env.LOGIN_RSAN': JSON.stringify('7162900525229798032761816791230527296329313291232324290237849263501208207972894053929065636522363163621000728841182238772712427862772219676577293600221789')
};

// bun minification
async function prodBuild(entry) {
    const build = await Bun.build({
        entrypoints: [entry],
        minify: true,
        sourcemap: 'external',
        drop: ['console'],
        define,
        external: ['#3rdparty/*']
    });

    if (!build.success) {
        build.logs.forEach(x => console.log(x));
        process.exit(1);
    }

    const source = await build.outputs[0].text();
    const sourcemap = await build.outputs[0].sourcemap.text();

    return {
        source,
        sourcemap
    };
}

// uglify-js
async function uglifyProdBuild(entry) {
    const build = await Bun.build({
        entrypoints: [entry],
        sourcemap: 'external',
        drop: ['console'],
        define,
        external: ['#3rdparty/*']
    });

    if (!build.success) {
        build.logs.forEach(x => console.log(x));
        process.exit(1);
    }

    const source = await build.outputs[0].text();
    const sourcemap = await build.outputs[0].sourcemap.text();

    const ugly = uglify.minify(source, {
        compress: {
            module: true,
            unsafe: true,
            toplevel: true
        },
        mangle: {
            reserved: [
                // entry point
                'Client'
            ],
            eval: true,
            toplevel: true
        },
        sourceMap: {
            content: sourcemap
        },
        toplevel: true
    });

    if (ugly.error) {
        console.error(ugly.error.message);
        process.exit(1);
    }

    return {
        source: ugly.code,
        sourcemap: ugly.map
    };
}

// todo: still experimenting with performance
// javascript-obfuscator
async function obfuscatorProdBuild(entry) {
    const build = await Bun.build({
        entrypoints: [entry],
        drop: ['console'],
        define,
        external: ['#3rdparty/*']
    });

    if (!build.success) {
        build.logs.forEach(x => console.log(x));
        process.exit(1);
    }

    const obfuscated = obfuscator.obfuscate(await build.outputs[0].text(), {
        sourceMap: true,
        sourceMapMode: 'separate',
        identifierNamesGenerator: 'mangled-shuffled',
        renameGlobals: true,
        renameProperties: true,
        transformObjectKeys: true,
        reservedNames: [
            // entry point
            '^Client$',
            // deps (for some reason the obfuscator attempts these!)
            'playWave',
            'setWaveVolume',
            'playMidi',
            'stopMidi',
            'setMidiVolume',
            'BZip2',
            'decompress'
        ],
        selfDefending: true,
        debugProtection: true,
        debugProtectionInterval: 2000,
        // less secure, but better UX (less lag):
        // simplify: false,
        // stringArray: false
    });

    return {
        source: obfuscated.getObfuscatedCode(),
        sourcemap: obfuscated.getSourceMap()
    };
}

async function devBuild(entry) {
    const build = await Bun.build({
        entrypoints: [entry],
        sourcemap: 'external',
        define,
        external: ['#3rdparty/*']
    });

    if (!build.success) {
        build.logs.forEach(x => console.log(x));
        process.exit(1);
    }

    const source = await build.outputs[0].text();
    const sourcemap = await build.outputs[0].sourcemap.text();

    return {
        source,
        sourcemap
    };
}

async function depsBuild(entry) {
    const build = await Bun.build({
        entrypoints: [entry],
        sourcemap: 'external',
        define
    });

    if (!build.success) {
        build.logs.forEach(x => console.log(x));
        process.exit(1);
    }

    const source = await build.outputs[0].text();
    const sourcemap = await build.outputs[0].sourcemap.text();

    const ugly = uglify.minify(source, {
        compress: {
            module: true
        },
        sourceMap: {
            content: sourcemap
        },
        toplevel: true
    });

    if (ugly.error) {
        console.error(ugly.error.message);
        process.exit(1);
    }

    return {
        source: ugly.code,
        sourcemap: ugly.map
    };
}

// todo: workaround due to a bun bug https://github.com/oven-sh/bun/issues/16509: not remapping external
function replaceDepsUrl(source) {
    return source.replaceAll('#3rdparty', '.');
}

const deps = await depsBuild('./src/3rdparty/deps.js');
fs.writeFileSync('out/deps.js', deps.source);
// fs.writeFileSync('out/deps.js.map', deps.sourcemap);

const args = process.argv.slice(2);

let build = devBuild;
if (args[0] === 'prod') {
    if (args[1] === 'uglify') {
        build = uglifyProdBuild;
    } else if (args[1] === 'obfuscate') {
        build = obfuscatorProdBuild;
    } else {
        build = prodBuild;
    }
}

const client = await build('./src/client/Client.ts');
fs.writeFileSync('out/client.js', replaceDepsUrl(client.source));
// fs.writeFileSync('out/client.js.map', client.sourcemap);

if (fs.existsSync('../Server/public')) {
    fs.copyFileSync('out/client.js', '../Server/public/client/client.js');
    // fs.copyFileSync('out/client.js.map', '../Server/public/client/client.js.map');

    fs.copyFileSync('out/deps.js', '../Server/public/client/deps.js');
    // fs.copyFileSync('out/deps.js.map', '../Server/public/client/deps.js.map');

    fs.copyFileSync('src/3rdparty/bzip2-wasm/bzip2.wasm', '../Server/public/client/bzip2.wasm');
    fs.copyFileSync('src/3rdparty/tinymidipcm/tinymidipcm.wasm', '../Server/public/client/tinymidipcm.wasm');
}
