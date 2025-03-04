const gulp = require('gulp');
const postcss = require('gulp-postcss');
const cssnano = require('gulp-cssnano');
const terser = require('gulp-terser');
const htmlmin = require('gulp-htmlmin');
const rename = require('gulp-rename');
const sourcemaps = require('gulp-sourcemaps');

// Minify CSS
function minifyCSS() {
  return gulp.src('./styles.css')
    .pipe(sourcemaps.init())
    .pipe(postcss([require('cssnano')({
      preset: ['default', {
        discardComments: { removeAll: true },
        normalizeWhitespace: true,
        minifyFontValues: true,
        colormin: true
      }]
    })]))
    .pipe(rename({ suffix: '.min' }))
    .pipe(sourcemaps.write('.'))
    .pipe(gulp.dest('./'));
}

// Minify JS
function minifyJS() {
  return gulp.src('./script.js')
    .pipe(sourcemaps.init())
    .pipe(terser({
      compress: {
        drop_console: true,
        drop_debugger: true,
        pure_funcs: ['console.log', 'console.info', 'console.debug']
      },
      mangle: {
        toplevel: true
      }
    }))
    .pipe(rename({ suffix: '.min' }))
    .pipe(sourcemaps.write('.'))
    .pipe(gulp.dest('./'));
}

// Minify HTML
function minifyHTML() {
  return gulp.src('./index.html')
    .pipe(htmlmin({
      collapseWhitespace: true,
      removeComments: true,
      removeOptionalTags: true,
      removeRedundantAttributes: true,
      removeScriptTypeAttributes: true,
      removeStyleLinkTypeAttributes: true,
      minifyJS: true,
      minifyCSS: true,
      minifyURLs: true,
      useShortDoctype: true
    }))
    .pipe(rename('index.min.html'))
    .pipe(gulp.dest('./'));
}

// Combined minify task
const minify = gulp.parallel(minifyCSS, minifyJS, minifyHTML);

exports.css = minifyCSS;
exports.js = minifyJS;
exports.html = minifyHTML;
exports.default = minify;