"use strict";

var gulp = require("gulp");
var fs = require("fs");

// require() all ./gulp/*.js files so that we don't have to
// write out all of our tasks here (note: not recursive)
fs.readdirSync("./gulp")
    .filter(function(file) { return (/\.js$/i).test(file); })
    .forEach(function(file) { return require("./gulp/" + file); });

gulp.task("default", ["cleanBuild"]);

