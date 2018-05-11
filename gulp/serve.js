'use strict';

var gulp = require("gulp");

var conf = require("./conf");
var sourceSets = conf.sourceSets;
var paths = conf.paths;

var browserSync;
gulp.task('serve', ['cleanBuild'], function() {

	browserSync = require("browser-sync").create("default");

	browserSync.init({
		server: {
			baseDir: paths.dist
		},
		startPath: '/index.html'
	});

	gulp.watch(sourceSets.app,				reloadBrowsersAfter('build-js'));
	gulp.watch(sourceSets.templates,		reloadBrowsersAfter('build-js'));
	gulp.watch(sourceSets.scss,				reloadBrowsersAfter('build-css'));
	gulp.watch(sourceSets.img,				reloadBrowsersAfter('build-img'));
	gulp.watch(sourceSets.staticFiles,		reloadBrowsersAfter('build-static'));
	
    gulp.watch(sourceSets.berylliumAll,     reloadBrowsersAfter('cleanBuild'));
});

function reloadBrowsersAfter(taskName) {
	var generatedTaskName = '_' + taskName + '_and_reload';
	gulp.task(
		generatedTaskName,
		[ taskName ],
		function(cb) {
			browserSync.reload();
			cb();
		}
	);
	return [ generatedTaskName ];
}
