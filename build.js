const fs = require('fs');
const path = require('path');
const { minify: minifyHtml } = require('html-minifier-terser');
const CleanCSS = require('clean-css');
const { minify: minifyJs } = require('terser');

const root = __dirname;
const srcHtmlPath = path.join(root, 'index.html');
const distDir = path.join(root, 'dist');
const distCssDir = path.join(distDir, 'css');
const distJsDir = path.join(distDir, 'js');
const distAssetsDir = path.join(distDir, 'assets');

const canonicalUrl = 'https://pos.personaltraineracademy.com.br/';
const defaultOgImage = `${canonicalUrl}assets/rafa01.webp`;

function cleanDist() {
  fs.rmSync(distDir, { recursive: true, force: true });
  fs.mkdirSync(distCssDir, { recursive: true });
  fs.mkdirSync(distJsDir, { recursive: true });
  fs.mkdirSync(distAssetsDir, { recursive: true });
}

function copyAssets() {
  const srcAssetsDir = path.join(root, 'assets');
  fs.cpSync(srcAssetsDir, distAssetsDir, { recursive: true });
}

function ensureMetaTag(html, testRegex, tag) {
  if (testRegex.test(html)) return html;
  return html.replace('</head>', `  ${tag}\n</head>`);
}

function ensureSeoMeta(html) {
  html = ensureMetaTag(
    html,
    /<link\s+rel=["']canonical["']/i,
    `<link rel="canonical" href="${canonicalUrl}">`
  );

  html = ensureMetaTag(
    html,
    /<meta\s+property=["']og:title["']/i,
    '<meta property="og:title" content="PERSONAL 10K | Como Vender Consultoria Online">'
  );
  html = ensureMetaTag(
    html,
    /<meta\s+property=["']og:description["']/i,
    '<meta property="og:description" content="Aprenda a transformar seu Instagram em uma ferramenta que gera alunos todos os dias, sem viralizar nem virar influencer.">'
  );
  html = ensureMetaTag(
    html,
    /<meta\s+property=["']og:image["']/i,
    `<meta property="og:image" content="${defaultOgImage}">`
  );
  html = ensureMetaTag(
    html,
    /<meta\s+property=["']og:url["']/i,
    `<meta property="og:url" content="${canonicalUrl}">`
  );
  html = ensureMetaTag(
    html,
    /<meta\s+property=["']og:type["']/i,
    '<meta property="og:type" content="website">'
  );

  html = ensureMetaTag(
    html,
    /<meta\s+name=["']twitter:card["']/i,
    '<meta name="twitter:card" content="summary_large_image">'
  );
  html = ensureMetaTag(
    html,
    /<meta\s+name=["']twitter:title["']/i,
    '<meta name="twitter:title" content="PERSONAL 10K | Como Vender Consultoria Online">'
  );
  html = ensureMetaTag(
    html,
    /<meta\s+name=["']twitter:description["']/i,
    '<meta name="twitter:description" content="Aprenda a transformar seu Instagram em uma ferramenta que gera alunos todos os dias, sem viralizar nem virar influencer.">'
  );
  html = ensureMetaTag(
    html,
    /<meta\s+name=["']twitter:image["']/i,
    `<meta name="twitter:image" content="${defaultOgImage}">`
  );

  html = ensureMetaTag(
    html,
    /<link\s+rel=["']preconnect["']\s+href=["']https:\/\/cdnjs\.cloudflare\.com["']/i,
    '<link rel="preconnect" href="https://cdnjs.cloudflare.com" crossorigin>'
  );
  html = ensureMetaTag(
    html,
    /<link\s+rel=["']preconnect["']\s+href=["']https:\/\/unpkg\.com["']/i,
    '<link rel="preconnect" href="https://unpkg.com" crossorigin>'
  );

  return html;
}

function ensureImageAlts(html) {
  return html.replace(/<img\b([^>]*?)>/gi, (match, attrs) => {
    if (/\salt\s*=\s*["'][^"']*["']/i.test(attrs)) {
      return match;
    }
    return `<img${attrs} alt="Imagem">`;
  });
}

function ensureBackgroundClipCompatibility(css) {
  return css.replace(/-webkit-background-clip:\s*text;/g, (token) => {
    return `${token} background-clip: text;`;
  });
}

async function build() {
  cleanDist();
  copyAssets();

  let html = fs.readFileSync(srcHtmlPath, 'utf8');
  html = ensureSeoMeta(html);
  html = ensureImageAlts(html);

  const inlineStyleRegex = /<style>([\s\S]*?)<\/style>/i;
  const styleMatch = html.match(inlineStyleRegex);
  if (styleMatch) {
    const rawCss = ensureBackgroundClipCompatibility(styleMatch[1]);
    const minifiedCss = new CleanCSS({ level: 2 }).minify(rawCss).styles;
    const cssFileName = 'styles.min.css';
    fs.writeFileSync(path.join(distCssDir, cssFileName), `${minifiedCss}\n`, 'utf8');
    html = html.replace(
      inlineStyleRegex,
      `<link rel="stylesheet" href="css/${cssFileName}">`
    );
  }

  const inlineScriptRegex = /<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/gi;
  let scriptIndex = 0;
  let tailwindConfigHandled = false;
  const scriptTasks = [];

  html = html.replace(inlineScriptRegex, (full, attrs, content) => {
    const trimmed = content.trim();
    if (!trimmed) return '';

    scriptIndex += 1;
    const isTailwindConfig = /tailwind\.config\s*=/.test(trimmed) && !tailwindConfigHandled;
    const jsFileName = isTailwindConfig ? 'tailwind-config.min.js' : `app-${scriptIndex}.min.js`;
    if (isTailwindConfig) tailwindConfigHandled = true;

    scriptTasks.push(
      minifyJs(trimmed, {
        compress: true,
        mangle: !isTailwindConfig,
      }).then((result) => {
        fs.writeFileSync(path.join(distJsDir, jsFileName), `${result.code || ''}\n`, 'utf8');
      })
    );

    const deferred = isTailwindConfig ? '' : ' defer';
    return `<script src="js/${jsFileName}"${deferred}></script>`;
  });

  await Promise.all(scriptTasks);

  const minifiedHtml = await minifyHtml(html, {
    collapseWhitespace: true,
    removeComments: true,
    removeRedundantAttributes: true,
    removeEmptyAttributes: true,
    minifyCSS: false,
    minifyJS: false,
    keepClosingSlash: true,
  });

  fs.writeFileSync(path.join(distDir, 'index.html'), `${minifiedHtml}\n`, 'utf8');
  console.log('Build concluido com sucesso em ./dist');
}

build().catch((error) => {
  console.error('Erro no build:', error);
  process.exit(1);
});
