(function() {

angular
.module("beryllium-maven")
.component("realtimeHud", {
    templateUrl: "components/realtimeHudComponent/realtimeHud.component.html",
    require: { cesium: "^^cesium" },
    bindings: {},
    controller: [
        "$scope",
        "maven3dConstants",
        "kpDataTransformer",
        realtimeHudController
    ]
});

function realtimeHudController( $scope, constants, kpDataTransformer ) {
    var vm = this;
    var dataTransformer = kpDataTransformer;

    // Keep labels and values in synchronized arrays.
    // Pros: can update the values easily every tick
    //        without changing the labels
    // Cons: synchronized arrays are easy to f*** up.
    //        You have to manually keep them in the same
    //        order.
    vm.labels = [
        "Elevation",
        "Latitude",
        "Longitude",
        "Solar Zenith Angle",
        "Solar Longitude (L<sub>S</sub>)"
    ];
    vm.values = [];

    // Whenever we get new properties from the DataTransformer, save them
    // off so the onTick function can access them.
    var properties;
    dataTransformer.dataReady.addEventListener(function( _properties ) {
        properties = _properties;
    });

    vm.$onInit = function() {
        vm.cesium.onViewerReady( onViewerReady );
    };

    function onViewerReady( viewer ) {
        viewer.clock.onTick.addEventListener( onTick );
    }

    // Code that should be executed once per clock tick
    function onTick( clock ) {
        if( !properties ) {
            return;
        }
        render( clock );
    }

    // Render (or re-render) the directive using the properties object
    // to populate the vm.values array.
    function render( clock ) {
        var cartesianPosition = properties.orbitPosition.getValue( clock.currentTime );
        var cartographicPosition = Cesium.Cartographic.fromCartesian(
            cartesianPosition,
            constants.MARSIAU2000
        );
        var solarZenithAngle = properties.solarZenithAngle.getValue( clock.currentTime );
        var solarLongitude = properties.solarLongitude.getValue( clock.currentTime );

        var heightKm = (cartographicPosition.height / 1000).toFixed(1);
        var latDeg = Cesium.Math.toDegrees( cartographicPosition.latitude ).toFixed(1);
        var lngDeg = Cesium.Math.toDegrees( cartographicPosition.longitude ).toFixed(1);
        var zenAngleDeg = solarZenithAngle.toFixed(1);
        var solarLongitudeDeg = solarLongitude.toFixed(1);

        var degreeSymbol = '\xB0';

        var elevationStr = heightKm + 'km';
        var latStr = latDeg + degreeSymbol;
        var lngStr = lngDeg + degreeSymbol;
        var zenithAngleStr = zenAngleDeg + degreeSymbol;
        var solarLongitudeStr = solarLongitudeDeg + degreeSymbol;

        // NOTE: order in this array must match order in the labels array
        vm.values = [
            elevationStr,
            latStr,
            lngStr,
            zenithAngleStr,
            solarLongitudeStr
        ];

        // Make sure the component actually notices the changes we've made
        $scope.$apply();
    }
}

})();
