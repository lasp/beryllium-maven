'use strict';

var paths = exports.paths = {
    src: './src/',
    dist: './dist/',
    tmp: './.tmp/',
    bower: './bower_components/'
};

exports.sassOptions = {
    outFile: paths.dist + 'css/thisnameisntused.css',
    outputStyle: 'compressed'
};

exports.sourceSets = {
    app: [
        paths.src + 'app/app.js',
        paths.src + 'app/*/**/*.js',
        '!' + paths.src + '**/*.spec.js'
    ],
    templates: paths.src + 'app/**/*.html',
    scss: [
        paths.src + 'scss/**/*.scss',
        paths.src + 'app/**/*.scss'
    ],
    img: paths.src + 'img/**/*',
    staticFiles: [
        paths.src + 'models/**/*',
        paths.src + '*.*' // anything that lives directly in root directory
    ],
    berylliumAll: paths.bower + 'beryllium/dist/**/*',
};

exports.cleanDirs = [
    paths.dist
];

exports.deploy = {
    projectName: 'beryllium-maven',

    domain: 'ds-webapp-dev',
    adminProtocol: 'https',
    adminPort: '4848',
    ignoreCertificateErrors: true,
    target: 'dev',
    username: 'demo-deployer',
    password: 'JebediahKerman',
    displayPort: '28080',
    displayProtocol: 'http'
};


