import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { extname, relative, resolve } from 'path';
import { fileURLToPath } from 'node:url';
import { glob } from 'glob';
import dts from 'vite-plugin-dts';
import svgr from 'vite-plugin-svgr';
import sass from 'sass';
import { libInjectCss } from 'vite-plugin-lib-inject-css';

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [
        react(),
        libInjectCss(),
        svgr(),
        dts({
            include: ['src'],
            exclude: ['src/**/*.spec.tsx', 'src/App.tsx', 'src/main.tsx'],
            tsconfigPath: './tsconfig.app.json',
            insertTypesEntry: true,
        }),
    ],
    resolve: {
        alias: {
            '@': resolve(__dirname, './src'),
        },
    },
    css: {
        preprocessorOptions: {
            scss: {
                implementation: sass,
            },
        },
    },
    build: {
        lib: {
            entry: resolve(__dirname, 'src/index.ts'),
            formats: ['es'],
            name: 'adrienne-auth-client',
            fileName: 'auth-client',
        },
        copyPublicDir: false,
        rollupOptions: {
            external: ['react', 'react-dom', '@deriv-com/utils'],
            input: Object.fromEntries(
                glob
                    .sync('src/**/*.{ts,tsx}', {
                        ignore: [
                            '**/*.test.ts',
                            '**/*.test.tsx',
                            '**/*.spec.ts',
                            '**/*.spec.tsx',
                            '**/__tests__/**',
                            './src/App.tsx',
                            './src/main.tsx',
                        ],
                    })
                    .map(file => {
                        return [
                            // The name of the entry point
                            // src/nested/foo.ts becomes nested/foo
                            relative('src', file.slice(0, file.length - extname(file).length)),
                            // The absolute path to the entry file
                            // src/nested/foo.ts becomes /project/src/nested/foo.ts
                            fileURLToPath(new URL(file, import.meta.url)),
                        ];
                    })
            ),
            output: {
                assetFileNames: 'assets/[name][extname]',
                entryFileNames: '[name].js',
                globals: {
                    react: 'React',
                    'react-dom': 'ReactDOM',
                },
            },
        },
    },
});
