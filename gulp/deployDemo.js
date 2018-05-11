'use strict';

var gulp = require('gulp');
var conf = require('./conf');

var warOptions;
gulp.task('_deployDemo_warOptions', ['_deployDemo_getGitBranch'], function(cb) {
	var deploy = conf.deploy;

	var contextRoot = 'demo/{project}/{branch}'
		.replace('{project}', deploy.projectName)
		.replace('{branch}', gitBranch);

	var appName = '{project}-{branch}'
		.replace('{project}', deploy.projectName)
		.replace('{branch}', gitBranch)
		.replace('/', '-');

	var auth =
		(deploy.username && deploy.password) ? deploy.username + ':' + deploy.password + '@'
		: '';

	var uploadUrl = '{protocol}://{auth}{domain}:{port}/management/domain/applications/application'
		.replace('{protocol}', deploy.adminProtocol)
		.replace('{auth}', auth)
		.replace('{domain}', deploy.domain)
		.replace('{port}', deploy.adminPort);

	var displayUrl = '{protocol}://{domain}:{port}/{contextRoot}/'
		.replace('{protocol}', deploy.displayProtocol)
		.replace('{domain}', deploy.domain)
		.replace('{port}', deploy.displayPort)
		.replace('{contextRoot}', contextRoot);

	var warFolder = conf.paths.tmp + '_deployDemo_war/';
	var warFilename = deploy.projectName + '.war';
	var warLocation = warFolder + warFilename;

	warOptions = {
		uploadUrl: uploadUrl,
		contextRoot: contextRoot,
		appName: appName,

		warFolder: warFolder,
		warFilename: warFilename,
		warLocation: warLocation,

		displayUrl: displayUrl
	};

	cb();
})

gulp.task('_deployDemo_war', [ 'cleanBuild', '_deployDemo_warOptions' ], function() {
	var war = require('gulp-war');
	var zip = require('gulp-zip');

	var warContents = [
		conf.paths.dist + "**/*",
	];

	return gulp.src(warContents, { base: './dist' })
		.pipe(war({
			welcome: 'index.html',
			displayName: warOptions.appName
		}))
		.pipe(zip(warOptions.warFilename))
		.pipe(gulp.dest(warOptions.warFolder));
});

var gitBranch;
gulp.task('_deployDemo_getGitBranch', function(cb) {
	require('child_process').exec(
		'git rev-parse --abbrev-ref HEAD',
		function (error, stdout, stderr) {
			gitBranch = stdout.trim();
			cb();
		}
	);
});

gulp.task(
	'_deployDemo_upload',
	[ '_deployDemo_war', '_deployDemo_warOptions' ],
	function(cb) {

		var fs = require('fs');
		var request = require('request');
		var deploy = conf.deploy;

		var previous_NODE_TLS_REJECT_UNAUTHORIZED = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
		if (deploy.ignoreCertificateErrors) {
			process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
		}

		var multipartFormData = {
			force: 'true',
			contextroot: warOptions.contextRoot,
			name: warOptions.appName,
			id: fs.createReadStream(warOptions.warLocation)
		};

		if (deploy.target) {
			multipartFormData.target = deploy.target;
		}

		var headers = {
			'X-Requested-By': 'gulp deployDemo',
			'Accept': 'application/json'
		};

		request.post(
			{
				url: warOptions.uploadUrl,
				formData: multipartFormData,
				headers: headers
			},
			function (err, httpResponse, body) {
				// reset this variable so that we're not leaving open security holes
				// for the rest of this process
				process.env.NODE_TLS_REJECT_UNAUTHORIZED = previous_NODE_TLS_REJECT_UNAUTHORIZED;

				if (err) {
					cb(err);
				}
				else {
					cb();
				}
			}
		);
	}
);

gulp.task('deployDemo', [ '_deployDemo_upload' ], function(cb) {
	console.log("Successfully deployed to: " + warOptions.displayUrl)
	cb();
});
