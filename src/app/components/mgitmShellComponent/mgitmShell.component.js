(function() {

// Angular component for the M-GITM shell display inside
// the Cesium component
angular
.module("beryllium-maven")
.component( "mgitmShell", {
    template: "",
    require: {
        cesium: "^^cesium"
    },
    bindings: {
        "solarFlux": "<",
        "solarLongitude": "<",
        "altitude": "<",
        "parameter": "<"
    },
    controller: [
        "maven3dConstants",
        "mgitmDataTransformer",
        "CallbackPositionProperty",
        mgitmShellController
    ]
});

function mgitmShellController( constants, mgitmDataTransformer, CallbackPositionProperty ) {
    var vm = this;
    var dataTransformer = mgitmDataTransformer;
    var properties, shell, subsolarPoint, secondRotationAxis;

    // This can be set to true to display various utilities that help
    // debug the alignment of the M-GITM shell. E.g., it displays lines
    // on the edges of the M-GITM image, so that you can see where the
    // image edges wind up when "wrapped" around the spherical shell.
    // There is also a blue line that shows the axis of rotation of
    // the second alignment rotation that we do, since that axis is
    // manually calculated and easy to mess up (it should be on the
    // equator, 90degrees east of the subsolar point)
    var DEBUG = false;

    // We'll render the M-GITM data to a <canvas> element so that we can
    // have pixel-level control over what Cesium displays on the sphere
    // entity.
    var canvas = document.createElement("canvas");
    if( DEBUG ) {
        // Draw the canvas in the upper left corner, so we can see what it
        // actually looks like before it's wrapped around the shell
        canvas.style.cssText = "position:fixed;top:0;left:0;outline:1px solid red;z-index:99;";
        document.body.appendChild( canvas );
    }
    var ctx = canvas.getContext("2d");

    // Provide the dataTransformer with various requirements, when requested
    dataTransformer.requirementsManager.addRequirementsProvider(function() {
        return {
            parameter: vm.parameter,
            displayType: "shell",
            solarFlux: vm.solarFlux,
            solarLongitude: vm.solarLongitude,
            altitude: vm.altitude
        }
    });

    // On the off chance that we have enough information to request data
    // right at startup, notify the dataTransformer that our requirements
    // have changed (from "nothing", to "something"). However, as of this
    // writing this will never execute because the starting value for
    // "parameter" will be "none" (it's hardcoded in the main controller)
    if( vm.parameter !== "none" ) {
        dataTransformer.requestReload();
    }

    // When we receive new properties from the dataTransformer, save them off
    // and, if everything else is ready, draw them to the viewer. Generally speaking
    // the viewer will always be ready (once it becomes ready it will stay ready
    // indefinitely), but this logic is necessary to prevent a race condition
    // during initial startup where we can't guarantee that the viewer will be
    // ready before the data arrives.
    var dataIsReady = false;
    dataTransformer.dataReady.addEventListener(function( _properties ) {
        properties = _properties;
        dataIsReady = true;
        if( viewerIsReady ) {
            drawEntities();
        }
    });

    // First, wait for "^^cesium" to be ready, and then wait for the Cesium Viewer
    // to be ready. Once they are, set viewerIsReady and, if we've already received
    // data from the dataTransformer, render the data to the Viewer.
    var viewerIsReady = false;
    vm.$onInit = function() {
        vm.cesium.onViewerReady(function( viewer ) {
            viewerIsReady = true;
            if( dataIsReady ) {
                drawEntities();
            }
        });
    }

    // Currently, all of our bindings are backend parameters that change what data
    // we need to have loaded, so whenever we see a change we should load new data.
    // The only exception is if "parameter" is "none", which effectively turns this
    // component off.
    vm.$onChanges = function( changesObj ) {
        dataIsReady = false;
        deleteEntities();
        if( vm.parameter !== "none" ) {
            dataTransformer.requestReload();
        }
    };

    // Draw the entities for this component to the Cesium Viewer. In order for
    // this method to be successfull, both the Cesium Viewer and the data from
    // the DataTransformer must be ready. The entities drawn by this method
    // may be deleted from the Viewer by calling deleteEntities().
    function drawEntities() {

        deleteEntities();

        // Determine the width and height by inspecting the data. If there
        // is no data, set width=0 and height=0 (should never happen, but
        // better safe than sorry)
        var height = properties.pixelArray.length;
        var width = properties.pixelArray.length === 0
            ? 0
            : properties.pixelArray[0].length;

        if( width === 0 || height === 0 ) {
            // Cesium will just throw an error if we try to continue, so we
            // may as well just return.
            console.error("No M-GITM " + vm.parameter + " data received from the server");
            return;
        }

        // Set canvas dimensions
        canvas.width = width;
        canvas.height = height;

        // Get an imagedata object from the canvas to populate its pixels.
        // According to some StackOverflow article I read somewhere, this
        // is the fastest way to do that.
        var imgDataObj = ctx.createImageData(width, height);
        var imgData = imgDataObj.data;

        // Populate the imagedata array pixel-by-pixel from properties.pixelArray
        properties.pixelArray.forEach(function( row, rowIndex ) {
            row.forEach(function( color, colIndex ) {
                var baseIndex = (rowIndex * width + colIndex) * 4;

                imgData[ baseIndex + 0 ] = color.red * 255;
                imgData[ baseIndex + 1 ] = color.green * 255;
                imgData[ baseIndex + 2 ] = color.blue * 255;
                imgData[ baseIndex + 3 ] = 127.5; // alpha=127.5: 50% opacity
            });
        });

        // If we're debugging, draw some calibration lines around the edges
        // of the image, overwriting the data we just drew to the canvas.
        // This is useful for making sure the edges of the canvas are where
        // you think they are on the shell.
        if( !DEBUG ) {
            ctx.putImageData( imgDataObj, 0, 0 );
        }
        else {
            drawCalibrationLines( ctx );
        }

        // The data is all at the same altitude, but the altitude is "distance
        // above the surface of Mars" and not "distance from the center of Mars"
        // which is what Cesium needs.
        var radius = properties.altitudeMeters + constants.MARS_RADIUS_METERS;

        // A lot of the magic numbers here were found through careful tinkering
        // to make the shell face in the correct direction. For example:
        //
        // * position: should be [0,0,0], but Cesium throws some sort of error
        //        if that happens. Using a tiny 1m offset on the z-axis causes it
        //        to orient in the direction we want.
        // * orientation: Orientation is set dynamically to account for rotation
        //        of the planet. Interestingly though, when I was setting it manually
        //        I noticed that an orientation of 0deg aligns the image differently
        //        than specifying no rotation. The boundaries
        //        of our image are lat: [-90,90], lng: [0, 365] and a 0deg rotation
        //        about the z-axis appears to line us up like that.
        shell = vm.cesium.viewer.entities.add({
            position: new Cesium.Cartesian3( 0, 0, 1 ),
            orientation: properties.orientation,
            ellipsoid: {
                radii: new Cesium.Cartesian3( radius, radius, radius ),
                fill: false,
                material: new Cesium.ImageMaterialProperty({
                    image: canvas,
                    transparent: true
                })
            },
            availability: vm.cesium.defaultAvailability()
        });

        // Shows the ellipsoid only when the user chooses to show parameter data.
        // This prevents the weird Angular 1.6 bug where the ellipsoid is shown
        // as a gray outer layer at load time.
        if( vm.parameter !== "none" ) {
            shell.ellipsoid.fill = true;
        }

        // If we're debugging this component, display it's subsolar point using a
        // crosshairs icon. If the rotations we're applying are correct it should
        // appear directly underneath the KP data's subsolar point.
        if( DEBUG ) {
            var scratchCartesian3 = new Cesium.Cartesian3();
            var rotationMatrixScratch = new Cesium.Matrix4();
            var scaleIdentity = new Cesium.Cartesian3(1, 1, 1);

            subsolarPoint = vm.cesium.viewer.entities.add({
                id: "mgitmSubsolarPoint",
                availability: vm.cesium.defaultAvailability(),
                position: new CallbackPositionProperty(
                    function( time ) {

                        // Compute the M-GITM subsolar point by getting the KP subsolar point
                        // and applying the same rotation that we're using for the shell data.
                        var kpSubsolarPoint = properties.subsolarPoint.getValue( time );
                        var rotation = properties.orientation.getValue( time );

                        var rotationMatrixScratch = Cesium.Matrix4.fromTranslationQuaternionRotationScale(
                            Cesium.Cartesian3.ZERO,
                            rotation,
                            scaleIdentity,
                            rotationMatrixScratch
                        );

                        scratchCartesian3 = Cesium.Matrix4.multiplyByPoint(
                            rotationMatrixScratch,
                            kpSubsolarPoint,
                            scratchCartesian3
                        );

                        return scratchCartesian3;
                    },
                    false
                ),
                billboard: {
                    image: "img/Crosshairs.png",
                    scale: 0.2,
                    eyeOffset: new Cesium.Cartesian3(0.0, 0.0, -1e6)
                }
            });
        }

        // If we're debugging the display of this component, show the second rotation axis
        // as a blue line that's roughly the same size as the <debug-axis> lines. We don't
        // typically need to debug the first rotation axis because it's just the z-axis.
        // However, the second axis is computed on the fly to cause the subsolar point to
        // rotate exactly north/south, so it's worth checking.
        if( DEBUG ) {
            secondRotationAxis = vm.cesium.viewer.entities.add({
                id: "secondRotationAxis",
                polyline: {
                    followSurface: false,
                    positions: new Cesium.PositionPropertyArray([
                        new Cesium.ConstantPositionProperty( Cesium.Cartesian3.ZERO ),
                        properties.secondRotationAxis
                    ]),
                    material: Cesium.Color.AQUAMARINE,
                    width: 3
                }
            });
        }
    }

    // Clean up any entities we may have created, including debugging entities
    function deleteEntities() {
        vm.cesium.deleteEntity( shell );
        if( subsolarPoint ) { vm.cesium.deleteEntity( subsolarPoint ); }
        if( secondRotationAxis ) { vm.cesium.deleteEntity( secondRotationAxis ); }
    }

    // Utility function for debugging image alignment on the shell.
    //
    // Given a reference to the Canvas' Context2D, draw lines around
    // the borders of the canvas so that we can see where they appear
    // on the globe. Often useful with the <debug-axis> component
    // from the beryllium library. Draws the following:
    //
    // background: blue
    // left edge: 1px solid red
    // right edge: 1px solid green
    // top edge: 3px solid white
    // bottom edge: 3px solid yellow
    //
    // Should appear as the following:
    // * red+green strip down the prime meridian (north pole to
    //        south pole along latitude=0). Red should be just east
    //        of the prime meridian, green should be just west of it.
    // * white circle at the north pole
    // * yellow circle at the south pole
    function drawCalibrationLines( ctx ) {

        var width = ctx.canvas.width;
        var height = ctx.canvas.height;

        ctx.fillStyle = "blue";
        ctx.fillRect( 0, 0, width, height );

        ctx.fillStyle = "red";
        ctx.fillRect( 0, 0, 1, height );

        ctx.fillStyle = "green";
        ctx.fillRect( width-1, 0, 1, height );

        ctx.fillStyle = "white";
        ctx.fillRect( 0, 0, width, 3 );

        ctx.fillStyle = "yellow";
        ctx.fillRect( 0, height-3, width, 3 );
    }
}

})();
