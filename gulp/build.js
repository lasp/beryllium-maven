'use strict';

var gulp = require('gulp');
var path = require('path');

var conf = require('./conf');
var paths = conf.paths;
var sourceSets = conf.sourceSets;

gulp.task('clean', function(cb) {
    require('del').sync(conf.cleanDirs);
    cb();
});

gulp.task('build-css', function() {

    var sass = require('gulp-sass');
    var autoprefixer = require('gulp-autoprefixer');
    var concat = require('gulp-concat');

    // compile css and add browser prefixes
    return gulp.src( sourceSets.scss )
        .pipe( concat("beryllium-maven.scss") )
        .pipe( sass(conf.sassOptions).on('error', sass.logError) )
        .pipe( autoprefixer() )
        .pipe( gulp.dest( path.dirname( conf.sassOptions.outFile ) ) );
});

gulp.task('build-js', function() {

    var templateCache = require('gulp-angular-templatecache');
    var addSrc = require('gulp-add-src');
    var minifyHtml = require('gulp-minify-html');
    var concat = require('gulp-concat');

    return gulp.src( sourceSets.templates )
        .pipe( minifyHtml( {
            empty: true, // do not remove empty attributes
            spare: true, // do not remove redundate attributes
            quotes: true // do not remove arbitrary quotes
        } ) )
        .pipe( templateCache( "templates.js", { module: "beryllium-maven" } ) )
        .pipe( addSrc.prepend( sourceSets.app ) )
        .pipe( concat("app.js") )
        .pipe( gulp.dest( paths.dist + 'js' ) );
});

gulp.task('build-img', function() {
    return gulp.src(
        sourceSets.img,
        {
            base: './src'
        }
    ).pipe( gulp.dest(paths.dist) );
});

gulp.task('build-static', function() {
    return gulp.src(
        sourceSets.staticFiles,
        {
            base: './src'
        }
    ).pipe( gulp.dest(paths.dist) );
});

gulp.task('copy-beryllium-all', function() {
    return gulp.src( sourceSets.berylliumAll )
        .pipe( gulp.dest( paths.dist ) );
});

gulp.task('build', [
    'build-css',
    'build-js',
    'build-img',
    'build-static',
    'copy-beryllium-all'
]);

gulp.task('cleanBuild', function(cb) {
    require('run-sequence')('clean', 'build', cb);
});

