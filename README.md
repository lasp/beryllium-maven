# Beryllium-Maven

### Beryllium-Maven Summary

This is the second incarnation of the Beryllium-Maven Project. The original name was Cesium-Maven.
We changed the name to Beryllium from Cesium, because Cesium is really someone else's code; it
would be like calling every project that uses jQuery `jquery-myproject` or something.

Beryllium-Maven is an implementation of a Beryllium app, using the Beryllium library,
for the Maven mission. Beryllium-Maven is also known as Maven3D by many users. It displays a 3D rendering of Mars with
the Maven spacecraft orbiting it. Users can plot various data along with the spacecraft, usually
data collected by Maven itself, but also data generated by scientific models and other sources.

### Related Project(s)

* [beryllium-imagery-server](https://github.com/lasp/beryllium-imagery-server.git):
    Build scripts for the Google Earth-style image tiles used to make the planet look like Mars
* [beryllium](https://github.com/lasp/beryllium.git): Shared code
    for all `beryllium-*` projects (like beryllium-maven, beryllium-mms, etc)
* [beryllium-mms](https://github.com/lasp/beryllium-mms.git):
    Similar project for the MMS mission.

### Production URLs

* Production Link: https://lasp.colorado.edu/maven/sdc/public/pages/maven3d/

### Architecture

Beryllium-Maven is an angular app that makes use of the Beryllium library. It has a sidebar
that showcases various data and allows the user to select time range, reference frame, and
1D, 3D, and M-GITM parameters for display in the `<cesium>` widget. Many modifications are made to
the stock Cesium configuration to accommodate the Mars environment; the planet itself is
shrunk and re-skinned to look like Mars. The stock Moon and Sun have been deleted because
they shouldn't exist, and were in the wrong place in the sky, respectively. The Sun has
been replaced with a custom Sun Entity since that data is readily available from the KP
dataset.

The following custom cesium-directives have been installed inside the `<cesium>` component:

* `<create-cesium>`: Handles the creation and configuration of the `<cesium>` widget. Is
    responsible for most of the logic to make "Earth" look like "Mars"
* `<spacecraft-entities>`: Add Entities and Primitives to the Cesium Viewer to display the
    spacecraft and associated data (orbit path, orbit color, orbit whiskers, etc)
* `<sun-entities>`: Add Entities and Primitives to the Cesium Viewer to display our custom
    Sun and associated artifacts (sub-solar-point, nightside shadow, etc)
* `<legend>`: Adds a legend to the Cesium Viewer to display the toggleable sub-solar point and ground tracking entities,
    as well as display information about the currently selected data, such as its units of measurement,
    the corresponding color gradient, and the data range.

### Build System

We use a standard Gulp and Node build system for this project:
	[Gulp](https://gulpjs.com/)
	[Node](https://nodejs.org/en/)

##### Task Cheatsheet

```
gulp build // builds the project to the dist folder
gulp serve // builds and serves the project locally, rebuilds when changes are detected
gulp clean // removes dist folder and any/all temporary folders
```

### Running Beryllium-Maven Locally

##### Project Dependencies

Currently pulls data directly from a latis instance. Eventually this data will be available
publicly so it will be possible to run the app from anywhere.

### Deploying Beryllium-Maven

### FAQs and Help

For questions, please contact LASP web team.

##### Beryllium-Maven-specific common issues, gotchas

* When upgrading the Angular bower dependency past Angular 1.6.0, a gray layer appears around Mars on load.

### External Resources

* [CesiumJS Sandcastle](http://cesiumjs.org/Cesium/Apps/Sandcastle/index.html?src=Hello%20World.html&label=Showcases):
	This has lots of useful feature demos. If you need to implement something and you don't know
	what the right class is, this is a useful place to look.
* [CesiumJS API reference](http://cesiumjs.org/refdoc.html): If you know what you want to learn
	about, this is a helpful place to look.
* [CesiumJS Tutorials](http://cesiumjs.org/tutorials.html): This is a good place to start if you're
	new to CesiumJS.

#### Copyright
Copyright 2018 Regents of the University of Colorado. All rights reserved.

#### Terms of Use
Commercial use of this project is forbidden due to the terms set forth by Highstock.
