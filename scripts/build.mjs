import { execSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const distDir = path.join(projectRoot, 'dist');

rmSync(distDir, { recursive: true, force: true });

execSync('npx tsc --noEmit', { stdio: 'inherit', cwd: projectRoot });

const buildTargets = [
  {
    entry: path.join(projectRoot, 'src', 'content', 'overlay.tsx'),
    outfile: path.join(distDir, 'content', 'overlay.js'),
    format: 'iife',
    globalName: 'BychokOverlay'
  },
  {
    entry: path.join(projectRoot, 'src', 'popup', 'index.tsx'),
    outfile: path.join(distDir, 'popup', 'index.js')
  },
  {
    entry: path.join(projectRoot, 'src', 'service_worker.ts'),
    outfile: path.join(distDir, 'service_worker.js')
  }
];

const esbuildBaseConfig = {
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: ['chrome114'],
  jsx: 'automatic',
  sourcemap: false,
  define: {
    'process.env.NODE_ENV': '"production"'
  }
};

await Promise.all(
  buildTargets.map(async ({ entry, outfile, format, globalName }) => {
    mkdirSync(path.dirname(outfile), { recursive: true });
    const buildConfig = {
      ...esbuildBaseConfig,
      entryPoints: [entry],
      outfile
    };
    if (format) {
      buildConfig.format = format;
    }
    if (globalName) {
      buildConfig.globalName = globalName;
    }
    await esbuild.build(buildConfig);
  })
);

const popupSrcDir = path.join(projectRoot, 'src', 'popup');
const popupDistDir = path.join(projectRoot, 'dist', 'popup');
mkdirSync(popupDistDir, { recursive: true });

const htmlSrcPath = path.join(popupSrcDir, 'index.html');
const htmlDistPath = path.join(popupDistDir, 'index.html');
let htmlContent = readFileSync(htmlSrcPath, 'utf8');
htmlContent = htmlContent.replace('./index.tsx', './index.js');
writeFileSync(htmlDistPath, htmlContent, 'utf8');

const cssSrcPath = path.join(popupSrcDir, 'popup.css');
const cssDistPath = path.join(popupDistDir, 'popup.css');
cpSync(cssSrcPath, cssDistPath);
