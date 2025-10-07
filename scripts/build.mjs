import { execSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

execSync('npm run build:ts --silent', { stdio: 'inherit', cwd: projectRoot });

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
