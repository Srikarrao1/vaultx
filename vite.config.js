import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react-swc';
import { getPlugin } from 'react-devkit';
import rollupNodePolyFill from 'rollup-plugin-polyfill-node';
import { NodeGlobalsPolyfillPlugin } from '@esbuild-plugins/node-globals-polyfill';
import { NodeModulesPolyfillPlugin } from '@esbuild-plugins/node-modules-polyfill';

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd());

  return {
    plugins: [
      react({
        jsxImportSource: 'react',
        tsDecorators: true,
        swcOptions: {
          jsc: {
            transform: {
              react: { runtime: 'automatic' }
            }
          }
        }
      }),
      getPlugin()
    ],

    define: {
      'process.env': {
        VITE_DCL_DEFAULT_ENV: env.VITE_DCL_DEFAULT_ENV,
        VITE_BASE_URL: env.VITE_BASE_URL
      },
      global: 'globalThis'
    },

    resolve: {
      alias: {
        crypto: 'crypto-browserify',
        stream: 'stream-browserify',
        buffer: 'buffer',
        util: 'util',
        assert: 'assert',
        process: 'process/browser',

        // project aliases
        assets: '/src/assets',
        components: '/src/components',
        containers: '/src/containers',
        contracts: '/src/contracts',
        helpers: '/src/helpers',
        hooks: '/src/hooks',
        providers: '/src/providers'
      }
    },

    optimizeDeps: {
      include: [
        'buffer',
        'process',
        'crypto-browserify',
        'stream-browserify'
      ],

      esbuildOptions: {
        define: { global: 'globalThis' },
        plugins: [
          NodeGlobalsPolyfillPlugin({ process: true, buffer: true }),
          NodeModulesPolyfillPlugin()
        ]
      }
    },

    build: {
      sourcemap: true,
      rollupOptions: {
        plugins: [rollupNodePolyFill()]
      }
    },

    ...(command === 'build'
      ? { base: env.VITE_BASE_URL }
      : undefined)
  };
});
